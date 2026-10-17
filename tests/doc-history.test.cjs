const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Ledger = require('../js/policy-ledger.js');
const Workflow = require('../js/policy-workflow.js');
const History = require('../js/doc-history.js');

const clock = () => '2026-10-17T08:00:00.000Z';
function analyzed(newValue = '5 ngày') {
  const state = { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), current: null, ledger: [] };
  const built = Workflow.buildChange(state.registry, 'R-PK-01', newValue, 2);
  Workflow.startAnalysis(state, built.change, '');
  return state;
}
const docOf = (state, id) => state.docs.find(d => d.id === id);
/** Tài liệu có ít nhất một AUTO_PATCH trong ca R-PK-01 → 5 ngày. */
function autoDoc(state) { return state.current.props.find(p => p.outcome === 'AUTO_PATCH').docId; }

test('tài liệu chưa đổi: chỉ có phiên bản gốc, là phiên bản hiện tại', () => {
  const state = analyzed();
  const doc = state.docs[0];
  const h = History.build(doc, state.ledger, { chainOk: true });
  assert.equal(h.revisions.length, 1);
  assert.equal(h.revisions[0].kind, 'base');
  assert.equal(h.revisions[0].current, true);
  assert.deepEqual(h.revisions[0].lines, doc.lines);
  assert.equal(h.integrity.ok, true);
});

test('đề xuất chưa áp dụng không được tính là phiên bản; chỉ hiện ở danh sách đề xuất', () => {
  const state = analyzed();
  const id = autoDoc(state);
  const h = History.build(docOf(state, id), state.ledger);
  assert.equal(h.revisions.length, 1, 'chưa ban hành thì không có phiên bản mới');
  const props = History.proposals(id, state.current);
  assert.ok(props.length >= 1);
  assert.ok(props.every(p => /Chờ|Đã duyệt|từ chối|giữ nguyên/i.test(p.status)));
  assert.ok(props[0].words.some(w => w.type === 'add'));
});

test('ban hành tạo phiên bản mới có người thực hiện, loại AI, prover, liên kết băm sổ', () => {
  const state = analyzed();
  const id = autoDoc(state);
  const original = docOf(state, id).lines.slice();
  Workflow.commit(state, { now: clock });
  const doc = docOf(state, id);
  const h = History.build(doc, state.ledger, { chainOk: Ledger.verify(state.ledger) });
  assert.ok(h.revisions.length >= 2);
  assert.deepEqual(h.revisions[0].lines, original, 'dựng ngược ra đúng nội dung gốc');
  const last = h.revisions[h.revisions.length - 1];
  assert.equal(last.current, true);
  assert.deepEqual(last.lines, doc.lines);
  assert.equal(last.version, doc.version);
  assert.equal(last.actorKind, 'ai');
  assert.match(last.approval, /prover xác nhận/);
  const rec = state.ledger.find(r => r.seq === last.seq);
  assert.equal(last.hash, rec.hash);
  assert.equal(h.integrity.ok, true);
});

test('quyết định của người: phiên bản ghi người duyệt, mã hồ sơ CR, loại U', () => {
  const state = analyzed();
  const u1 = state.current.props.find(p => p.docId === 'HD-04' && p.lineIndex === 3);
  Workflow.decide(state, u1.id, 'a');
  Workflow.commit(state, { now: clock, humanActor: () => 'Người · Trưởng phòng (demo)', basisSuffix: 'hồ sơ CR-7 · cấp ban hành 2 · khởi tạo bởi A' });
  const h = History.build(docOf(state, 'HD-04'), state.ledger);
  const r = h.revisions.find(x => x.lineIndex === 3);
  assert.equal(r.actorKind, 'human');
  assert.equal(r.changeId, 'CR-7');
  assert.match(r.approval, /Người có thẩm quyền duyệt · U1/);
});

test('từ chối sửa và giữ nguyên là sự kiện, không phải phiên bản', () => {
  const state = analyzed();
  const u2 = state.current.props.find(p => p.docId === 'QT-07' && p.lineIndex === 1);
  Workflow.decide(state, u2.id, 'a');
  Workflow.commit(state, { now: clock });
  const doc = docOf(state, 'QT-07');
  const h = History.build(doc, state.ledger);
  const rejected = state.ledger.filter(r => r.docId === 'QT-07' && r.action.startsWith('TỪ CHỐI'));
  assert.equal(h.events.filter(e => e.kind === 'rejected').length, rejected.length);
  assert.ok(h.revisions.every(r => !String(r.action).startsWith('TỪ CHỐI')));
});

test('hoàn tác tạo phiên bản mới, giữ nguyên phiên bản cũ và đánh dấu bản bị thu hồi', () => {
  const state = analyzed();
  const id = autoDoc(state);
  Workflow.commit(state, { now: clock });
  const before = state.ledger.length;
  const patch = state.ledger.find(r => r.docId === id && r.action.startsWith('PATCH'));
  assert.equal(Workflow.undo(state, patch.seq, { now: clock }).ok, true);
  assert.equal(state.ledger.length, before + 1, 'hoàn tác ghi thêm, không xoá');
  const h = History.build(docOf(state, id), state.ledger, { chainOk: Ledger.verify(state.ledger) });
  const p = h.revisions.find(r => r.seq === patch.seq);
  const rv = h.revisions[h.revisions.length - 1];
  assert.equal(rv.kind, 'revert');
  assert.equal(rv.revertsSeq, patch.seq);
  assert.equal(p.revertedBy, rv.seq);
  assert.equal(h.integrity.ok, true);
});

