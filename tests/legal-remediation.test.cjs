const test = require('node:test');
const assert = require('node:assert/strict');
const Status = require('../js/legal-status.js');
const Discovery = require('../js/legal-discovery.js');
const Page = require('../js/legal-page.js');
const Fetch = require('../js/legal-fetch.js');
const Refs = require('../js/legal-refs.js');
const Research = require('../js/legal-research.js');
const fs = require('node:fs');
const path = require('node:path');

const source = { name: 'Synthetic official portal response', url: 'https://vbpl.vn/test', tier: 'primary', retrievedAt: '2026-10-17T00:00:00Z' };
const document = (id = '01/2020/TT-BGDĐT', extra = {}) => ({ canonicalId: id, number: id, effectiveFrom: '2020-02-01', text: '', sources: [source], relations: [],
  coverage: { relationships: 'complete', history: 'complete' }, ...extra });
const graph = (extra = {}) => ({ state: 'complete', nodes: [{ id: '01/2020/TT-BGDĐT', resolution: 'found', doc: document() }], edges: [], frontier: [], unresolved: [], errors: [], ...extra });
const assess = g => Status.assess('01/2020/TT-BGDĐT', g, '2026-10-17');

test('incomplete research cannot certify continued effectiveness', () => {
  assert.equal(assess(graph({ state: 'partial' })).state, 'UNVERIFIED');
  assert.equal(assess(graph({ unresolved: [{ id: 'missing' }] })).state, 'UNVERIFIED');
  const g = graph(); g.nodes[0].doc.coverage.relationships = 'unknown';
  assert.equal(assess(g).state, 'UNVERIFIED');
  assert.equal(assess(graph()).state, 'IN_FORCE');
  const noTime = graph(); noTime.nodes[0].doc.sources = [{ ...source, retrievedAt: null }];
  assert.equal(assess(noTime).state, 'UNVERIFIED');
  const expiredReport = graph({ state: 'partial' });
  expiredReport.nodes[0].doc.officialStatus = { label: 'Hết hiệu lực', observedAt: source.retrievedAt };
  assert.equal(assess(expiredReport).state, 'UNVERIFIED', 'missing repeal evidence in partial research is not itself a source conflict');
});

test('suspension never becomes permanent expiry', () => {
  assert.equal(Status.officialBucket('Ngưng hiệu lực toàn bộ'), 'SUSPENDED');
  const g = graph();
  g.nodes[0].doc.suspension = { from: '2026-01-01', until: '2026-11-01', scope: 'whole', raw: 'Ngưng hiệu lực toàn bộ' };
  assert.equal(assess(g).state, 'SUSPENDED');
  assert.equal(Status.assess('01/2020/TT-BGDĐT', g, '2025-01-01').state, 'IN_FORCE');
});

test('citation-only and conflicting identities cannot attribute page metadata', () => {
  const parse = html => Page.parse({ html, url: source.url, requestedId: '08/2021/TT-BGDĐT', retrievedAt: source.retrievedAt, source });
  assert.equal(parse('<title>Thông tư 09/2021/TT-BGDĐT</title><p>Số: 09/2021/TT-BGDĐT</p><p>Căn cứ Thông tư 08/2021/TT-BGDĐT. Ngày hiệu lực: 01/01/2022</p>').ok, false);
  assert.equal(parse('<title>Tra cứu</title><nav>08/2021/TT-BGDĐT</nav><p>Kết quả tìm kiếm: Thông tư 08/2021/TT-BGDĐT</p>').ok, false);
});

test('failed attempts consume the budget and non-retryable errors remain partial', async () => {
  let calls = 0;
  const g = await Discovery.discover({ start: { id: 'x', title: 'Synthetic input', text: '01/2020/TT-BGDĐT; 02/2020/TT-BGDĐT; 03/2020/TT-BGDĐT' }, maxDocs: 1,
    adapter: { name: 'Synthetic failure', resolve: async () => { calls++; return { status: 'error', code: 'http_403', retryable: false }; } } });
  assert.equal(calls, 1);
  assert.equal(g.state, 'partial');
  assert.equal(g.frontier.length, 2);
  const only = await Discovery.discover({ start: { id: 'x', title: 'x', text: '01/2020/TT-BGDĐT' }, adapter: { name: 'failure', resolve: async () => ({ status: 'error', retryable: false }) } });
  assert.equal(only.state, 'partial');
});

test('fetch cancellation reaches the underlying request', async () => {
  const ctrl = new AbortController(); let signal;
  const pending = Fetch.safeFetch(source.url, { signal: ctrl.signal, timeoutMs: 100, fetchImpl: async (_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('AbortError'))));
  } });
  ctrl.abort();
  const result = await pending;
  assert.equal(result.code, 'cancelled');
  assert.equal(signal.aborted, true);
});

