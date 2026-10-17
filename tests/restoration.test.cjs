const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Workflow = require('../js/policy-workflow.js');
const Ledger = require('../js/policy-ledger.js');
const Server = require('../js/policy-server.js');
const Store = require('../js/policy-store.js');
const App = require('../js/app-controller.js');
const History = require('../js/doc-history.js');
const clock = () => '2026-10-17T08:00:00Z';
function stateWithHistory() {
  const state = { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], current: null };
  Workflow.startAnalysis(state, Workflow.buildChange(state.registry, 'R-PK-01', '5 ngày', 2).change, '');
  Workflow.commit(state, { now: clock });
  const tail = Ledger.tailOf(state.ledger);
  return { ...state, now: clock, member: Server.demoMember('tp-dt'), workspace: { id: 'test', mode: 'live', ledger_seq: tail.seq, ledger_tail: tail.hash } };
}
const intent = ctx => ({ docId: 'QT-02', targetRevision: 0, expectedSeq: ctx.workspace.ledger_seq, expectedTail: ctx.workspace.ledger_tail,
  expectedVersion: ctx.docs.find(d => d.id === 'QT-02').version });

test('restoration derives the target from verified history and emits one optimistic transaction', () => {
  const ctx = stateWithHistory(), before = structuredClone(ctx.docs), ledger = structuredClone(ctx.ledger);
  const target = History.build(ctx.docs.find(d => d.id === 'QT-02'), ctx.ledger).revisions[0];
  const plan = Server.planRestore(ctx, { ...intent(ctx), lines: ['forged content'] });
  assert.equal(plan.ok, true, plan.message);
  assert.deepEqual(ctx.docs, before, 'planning does not modify source documents');
  assert.deepEqual(ctx.ledger, ledger);
  assert.equal(plan.rpc.p_doc_updates.length, 2);
  assert.equal(plan.rpc.p_expected_tail, ctx.workspace.ledger_tail);
  for (const update of plan.rpc.p_doc_updates) { const d = before.find(d => d.id === update.id); assert.equal(d.lines[update.lineIndex], update.from); d.lines[update.lineIndex] = update.to; }
  assert.deepEqual(before.find(d => d.id === 'QT-02').lines, target.lines);
  assert.equal(Ledger.verify(ctx.ledger.concat(plan.body.records)), true);
  for (const record of plan.body.records) {
    assert.match(record.basis, /khôi phục bản 0 · từ bản 2/);
    assert.equal(record.actor, Server.actorLabel(ctx.member));
    assert.ok(record.revertsSeq);
  }
});

test('restoration rejects stale revision, concurrent ledger tail, unauthorized role, foreign document and broken chain', () => {
  for (const alter of [ctx => { ctx.member = Server.demoMember('cv-dt'); }, ctx => { ctx.member = Server.demoMember('tp-tc'); }, ctx => { ctx.ledger[0].basis = 'tampered'; }]) {
    const ctx = stateWithHistory(); alter(ctx);
    const before = structuredClone(ctx.docs), ledger = structuredClone(ctx.ledger);
    assert.equal(Server.planRestore(ctx, intent(ctx)).ok, false);
    assert.deepEqual(ctx.docs, before); assert.deepEqual(ctx.ledger, ledger);
  }
  const ctx = stateWithHistory();
  for (const bad of [{ expectedSeq: 0 }, { expectedTail: Ledger.GENESIS }, { expectedVersion: 'old' }, { docId: 'foreign-doc' }, { targetRevision: 1.5 }]) {
    assert.equal(Server.planRestore(ctx, { ...intent(ctx), ...bad }).ok, false);
  }
});

async function controller(ctx, localStore, remote) {
  const app = App.createController({ Engine, Data, Workflow, Ledger, Server, Authz: require('../js/policy-authz.js'),
    Semantic: require('../js/semantic-discovery.js'), AI: require('../js/policy-ai.js'), Learning: require('../js/policy-learning.js'),
    localStore, remote, now: clock });
  Object.assign(app.state, { docs: structuredClone(ctx.docs), registry: structuredClone(ctx.registry), ledger: structuredClone(ctx.ledger),
    workspace: { id: 'test', mode: 'live' }, source: remote ? 'remote' : 'local', liveMember: ctx.member });
  return app;
}

test('offline restore saves once and publishes no partial state on storage failure', async () => {
  const ctx = stateWithHistory(); let calls = 0;
  const app = await controller(ctx, { save: async snapshot => { calls++; assert.equal(snapshot.ledger.length, ctx.ledger.length + 2); return false; } });
  const before = structuredClone({ docs: app.state.docs, ledger: app.state.ledger });
  const result = await app.restore('QT-02', 0);
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.deepEqual({ docs: app.state.docs, ledger: app.state.ledger }, before);
  assert.equal(app.state.busy, false);
});

test('offline restore commits one durable snapshot, preserves history, and rejects competing writes while pending', async () => {
  const ctx = stateWithHistory(), store = Store.createLocalStore({ backend: Store.memoryBackend() });
  let release;
  const app = await controller(ctx, { save: snapshot => new Promise(resolve => { release = async () => resolve(await store.save(snapshot)); }) });
  const pending = app.restore('QT-02', 0);
  assert.equal(app.state.busy, true);
  assert.equal((await app.undo(ctx.ledger[0].seq)).ok, false);
  assert.equal((await app.restore('QT-02', 0)).ok, false);
  assert.equal((await app.switchSource('local')).ok, false);
  await release();
  assert.equal((await pending).ok, true);
  const saved = await store.load();
  assert.deepEqual(saved.docs, app.state.docs);
  assert.deepEqual(saved.ledger.slice(0, ctx.ledger.length), ctx.ledger);
  assert.equal(Ledger.verify(saved.ledger), true);
});

test('remote restore makes one request; a failed transactional writer leaves the client unchanged', async () => {
  const ctx = stateWithHistory(), calls = [];
  const app = await controller(ctx, {}, { call: async body => { calls.push(body); return { ok: false, status: 500, data: { message: 'Simulated transaction rollback during write 2' } }; } });
  const before = structuredClone({ docs: app.state.docs, ledger: app.state.ledger });
  assert.equal((await app.restore('QT-02', 0)).ok, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'restore');
  assert.equal(calls[0].expectedTail, ctx.workspace.ledger_tail);
  assert.deepEqual({ docs: app.state.docs, ledger: app.state.ledger }, before);
});

test('restoration refuses a historically revoked policy patch rather than re-authorizing it', () => {
  const ctx = stateWithHistory();
  const patch = ctx.ledger.find(r => r.docId === 'QT-02');
  const revision = History.build(ctx.docs.find(d => d.id === 'QT-02'), ctx.ledger).revisions.find(r => r.seq === patch.seq).n;
  Workflow.undo(ctx, patch.seq, { now: clock });
  const tail = Ledger.tailOf(ctx.ledger); ctx.workspace.ledger_seq = tail.seq; ctx.workspace.ledger_tail = tail.hash;
  const result = Server.planRestore(ctx, { ...intent(ctx), targetRevision: revision });
  assert.equal(result.ok, false);
  assert.match(result.message, /ban hành lại/);
});