test('khôi phục về phiên bản gốc: hoàn tác lần lượt, mới nhất trước, kết quả trùng ảnh chụp', () => {
  const state = analyzed();
  // Hai lần đổi liên tiếp trên cùng tài liệu.
  const id = autoDoc(state);
  Workflow.commit(state, { now: clock });
  const built = Workflow.buildChange(state.registry, 'R-PK-01', '5 ngày', 2);
  // Đổi tiếp giá trị gốc để có lượt thứ hai trên cùng dòng.
  Workflow.ratifyRule(state, { now: clock });
  const b2 = Workflow.buildChange(state.registry, 'R-PK-01', '3 ngày', 2);
  Workflow.startAnalysis(state, b2.change, '');
  Workflow.commit(state, { now: clock });
  assert.ok(built.change);
  const h = History.build(docOf(state, id), state.ledger);
  assert.ok(h.revisions.length >= 3, 'có ít nhất hai lượt sửa');
  const plan = History.restorePlan(h, 0);
  assert.equal(plan.ok, true, plan.reason);
  const seqs = plan.undoSeqs.slice();
  assert.deepEqual(seqs, seqs.slice().sort((a, b) => b - a), 'mới nhất trước');
  for (const s of seqs) assert.equal(Workflow.undo(state, s, { now: clock }).ok, true);
  assert.deepEqual(docOf(state, id).lines, h.revisions[0].lines);
  assert.equal(Ledger.verify(state.ledger), true);
  // Toàn bộ lịch sử cũ vẫn còn, cộng thêm các bản ghi hoàn tác.
  const h2 = History.build(docOf(state, id), state.ledger);
  assert.equal(h2.revisions.length, h.revisions.length + seqs.length);
});

test('không khôi phục được phiên bản chứa thay đổi đã bị thu hồi', () => {
  const state = analyzed();
  const id = autoDoc(state);
  Workflow.commit(state, { now: clock });
  const patch = state.ledger.find(r => r.docId === id && r.action.startsWith('PATCH'));
  Workflow.undo(state, patch.seq, { now: clock });
  const h = History.build(docOf(state, id), state.ledger);
  const n = h.revisions.findIndex(r => r.seq === patch.seq);
  const plan = History.restorePlan(h, n);
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /ban hành lại/);
  assert.equal(History.restorePlan(h, h.revisions.length - 1).ok, false, 'phiên bản hiện tại không cần khôi phục');
});

test('tài liệu bị sửa ngoài sổ: báo không khớp và chặn khôi phục', () => {
  const state = analyzed();
  const id = autoDoc(state);
  Workflow.commit(state, { now: clock });
  const doc = docOf(state, id);
  const rec = state.ledger.find(r => r.docId === id && r.action.startsWith('PATCH'));
  doc.lines[rec.lineIndex] = 'sửa lén';
  const h = History.build(doc, state.ledger);
  assert.equal(h.integrity.ok, false);
  assert.match(h.integrity.problems[0], /không khớp/);
  assert.equal(History.restorePlan(h, 0).ok, false);
});

test('chuỗi băm hỏng thì lịch sử báo không toàn vẹn', () => {
  const state = analyzed();
  Workflow.commit(state, { now: clock });
  state.ledger[0].basis = 'sửa lén';
  const id = state.ledger[1].docId;
  const h = History.build(docOf(state, id), state.ledger, { chainOk: Ledger.verify(state.ledger) });
  assert.equal(h.integrity.chainOk, false);
  assert.equal(h.integrity.ok, false);
});

test('tài liệu thêm mới: phiên bản đầu là bản ghi THÊM TÀI LIỆU; tài liệu khác workspace không lẫn vào', () => {
  const state = analyzed();
  const r = Workflow.addDocument(state, { title: 'Hướng dẫn thử', owner: 'P', tier: 1, lines: ['Nộp đơn phúc khảo trong 7 ngày.'] }, { now: clock });
  assert.equal(r.ok, true);
  const h = History.build(r.doc, state.ledger);
  assert.equal(h.revisions[0].kind, 'created');
  assert.equal(h.revisions[0].seq, r.records[0].seq);
  const foreign = [{ seq: 99, docId: 'KHAC', action: 'PATCH dòng 1', lineIndex: 0, from: 'a', to: 'b', actor: 'AI', basis: '' }];
  assert.equal(History.build(r.doc, state.ledger.concat(foreign)).revisions.length, 1);
});

test('so sánh dòng và từ', () => {
  const d = History.diffLines(['a b c', 'giữ', 'xoá'], ['a x c', 'giữ', 'mới']);
  assert.equal(d.stats.changed, 2);
  const w = History.diffWords('nộp trong 7 ngày', 'nộp trong 5 ngày');
  assert.deepEqual(w.filter(x => x.type !== 'same').map(x => x.type + ':' + x.text), ['del:7', 'add:5']);
  const add = History.diffLines(['a'], ['a', 'b']);
  assert.equal(add.stats.added, 1);
});
