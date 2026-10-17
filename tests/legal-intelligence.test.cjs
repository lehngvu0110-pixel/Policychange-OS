// Căn cứ pháp lý: trích số hiệu, khám phá nhiều tầng, đánh giá hiệu lực, đọc trang nguồn, tải an toàn, adapter máy chủ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Refs = require('../js/legal-refs.js');
const Discovery = require('../js/legal-discovery.js');
const Status = require('../js/legal-status.js');
const Fixtures = require('../js/legal-fixtures.js');
const Page = require('../js/legal-page.js');
const Fetch = require('../js/legal-fetch.js');
const Remote = require('../js/legal-remote-adapter.js');
const Graph = require('../js/app/legal-graph.js');

const START = { id: 'MAU', title: 'Văn bản mẫu', text: Fixtures.START_TEXT };
const node = (g, id) => g.nodes.find(n => n.id === Refs.canonicalId(id));
const run = ({ adapter, ...opts } = {}) => Discovery.discover({ start: START, adapter: Fixtures.createFixtureAdapter(adapter || {}), maxDepth: 3, maxDocs: 25, ...opts });
/** Adapter từ một kho tự dựng (để thử chu trình, giới hạn). */
function corpusAdapter(corpus) { return Fixtures.createFixtureAdapter({ corpus }); }
const doc = (number, text, extra = {}) => ({ number, kind: 'Thông tư', title: 'Văn bản ' + number, issuer: 'Bộ Mô phỏng', issueDate: '2020-01-01', effectiveFrom: '2020-02-01', relations: [], text, ...extra });

// ---------------- Trích số hiệu ----------------
test('trích số hiệu nhiều dạng, chuẩn hoá có dấu và không dấu về cùng một mã, bỏ qua ngày tháng', () => {
  const refs = Refs.extractReferences('Căn cứ Nghị định số 04/2021/NĐ-CP ngày 22/01/2021; Luật 34/2018/QH14; Quyết định 1234/QĐ-ĐHBK; Thông tư 08/2021/TT-BGDĐT.');
  assert.deepEqual(refs.map(r => r.canonicalId), ['04/2021/ND-CP', '34/2018/QH14', '1234/QD-DHBK', '08/2021/TT-BGDDT']);
  assert.equal(Refs.canonicalId('04/2021/NĐ-CP'), Refs.canonicalId('04/2021/ND-CP'));
  assert.equal(refs[0].kind, 'Nghị định');
  assert.equal(Refs.extractReferences('ngày 12/05/2024').length, 0);
});

test('cụm từ báo quan hệ: sửa đổi, thay thế, bãi bỏ một phần kèm điều khoản; trích dẫn thường là CITES', () => {
  const r = Refs.extractReferences('Sửa đổi, bổ sung một số điều của Thông tư 10/2016/TT-BMP. Thông tư này thay thế Thông tư 02/2010/TT-BMP. Bãi bỏ Điều 5, Điều 6 của Quyết định 1234/QĐ-ĐHBK. Xem thêm 05/2020/QĐ-BMP.');
  const by = Object.fromEntries(r.map(x => [x.canonicalId, x]));
  assert.equal(by['10/2016/TT-BMP'].relation, 'AMENDS');
  assert.equal(by['02/2010/TT-BMP'].relation, 'REPLACES');
  assert.equal(by['1234/QD-DHBK'].relation, 'REPEALS');
  assert.equal(by['1234/QD-DHBK'].scope, 'partial');
  assert.match(by['1234/QD-DHBK'].provisions, /Điều 5, Điều 6/);
  assert.equal(by['05/2020/QD-BMP'].relation, 'CITES');
});

test('allowlist nguồn chặn SSRF: chỉ https, không IP, không localhost, không cổng lạ, không host giả mạo', () => {
  assert.equal(Refs.sourceFor('https://vbpl.vn/van-ban/1').tier, 'primary');
  assert.equal(Refs.sourceFor('https://vanban.chinhphu.vn/x').host, 'vanban.chinhphu.vn');
  assert.equal(Refs.sourceFor('https://thuvienphapluat.vn/x').tier, 'secondary');
  for (const bad of ['http://vbpl.vn/x', 'https://vbpl.vn.evil.com/x', 'https://evilvbpl.vn/x', 'https://127.0.0.1/x', 'https://localhost/x',
    'https://[::1]/x', 'https://vbpl.vn:8443/x', 'https://user:pw@vbpl.vn/x', 'file:///etc/passwd', 'https://169.254.169.254/latest', 'javascript:alert(1)', 'not a url']) {
    assert.equal(Refs.sourceFor(bad), null, bad);
  }
});

