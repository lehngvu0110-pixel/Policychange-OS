'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Remote = require('../js/remote-store.js');

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

function fakeFetch(routes, log) {
  return async (url, init) => {
    log.push({ url, init });
    const path = url.replace('https://x.test', '');
    const route = routes.find(r => path.startsWith(r.prefix));
    if (!route) return { ok: false, status: 404, text: async () => '{}', headers: new Map() };
    const body = typeof route.body === 'function' ? route.body(path, init) : route.body;
    return { ok: (route.status || 200) < 400, status: route.status || 200, text: async () => JSON.stringify(body), headers: new Map() };
  };
}

test('loadWorkspace ghép dữ liệu từ PostgREST sang mô hình ứng dụng', async () => {
  const log = [];
  const client = Remote.create({ url: 'https://x.test', anonKey: 'anon', storage: memoryStorage(), fetchImpl: fakeFetch([
    { prefix: '/rest/v1/workspaces', body: [{ id: 'demo', name: 'Demo', mode: 'demo', ledger_seq: 0, ledger_tail: '0'.repeat(64) }] },
    { prefix: '/rest/v1/policies', body: [{ id: 'R-1', name: 'n', value: '7 ngày', tier: 3, source: 's', owner: 'o', aliases: ['a'] }] },
    { prefix: '/rest/v1/documents', body: [{ id: 'D-1', title: 't', owner: 'o', tier: 2, version: '1.0', lines: ['x'] }] },
    { prefix: '/rest/v1/audit_log', body: [] },
    { prefix: '/rest/v1/feedback_events', body: [{ rule_id: 'R-1', category: 'U1', doc_id: 'D-1', line_index: 0, line: 'x', answer: 'accept', actor: 'a', created_at: 't' }] },
    { prefix: '/rest/v1/open_changes', body: [{ id: 'CR-1', rule_id: 'R-1', old_value: '7 ngày', new_value: '5 ngày', issuer_tier: 2, request_text: '', created_by: 'A', status: 'open', held: [] }] },
    { prefix: '/rest/v1/change_decisions', body: [] }
  ], log) });
  const res = await client.loadWorkspace('demo');
  assert.equal(res.ok, true);
  assert.equal(res.registry[0].value, '7 ngày');
  assert.deepEqual(res.docs[0].lines, ['x']);
  assert.equal(res.feedback[0].ruleId, 'R-1');
  assert.equal(res.openChanges[0].id, 'CR-1');
  assert.equal(res.openChanges[0].issuerTier, 2);
  assert.equal(log[0].init.headers.apikey, 'anon');
  assert.equal(log[0].init.headers.Authorization, 'Bearer anon');
});

test('workspace không đọc được (RLS trả mảng rỗng) → forbidden; lỗi mạng → network', async () => {
  const client = Remote.create({ url: 'https://x.test', anonKey: 'anon', storage: memoryStorage(),
    fetchImpl: fakeFetch([{ prefix: '/rest/v1/workspaces', body: [] }], []) });
  assert.equal((await client.loadWorkspace('hcmut-pilot')).reason, 'forbidden');
  const offline = Remote.create({ url: 'https://x.test', anonKey: 'anon', storage: memoryStorage(), fetchImpl: async () => { throw new Error('down'); } });
  assert.equal((await offline.loadWorkspace('demo')).reason, 'network');
  const call = await offline.call({ action: 'whoami' });
  assert.equal(call.ok, false);
  assert.match(call.data.message, /Không kết nối/);
});

test('đăng nhập lưu phiên, gửi token thật khi gọi policy-api, đăng xuất xoá phiên', async () => {
  const log = [];
  const storage = memoryStorage();
  const client = Remote.create({ url: 'https://x.test', anonKey: 'anon', storage, fetchImpl: fakeFetch([
    { prefix: '/auth/v1/token', body: { access_token: 'user-jwt', refresh_token: 'r', expires_in: 3600 } },
    { prefix: '/auth/v1/logout', body: {} },
    { prefix: '/functions/v1/policy-api', body: { member: { displayName: 'A' } } }
  ], log) });
  assert.equal((await client.signIn('a@b.vn ', 'pw')).ok, true);
  assert.deepEqual(client.session, { email: 'a@b.vn' });
  const res = await client.call({ action: 'whoami', workspace: 'hcmut-pilot' });
  assert.equal(res.ok, true);
  assert.equal(log.at(-1).init.headers.Authorization, 'Bearer user-jwt');
  await client.signOut();
  assert.equal(client.session, null);
  assert.equal(storage.getItem(Remote.SESSION_KEY), null);
});

test('sai mật khẩu → thông báo tiếng Việt, không lưu phiên', async () => {
  const client = Remote.create({ url: 'https://x.test', anonKey: 'anon', storage: memoryStorage(),
    fetchImpl: fakeFetch([{ prefix: '/auth/v1/token', status: 400, body: { error: 'invalid_grant' } }], []) });
  const res = await client.signIn('a@b.vn', 'bad');
  assert.equal(res.ok, false);
  assert.match(res.message, /không đúng/);
  assert.equal(client.session, null);
});

test('không cấu hình URL → configured=false, mọi thao tác trả lỗi mạng thay vì ném', async () => {
  const client = Remote.create({ url: '', anonKey: '', storage: null });
  assert.equal(client.configured, false);
  assert.equal((await client.loadWorkspace('demo')).ok, false);
  assert.equal(await client.tail('demo'), null);
});
