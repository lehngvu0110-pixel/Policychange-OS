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
    registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], feedback: [], openChanges: [], decisions: [] });
  const remote = { configured: true,
    loadWorkspace: async () => snapshot(), tail: async () => ({ seq: 0, hash: '0'.repeat(64) }),
    call: async body => { calls.push(body); return { ok: true, status: 200, data: { message: 'Đã ban hành.', applied: 5,
      records: [{ propId: 'P1', docId: 'QT-02', lineIndex: 0, from: Data.SEED_DOCUMENTS.find(d => d.id === 'QT-02').lines[0], action: 'PATCH dòng 1' }] } }; } };
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
  assert.deepEqual(body.decisions.map(d => [d.docId, d.lineIndex, d.act, d.persona]), [[u1.docId, u1.lineIndex, 'a', 'cv-dt']]);
  // Đối chiếu theo vị trí + nội dung, không theo propId (máy chủ trả P1 cho dòng mà client gọi là P2).
  assert.equal(app.state.current.props.find(p => p.docId === 'QT-02' && p.lineIndex === 0).applied, true);
  assert.equal(app.state.current.props.find(p => p.id === 'P1').applied, undefined);
});

test('trực tuyến mất mạng khi khởi động → tự lùi về ngoại tuyến kèm thông báo', async () => {
  const remote = { configured: true, loadWorkspace: async () => ({ ok: false, reason: 'network', message: 'Không kết nối được máy chủ.' }) };
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote }));
  await app.init();
  assert.equal(app.state.source, 'local');
  assert.equal(app.state.connection, 'offline');
  assert.match(app.state.notice.text, /Ngoại tuyến/);
});

test('trực tuyến: hồ sơ dùng chung hiện đúng người có thẩm quyền và gửi quyết định lên máy chủ', async () => {
  const calls = [];
  const Data = require('../js/policy-data.js');
  const Engine = require('../js/policy-engine.js');
  const remote = { configured: true, tail: async () => null,
    loadWorkspace: async () => ({ ok: true, workspace: { id: 'demo', name: 'Demo', mode: 'demo' },
      registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], feedback: [],
      openChanges: [{ id: 'CR-1', ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2, requestText: '', createdBy: 'A', status: 'open', held: [] }],
      decisions: [] }),
    call: async body => { calls.push(body); return { ok: true, status: 200, data: { message: 'Đã giữ nguyên QT-07 dòng 2.' } }; } };
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote }));
  await app.init();
  const items = app.caseItems();
  assert.deepEqual(items.map(i => i.p.category).sort(), ['U1', 'U2', 'U3']);
  const u2 = items.find(i => i.p.category === 'U2');
  app.setPersona('tp-dt');
  assert.equal((await app.decideCase(u2, 'a')).ok, false);
  app.setPersona('tp-tt');
  assert.equal((await app.decideCase(u2, 'a')).ok, true);
  assert.deepEqual([calls[0].action, calls[0].changeId, calls[0].docId, calls[0].act, calls[0].persona], ['decide', 'CR-1', 'QT-07', 'a', 'tp-tt']);
});

test('ngoại tuyến: bản ghi ghi đúng tên người quyết, không phải người bấm Ban hành', async () => {
  const app = await offline();
  app.analyze(CHANGE);
  const u2 = app.state.current.props.find(p => p.category === 'U2');
  app.setPersona('tp-tt'); app.decide(u2.id, 'a');
  app.setPersona('tp-dt');
  assert.equal((await app.commit()).ok, true);
  const rec = app.state.ledger.find(e => e.docId === 'QT-07');
  assert.equal(rec.actor, 'Người · Trưởng phòng Thanh tra – Pháp chế (demo)');
  assert.match(rec.basis, /cấp ban hành 2 · khởi tạo bởi Trưởng phòng Đào tạo \(demo\)/);
});

