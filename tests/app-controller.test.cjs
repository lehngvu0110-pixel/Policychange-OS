'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../js/app-controller.js');
const Store = require('../js/policy-store.js');

const deps = extra => ({
  Engine: require('../js/policy-engine.js'), Data: require('../js/policy-data.js'), Workflow: require('../js/policy-workflow.js'),
  Ledger: require('../js/policy-ledger.js'), Authz: require('../js/policy-authz.js'), Server: require('../js/policy-server.js'),
  Semantic: require('../js/semantic-discovery.js'), AI: require('../js/policy-ai.js'), Learning: require('../js/policy-learning.js'),
  now: () => '2026-10-01T08:00:00.000Z', ...extra
});
const CHANGE = { ruleId: 'R-PK-01', newValue: '5 ngày', issuerTier: 2, requestText: '' };

async function offline(backend = Store.memoryBackend()) {
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend, workspace: 'local' }) }));
  await app.init({ prefer: 'local' });
  return app;
}

test('ngoại tuyến: phân tích → quyết định đúng thẩm quyền → ban hành → tải lại vẫn còn', async () => {
  const backend = Store.memoryBackend();
  const app = await offline(backend);
  assert.equal(app.state.source, 'local');
  assert.equal(app.analyze(CHANGE).ok, true);
  const u1 = app.state.current.props.find(p => p.docId === 'HD-04' && p.lineIndex === 3);
  const u2 = app.state.current.props.find(p => p.docId === 'QT-07');
  assert.equal(u1.category, 'U1');
  assert.equal(u2.category, 'U2');

  app.setPersona('tp-tc');
  assert.equal(app.decide(u1.id, 'a').ok, false, 'Trưởng phòng Tài chính không phụ trách Cổng thông tin sinh viên');
  app.setPersona('cv-dt');
  assert.equal(app.decide(u1.id, 'b').ok, true);
  assert.equal(app.decide(u2.id, 'a').ok, false, 'U2 cần Trưởng phòng Thanh tra – Pháp chế');
  app.setPersona('tp-tt');
  assert.equal(app.decide(u2.id, 'a').ok, true);

  app.setPersona('cv-dt');
  const refused = await app.commit();
  assert.equal(refused.ok, false, 'chuyên viên cấp 1 không được ban hành thay đổi cấp 2');
  app.setPersona('tp-dt');
  const done = await app.commit();
  assert.equal(done.ok, true, done.message);
  assert.equal(done.applied, 6);
  assert.equal(app.state.feedback.length, 2);
  assert.ok(app.state.ledger.every(e => e.actor === 'AI · động cơ tiền định' || e.actor.startsWith('Người · ')));

  const again = await offline(backend);
  assert.equal(again.state.ledger.length, app.state.ledger.length);
  assert.equal(again.state.docs.find(d => d.id === 'QT-02').lines[0].includes('5 ngày'), true);
  assert.equal(again.state.feedback.length, 2);
});

test('ngoại tuyến: hoàn tác theo quyền và phê chuẩn quy định gốc theo cấp', async () => {
  const app = await offline();
  app.analyze({ ...CHANGE, issuerTier: 3 });
  app.setPersona('ht');
  const res = await app.commit({ ratify: true });
  assert.equal(res.ok, true);
  assert.equal(app.state.registry.find(r => r.id === 'R-PK-01').value, '5 ngày');
  const patch = app.state.ledger.find(e => e.docId === 'QD-01' && e.action.startsWith('PATCH'));
  app.setPersona('tp-dt');
  assert.equal(app.canUndo(patch.seq).ok, false, 'QD-01 cấp 3 chỉ Hiệu trưởng hoàn tác');
  app.setPersona('ht');
  assert.equal((await app.undo(patch.seq)).ok, true);
  assert.equal(app.state.ledger.at(-1).revertsSeq, patch.seq);
});