test('historical and future assessments require evidence covering the selected date', () => {
  const g = graph();
  g.nodes[0].doc.coverage.history = 'unknown';
  g.nodes[0].doc.officialStatus = { label: 'Còn hiệu lực', observedAt: '2026-10-17T00:00:00Z' };
  assert.equal(assess(g).state, 'IN_FORCE');
  assert.equal(Status.assess(g.nodes[0].id, g, '2021-01-01').state, 'UNVERIFIED');
  assert.equal(Status.assess(g.nodes[0].id, g, '2027-01-01').state, 'UNVERIFIED');
  assert.equal(Status.assess(g.nodes[0].id, g, '2019-01-01').state, 'NOT_YET');
  assert.equal(Status.assess(g.nodes[0].id, g, '2026-02-30').state, 'UNVERIFIED');
  g.nodes[0].doc.issueDate = '2021-01-01';
  assert.equal(assess(g).state, 'UNVERIFIED', 'contradictory issue/effectivity dates are not guessed');
});

test('suspension intervals are distinct from repeal and unknown suspension scope remains unresolved', () => {
  const g = graph(), id = g.nodes[0].id;
  g.nodes[0].doc.suspension = { from: '2026-01-01', until: '2026-11-01', scope: 'whole', raw: 'Ngưng hiệu lực' };
  assert.equal(Status.assess(id, g, '2026-01-01').state, 'SUSPENDED');
  assert.equal(Status.assess(id, g, '2026-11-01').state, 'IN_FORCE');
  g.nodes[0].doc.suspension.scope = 'partial';
  assert.equal(assess(g).state, 'UNVERIFIED');
  delete g.nodes[0].doc.suspension;
  g.nodes[0].doc.officialStatus = { label: 'Ngưng hiệu lực toàn bộ', observedAt: source.retrievedAt };
  assert.equal(assess(g).state, 'UNVERIFIED');
});

test('amendments, consolidation, partial replacement and unknown scope cannot become total repeal', () => {
  const g = graph(), id = g.nodes[0].id;
  g.nodes.push({ id: '02/2025/TT-BGDĐT', resolution: 'found', doc: document('02/2025/TT-BGDĐT', { effectiveFrom: '2025-01-01' }) });
  const relation = { from: '02/2025/TT-BGDĐT', to: id, type: 'AMENDS', basis: 'official_metadata', source, effectiveFrom: '2025-01-01' };
  g.edges = [relation];
  assert.equal(assess(g).state, 'IN_FORCE');
  relation.type = 'CONSOLIDATES'; assert.equal(assess(g).state, 'IN_FORCE');
  relation.type = 'REPLACES'; assert.equal(assess(g).state, 'UNVERIFIED');
  relation.scope = 'partial'; relation.provisions = 'Điều 5'; assert.equal(assess(g).state, 'PARTIAL');
  relation.scope = 'whole'; delete relation.provisions; assert.equal(assess(g).state, 'EXPIRED');
  relation.effectiveFrom = '2027-01-01'; assert.equal(assess(g).state, 'IN_FORCE');
  assert.equal(assess(g).pending.length, 1);
});

test('source parser rejects conflicting fields, embedded results, malformed HTML and unknown page structure', () => {
  const parse = html => Page.parse({ html, url: source.url, requestedId: '08/2021/TT-BGDĐT', retrievedAt: source.retrievedAt, source });
  for (const html of [
    '<title>Thông tư 08/2021/TT-BGDĐT</title><p>Số: 08/2021/TT-BGDĐT</p><p>Số: 09/2021/TT-BGDĐT</p>',
    '<title>Tra cứu</title><p>Số: 08/2021/TT-BGDĐT</p><p>Ngày ban hành: 01/01/2021</p>',
    '<p title="unfinished', '<p>Trích dẫn Thông tư 08/2021/TT-BGDĐT trong một trang khác với ngày 01/01/2021</p>'
  ]) assert.equal(parse(html).ok, false);
  const spaced = parse('<title>Thông tư 08/2021/TT-BGDĐT</title><p>Số ký hiệu: 08 / 2021 / TT - BGDĐT</p><p>Ngày ban hành: 18/03/2021</p>');
  assert.equal(spaced.ok, true);
  assert.equal(spaced.doc.effectiveFrom, null);
  assert.equal(spaced.doc.coverage.relationships, 'unknown');
});