// ---------------- Khám phá nhiều tầng ----------------
test('khám phá văn bản mẫu: trực tiếp và đệ quy, metadata ngược, dừng ở giới hạn độ sâu và báo dang dở', async () => {
  const g = await run();
  assert.equal(g.state, 'partial');
  assert.deepEqual(g.stopReasons, ['depth', 'unresolved']);
  assert.equal(node(g, '08/2021/TT-BMP').depth, 1);
  assert.equal(node(g, '08/2021/TT-BMP').direct, true);
  assert.equal(node(g, '10/2016/TT-BMP').depth, 2);
  assert.equal(node(g, '10/2016/TT-BMP').direct, false);
  // 60/2024 không được văn bản đầu vào nhắc tới: chỉ tìm ra nhờ metadata "bị bãi bỏ một phần bởi".
  assert.equal(node(g, '60/2024/NĐ-MP').resolution, 'found');
  assert.ok(g.edges.some(e => e.from === '60/2024/ND-MP' && e.to === '50/2021/ND-MP' && e.type === 'REPEALS' && e.basis === 'official_metadata'));
  assert.equal(node(g, '01/2005/TT-BMP').resolution, 'pending');
  assert.equal(node(g, '01/2005/TT-BMP').stoppedBy, 'depth');
  assert.deepEqual(g.frontier.map(f => f.id), ['01/2005/TT-BMP']);
  assert.equal(node(g, '120/QĐ-TMP').resolution, 'not_found');
  assert.ok(g.unresolved.some(u => u.id === '120/QD-TMP'));
});

test('tiếp tục không tải lại văn bản đã có; tham chiếu không tìm được vẫn làm kết quả dang dở', async () => {
  const first = await run();
  const adapter = Fixtures.createFixtureAdapter();
  const next = await Discovery.continueDiscovery(first, { adapter });
  assert.equal(next.state, 'partial');
  assert.deepEqual(next.stopReasons, ['unresolved']);
  assert.deepEqual(adapter.calls, ['01/2005/TT-BMP']);
  assert.equal(node(next, '01/2005/TT-BMP').resolution, 'found');
  assert.equal(next.limits.maxDepth, 4);
});

test('chu trình và trích dẫn lặp: mỗi văn bản chỉ tải một lần, không lặp vô hạn', async () => {
  const corpus = { '01/2020/TT-BMP': doc('01/2020/TT-BMP', 'Căn cứ Thông tư 02/2020/TT-BMP và Thông tư 02/2020/TT-BMP.'),
    '02/2020/TT-BMP': doc('02/2020/TT-BMP', 'Căn cứ Thông tư 01/2020/TT-BMP.') };
  const adapter = corpusAdapter(corpus);
  const g = await Discovery.discover({ start: { id: 'X', title: 'x', text: 'Căn cứ Thông tư 01/2020/TT-BMP; Thông tư 01/2020/TT-BMP.' }, adapter, maxDepth: 8, maxDocs: 50 });
  assert.equal(g.state, 'complete');
  assert.deepEqual(adapter.calls.sort(), ['01/2020/TT-BMP', '02/2020/TT-BMP']);
  assert.equal(g.nodes.length, 3);
  const keys = g.edges.map(e => e.from + '>' + e.to + ':' + e.type + ':' + e.basis);
  assert.equal(new Set(keys).size, keys.length, 'không có cạnh trùng');
});

test('giới hạn số văn bản: dừng, ghi lý do "count", phần còn lại vào frontier', async () => {
  const g = await run({ maxDocs: 3 });
  assert.equal(g.state, 'partial');
  assert.ok(g.stopReasons.includes('count'));
  assert.equal(g.stats.found + g.stats.notFound, 3);
  assert.ok(g.frontier.length > 0);
});

