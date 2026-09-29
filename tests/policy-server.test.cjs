const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Ledger = require('../js/policy-ledger.js');
const Server = require('../js/policy-server.js');

const clock = () => '2026-09-29T09:00:00.000Z';
function ctxFor(personaId, ledger = [], docs = Engine.cloneDocs(Data.SEED_DOCUMENTS), registry = Engine.cloneRegistry(Data.SEED_REGISTRY)) {
  const tail = Ledger.tailOf(ledger);
  return { workspace: { id: 'demo', mode: 'demo', ledger_seq: tail.seq, ledger_tail: tail.hash },
    member: Server.demoMember(personaId), registry, docs, ledger, now: clock };
}
const change = { ruleId: 'R-PK-01', newValue: '5 ngày', issuerTier: 2 };
const lineOf = (docId, i) => Data.SEED_DOCUMENTS.find(d => d.id === docId).lines[i];

test('ban hành hợp lệ: 6 bản vá tự động, bản ghi nối tiếp đúng đuôi, gói RPC đầy đủ', () => {
  const plan = Server.planCommit(ctxFor('tp-dt'), { change });
  assert.equal(plan.ok, true, plan.message);
  assert.equal(plan.body.applied, 6);
  assert.equal(plan.rpc.p_expected_seq, 0);
  assert.equal(plan.rpc.p_records.length, 6);
  assert.equal(plan.rpc.p_records[0].prevHash, Ledger.GENESIS);
  assert.equal(Ledger.verify(plan.body.records), true);
  assert.equal(plan.rpc.p_doc_updates.length, 6);
  assert.match(plan.rpc.p_records[0].basis, /khởi tạo bởi Trưởng phòng Đào tạo \(demo\)/);
});

test('chuyên viên cấp 1 khai cấp 2 → 403, không sinh gói ghi nào', () => {
  const plan = Server.planCommit(ctxFor('cv-dt'), { change });
  assert.equal(plan.ok, false);
  assert.equal(plan.status, 403);
  assert.equal(plan.rpc, undefined);
});

test('quyết định vượt thẩm quyền (U3 của Hiệu trưởng do trưởng phòng bấm) → 403 kèm lý do từng dòng', () => {
  const plan = Server.planCommit(ctxFor('tp-dt'), { change, decisions: [{ docId: 'QD-01', lineIndex: 1, line: lineOf('QD-01', 1), act: 'b' }] });
  assert.equal(plan.status, 403);
  assert.equal(plan.details[0].docId, 'QD-01');
  assert.match(plan.details[0].reason, /Hiệu trưởng/);
});

test('quyết định trên dòng đã đổi kể từ lúc phân tích → 409 stale_analysis', () => {
  const plan = Server.planCommit(ctxFor('tp-dt'), { change, decisions: [{ docId: 'HD-04', lineIndex: 3, line: 'nội dung client nhìn thấy đã cũ', act: 'a' }] });
  assert.equal(plan.status, 409);
  assert.equal(plan.error, 'stale_analysis');
});

test('người đúng thẩm quyền chấp thuận U1 → dòng được sửa và phản hồi được ghi để học', () => {
  const plan = Server.planCommit(ctxFor('cv-dt'), {
    change: { ...change, issuerTier: 1 },
    decisions: [{ docId: 'HD-04', lineIndex: 3, line: lineOf('HD-04', 3), act: 'a' }]
  });
  assert.equal(plan.ok, true, plan.message);
  assert.ok(plan.rpc.p_doc_updates.some(u => u.id === 'HD-04' && u.lineIndex === 3));
  assert.deepEqual(plan.rpc.p_feedback.map(f => [f.category, f.answer, f.docId]), [['U1', 'accept', 'HD-04']]);
});

test('client chỉ làm kết quả thận trọng hơn: dòng bị "giữ" thì không được vá tự động', () => {
  const plan = Server.planCommit(ctxFor('tp-dt'), { change, holds: [{ docId: 'QT-02', lineIndex: 0, line: lineOf('QT-02', 0) }] });
  assert.equal(plan.ok, true);
  assert.equal(plan.body.applied, 5);
  assert.equal(plan.rpc.p_doc_updates.some(u => u.id === 'QT-02' && u.lineIndex === 0), false);
});

test('đuôi sổ trong workspace khác đuôi sổ nạp được → 409 (có người vừa ghi)', () => {
  const ctx = ctxFor('tp-dt');
  ctx.workspace.ledger_seq = 3;
  assert.equal(Server.planCommit(ctx, { change }).error, 'ledger_conflict');
});

test('Hiệu trưởng ban hành và phê chuẩn: giá trị gốc trong sổ đăng ký đổi theo, có expectedValue để chống ghi đè', () => {
  const plan = Server.planCommit(ctxFor('ht'), { change: { ...change, issuerTier: 3 }, ratify: true });
  assert.equal(plan.ok, true, plan.message);
  assert.deepEqual(plan.rpc.p_policy_updates.map(u => [u.id, u.expectedValue, u.value]), [['R-PK-01', '7 ngày', '5 ngày']]);
  assert.equal(plan.rpc.p_records.at(-1).action, 'CẬP NHẬT QUY ĐỊNH R-PK-01');
});

test('hoàn tác theo quyền: trưởng phòng không hoàn tác được tài liệu cấp 3', () => {
  const first = Server.planCommit(ctxFor('ht'), { change: { ...change, issuerTier: 3 } });
  const ledger = first.body.records;
  const docs = Engine.cloneDocs(Data.SEED_DOCUMENTS);
  for (const u of first.rpc.p_doc_updates) docs.find(d => d.id === u.id).lines[u.lineIndex] = u.to;
  const qd = ledger.find(r => r.docId === 'QD-01');
  assert.equal(Server.planUndo(ctxFor('tp-dt', ledger, docs), { seq: qd.seq }).status, 403);
  const undo = Server.planUndo(ctxFor('ht', ledger, docs), { seq: qd.seq });
  assert.equal(undo.ok, true);
  assert.equal(undo.rpc.p_doc_updates[0].to, lineOf('QD-01', 1));
});

test('thêm neo và thêm tài liệu cũng theo quyền và ghi sổ', () => {
  assert.equal(Server.planAnchor(ctxFor('cv-dt'), { ruleId: 'R-PK-01', phrase: 'lưu bài' }).status, 403);
  const anchor = Server.planAnchor(ctxFor('tp-dt'), { ruleId: 'R-PK-01', phrase: 'lưu bài' });
  assert.equal(anchor.ok, true);
  assert.ok(anchor.rpc.p_policy_updates[0].aliases.includes('lưu bài'));
  assert.equal(Server.planAddDocument(ctxFor('cv-dt'), { document: { title: 'X', tier: 2, lines: ['a'] } }).status, 403);
  const doc = Server.planAddDocument(ctxFor('cv-dt'), { document: { title: 'Hướng dẫn', tier: 1, lines: ['Nộp đơn phúc khảo trong 7 ngày.'] } });
  assert.equal(doc.ok, true);
  assert.equal(doc.rpc.p_new_documents[0].owner, 'Phòng Đào tạo');
});
