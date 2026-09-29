const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Ledger = require('../js/policy-ledger.js');
const Workflow = require('../js/policy-workflow.js');

const clock = () => '2026-09-29T08:00:00.000Z';
function freshState() {
  return { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), current: null, ledger: [] };
}
function analyzed(ruleId = 'R-PK-01', newValue = '5 ngày', tier = 2) {
  const state = freshState();
  const built = Workflow.buildChange(state.registry, ruleId, newValue, tier);
  Workflow.startAnalysis(state, built.change, '');
  return state;
}
const find = (state, docId, lineIndex) => state.current.props.find(p => p.docId === docId && p.lineIndex === lineIndex);

test('ban hành chỉ áp dụng AUTO_PATCH đã qua prover; ESCALATE chưa quyết thì không đụng', () => {
  const state = analyzed();
  const before = JSON.stringify(state.docs.find(d => d.id === 'QD-01'));
  const result = Workflow.commit(state, { now: clock });
  assert.equal(result.ok, true);
  assert.equal(result.applied, 6);
  assert.equal(JSON.stringify(state.docs.find(d => d.id === 'QD-01')), before);
  assert.equal(state.ledger.length, 6);
  assert.equal(Ledger.verify(state.ledger), true);
  assert.ok(state.ledger.every(e => e.actor === 'AI · động cơ tiền định'));
});

test('người chấp thuận U1 thì dòng được sửa; người từ chối U2 thì ghi TỪ CHỐI SỬA, không đổi nội dung', () => {
  const state = analyzed();
  const u1 = find(state, 'HD-04', 3);
  const u2 = find(state, 'QT-07', 1);
  assert.equal(Workflow.decide(state, u1.id, 'a').ok, true);
  assert.equal(Workflow.decide(state, u2.id, 'a').ok, true);
  const before = state.docs.find(d => d.id === 'QT-07').lines[1];
  Workflow.commit(state, { now: clock, humanActor: () => 'Người · Nguyễn A (demo)' });
  assert.equal(state.docs.find(d => d.id === 'HD-04').lines[3].includes('5 ngày'), true);
  assert.equal(state.docs.find(d => d.id === 'QT-07').lines[1], before);
  const refusal = state.ledger.find(e => e.action === 'TỪ CHỐI SỬA dòng 2');
  assert.equal(refusal.actor, 'Người · Nguyễn A (demo)');
  assert.equal(state.ledger.find(e => e.docId === 'HD-04' && e.lineIndex === 3).actor, 'Người · Nguyễn A (demo)');
  assert.equal(state.ledger.find(e => e.docId === 'HD-04' && e.lineIndex === 1).actor, 'AI · động cơ tiền định');
});

test('dòng bị người khác sửa sau khi phân tích thì không được ban hành', () => {
  const state = analyzed();
  // AUTO_PATCH: prover phát hiện dòng đã khác ảnh chụp lúc phân tích nên chặn.
  state.docs.find(d => d.id === 'BM-03').lines[1] = 'Lưu ý: đã sửa tay trước khi ban hành, 7 ngày.';
  // ESCALATE đã được người chấp thuận: không có prover, nên workflow tự kiểm tra và bỏ qua.
  const u1 = find(state, 'HD-04', 3);
  Workflow.decide(state, u1.id, 'a');
  state.docs.find(d => d.id === 'HD-04').lines[3] = 'Đáp: nội dung đã được sửa tay, lưu bài 7 ngày.';
  const result = Workflow.commit(state, { now: clock });
  assert.equal(result.proverHeld, 1);
  assert.equal(result.stale, 1);
  assert.equal(result.applied, 5);
  assert.match(result.message, /bỏ qua 1 dòng/);
  assert.equal(state.docs.find(d => d.id === 'HD-04').lines[3], 'Đáp: nội dung đã được sửa tay, lưu bài 7 ngày.');
});

test('sổ bị sửa lén thì từ chối ban hành toàn bộ', () => {
  const state = analyzed();
  Workflow.commit(state, { now: clock });
  const second = analyzed('R-TC-01', '15 triệu', 2);
  second.ledger = state.ledger;
  second.ledger[0].to = 'giả mạo';
  const result = Workflow.commit(second, { now: clock });
  assert.equal(result.ok, false);
  assert.equal(result.applied, 0);
});

test('hoàn tác khôi phục dòng, thêm bản ghi mới; từ chối khi dòng đã khác bản ban hành', () => {
  const state = analyzed();
  Workflow.commit(state, { now: clock });
  const first = state.ledger[0];
  const doc = state.docs.find(d => d.id === first.docId);
  const undone = Workflow.undo(state, first.seq, { now: clock });
  assert.equal(undone.ok, true);
  assert.equal(doc.lines[first.lineIndex], first.from);
  assert.equal(state.ledger[state.ledger.length - 1].revertsSeq, first.seq);
  assert.equal(Workflow.undo(state, first.seq, { now: clock }).ok, false);

  const second = state.ledger[1];
  state.docs.find(d => d.id === second.docId).lines[second.lineIndex] = 'đã bị sửa tay';
  const refused = Workflow.undo(state, second.seq, { now: clock });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /đã khác/);
  assert.equal(Ledger.verify(state.ledger), true);
});

test('bộ Verify: 9/9 ca đạt trên kho mẫu', () => {
  const env = { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), seedDocuments: Data.SEED_DOCUMENTS };
  const rows = [...Data.SUITE_REQUIRED, ...Data.SUITE_ESCALATION].map(tc => Workflow.runVerifyCase(tc, env));
  assert.deepEqual(rows.filter(r => !r.ok).map(r => r.id), []);
  assert.equal(rows.length, 9);
});

test('thêm neo: từ chối cụm trùng / chồng lên neo của quy định khác, ghi sổ khi hợp lệ', () => {
  const state = freshState();
  assert.equal(Workflow.addAnchor(state, 'R-PK-01', 'khiếu nại điểm', { now: clock }).ok, false);
  assert.equal(Workflow.addAnchor(state, 'R-PK-01', 'phúc khảo', { now: clock }).ok, false);
  assert.equal(Workflow.addAnchor(state, 'R-PK-01', 'lưu bài 7', { now: clock }).ok, false);
  const ok = Workflow.addAnchor(state, 'R-PK-01', 'lưu bài', { now: clock, actor: 'Trưởng phòng Đào tạo (demo)' });
  assert.equal(ok.ok, true);
  assert.ok(state.registry.find(r => r.id === 'R-PK-01').aliases.includes('lưu bài'));
  assert.equal(state.ledger[0].action, 'THÊM NEO R-PK-01');
  assert.equal(Ledger.verify(state.ledger), true);
});

test('thêm tài liệu: kiểm tra đầu vào, cấp mã NEW-xx và ghi sổ', () => {
  const state = freshState();
  assert.equal(Workflow.addDocument(state, { title: '', tier: 1, lines: ['a'] }).ok, false);
  assert.equal(Workflow.addDocument(state, { title: 'X', tier: 4, lines: ['a'] }).ok, false);
  const r = Workflow.addDocument(state, { title: 'Hướng dẫn Khoa Điện', owner: 'Phòng Đào tạo', tier: 1, lines: ['Nộp đơn phúc khảo trong 7 ngày.', ''] }, { now: clock });
  assert.equal(r.ok, true);
  assert.equal(r.doc.id, 'NEW-01');
  assert.deepEqual(r.doc.lines, ['Nộp đơn phúc khảo trong 7 ngày.']);
  assert.equal(state.ledger[0].action, 'THÊM TÀI LIỆU NEW-01');
});