test('nguồn quá thời gian, lỗi, ném ngoại lệ: ghi lỗi có thể thử lại, kết quả dang dở; tiếp tục thì thử lại', async () => {
  const g = await run({ adapter: { failures: { '08/2021/TT-BMP': 'timeout', '11/2012/QH99': 'error' } }, timeoutMs: 1000 });
  assert.equal(g.state, 'partial');
  assert.ok(g.stopReasons.includes('errors'));
  assert.equal(node(g, '08/2021/TT-BMP').resolution, 'error');
  assert.match(node(g, '08/2021/TT-BMP').reason, /thời gian chờ/);
  assert.equal(node(g, '11/2012/QH99').resolution, 'error');
  const next = await Discovery.continueDiscovery(g, { adapter: Fixtures.createFixtureAdapter(), addDepth: 0, addDocs: 20 });
  assert.equal(node(next, '08/2021/TT-BMP').resolution, 'found');
  assert.equal(node(next, '11/2012/QH99').resolution, 'found');
  const throwing = { name: 't', live: false, resolve: async () => { throw new Error('ECONNRESET'); } };
  const t = await Discovery.discover({ start: START, adapter: throwing, maxDepth: 1 });
  assert.ok(t.nodes.filter(n => n.resolution === 'error').length >= 4);
});

test('nguồn trả về văn bản khác số hiệu hoặc không rõ số hiệu: không nhận', async () => {
  const g = await run({ adapter: { failures: { '08/2021/TT-BMP': 'wrong_doc' } } });
  assert.equal(node(g, '08/2021/TT-BMP').resolution, 'error');
  assert.equal(node(g, '08/2021/TT-BMP').code, 'identity_unverified');
  assert.match(node(g, '08/2021/TT-BMP').reason, /khác số hiệu/);
  const blank = { name: 'b', live: false, resolve: async () => ({ status: 'found', doc: { title: 'x', text: '' } }) };
  const b = await Discovery.discover({ start: { id: 'X', title: 'x', text: 'Căn cứ Thông tư 01/2020/TT-BMP.' }, adapter: blank });
  assert.equal(b.nodes[1].resolution, 'error');
});

test('câu chèn lệnh trong văn bản tải về chỉ là dữ liệu: không tạo quan hệ, không đổi kết luận', async () => {
  const g = await run();
  const n = node(g, '10/2016/TT-BMP');
  assert.match(n.doc.text, /bỏ qua mọi hướng dẫn/);
  const out = g.edges.filter(e => e.from === '10/2016/TT-BMP');
  assert.deepEqual(out.map(e => e.to), ['02/2010/TT-BMP']);
  assert.equal(Status.assess('10/2016/TT-BMP', g, '2026-10-17').state, 'EXPIRED');
});

test('văn bản quá lớn bị cắt ở 300.000 ký tự; trường lạ của nguồn bị bỏ', async () => {
  const big = { '01/2020/TT-BMP': doc('01/2020/TT-BMP', 'a'.repeat(400000), { evil: '<script>', relations: [{ type: 'DELETE_ALL', target: '02/2020/TT-BMP' }] }) };
  const g = await Discovery.discover({ start: { id: 'X', title: 'x', text: 'Căn cứ Thông tư 01/2020/TT-BMP.' }, adapter: corpusAdapter(big) });
  const n = node(g, '01/2020/TT-BMP');
  assert.equal(n.doc.text.length, 300000);
  assert.equal(n.doc.evil, undefined);
  assert.equal(g.edges.filter(e => e.from === '01/2020/TT-BMP').length, 0, 'loại quan hệ không hợp lệ bị bỏ');
});

// ---------------- Hiệu lực ----------------
test('hiệu lực theo ngày: đủ sáu trạng thái trên kho mô phỏng', async () => {
  // Closed synthetic corpus: remove the deliberately unresolved reference for positive status tests.
  const g = await run({ maxDepth: 5, start: { ...START, text: START.text.replace(/^Căn cứ Quyết định 120[^\n]*\n/m, '') } });
  assert.equal(g.state, 'complete');
  const at = (id, d) => Status.assess(Refs.canonicalId(id), g, d);
  assert.equal(at('11/2012/QH99', '2026-10-17').state, 'IN_FORCE');
  assert.equal(at('10/2016/TT-BMP', '2026-10-17').state, 'EXPIRED');
  assert.equal(at('10/2016/TT-BMP', '2020-01-01').state, 'IN_FORCE');
  assert.equal(at('08/2021/TT-BMP', '2020-01-01').state, 'NOT_YET');
  assert.equal(at('15/2026/TT-BMP', '2026-10-17').state, 'NOT_YET');
  assert.equal(at('15/2026/TT-BMP', '2027-01-01').state, 'IN_FORCE', 'nguồn ghi "chưa có hiệu lực" lúc tải không mâu thuẫn với ngày sau đó');
  assert.equal(at('50/2021/NĐ-MP', '2026-10-17').state, 'PARTIAL');
  assert.equal(at('50/2021/NĐ-MP', '2024-01-01').state, 'IN_FORCE', 'trước ngày bãi bỏ một phần có hiệu lực');
  assert.equal(at('33/2019/TT-BMP', '2026-10-17').state, 'CONFLICT');
  assert.equal(at('05/2020/QĐ-BMP', '2026-10-17').state, 'UNVERIFIED', 'chỉ có nguồn thứ cấp');
  assert.equal(at('120/QĐ-TMP', '2026-10-17').state, 'UNVERIFIED', 'không tìm thấy');
  assert.equal(at('02/2010/TT-BMP', '2026-10-17').state, 'EXPIRED');
  assert.equal(Status.STATES.EXPIRED.label, 'Hết hiệu lực / bị thay thế');
});

