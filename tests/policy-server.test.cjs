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

// ---------- Hồ sơ chuyển tiếp dùng chung (Sprint 2, sau review) ----------
function applyPlan(ctx, plan) {
  // Mô phỏng apply_change: cập nhật tài liệu, sổ, hồ sơ, quyết định.
  const docs = Engine.cloneDocs(ctx.docs);
  for (const u of plan.rpc.p_doc_updates) { const d = docs.find(x => x.id === u.id); d.lines[u.lineIndex] = u.to; d.version = u.version; }
  const ledger = [...ctx.ledger, ...plan.rpc.p_records];
  let openChanges = (ctx.openChanges || []).map(c => ({ ...c }));
  const oc = plan.rpc.p_open_change;
  if (oc) {
    const row = { id: oc.id, ruleId: oc.ruleId, oldValue: oc.oldValue, newValue: oc.newValue, issuerTier: oc.issuerTier,
      requestText: oc.requestText, createdBy: oc.createdBy, status: oc.status, held: oc.held };
    openChanges = openChanges.filter(c => c.id !== oc.id).concat(row);
  }
  if (plan.rpc.p_close_change) openChanges = openChanges.map(c => c.id === plan.rpc.p_close_change ? { ...c, status: 'closed' } : c);
  const decisions = [...(ctx.decisions || []), ...plan.rpc.p_decisions];
  const tail = Ledger.tailOf(ledger);
  return { ...ctx, docs, ledger, openChanges, decisions, workspace: { ...ctx.workspace, ledger_seq: tail.seq, ledger_tail: tail.hash } };
}
const as = (ctx, personaId, mode = 'demo') => ({ ...ctx, member: Server.demoMember(personaId), workspace: { ...ctx.workspace, mode } });

test('ban hành còn U1/U2/U3 chưa quyết → mở hồ sơ CR-1 cho người có thẩm quyền, căn cứ ghi cấp ban hành', () => {
  const plan = Server.planCommit(ctxFor('tp-dt'), { change });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.body.openChange, { id: 'CR-1', status: 'open', pending: 3 });
  assert.match(plan.rpc.p_records[0].basis, /hồ sơ CR-1 · cấp ban hành 2 · khởi tạo bởi Trưởng phòng Đào tạo \(demo\)/);
});

test('trưởng phòng Thanh tra quyết U2 trên máy của mình; người sai đơn vị bị chặn; quyết xong mục cuối thì đóng hồ sơ', () => {
  let ctx = ctxFor('tp-dt');
  ctx = applyPlan(ctx, Server.planCommit(ctx, { change }));
  const pending = Server.analyzeOpenChange(ctx.openChanges[0], ctx.registry, ctx.docs, ctx.decisions).pending;
  assert.deepEqual(pending.map(p => p.category).sort(), ['U1', 'U2', 'U3']);
  const u2 = pending.find(p => p.category === 'U2');
  const req = { changeId: 'CR-1', docId: u2.docId, lineIndex: u2.lineIndex, line: u2.line, act: 'a' };
  assert.equal(Server.planDecide(as(ctx, 'tp-dt'), req).status, 403);
  const ok = Server.planDecide(as(ctx, 'tp-tt'), req);
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.rpc.p_records[0].actor, 'Người · Trưởng phòng Thanh tra – Pháp chế (demo)');
  assert.equal(ok.rpc.p_records[0].action, 'TỪ CHỐI SỬA dòng 2');
  assert.equal(ok.rpc.p_close_change, null);
  ctx = applyPlan(ctx, ok);
  assert.equal(Server.planDecide(as(ctx, 'tp-tt'), req).status, 409, 'không quyết lại vị trí đã quyết');

  const rest = Server.analyzeOpenChange(ctx.openChanges[0], ctx.registry, ctx.docs, ctx.decisions).pending;
  assert.equal(rest.length, 2);
  const u1 = rest.find(p => p.category === 'U1');
  ctx = applyPlan(ctx, Server.planDecide(as(ctx, 'cv-dt'), { changeId: 'CR-1', docId: u1.docId, lineIndex: u1.lineIndex, line: u1.line, act: 'a' }));
  assert.ok(ctx.docs.find(d => d.id === 'HD-04').lines[3].includes('5 ngày'));
  const u3 = Server.analyzeOpenChange(ctx.openChanges[0], ctx.registry, ctx.docs, ctx.decisions).pending[0];
  const last = Server.planDecide(as(ctx, 'ht'), { changeId: 'CR-1', docId: u3.docId, lineIndex: u3.lineIndex, line: u3.line, act: 'b' });
  assert.equal(last.rpc.p_close_change, 'CR-1');
  ctx = applyPlan(ctx, last);
  assert.equal(Ledger.verify(ctx.ledger), true);
  assert.equal(Server.planDecide(as(ctx, 'ht'), { changeId: 'CR-1', docId: 'x', lineIndex: 0, line: '', act: 'a' }).error, 'change_closed');
});

test('workspace trình diễn: quyết định mang vai trò người bấm; workspace thật bỏ qua vai trò client khai', () => {
  const u2 = { docId: 'QT-07', lineIndex: 1, line: lineOf('QT-07', 1), act: 'b', persona: 'tp-tt' };
  const demo = Server.planCommit(ctxFor('tp-dt'), { change, decisions: [u2] });
  assert.equal(demo.ok, true, demo.message);
  const rec = demo.rpc.p_records.find(r => r.docId === 'QT-07');
  assert.equal(rec.actor, 'Người · Trưởng phòng Thanh tra – Pháp chế (demo)');
  assert.equal(demo.rpc.p_feedback[0].actor, rec.actor);
  const live = Server.planCommit(as(ctxFor('tp-dt'), 'tp-dt', 'live'), { change, decisions: [u2] });
  assert.equal(live.status, 403);
});

test('hoàn tác cần đủ cấp đã ban hành: chuyên viên không thu hồi được thay đổi do Hiệu trưởng ban hành', () => {
  let ctx = ctxFor('ht');
  ctx = applyPlan(ctx, Server.planCommit(ctx, { change: { ...change, issuerTier: 3 } }));
  const hd = ctx.ledger.find(e => e.docId === 'HD-04' && e.action.startsWith('PATCH'));
  assert.equal(Server.planUndo(as(ctx, 'cv-dt'), { seq: hd.seq }).status, 403);
  assert.equal(Server.planUndo(as(ctx, 'ht'), { seq: hd.seq }).ok, true);
});

test('thêm neo đại lượng: gói RPC mang cả measures, bản ghi ghi rõ loại neo', () => {
  const plan = Server.planAnchor(ctxFor('tp-dt'), { ruleId: 'R-PK-01', phrase: 'phiếu đăng ký', field: 'measures' });
  assert.equal(plan.ok, true, plan.message);
  const upd = plan.rpc.p_policy_updates[0];
  assert.ok(upd.measures.includes('phiếu đăng ký'));
  assert.ok(!upd.aliases.includes('phiếu đăng ký'));
  assert.equal(plan.rpc.p_records[0].action, 'THÊM NEO ĐẠI LƯỢNG R-PK-01');
  assert.deepEqual(Server.fromDbPolicy({ id: 'X', name: 'n', value: '1 ngày', tier: 1, source: 's', owner: 'o', aliases: ['a'] }).measures, []);
});