test('có AI thật: Ban hành tự cho mô hình rà các dòng tự sửa trước; dòng AI nghi ngờ bị giữ lại cho người', async () => {
  const calls = [];
  const aiAdapter = {
    status: async () => ({ available: true, model: 'test-model' }),
    discover: async payload => { calls.push(payload); return { available: true, output: { schemaVersion: 1, candidates: payload.candidates.map(c => {
      const q = '7 ngày'; const start = c.line.indexOf(q);
      return { ruleId: c.ruleId, documentId: c.documentId, lineIndex: c.lineIndex, quote: q, start, end: start + q.length,
        relation: c.documentId === 'QT-02' && c.lineIndex === 4 ? 'possibly_related' : 'supports', explanation: 'test', evidence: [{ quote: q, start, end: start + q.length }] };
    }) } }; },
    extract: async () => ({ available: false })
  };
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend(), workspace: 'local' }), aiAdapter }));
  await app.init({ prefer: 'local' });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(app.state.ai.status, 'ready');
  app.analyze(CHANGE);
  app.setPersona('tp-dt');
  const res = await app.commit();
  assert.equal(res.ok, true, res.message);
  assert.equal(calls.length, 1, 'mô hình được gọi đúng một lần, tự động');
  const held = app.state.current.props.find(p => p.docId === 'QT-02' && p.lineIndex === 4);
  assert.equal(held.semanticHold, true);
  assert.ok(!held.applied, 'dòng AI nghi ngờ không được tự sửa');
  assert.equal(res.applied, 5);
});

test('bản lưu ngoại tuyến cũ (chưa có neo đại lượng) không lặng lẽ tắt điều kiện §5.4', async () => {
  const backend = Store.memoryBackend();
  const Data = require('../js/policy-data.js');
  const old = Data.SEED_REGISTRY.map(({ measures, ...r }) => ({ ...r, aliases: [...r.aliases] }));
  const store = Store.createLocalStore({ backend, workspace: 'local' });
  await store.save({ registry: old, docs: require('../js/policy-engine.js').cloneDocs(Data.SEED_DOCUMENTS), ledger: [], feedback: [] });
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend, workspace: 'local' }) }));
  await app.init({ prefer: 'local' });
  assert.ok(app.state.registry.find(r => r.id === 'R-PK-01').measures.includes('nộp'));
});

test('đổi vai trò trong lúc AI đang rà → không ban hành; bấm Ban hành lần hai khi AI chưa xong → bị chặn', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const aiAdapter = {
    status: async () => ({ available: true, model: 'm' }),
    discover: async payload => { await gate; return { available: true, output: { schemaVersion: 1, candidates: [] } }; },
    extract: async () => ({ available: false })
  };
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend(), workspace: 'local' }), aiAdapter }));
  await app.init({ prefer: 'local' });
  await new Promise(r => setTimeout(r, 0));
  app.analyze(CHANGE);
  app.setPersona('tp-dt');
  const first = app.commit();
  await new Promise(r => setTimeout(r, 0));
  const second = await app.commit();
  assert.equal(second.ok, false, 'lần bấm thứ hai không được bỏ qua bước rà soát');
  app.setPersona('cv-dt');
  release();
  const res = await first;
  assert.equal(res.ok, false);
  assert.match(res.message, /vai trò vừa thay đổi/);
  assert.equal(app.state.ledger.length, 0);
});

// ---------- Hồi quy theo báo cáo kiểm thử 02/10/2026 ----------

/** Adapter AI giả: mỗi lần gọi lấy một hành vi trong danh sách ('hold' | 'fail' | 'supports' | Promise). */
function scriptedAdapter(script) {
  const calls = [];
  return { calls, status: async () => ({ available: true, model: 'test' }), extract: async () => ({ available: false }),
    discover: async payload => {
      const step = script[Math.min(calls.length, script.length - 1)];
      calls.push(payload);
      if (step === 'fail') throw new Error('network');
      if (step && typeof step.then === 'function') await step;
      const relation = step === 'supports' ? 'supports' : 'uncertain';
      return { available: true, output: { schemaVersion: 1, candidates: payload.candidates.map(c => {
        const q = '7 ngày'; const start = c.line.indexOf(q);
        return { ruleId: c.ruleId, documentId: c.documentId, lineIndex: c.lineIndex, quote: q, start, end: start + q.length,
          relation, explanation: 'test', evidence: [{ quote: q, start, end: start + q.length }] };
      }) } };
    } };
}
async function offlineWithAI(adapter) {
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend(), workspace: 'local' }), aiAdapter: adapter }));
  await app.init({ prefer: 'local' });
  await new Promise(r => setTimeout(r, 0));
  return app;
}