test('chuỗi sửa đổi, thay đổi sắp có hiệu lực và bằng chứng có nguồn', async () => {
  const g = await run();
  const a = Status.assess('11/2012/QH99', g, '2026-10-17');
  assert.deepEqual(a.amendments.map(x => x.by), ['22/2018/QH99']);
  assert.equal(a.amendments.length, 1, 'metadata và câu chữ cùng một quan hệ chỉ tính một lần');
  const p = Status.assess('08/2021/TT-BMP', g, '2026-10-17');
  assert.deepEqual(p.pending.map(x => x.by), ['15/2026/TT-BMP']);
  assert.ok(a.evidence.every(e => e.url && e.sourceName && e.retrievedAt));
  assert.ok(a.evidence.every(e => e.synthetic === true));
  assert.ok(a.evidence.some(e => e.kind === 'effective_from'));
  const r = Status.assess('10/2016/TT-BMP', g, '2026-10-17');
  assert.deepEqual(r.causedBy, ['08/2021/TT-BMP']);
});

test('ngày ban hành không được dùng thay ngày có hiệu lực', async () => {
  const corpus = { '01/2026/TT-BMP': doc('01/2026/TT-BMP', '', { issueDate: '2026-09-01', effectiveFrom: '2026-11-15' }) };
  const g = await Discovery.discover({ start: { id: 'X', title: 'x', text: 'Căn cứ Thông tư 01/2026/TT-BMP.' }, adapter: corpusAdapter(corpus) });
  assert.equal(Status.assess('01/2026/TT-BMP', g, '2026-10-17').state, 'NOT_YET');
  const noEff = { '02/2026/TT-BMP': doc('02/2026/TT-BMP', '', { effectiveFrom: null }) };
  const g2 = await Discovery.discover({ start: { id: 'X', title: 'x', text: 'Căn cứ Thông tư 02/2026/TT-BMP.' }, adapter: corpusAdapter(noEff) });
  assert.equal(Status.assess('02/2026/TT-BMP', g2, '2026-10-17').state, 'UNVERIFIED');
});

test('bãi bỏ không rõ ngày hiệu lực hoặc chỉ từ nguồn thứ cấp: không kết luận hết hiệu lực', async () => {
  const corpus = {
    '01/2020/TT-BMP': doc('01/2020/TT-BMP', ''),
    '09/2025/TT-BMP': doc('09/2025/TT-BMP', 'Bãi bỏ Thông tư 01/2020/TT-BMP.', { effectiveFrom: null }),
    '07/2025/TT-BMP': doc('07/2025/TT-BMP', 'Thay thế Thông tư 03/2020/TT-BMP.', { tier: 'secondary' }),
    '03/2020/TT-BMP': doc('03/2020/TT-BMP', '')
  };
  const g = await Discovery.discover({ start: { id: 'X', title: 'x', text: 'Căn cứ Thông tư 09/2025/TT-BMP; Thông tư 07/2025/TT-BMP.' }, adapter: corpusAdapter(corpus) });
  const a = Status.assess('01/2020/TT-BMP', g, '2026-10-17');
  assert.equal(a.state, 'UNVERIFIED');
  assert.match(a.reasons.join(' '), /chưa xác định được ngày hiệu lực/);
  const b = Status.assess('03/2020/TT-BMP', g, '2026-10-17');
  assert.equal(b.state, 'UNVERIFIED');
  assert.match(b.reasons.join(' '), /không đến từ nguồn chính thức/);
});

