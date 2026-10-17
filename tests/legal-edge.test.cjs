// Executes the actual TypeScript HTTP handlers with mocked Supabase and provider I/O. No live service calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto').webcrypto;
const Server = require('../js/policy-server.js');
const Refs = require('../js/legal-refs.js');
const Page = require('../js/legal-page.js');
const Fetch = require('../js/legal-fetch.js');
const Research = require('../js/legal-research.js');
const Status = require('../js/legal-status.js');
const Sha = require('../js/sha256.js');
const id = '08/2021/TT-BGDDT';
const now = new Date().toISOString();
const input = () => ({ startLabel: 'Synthetic test input', startText: 'Căn cứ Thông tư 08/2021/TT-BGDĐT.', asOf: '2026-10-17', maxDepth: 3, maxDocs: 25 });
const source = { name: 'Synthetic response', url: 'https://vbpl.vn/test', tier: 'primary', retrievedAt: now };
function cacheRow(extra = {}) {
  return { canonical_id: id, number: '08/2021/TT-BGDĐT', body_text: '', content_sha256: Sha.sha256Hex(''), effective_from: '2021-05-03', issue_date: '2021-03-18',
    sources: [source], retrieved_at: now, cache_until: new Date(Date.now() + 3600000).toISOString(), relations: [],
    evidence: { parserVersion: 2, identity: { verified: true, canonicalId: id }, coverage: { relationships: 'unknown', history: 'unknown' } }, ...extra };
}
function compile(file, globals, imports) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, AbortController, setTimeout, clearTimeout, crypto, ...globals,
    require: name => { if (Object.hasOwn(imports, name)) return imports[name]; if (name.endsWith('.js')) return {}; throw new Error('Unexpected import: ' + name); } });
  vm.runInContext(js, context, { filename: file });
  return context.exports;
}
function harness(options = {}) {
  const writes = [], calls = [], filters = [];
  let handler;
  const admin = { auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: 'test-user', is_anonymous: !!options.anonymous } } }) },
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      const query = { eq: {}, table };
      const builder = {
        select() { return builder; }, eq(key, value) { query.eq[key] = value; return builder; }, gt() { return builder; },
        async maybeSingle() {
          filters.push(query);
          if (table === 'workspaces') return { data: { id: query.eq.id, mode: options.mode || 'live' } };
          if (table === 'members') return { data: options.member === false || query.eq.workspace_id === 'foreign' ? null : { display_name: 'Test member', tier: options.tier ?? 2, units: ['Test unit'] } };
          if (table === 'legal_documents') return { data: options.cache === false ? null : cacheRow(options.cacheExtra) };
          throw new Error(table);
        },
        upsert(value) { writes.push({ table, value }); return Promise.resolve({ error: null }); },
        insert(value) { writes.push({ table, value }); return builder; },
        async single() { return { data: { id: 'test-run-id' }, error: null }; }
      };
      return builder;
    } };
  const http = compile('supabase/functions/_shared/http.ts', {}, {});
  compile('supabase/functions/legal-discover/index.ts', {
    PolicyChangeLegalRefs: Refs, PolicyChangeLegalPage: Page, PolicyChangeLegalFetch: Fetch, PolicyChangeLegalResearch: Research,
    Deno: { env: { get: key => ({ LEGAL_SEARCH_PROVIDER: options.provider === 'brave' ? 'brave' : options.provider ? 'google' : '', LEGAL_SEARCH_API_KEY: 'SYNTHETIC_TEST_KEY', LEGAL_SEARCH_CX: 'SYNTHETIC_CX' })[key] }, serve: fn => { handler = fn; } },
    fetch: async (url, init) => { calls.push({ url, init }); return options.fetch ? options.fetch(url, init) : new Response('{}'); }
  }, { '../_shared/modules.ts': { Server }, '../_shared/http.ts': http, '../_shared/quota.ts': { adminClient: () => admin, clientKey: async () => 'a'.repeat(64) } });
  return { writes, calls, filters, async request(body, opts = {}) {
    const req = new Request('https://local.test/legal-discover', { method: 'POST', headers: { Authorization: 'Bearer synthetic.test.token' }, body: JSON.stringify(body), ...opts });
    const response = await handler(req);
    return { status: response.status, data: await response.json() };
  } };
}

test('HTTP save_run rejects forged live, graph, statuses, completeness, timestamps and URLs', async () => {
  for (const forged of [{ live: true }, { state: 'complete' }, { graph: { nodes: [{ doc: { sources: [{ url: 'http://169.254.169.254' }] } }] } },
    { assessments: { [id]: { state: 'IN_FORCE' } } }, { evidenceHash: 'fake' }, { validatedAt: now }]) {
    const h = harness();
    assert.equal((await h.request({ action: 'save_run', workspace: 'mine', run: { ...input(), ...forged } })).status, 400);
    assert.equal(h.writes.length, 0);
    assert.equal(h.calls.length, 0);
  }
});