test('minh hoạ chạy trên bản sao tạm, thoát ra trả lại nguyên trạng', async () => {
  const app = await offline();
  const before = app.state.docs.length;
  app.enterSandbox({ label: 'Minh hoạ', docs: [{ id: 'DEMO', title: 't', owner: 'Phòng Đào tạo', tier: 2, version: '1.0', lines: ['Nộp đơn phúc khảo trong 7 ngày.'] }] });
  assert.equal(app.state.source, 'sandbox');
  app.analyze(CHANGE);
  assert.equal((await app.commit()).ok, true);
  app.exitSandbox();
  assert.equal(app.state.source, 'local');
  assert.equal(app.state.docs.length, before);
  assert.equal(app.state.ledger.length, 0);
});

test('học từ phản hồi: đủ phản hồi "Có" → đề xuất neo; chỉ trưởng đơn vị sở hữu được duyệt', async () => {
  const app = await offline();
  app.state.feedback.push(
    { ruleId: 'R-PK-01', category: 'U1', docId: 'A', lineIndex: 0, line: 'Phòng thi chỉ lưu bài thi trong 7 ngày.', answer: 'accept' },
    { ruleId: 'R-PK-01', category: 'U1', docId: 'B', lineIndex: 0, line: 'Khoa lưu bài thi tối đa 7 ngày.', answer: 'accept' });
  const s = app.suggestions().find(x => x.phrase === 'lưu bài thi');
  assert.ok(s);
  app.setPersona('cv-dt');
  assert.equal((await app.addAnchor('R-PK-01', s.phrase)).ok, false);
  app.setPersona('tp-dt');
  assert.equal((await app.addAnchor('R-PK-01', s.phrase, 'Học từ 2 phản hồi')).ok, true);
  assert.ok(app.state.registry.find(r => r.id === 'R-PK-01').aliases.includes('lưu bài thi'));
});

test('trực tuyến: ban hành gửi đúng ý định lên policy-api rồi nạp lại', async () => {
  const calls = [];
  const Data = require('../js/policy-data.js');
  const Engine = require('../js/policy-engine.js');
  const snapshot = () => ({ ok: true, workspace: { id: 'demo', name: 'Demo', mode: 'demo' },
    registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], feedback: [] });
  const remote = { configured: true,
    loadWorkspace: async () => snapshot(), tail: async () => ({ seq: 0, hash: '0'.repeat(64) }),
    call: async body => { calls.push(body); return { ok: true, status: 200, data: { message: 'Đã ban hành.', applied: 5, records: [{ propId: 'P2', action: 'PATCH dòng 1' }] } }; } };
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote }));
  await app.init();
  assert.equal(app.state.source, 'remote');
  app.analyze(CHANGE);
  const u1 = app.state.current.props.find(p => p.category === 'U1');
  app.setPersona('cv-dt'); app.decide(u1.id, 'a');
  app.setPersona('tp-dt');
  const res = await app.commit();
  assert.equal(res.ok, true);
  const body = calls.find(c => c.action === 'commit');
  assert.deepEqual(body.change, { ruleId: 'R-PK-01', newValue: '5 ngày', issuerTier: 2 });
  assert.equal(body.persona, 'tp-dt');
  assert.deepEqual(body.decisions.map(d => [d.docId, d.lineIndex, d.act]), [[u1.docId, u1.lineIndex, 'a']]);
  assert.equal(app.state.current.props.find(p => p.id === 'P2').applied, true);
});

test('trực tuyến mất mạng khi khởi động → tự lùi về ngoại tuyến kèm thông báo', async () => {
  const remote = { configured: true, loadWorkspace: async () => ({ ok: false, reason: 'network', message: 'Không kết nối được máy chủ.' }) };
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote }));
  await app.init();
  assert.equal(app.state.source, 'local');
  assert.equal(app.state.connection, 'offline');
  assert.match(app.state.notice.text, /Ngoại tuyến/);
});