test('kết luận chắc chắn mà không có đường dẫn nguồn thì hạ xuống "Chưa xác minh được"', async () => {
  const adapter = { name: 'n', live: false, resolve: async () => ({ status: 'found', doc: { ...doc('01/2020/TT-BMP', ''), canonicalId: '01/2020/TT-BMP',
    sources: [{ name: 'Không link', url: null, tier: 'primary', retrievedAt: 'x' }] } }) };
  const g = await Discovery.discover({ start: { id: 'X', title: 'x', text: 'Căn cứ Thông tư 01/2020/TT-BMP.' }, adapter });
  const a = Status.assess('01/2020/TT-BMP', g, '2026-10-17');
  assert.equal(a.state, 'UNVERIFIED');
  assert.match(a.reasons.join(' '), /Không có đường dẫn nguồn/);
});

test('cảnh báo cho quy trình thay đổi chỉ gồm văn bản không còn hiệu lực đầy đủ, không kèm quyết định', async () => {
  const g = await run();
  const w = Status.warnings(g, '2026-10-17');
  assert.ok(w.length > 0);
  assert.ok(w.every(x => x.state !== 'IN_FORCE'));
  assert.ok(w.some(x => x.id === '10/2016/TT-BMP' && x.state === 'EXPIRED'));
  assert.ok(w.every(x => !('apply' in x) && !('decision' in x)));
});

// ---------------- Đọc trang nguồn ----------------
const HTML = '<html><head><title>Thông tư 08/2021/TT-BGDĐT</title><script>window.x=1</script></head><body>' +
  '<p>Số: 08/2021/TT-BGDĐT</p><p>Ngày ban hành: 18/03/2021</p><div>Tình trạng hiệu lực: Còn hiệu lực</div>' +
  '<p>Thông tư này có hiệu lực thi hành kể từ ngày 03 tháng 5 năm 2021 và thay thế Thông tư 10/2016/TT-BGDĐT.</p><p>&lt;b&gt; &amp; &#273;</p></body></html>';
const SRC = { name: 'Cơ sở dữ liệu quốc gia về văn bản pháp luật', tier: 'primary' };

test('đọc trang: ngày ban hành, ngày hiệu lực ghi bằng chữ, tình trạng; bỏ script; giải mã thực thể', () => {
  const r = Page.parse({ html: HTML, url: 'https://vbpl.vn/a', requestedId: '08/2021/TT-BGDĐT', retrievedAt: '2026-10-17T00:00:00Z', source: SRC });
  assert.equal(r.ok, true);
  assert.equal(r.doc.canonicalId, '08/2021/TT-BGDDT');
  assert.equal(r.doc.kind, 'Thông tư');
  assert.equal(r.doc.issueDate, '2021-03-18');
  assert.equal(r.doc.effectiveFrom, '2021-05-03');
  assert.equal(r.doc.officialStatus.label, 'Còn hiệu lực');
  assert.doesNotMatch(r.doc.text, /window\.x/);
  assert.match(r.doc.text, /<b> & đ/);
  assert.equal(r.doc.sources[0].url, 'https://vbpl.vn/a');
  assert.equal(Page.labelledDate('Ngày ban hành: 31/02/2021', 'ngày\\s+ban\\s+hành'), null, 'ngày không tồn tại bị bỏ');
});

test('đọc trang: không nhận trang không chứa đúng số hiệu được hỏi', () => {
  const r = Page.parse({ html: HTML, url: 'https://vbpl.vn/a', requestedId: '09/2021/TT-BGDĐT', retrievedAt: 'x', source: SRC });
  assert.equal(r.ok, false);
});

// ---------------- Tải an toàn ----------------
function fakeFetch(routes) {
  const seen = [];
  const fn = async (url, init) => {
    seen.push(url);
    assert.equal(init.redirect, 'manual', 'không bao giờ tự đi theo chuyển hướng');
    const r = routes[url];
    if (!r) throw new Error('unexpected ' + url);
    if (r === 'hang') return new Promise(() => {});
    const headers = new Map(Object.entries(r.headers || {}));
    return { status: r.status || 200, headers: { get: k => headers.get(k.toLowerCase()) ?? null }, text: async () => r.body || '' };
  };
  fn.seen = seen;
  return fn;
}

