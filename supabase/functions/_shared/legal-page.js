// @ts-check
/**
 * Đọc một trang văn bản pháp luật đã tải về (HTML) thành dữ liệu có cấu trúc cho bộ khám phá.
 *
 * Chạy trên máy chủ (Edge Function legal-discover) sau khi trang đã qua allowlist và giới hạn kích thước.
 * Nội dung trang là dữ liệu không tin cậy: chỉ được bóc chữ và đọc bằng biểu thức chính quy, không thực thi,
 * không đưa cho mô hình ngôn ngữ, không để câu chữ trong trang đổi kết luận.
 *
 * Bộ đọc này dựa trên các nhãn thường gặp ("Ngày ban hành", "Ngày có hiệu lực", "Tình trạng hiệu lực") và câu
 * "có hiệu lực thi hành kể từ ngày ..." trong thân văn bản. Chưa kiểm chứng được trên trang thật từ môi trường
 * phát triển (mạng bị chặn), nên mọi trường không đọc được để trống và trạng thái sẽ là "Chưa xác minh được".
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
    const m = text.match(new RegExp(label + '\\s*[:：]?\\s*(?:' + NUM_DATE + '|' + WORD_DATE + ')', 'iu'));
    if (!m) return null;
    return m[1] ? iso(m[1], m[2], m[3]) : iso(m[4], m[5], m[6]);
  }

  const STATUS_RE = /(?:tình\s+trạng(?:\s+hiệu\s+lực)?|trạng\s+thái\s+hiệu\s+lực)\s*[:：]\s*(còn hiệu lực|hết hiệu lực toàn bộ|hết hiệu lực một phần|hết hiệu lực|chưa có hiệu lực|chưa xác định|ngưng hiệu lực(?: một phần| toàn bộ)?|không còn phù hợp)/iu;

  /**
   * @param {{ html:string, url:string, requestedId:string, retrievedAt:string, source:{name:string, tier:'primary'|'secondary'} }} input
   * @returns {{ ok:true, doc:any } | { ok:false, reason:string }}
   */
  function parse(input) {
    const text = htmlToText(input.html);
    if (text.length < 40) return { ok: false, reason: 'Trang không có nội dung văn bản.' };
    const want = Refs.canonicalId(input.requestedId);
    // Trang phải chứa đúng số hiệu được hỏi, nếu không thì không nhận (tránh nhận nhầm văn bản cùng chủ đề).
    const hit = Refs.extractReferences(text).find((/** @type {any} */ r) => r.canonicalId === want);
    if (!hit && !Refs.canonicalId(text).includes(want)) return { ok: false, reason: 'Trang không chứa số hiệu ' + input.requestedId + '.' };
    const titleTag = (String(input.html).match(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i) || [])[1];
    const title = titleTag ? htmlToText(titleTag).replace(/\s+/g, ' ').slice(0, 400) : (text.split('\n').find(l => l.length > 20) || '').slice(0, 400);
    const sym = String(hit ? hit.symbol || '' : (input.requestedId.split('/').pop() || ''));
    const parsed = hit && hit.kind ? { kind: hit.kind, issuer: hit.issuer } : (sym ? Refs.parseSymbol(sym) : {});
    const issueDate = labelledDate(text, 'ngày\\s+ban\\s+hành');
    const effectiveFrom = labelledDate(text, '(?:ngày\\s+có\\s+hiệu\\s+lực|ngày\\s+hiệu\\s+lực|hiệu\\s+lực\\s+từ\\s+ngày|có\\s+hiệu\\s+lực(?:\\s+thi\\s+hành)?(?:\\s+kể)?\\s+từ)');
    const expiresOn = labelledDate(text, '(?:ngày\\s+hết\\s+hiệu\\s+lực|hết\\s+hiệu\\s+lực\\s+từ\\s+ngày)');
    const st = text.match(STATUS_RE);
    const label = st ? st[1].charAt(0).toUpperCase() + st[1].slice(1).toLowerCase() : null;
    const doc = {
      canonicalId: want, number: hit ? hit.raw.replace(/\s+/g, '') : input.requestedId, kind: parsed.kind || null, title, issuer: parsed.issuer || null,
      issueDate, effectiveFrom, expiresOn,
      officialStatus: label ? { label, raw: st ? st[0].slice(0, 300) : null, observedAt: input.retrievedAt } : null,
      sources: [{ name: input.source.name, url: input.url, tier: input.source.tier, retrievedAt: input.retrievedAt }],
      // Quan hệ do bộ khám phá đọc từ câu chữ (kèm trích dẫn). Chưa đọc metadata quan hệ riêng của từng cổng.
      relations: [], text, synthetic: false
    };
    return { ok: true, doc };
  }

  return { MAX_HTML, htmlToText, parse, labelledDate };
});