test('inspected Government metadata excerpt yields an amendment with direction, quote and explicit provenance', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/legal/government-detail.fragment.html'), 'utf8');
  const parsed = Page.parse({ html, url: 'https://vanban.chinhphu.vn/?docid=220017&pageid=27160', requestedId: '1989/QĐ-TTg', retrievedAt: source.retrievedAt, source });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.issueDate, '2026-10-15');
  assert.equal(parsed.doc.relations[0].type, 'AMENDS');
  assert.equal(parsed.doc.relations[0].target, '460/QĐ-TTg');
  assert.equal(parsed.doc.relations[0].direction, 'out');
  assert.equal(parsed.doc.relations[0].basis, 'text_cue', 'abstract language is not a certified relationship ledger');
  assert.match(parsed.doc.relations[0].provenance, /Trích yếu/);
  assert.equal(parsed.doc.coverage.relationships, 'unknown');
  assert.equal(parsed.doc.effectiveFrom, null, 'a promulgation date never becomes an effective date');
});

test('bounded retries and total deadline abort adapters and preserve unresolved work', async () => {
  let calls = 0, signal;
  const adapter = { name: 'Synthetic failure', resolve: async (_ref, ctx) => { calls++; signal = ctx.signal; return { status: 'error', code: 'http_503', retryable: true }; } };
  let g = await Discovery.discover({ start: { id: 'x', title: 'x', text: '01/2020/TT-BGDĐT' }, adapter });
  for (let n = 0; n < 5; n++) g = await Discovery.continueDiscovery(g, { adapter });
  assert.equal(calls, 3);
  assert.equal(g.state, 'partial');
  const deadline = await Discovery.discover({ start: { id: 'x', title: 'x', text: '01/2020/TT-BGDĐT; 02/2020/TT-BGDĐT' },
    totalTimeoutMs: 10, adapter: { name: 'Slow mock', resolve: async (_ref, ctx) => { signal = ctx.signal; return new Promise(() => {}); } } });
  assert.equal(signal.aborted, true);
  assert.ok(deadline.stopReasons.includes('time'));
  assert.equal(deadline.unresolved.length, 2);
});

test('streaming response cancellation and size caps release a source reader', async () => {
  let cancelled = false;
  const result = await Fetch.safeFetch(source.url, { maxBytes: 2, fetchImpl: async () => new Response(new ReadableStream({
    start(ctrl) { ctrl.enqueue(new Uint8Array([1, 2, 3])); }, cancel() { cancelled = true; }
  }), { headers: { 'content-type': 'text/html' } }) });
  assert.equal(result.code, 'too_large');
  assert.equal(cancelled, true);
  assert.equal(Fetch.retryable('http_403'), false);
  assert.equal(Fetch.retryable('http_429'), true);
});

test('multiple explicit relationships to one target retain scopes and source evidence', async () => {
  const d = document('01/2020/TT-BGDDT', { text: 'Sửa đổi Điều 2 của Thông tư 02/2020/TT-BGDĐT. Bãi bỏ Điều 3 của Thông tư 02/2020/TT-BGDĐT.' });
  const g = await Discovery.discover({ start: { id: 'x', title: 'x', text: '01/2020/TT-BGDĐT' }, adapter: { name: 'Synthetic', resolve: async ref => ({ status: 'found', doc: { ...d, canonicalId: ref.canonicalId } }) }, maxDepth: 2 });
  assert.ok(g.edges.some(e => e.type === 'AMENDS' && e.provisions === 'Điều 2'));
  assert.ok(g.edges.some(e => e.type === 'REPEALS' && e.scope === 'partial' && e.provisions === 'Điều 3'));
});

test('legal evidence and acknowledgements cannot authorize deterministic U1/U2/U3 outcomes', () => {
  const Server = require('../js/policy-server.js'), Engine = require('../js/policy-engine.js'), Data = require('../js/policy-data.js'), Ledger = require('../js/policy-ledger.js');
  const ctx = { workspace: { id: 'demo', mode: 'demo', ledger_seq: 0, ledger_tail: Ledger.GENESIS }, member: Server.demoMember('tp-dt'),
    registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), ledger: [], now: () => source.retrievedAt };
  const request = { change: { ruleId: 'R-PK-01', newValue: '5 ngày', issuerTier: 2 } };
  const original = Server.planCommit(ctx, request);
  const forged = Server.planCommit(ctx, { ...request, legalAck: true, legalStatus: 'IN_FORCE', live: true, assessments: { trusted: true }, props: [{ outcome: 'AUTO_PATCH' }] });
  assert.deepEqual(forged.rpc, original.rpc);
  assert.equal(forged.body.applied, 6);
  assert.equal(forged.rpc.p_doc_updates.some(u => ['QD-01', 'QT-07'].includes(u.id)), false);
});