test('tải an toàn: chặn host ngoài allowlist, kiểm lại từng bước chuyển hướng', async () => {
  const f = fakeFetch({
    'https://vbpl.vn/a': { status: 302, headers: { location: 'https://vanban.chinhphu.vn/b' } },
    'https://vanban.chinhphu.vn/b': { headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<p>ok</p>' },
    'https://vbpl.vn/evil': { status: 301, headers: { location: 'http://169.254.169.254/latest/meta-data' } },
    'https://vbpl.vn/loop': { status: 302, headers: { location: '/loop' } }
  });
  const ok = await Fetch.safeFetch('https://vbpl.vn/a', { fetchImpl: f });
  assert.equal(ok.ok, true);
  assert.equal(ok.url, 'https://vanban.chinhphu.vn/b');
  assert.equal((await Fetch.safeFetch('https://example.com/', { fetchImpl: f })).code, 'blocked');
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/evil', { fetchImpl: f })).code, 'blocked');
  assert.ok(!f.seen.some(u => u.includes('169.254')), 'không gọi tới địa chỉ nội bộ');
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/loop', { fetchImpl: f })).code, 'too_many_redirects');
});

test('tải an toàn: giới hạn kích thước, loại nội dung, thời gian chờ, mã lỗi', async () => {
  const f = fakeFetch({
    'https://vbpl.vn/big': { headers: { 'content-type': 'text/html', 'content-length': String(5 * 1024 * 1024) }, body: '' },
    'https://vbpl.vn/big2': { headers: { 'content-type': 'text/html' }, body: 'x'.repeat(3000) },
    'https://vbpl.vn/pdf': { headers: { 'content-type': 'application/pdf' }, body: '%PDF' },
    'https://vbpl.vn/slow': 'hang',
    'https://vbpl.vn/404': { status: 404 },
    'https://vbpl.vn/500': { status: 500 }
  });
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/big', { fetchImpl: f })).code, 'too_large');
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/big2', { fetchImpl: f, maxBytes: 1000 })).code, 'too_large');
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/pdf', { fetchImpl: f })).code, 'bad_type');
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/slow', { fetchImpl: f, timeoutMs: 50 })).code, 'timeout');
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/404', { fetchImpl: f })).code, 'not_found');
  assert.equal((await Fetch.safeFetch('https://vbpl.vn/500', { fetchImpl: f })).code, 'http_500');
});

// ---------------- Adapter máy chủ ----------------
function fakeServer(reply) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); const r = await reply(JSON.parse(init.body)); return { ok: r.status === 200, status: r.status, json: async () => r.data }; };
  fn.calls = calls;
  return fn;
}

test('adapter trực tuyến: máy chủ chưa cấu hình thì báo rõ, không giả là "không tìm thấy"; không gửi khoá bí mật', async () => {
  const f = fakeServer(() => ({ status: 200, data: { status: 'unavailable', reason: 'Máy chủ chưa cấu hình nhà cung cấp tìm kiếm' } }));
  const a = Remote.create({ functionsUrl: 'https://x.supabase.co/functions/v1', apiKey: 'anon-public', fetchImpl: f });
  const r1 = await a.resolve({ canonicalId: '08/2021/TT-BGDDT', raw: '08/2021/TT-BGDĐT' });
  assert.equal(r1.status, 'error');
  assert.equal(r1.retryable, true);
  assert.match(a.unavailable, /chưa cấu hình/);
  await a.resolve({ canonicalId: '09/2021/TT-BGDDT', raw: '09/2021/TT-BGDĐT' });
  assert.equal(f.calls.length, 1, 'không gọi tiếp khi đã biết máy chủ không tra cứu được');
  assert.deepEqual(Object.keys(f.calls[0].body).sort(), ['action', 'ref']);
  assert.ok(!JSON.stringify(f.calls[0]).includes('LEGAL_SEARCH'));
  const g = await Discovery.discover({ start: START, adapter: Remote.create({ functionsUrl: 'https://x/functions/v1', fetchImpl: f }) });
  assert.equal(g.state, 'partial');
  assert.ok(g.nodes.filter(n => n.resolution !== 'start').every(n => n.resolution === 'error'));
});