test('HTTP save_run authorizes the exact workspace, real membership and valid roles', async () => {
  for (const [options, workspace, expected] of [[{ user: false }, 'mine', 401], [{ anonymous: true }, 'mine', 401], [{ member: false }, 'mine', 401],
    [{}, 'foreign', 401], [{ tier: 0 }, 'mine', 403], [{ tier: 4 }, 'mine', 403]]) {
    const h = harness(options);
    assert.equal((await h.request({ action: 'save_run', workspace, persona: 'ht', run: input() })).status, expected);
    assert.equal(h.writes.length, 0);
  }
});

test('HTTP save_run rebuilds from verified server evidence, retains partial status and never fetches client URLs', async () => {
  const h = harness();
  const result = await h.request({ action: 'save_run', workspace: 'mine', run: input() });
  assert.equal(result.status, 200);
  assert.equal(result.data.state, 'partial');
  assert.equal(h.calls.length, 0);
  const saved = h.writes[0].value;
  assert.equal(saved.workspace_id, 'mine');
  assert.equal(saved.created_user, 'test-user');
  assert.equal(saved.trust_version, 1);
  assert.match(saved.evidence_sha256, /^[a-f0-9]{64}$/);
  assert.equal(Research.hashRun(saved.graph, saved.assessments, saved.as_of), saved.evidence_sha256);
  const shuffled = Object.fromEntries(Object.entries(saved.graph).reverse());
  assert.equal(Research.hashRun(shuffled, saved.assessments, saved.as_of), saved.evidence_sha256);
  assert.equal(saved.assessments[id].state, 'UNVERIFIED');
  assert.equal(saved.graph.nodes.find(n => n.resolution === 'found').doc.text, undefined);
  assert.ok(h.filters.some(q => q.table === 'members' && q.eq.workspace_id === 'mine' && q.eq.user_id === 'test-user'));
});

test('HTTP save_run rejects malformed, oversized scope and stale or unverified cached evidence', async () => {
  for (const bad of [{ ...input(), asOf: '2026-02-30' }, { ...input(), maxDocs: 201 }, { ...input(), maxDepth: 1.5 }, { ...input(), startText: 'a'.repeat(300001) }, null]) {
    const h = harness();
    assert.equal((await h.request({ action: 'save_run', workspace: 'mine', run: bad })).status, 400);
    assert.equal(h.writes.length, 0);
  }
  const tooBig = harness();
  assert.equal((await tooBig.request({ action: 'save_run', padding: 'đ'.repeat(400000) })).status, 413);
  for (const cacheExtra of [{ evidence: {} }, { content_sha256: 'a'.repeat(64) }, { sources: [{ ...source, url: 'http://127.0.0.1' }] }, { cache_until: '2000-01-01' }]) {
    const h = harness({ cacheExtra });
    assert.equal((await h.request({ action: 'save_run', workspace: 'mine', run: input() })).status, 422);
    assert.equal(h.writes.length, 0);
  }
});

test('HTTP resolve distinguishes provider misconfiguration, HTTP failures, malformed responses and genuine empty search', async () => {
  assert.equal((await harness({ cache: false }).request({ action: 'resolve', ref: { canonicalId: id } })).data.status, 'unavailable');
  for (const code of [403, 429, 500]) {
    const h = harness({ cache: false, provider: true, fetch: async () => new Response('{}', { status: code }) });
    const result = await h.request({ action: 'resolve', ref: { canonicalId: id } });
    assert.equal(result.data.status, 'error');
    assert.equal(result.data.code, 'provider_http_' + code);
    assert.equal(result.data.retryable, code !== 403);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_TEST_KEY|SYNTHETIC_CX/);
  }
  const malformed = harness({ cache: false, provider: true, fetch: async () => new Response('{}') });
  assert.equal((await malformed.request({ action: 'resolve', ref: { canonicalId: id } })).data.code, 'provider_parse');
  const empty = harness({ cache: false, provider: true, fetch: async () => Response.json({ searchInformation: { totalResults: '0' } }) });
  assert.equal((await empty.request({ action: 'resolve', ref: { canonicalId: id } })).data.status, 'not_found');
});

