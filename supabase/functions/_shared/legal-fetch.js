// @ts-check
/**
 * Tải một trang từ nguồn văn bản pháp luật một cách an toàn (dùng ở Edge Function legal-discover).
 *
 * - Chỉ https, chỉ host trong allowlist (legal-refs SOURCES), không IP, không cổng lạ, không thông tin đăng nhập trong URL.
 * - Không tự đi theo chuyển hướng: mỗi bước chuyển hướng được kiểm lại với allowlist, tối đa 3 bước.
 * - Giới hạn thời gian và kích thước (đọc theo luồng, dừng khi vượt), chỉ nhận HTML hoặc văn bản thuần.
 * Hàm fetch được truyền vào để kiểm thử được mà không cần mạng.
 */
(function attachLegalFetch(/** @type {any} */ root, /** @type {(r:any) => any} */ factory) {
  const g = /** @type {any} */ (root || {});
  // @ts-ignore -- CommonJS khi chạy trong Node.
  const refs = typeof module === 'object' && module.exports ? require('./legal-refs.js') : g.PolicyChangeLegalRefs;
  const api = factory(refs);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLegalFetch = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLegalFetch(/** @type {any} */ Refs) {
  'use strict';

  const DEFAULTS = Object.freeze({ maxBytes: 2 * 1024 * 1024, timeoutMs: 8000, maxRedirects: 3 });

  /**
   * @param {string} url
   * @param {{ fetchImpl:(url:string, init:any) => Promise<any>, allow?:any[], maxBytes?:number, timeoutMs?:number, maxRedirects?:number }} opts
   * @returns {Promise<{ ok:true, url:string, source:any, body:string, bytes:number } | { ok:false, reason:string, code:string }>}
   */
  async function safeFetch(url, opts) {
    const maxBytes = opts.maxBytes || DEFAULTS.maxBytes;
    const timeoutMs = opts.timeoutMs || DEFAULTS.timeoutMs;
    const maxRedirects = opts.maxRedirects ?? DEFAULTS.maxRedirects;
    let current = String(url);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const source = Refs.sourceFor(current, opts.allow);
      if (!source) return { ok: false, code: 'blocked', reason: 'Địa chỉ không thuộc danh sách nguồn được phép.' };
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      /** @type {any} */ let timer = null;
      try {
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => { if (ctrl) ctrl.abort(); reject(new Error('timeout')); }, timeoutMs); });
        /** @type {any} */
        const res = await Promise.race([opts.fetchImpl(current, {
          method: 'GET', redirect: 'manual', signal: ctrl ? ctrl.signal : undefined,
          headers: { 'Accept': 'text/html,text/plain;q=0.9', 'User-Agent': 'PolicyChangeOS-LegalDiscover/1.0 (+tra cứu văn bản công khai)' }
        }), timeout]);
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null;
          if (!loc) return { ok: false, code: 'bad_redirect', reason: 'Nguồn chuyển hướng nhưng không cho địa chỉ.' };
          current = new URL(loc, current).toString();
          continue;
        }
        if (res.status === 404) return { ok: false, code: 'not_found', reason: 'Nguồn trả về 404.' };
        if (res.status < 200 || res.status >= 300) return { ok: false, code: 'http_' + res.status, reason: 'Nguồn trả về mã ' + res.status + '.' };
        const type = String(res.headers && res.headers.get ? res.headers.get('content-type') || '' : '').toLowerCase();
        if (type && !/^(text\/html|text\/plain|application\/xhtml\+xml)/.test(type)) return { ok: false, code: 'bad_type', reason: 'Nguồn trả về loại nội dung không đọc được (' + type.slice(0, 60) + ').' };
        const declared = Number(res.headers && res.headers.get ? res.headers.get('content-length') : NaN);
        if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, code: 'too_large', reason: 'Trang lớn hơn giới hạn ' + Math.round(maxBytes / 1024) + ' KB.' };
        const read = await Promise.race([readLimited(res, maxBytes), timeout]);
        if (!read.ok) return { ok: false, code: 'too_large', reason: 'Trang lớn hơn giới hạn ' + Math.round(maxBytes / 1024) + ' KB.' };
        return { ok: true, url: current, source, body: read.text, bytes: read.bytes };
      } catch (err) {
        const msg = String((/** @type {any} */ (err)) && (/** @type {any} */ (err)).message || err);
        return msg === 'timeout' || /abort/i.test(msg)
          ? { ok: false, code: 'timeout', reason: 'Quá thời gian chờ ' + Math.round(timeoutMs / 1000) + ' giây.' }
          : { ok: false, code: 'network', reason: 'Không kết nối được tới nguồn.' };
      } finally { if (timer) clearTimeout(timer); }
    }
    return { ok: false, code: 'too_many_redirects', reason: 'Nguồn chuyển hướng quá nhiều lần.' };
  }

  /** @param {any} res @param {number} maxBytes */
  async function readLimited(res, maxBytes) {
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      /** @type {Uint8Array[]} */ const chunks = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) { try { await reader.cancel(); } catch (_) { /* bỏ qua */ } return { ok: false, text: '', bytes }; }
        chunks.push(value);
      }
      const all = new Uint8Array(bytes);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.byteLength; }
      return { ok: true, text: new TextDecoder('utf-8').decode(all), bytes };
    }
    const text = String(await res.text());
    const bytes = new TextEncoder().encode(text).byteLength;
    return bytes > maxBytes ? { ok: false, text: '', bytes } : { ok: true, text, bytes };
  }

  return { DEFAULTS, safeFetch };
});