test('adapter trực tuyến: chức năng chưa triển khai (404) và mất mạng đều trả trạng thái rõ ràng', async () => {
  const notDeployed = Remote.create({ functionsUrl: 'https://x/functions/v1', fetchImpl: fakeServer(() => ({ status: 404, data: { message: 'Function not found' } })) });
  const s = await notDeployed.status();
  assert.equal(s.configured, false);
  assert.match(s.reason, /chưa triển khai/);
  const down = Remote.create({ functionsUrl: 'https://x/functions/v1', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  const r = await down.resolve({ canonicalId: 'A', raw: 'A' });
  assert.equal(r.status, 'error');
  const offline = Remote.create({ functionsUrl: '' });
  assert.equal((await offline.status()).configured, false);
  const found = Remote.create({ functionsUrl: 'https://x/functions/v1', fetchImpl: fakeServer(() => ({ status: 200, data: { status: 'found', doc: { canonicalId: 'A', synthetic: true } } })) });
  assert.equal((await found.resolve({ canonicalId: 'A' })).doc.synthetic, false, 'văn bản tra cứu thật không bao giờ mang nhãn mô phỏng từ máy chủ');
});

// ---------------- Đồ thị ----------------
test('đồ thị SVG thoát HTML trong tên văn bản và có nút bấm được cho mỗi văn bản', async () => {
  const corpus = { '01/2020/TT-BMP': doc('01/2020/TT-BMP', '', { title: '<img src=x onerror=alert(1)>' }) };
  const g = await Discovery.discover({ start: { id: 'X', title: '<script>alert(1)</script>', text: 'Căn cứ Thông tư 01/2020/TT-BMP.' }, adapter: corpusAdapter(corpus) });
  const svg = Graph.render(g, Status.assessAll(g, '2026-10-17'), null);
  assert.doesNotMatch(svg, /<script>|<img/);
  assert.equal((svg.match(/data-action="legal-node"/g) || []).length, 2);
  assert.equal(Graph.render({ nodes: [{ id: 'START' }], edges: [], startId: 'START' }, {}, null), '');
});

// ---------------- Kiểm tra tĩnh: bí mật, quyền, cách ly workspace ----------------
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('khoá nhà cung cấp tìm kiếm chỉ đọc từ biến môi trường máy chủ, không bao giờ trả về trình duyệt', () => {
  const fn = read('supabase/functions/legal-discover/index.ts');
  assert.match(fn, /Deno\.env\.get\("LEGAL_SEARCH_API_KEY"\)/);
  for (const m of fn.matchAll(/json\(\d+,([^;]*)\)/g)) assert.doesNotMatch(m[1], /\.key\b|API_KEY|\.cx\b/, 'phản hồi không chứa khoá');
  for (const f of ['js/legal-remote-adapter.js', 'js/app/ui.js', 'js/config.js', 'index.html']) {
    assert.doesNotMatch(read(f), /LEGAL_SEARCH_API_KEY|LEGAL_SEARCH_CX|X-Subscription-Token/, f);
  }
  // Khoá duy nhất ở phía trình duyệt là khoá anon công khai.
  const jwt = read('js/config.js').match(/anonKey: '([^']+)'/)[1];
  assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role, 'anon');
});

test('migration: bảng mới bật RLS, kết quả tra cứu đọc theo quyền workspace, chỉ service role được ghi', () => {
  const sql = read('supabase/migrations/20261017000009_legal_intelligence.sql');
  for (const t of ['legal_documents', 'legal_fetch_usage', 'legal_discovery_runs']) assert.match(sql, new RegExp('alter table public\\.' + t + ' enable row level security'));
  assert.match(sql, /on public\.legal_discovery_runs\s+for select to anon, authenticated using \(\(select private\.can_read_workspace\(workspace_id\)\)\)/);
  assert.doesNotMatch(sql, /for (insert|update|delete|all) to (anon|authenticated)/);
  assert.match(sql, /revoke all on function public\.consume_legal_fetch_quota\(integer, text, integer\) from public, anon, authenticated/);
  const fn = read('supabase/functions/legal-discover/index.ts');
  assert.match(fn, /Research\.validateRun\(run\)/, 'máy chủ chỉ nhận phạm vi, không nhận chứng nhận từ client');
  assert.match(fn, /Research\.rebuildRun\(run/, 'máy chủ tự dựng đồ thị và kết luận từ cache đã xác minh');
  assert.match(fn, /from\("members"\)[\s\S]*eq\("workspace_id", ws\.id\)/, 'lưu kết quả chỉ khi là thành viên đúng workspace');
});
