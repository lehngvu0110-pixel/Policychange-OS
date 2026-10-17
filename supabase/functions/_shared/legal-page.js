// @ts-check
/**
 * Đọc một trang văn bản pháp luật đã tải về (HTML) thành dữ liệu có cấu trúc cho bộ khám phá.
 *
 * Chạy trên máy chủ (Edge Function legal-discover) sau khi trang đã qua allowlist và giới hạn kích thước.
 * Nội dung trang là dữ liệu không tin cậy: chỉ được bóc chữ và đọc bằng biểu thức chính quy, không thực thi,
 * không đưa cho mô hình ngôn ngữ, không để câu chữ trong trang đổi kết luận.
 *
 * Bộ đọc này dựa trên các nhãn thường gặp ("Ngày ban hành", "Ngày có hiệu lực", "Tình trạng hiệu lực") và câu
 * "có hiệu lực thi hành kể từ ngày ..." trong thân văn bản. Một đoạn metadata Chính phủ đã được đối chiếu;
 * cấu trúc HTML và quan hệ ngược chưa được kiểm chứng end-to-end. Xem docs/LEGAL-INTELLIGENCE.md.
 */
(function attachLegalPage(/** @type {any} */ root, /** @type {(r:any) => any} */ factory) {
  const g = /** @type {any} */ (root || {});
  // @ts-ignore -- CommonJS khi chạy trong Node.
  const refs = typeof module === 'object' && module.exports ? require('./legal-refs.js') : g.PolicyChangeLegalRefs;
  const api = factory(refs);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLegalPage = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLegalPage(/** @type {any} */ Refs) {
  'use strict';

  const MAX_HTML = 2 * 1024 * 1024;
  const MAX_TEXT = 300000;
  /** @type {Record<string,string>} */
  const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '-', mdash: '-', hellip: '...' };

  /** @param {string} html */
  function htmlToText(html) {
    let s = String(html || '').slice(0, MAX_HTML);
    s = s.replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg|iframe|object)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/td|\/table|p|div|tr|li|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => safeChar(parseInt(h, 16)))
      .replace(/&#(\d{1,7});/g, (_, d) => safeChar(Number(d)))
      .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
    s = s.normalize('NFC').split('\n').map(l => l.replace(/[\t\f\v\r  ]+/g, ' ').trim()).filter(Boolean).join('\n');
    return s.slice(0, MAX_TEXT);
  }
  /** @param {number} c */
  function safeChar(c) { return c > 0 && c < 0x110000 && !(c >= 0xd800 && c <= 0xdfff) && c !== 0 ? String.fromCodePoint(c) : ' '; }

  /** @param {string|undefined} d @param {string|undefined} m @param {string|undefined} y */
  function iso(d, m, y) {
    const dd = Number(d), mm = Number(m), yy = Number(y);
    if (!(yy >= 1945 && yy <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return null;
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    if (dt.getUTCMonth() !== mm - 1) return null;
    return yy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  }
  const NUM_DATE = '(\\d{1,2})\\s*[/.-]\\s*(\\d{1,2})\\s*[/.-]\\s*(\\d{4})';
  const WORD_DATE = 'ngày\\s+(\\d{1,2})\\s+tháng\\s+(\\d{1,2})\\s+năm\\s+(\\d{4})';
  /** @param {string} text @param {string} label */
  function labelledDate(text, label) {
    const m = text.match(new RegExp(label + '\\s*[:：]?\\s*(?:' + NUM_DATE + '|' + WORD_DATE + ')', 'imu'));
    if (!m) return null;
    return m[1] ? iso(m[1], m[2], m[3]) : iso(m[4], m[5], m[6]);
  }

  const STATUS_RE = /(?:tình\s+trạng(?:\s+hiệu\s+lực)?|trạng\s+thái\s+hiệu\s+lực)\s*[:：]\s*(còn hiệu lực|hết hiệu lực toàn bộ|hết hiệu lực một phần|hết hiệu lực|chưa có hiệu lực|chưa xác định|ngưng hiệu lực(?: một phần| toàn bộ)?|không còn phù hợp)/iu;

  /**
   * @param {{ html:string, url:string, requestedId:string, retrievedAt:string, source:{name:string, tier:'primary'|'secondary'} }} input
   * @returns {{ ok:true, doc:any } | { ok:false, reason:string, code:string }}
   */
  function parse(input) {
    const html = String(input.html || '').replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, ' ');
    const text = htmlToText(html);
    if (text.length < 40) return { ok: false, reason: 'Trang không có nội dung văn bản.', code: 'parse_error' };
    const want = Refs.canonicalId(input.requestedId);
    // Only an exact number field establishes identity. Citations, navigation and search snippets do not.
    const numberFields = [...text.matchAll(/^(?:số\s*(?:ký\s*hiệu|hiệu)?|ký\s*hiệu)\s*[:：]?\s*([^\n]+)$/gimu)].map(m => ({ raw: m[1].trim(), quote: m[0] }));
    const ids = new Set(numberFields.map(m => Refs.canonicalId(m.raw)));
    if (!want || ids.size !== 1 || !ids.has(want)) return { ok: false, reason: 'Không xác minh được số hiệu ở trường định danh của trang.', code: 'identity_unverified' };
    const hit = Refs.extractReferences(numberFields[0].raw).find((/** @type {any} */ r) => r.canonicalId === want);
    if (!hit) return { ok: false, reason: 'Trường số hiệu không đúng định dạng.', code: 'identity_unverified' };
    const titleTag = (String(input.html).match(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i) || [])[1];
    const title = titleTag ? htmlToText(titleTag).replace(/\s+/g, ' ').slice(0, 400) : (text.split('\n').find(l => l.length > 20) || '').slice(0, 400);
    const titleId = Refs.extractReferences(title)[0];
    if (/tra cứu|tìm kiếm|kết quả tìm|search results/iu.test(title) || /<(?:form)\b[^>]*>[\s\S]*kết quả tìm kiếm/iu.test(html)) return { ok: false, reason: 'Trang tìm kiếm không phải trang định danh văn bản.', code: 'identity_unverified' };
    if (titleId && titleId.canonicalId !== want) return { ok: false, reason: 'Tiêu đề và trường số hiệu mâu thuẫn.', code: 'identity_unverified' };
    const pageSource = Refs.sourceFor(input.url);
    if (!pageSource) return { ok: false, reason: 'Trang không thuộc nguồn được phép.', code: 'blocked' };
    if (!titleId || titleId.canonicalId !== want) return { ok: false, reason: 'Thiếu tiêu đề văn bản khớp trường số hiệu; không nhận kết quả tìm kiếm hay trang trích dẫn.', code: 'identity_unverified' };
    const sym = String(hit ? hit.symbol || '' : (input.requestedId.split('/').pop() || ''));
    const parsed = hit && hit.kind ? { kind: hit.kind, issuer: hit.issuer } : (sym ? Refs.parseSymbol(sym) : {});
    const issueDate = labelledDate(text, '^ngày\\s+ban\\s+hành');
    const effectiveFrom = labelledDate(text, '^(?:ngày\\s+có\\s+hiệu\\s+lực|ngày\\s+hiệu\\s+lực|hiệu\\s+lực\\s+từ\\s+ngày)') ||
      labelledDate(text, '(?:thông tư|nghị định|quyết định|luật|nghị quyết)\\s+này\\s+có\\s+hiệu\\s+lực(?:\\s+thi\\s+hành)?(?:\\s+kể)?\\s+từ');
    const expiresOn = labelledDate(text, '^ngày\\s+hết\\s+hiệu\\s+lực');
    const st = text.match(STATUS_RE);
    const label = st ? st[1].charAt(0).toUpperCase() + st[1].slice(1).toLowerCase() : null;
    const suspensionFrom = labelledDate(text, '^(?:ngày\\s+bắt\\s+đầu\\s+ngưng\\s+hiệu\\s+lực|ngưng\\s+hiệu\\s+lực\\s+từ\\s+ngày)');
    const suspensionUntil = labelledDate(text, '^ngày\\s+kết\\s+thúc\\s+ngưng\\s+hiệu\\s+lực');
    const doc = {
      canonicalId: want, number: hit ? hit.raw.replace(/\s+/g, '') : input.requestedId, kind: parsed.kind || null, title, issuer: parsed.issuer || null,
      issueDate, effectiveFrom, expiresOn,
      officialStatus: label ? { label, raw: st ? st[0].slice(0, 300) : null, observedAt: input.retrievedAt } : null,
      suspension: suspensionFrom ? { from: suspensionFrom, until: suspensionUntil, scope: label && /toàn bộ/iu.test(label) ? 'whole' : 'partial', raw: st ? st[0].slice(0, 300) : 'Ngưng hiệu lực' } : null,
      sources: [{ name: pageSource.name, url: input.url, tier: pageSource.tier, retrievedAt: input.retrievedAt }],
      identity: { verified: true, canonicalId: want, method: 'exact_number_field', quote: numberFields[0].quote.slice(0, 400) },
      coverage: { relationships: 'unknown', history: 'unknown' },
      limitations: ['Chưa kiểm chứng đầy đủ metadata quan hệ ngược và lịch sử từng điều tại cổng nguồn.'],
      relations: /** @type {any[]} */ ([]), text: text.slice(text.indexOf(numberFields[0].quote)).split(/\nCác văn bản khác\b/iu)[0], synthetic: false
    };
    // The inspected Government portal exposes a labelled abstract, not a complete relationship ledger.
    if (new URL(input.url).hostname === 'vanban.chinhphu.vn') {
      const summary = text.match(/^Trích yếu\s*[:：]?\s*([^\n]+)/imu)?.[1];
      if (summary) for (const ref of Refs.extractReferences(summary)) {
        if (ref.canonicalId === want || !['AMENDS', 'SUPPLEMENTS', 'CONSOLIDATES'].includes(ref.relation)) continue;
        doc.relations.push({ target: ref.raw, type: ref.relation, direction: 'out', basis: 'text_cue', scope: ref.scope, provisions: ref.provisions,
          quote: summary.slice(0, 400), effectiveFrom: null, provenance: 'vanban.chinhphu.vn:Trích yếu' });
      }
    }
    return { ok: true, doc };
  }

  return { MAX_HTML, PARSER_VERSION: 2, htmlToText, parse, labelledDate };
});