test('F01: rà soát lần hai thất bại KHÔNG xoá cờ giữ lại; Ban hành không sửa dòng bị giữ', async () => {
  const adapter = scriptedAdapter(['hold', 'fail']);
  const app = await offlineWithAI(adapter);
  app.analyze(CHANGE);
  const autos = app.state.current.props.filter(p => p.outcome === 'AUTO_PATCH').length;
  const first = await app.discoverSemantics();
  assert.equal(first.status, 'complete');
  assert.equal(app.state.current.props.filter(p => p.semanticHold).length, autos, 'mọi dòng tự sửa bị giữ lại');
  const second = await app.discoverSemantics();
  assert.equal(second.status, 'provider_failure');
  assert.equal(app.state.current.props.filter(p => p.semanticHold).length, autos, 'lần lỗi không được xoá cờ giữ lại');
  assert.ok(app.state.current.props.filter(p => p.semanticHold).every(p => Array.isArray(p.semanticEvidence)), 'bằng chứng cũ còn nguyên');
  assert.match(second.message, /giữ nguyên kết quả rà soát trước/);
  app.setPersona('tp-dt');
  const res = await app.commit();
  assert.equal(adapter.calls.length, 2, 'đã có một lần rà hợp lệ thì Ban hành không gọi lại AI');
  assert.equal(res.applied || 0, 0, 'không dòng nào bị giữ được tự sửa khi chưa có người duyệt');
  assert.equal(app.state.ledger.filter(e => String(e.action).startsWith('PATCH')).length, 0);
});

test('F01: lỗi ở lần rà tự động trước Ban hành cũng không gỡ cờ giữ lại', async () => {
  const adapter = scriptedAdapter(['hold', 'fail']);
  const app = await offlineWithAI(adapter);
  app.analyze(CHANGE);
  await app.discoverSemantics();
  app.state.current.semanticSettled = false; // mô phỏng phiên cũ: buộc Ban hành rà lại và lần đó lỗi
  app.setPersona('tp-dt');
  const res = await app.commit();
  assert.equal(adapter.calls.length, 2);
  assert.equal(res.applied || 0, 0);
});

test('F03: kết quả của lượt rà cũ về muộn bị bỏ, không ghi đè lượt mới hơn', async () => {
  let release;
  const slow = new Promise(r => { release = r; });
  const real = scriptedAdapter([slow]);          // "AI thật": về muộn, nói supports (không giữ)
  const app = await offlineWithAI(real);
  app.analyze(CHANGE);
  // supports cho lượt chậm: đổi kịch bản sau khi đã gọi
  const late = app.discoverSemantics();
  await new Promise(r => setTimeout(r, 0));
  const fixture = scriptedAdapter(['hold']);     // dữ liệu mẫu của minh hoạ: giữ lại
  const fresh = await app.discoverSemantics(fixture, 'fixture_mock');
  assert.equal(fresh.status, 'complete');
  const held = app.state.current.props.filter(p => p.semanticHold).length;
  assert.ok(held > 0);
  release();
  const stale = await late;
  assert.equal(stale.stale, true);
  assert.equal(app.state.current.props.filter(p => p.semanticHold).length, held, 'lượt cũ không ghi đè');
  assert.equal(app.state.current.semanticSource, 'fixture_mock');
});

test('F02: biểu mẫu khác với phân tích → không ban hành', async () => {
  const app = await offline();
  app.analyze({ ...CHANGE, requestText: 'Rút hạn phúc khảo từ 7 ngày xuống 5 ngày, Trưởng phòng Đào tạo ban hành.' });
  app.setPersona('tp-dt');
  assert.equal(app.matchesInput({ ...CHANGE, requestText: 'Rút hạn phúc khảo từ 7 ngày xuống 5 ngày,  Trưởng phòng Đào tạo ban hành. ' }), true, 'khoảng trắng thừa không tính');
  const other = await app.commit({ expect: { ...CHANGE, requestText: 'Đổi tất cả các thời hạn 7 ngày thành 5 ngày.' } });
  assert.equal(other.ok, false);
  assert.match(other.message, /Biểu mẫu đã thay đổi/);
  const value = await app.commit({ expect: { ...CHANGE, newValue: '4 ngày', requestText: 'Rút hạn phúc khảo từ 7 ngày xuống 5 ngày, Trưởng phòng Đào tạo ban hành.' } });
  assert.equal(value.ok, false);
  assert.equal(app.state.ledger.length, 0);
  const same = await app.commit({ expect: { ...CHANGE, issuerTier: '2', requestText: 'Rút hạn phúc khảo từ 7 ngày xuống 5 ngày, Trưởng phòng Đào tạo ban hành.' } });
  assert.equal(same.ok, true, same.message);
});

