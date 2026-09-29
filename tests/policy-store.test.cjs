const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../js/policy-store.js');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');

const data = () => ({ registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], feedback: [] });

test('lưu rồi tải lại (như sau khi F5) cho ra đúng dữ liệu', async () => {
  const backend = Store.memoryBackend();
  const store = Store.createLocalStore({ backend });
  const saved = data();
  saved.docs[0].lines[1] = 'đã sửa';
  saved.ledger.push({ seq: 1, action: 'PATCH dòng 2' });
  assert.equal(await store.save(saved), true);
  const again = await Store.createLocalStore({ backend }).load();
  assert.equal(again.docs[0].lines[1], 'đã sửa');
  assert.equal(again.ledger.length, 1);
  assert.equal(again.workspace, 'demo');
});

test('dữ liệu hỏng hoặc sai định dạng thì trả null kèm lý do, không ném lỗi', async () => {
  const backend = Store.memoryBackend();
  await backend.set('policychange-os:v1:demo', '{không phải json');
  const store = Store.createLocalStore({ backend });
  assert.equal(await store.load(), null);
  assert.match(store.lastError, /Không đọc được/);
  await backend.set('policychange-os:v1:demo', JSON.stringify({ schemaVersion: 1, workspace: 'demo', registry: [], docs: [{ id: 1 }], ledger: [], feedback: [] }));
  assert.equal(await store.load(), null);
  assert.match(store.lastError, /không đúng định dạng/);
});

test('trình duyệt chặn ghi thì save trả false, ứng dụng không sập', async () => {
  const backend = { kind: 'broken', async get() { return null; }, async set() { throw new Error('QuotaExceeded'); }, async del() {} };
  const store = Store.createLocalStore({ backend });
  assert.equal(await store.save(data()), false);
  assert.match(store.lastError, /không cho lưu/);
});

test('mỗi workspace có vùng lưu riêng', async () => {
  const backend = Store.memoryBackend();
  await Store.createLocalStore({ backend, workspace: 'a' }).save(data());
  assert.equal(await Store.createLocalStore({ backend, workspace: 'b' }).load(), null);
});

test('defaultBackend lùi về localStorage rồi bộ nhớ khi môi trường không có IndexedDB', () => {
  const fakeLocal = { m: new Map(), setItem(k, v) { this.m.set(k, v); }, getItem(k) { return this.m.get(k) ?? null; }, removeItem(k) { this.m.delete(k); } };
  assert.equal(Store.defaultBackend({ localStorage: fakeLocal }).kind, 'localStorage');
  assert.equal(Store.defaultBackend({ localStorage: { setItem() { throw new Error('blocked'); } } }).kind, 'memory');
  assert.equal(Store.defaultBackend({}).kind, 'memory');
});