test('HTTP search keeps the written Vietnamese number and handles empty Brave results without claiming 404', async () => {
  for (const provider of ['brave', true]) {
    const h = harness({ cache: false, provider, fetch: async url => {
      const query = new URL(url).searchParams.get('q');
      assert.match(query, /^08\/2021\/TT-BGDĐT \(/);
      assert.doesNotMatch(query, /"/);
      assert.match(query, /site:vbpl.vn/);
      return Response.json(provider === 'brave' ? { query: { original: query } } : { searchInformation: { totalResults: '0' } });
    } });
    const result = await h.request({ action: 'resolve', ref: { canonicalId: id, raw: '08 / 2021 / TT-BGDĐT' } });
    assert.equal(h.calls.length, 1);
    assert.equal(result.data.status, 'not_found');
    assert.equal(result.data.code, 'no_candidates');
    assert.doesNotMatch(result.data.reason, /404/);
    assert.match(result.data.reason, /không có nghĩa là văn bản không tồn tại/);
  }
  const malformed = harness({ cache: false, provider: 'brave', fetch: async () => Response.json({}) });
  assert.equal((await malformed.request({ action: 'resolve', ref: { canonicalId: id } })).data.code, 'provider_parse');
  const mismatch = harness({ cache: false, provider: 'brave' });
  assert.equal((await mismatch.request({ action: 'resolve', ref: { canonicalId: id, raw: '09/2021/TT-BGDĐT' } })).data.code, 'invalid_id');
  assert.equal(mismatch.calls.length, 0);
});

test('candidate failures never become not-found; retries, URL duplicates, redirects and candidate budget are bounded', async () => {
  for (const code of [403, 429, 500, 404]) {
    let calls = 0;
    const result = await Research.resolveCandidates(['https://vbpl.vn/x?utm_source=a', 'https://vbpl.vn/x'], id, { now: () => now, fetchImpl: async () => { calls++; return new Response('', { status: code }); } });
    assert.equal(result.status, code === 404 ? 'not_found' : 'error');
    assert.equal(calls, 1);
    if (code !== 404) assert.equal(result.retryable, code !== 403);
  }
  let calls = 0;
  const budget = await Research.resolveCandidates(Array.from({ length: 6 }, (_, n) => 'https://vbpl.vn/' + n), id, { now: () => now, fetchImpl: async () => { calls++; return new Response('', { status: 404 }); } });
  assert.equal(calls, 3);
  assert.equal(budget.status, 'error');
  const redirect = await Research.resolveCandidates(['https://vbpl.vn/x'], id, { now: () => now, fetchImpl: async url => { assert.equal(url, 'https://vbpl.vn/x'); return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }); } });
  assert.equal(redirect.code, 'blocked');
  const parse = await Research.resolveCandidates(['https://vbpl.vn/x'], id, { now: () => now, fetchImpl: async () => new Response('<p>tiny</p>') });
  assert.equal(parse.code, 'parse_error');
});

test('cache identity and source tier cannot be promoted by the browser', () => {
  assert.equal(Research.cacheDoc(cacheRow({ evidence: { parserVersion: 2, identity: { verified: true, canonicalId: 'other' } } }), now), null);
  const secondary = Research.cacheDoc(cacheRow({ sources: [{ ...source, url: 'https://luatvietnam.vn/x', tier: 'primary' }] }), now);
  assert.equal(secondary.sources[0].tier, 'secondary');
  assert.equal(Status.assess(id, { state: 'complete', nodes: [{ id, resolution: 'found', doc: secondary }], edges: [] }, '2026-10-17').state, 'UNVERIFIED');
});

test('failed and unchecked candidate URLs survive as evidence limitations on a found document', async () => {
  const urls = ['https://vbpl.vn/denied', 'https://vbpl.vn/matched', 'https://vbpl.vn/unchecked'];
  const result = await Research.resolveCandidates(urls, id, { now: () => now, fetchImpl: async url => url === urls[0] ? new Response('', { status: 403 }) :
    new Response('<title>Thông tư 08/2021/TT-BGDĐT</title><p>Số: 08/2021/TT-BGDĐT</p><p>Ngày ban hành: 18/03/2021</p>') });
  assert.equal(result.status, 'found');
  assert.deepEqual(result.doc.retrievalFailures.map(f => [f.url, f.code]), [[urls[0], 'http_403'], [urls[2], 'candidate_unchecked']]);
  assert.equal(result.doc.coverage.relationships, 'unknown');
});

test('evidence migration preserves RLS and marks legacy reports untrusted without rewriting them', () => {
  const sql = fs.readFileSync('supabase/migrations/20261017000010_legal_evidence.sql', 'utf8');
  assert.match(sql, /trust_version integer not null default 0/);
  assert.match(sql, /trust_version = 0 or \(live is true and evidence_sha256 is not null and validated_at is not null\)/);
  assert.doesNotMatch(sql, /disable row level security|grant .* to (?:anon|authenticated)|create policy|\b(?:update|delete from) public\.legal_/i);
});