test('F07: sau chính lần Ban hành của mình, phân tích không bị coi là cũ', async () => {
  const app = await offline();
  app.analyze(CHANGE);
  app.setPersona('tp-dt');
  assert.equal((await app.commit()).ok, true);
  assert.equal(app.state.current.revision, app.state.revision);
  await app.addAnchor('R-PK-01', 'đơn xin phúc khảo', 'test');
  assert.notEqual(app.state.current.revision, app.state.revision, 'thay đổi sổ đăng ký sau đó vẫn được cảnh báo');
});

function remoteWith(snapshotExtra, opts = {}) {
  const Data = require('../js/policy-data.js');
  const Engine = require('../js/policy-engine.js');
  const loads = [];
  return { loads, configured: true, session: opts.session || null, tail: async () => opts.tail || null,
    loadWorkspace: async id => {
      loads.push(id);
      if (opts.forbidden && opts.forbidden.includes(id)) return { ok: false, reason: 'forbidden', message: 'Không có quyền đọc workspace này.' };
      return { ok: true, workspace: { id, name: id, mode: id === 'demo' ? 'demo' : 'live' },
        registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], feedback: [],
        openChanges: [], decisions: [], ...snapshotExtra };
    },
    call: async body => body.action === 'whoami' ? { ok: true, status: 200, data: { member: { id: 'u', displayName: 'Hiệu trưởng', tier: 3, units: ['*'] } } } : { ok: true, status: 200, data: {} } };
}

test('F04: thoát minh hoạ khôi phục hàng đợi dùng chung (openChanges, decisions, người đăng nhập)', async () => {
  const oc = { id: 'CR-1', ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2, requestText: '', createdBy: 'A', status: 'open', held: [] };
  const decision = { changeId: 'CR-1', docId: 'QT-07', lineIndex: 1, act: 'a' };
  const remote = remoteWith({ openChanges: [oc], decisions: [decision] }, { session: { email: 'x' } });
  const app = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote }));
  await app.init();
  assert.equal(app.state.workspace.id, 'hcmut-pilot');
  const member = app.state.liveMember;
  const before = app.caseItems().length;
  assert.ok(before > 0);
  app.enterSandbox({ label: 'Minh hoạ', docs: [{ id: 'DEMO', title: 't', owner: 'Phòng Đào tạo', tier: 2, version: '1.0', lines: ['Nộp đơn phúc khảo trong 7 ngày.'] }] });
  assert.equal(app.state.openChanges.length, 0);
  app.exitSandbox();
  assert.equal(app.state.source, 'remote');
  assert.equal(app.state.openChanges.length, 1);
  assert.equal(app.state.decisions.length, 1);
  assert.equal(app.state.liveMember, member);
  assert.equal(app.caseItems().length, before);
});

test('F05: khởi động mở lại workspace đã chọn; workspace không đọc được thì lùi về Trình diễn, không về ngoại tuyến', async () => {
  const remembered = remoteWith({});
  const a = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote: remembered }));
  await a.init({ workspace: 'hcmut-pilot' });
  assert.equal(a.state.workspace.id, 'hcmut-pilot');

  const signedIn = remoteWith({}, { session: { email: 'x' } });
  const b = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote: signedIn }));
  await b.init();
  assert.deepEqual(signedIn.loads, ['hcmut-pilot'], 'còn phiên đăng nhập → mở thẳng workspace thí điểm');

  const expired = remoteWith({}, { forbidden: ['hcmut-pilot'] });
  const c = App.createController(deps({ localStore: Store.createLocalStore({ backend: Store.memoryBackend() }), remote: expired }));
  await c.init({ workspace: 'hcmut-pilot' });
  assert.equal(c.state.source, 'remote');
  assert.equal(c.state.workspace.id, 'demo');
  assert.match(c.state.notice.text, /Trình diễn/);
});
