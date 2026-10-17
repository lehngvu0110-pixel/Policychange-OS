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
   * @param {{ fetchImpl:(url:string, init:any) => Promise<any>, allow?:any[], maxBytes?:number, timeoutMs?:number, maxRedirects?:number, signal?:AbortSignal }} opts
   * @returns {Promise<{ ok:true, url:string, source:any, body:string, bytes:number } | { ok:false, reason:string, code:string }>}
   */
  async function safeFetch(url, opts) {
    const clamp = (/** @type {any} */ x, /** @type {number} */ fallback, /** @type {number} */ min) => Number.isFinite(x) ? Math.max(min, Math.min(fallback, Math.floor(x))) : fallback;
    const maxBytes = clamp(opts.maxBytes, DEFAULTS.maxBytes, 1);
    const timeoutMs = clamp(opts.timeoutMs, DEFAULTS.timeoutMs, 1);
    const maxRedirects = clamp(opts.maxRedirects, DEFAULTS.maxRedirects, 0);
    let current = String(url);
    const ctrl = new AbortController();
    const cancel = () => ctrl.abort();
    let timedOut = false;
    /** @type {any} */ let timer;
    const stopped = new Promise((_, reject) => {
      const aborted = () => reject(new Error(timedOut ? 'timeout' : 'cancelled'));
      ctrl.signal.addEventListener('abort', aborted, { once: true });
      timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    });
    void stopped.catch(() => {});
    opts.signal?.addEventListener('abort', cancel, { once: true });
    if (opts.signal?.aborted) cancel();
    try {
      for (let hop = 0; hop <= maxRedirects; hop++) {
        if (ctrl.signal.aborted) return { ok: false, code: timedOut ? 'timeout' : 'cancelled', reason: timedOut ? 'Quá thời gian chờ nguồn.' : 'Đã huỷ tải nguồn.' };
        const source = Refs.sourceFor(current, opts.allow);
        if (!source) return { ok: false, code: 'blocked', reason: 'Địa chỉ không thuộc danh sách nguồn được phép.' };
        try {
          /** @type {any} */
          const res = await Promise.race([opts.fetchImpl(current, {
            method: 'GET', redirect: 'manual', signal: ctrl.signal,
            headers: { 'Accept': 'text/html,text/plain;q=0.9', 'User-Agent': 'PolicyChangeOS-LegalDiscover/1.0 (public legal research)' }
          }), stopped]);
          if (res.status >= 300 && res.status < 400) {
            const loc = res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null;
            if (!loc) return { ok: false, code: 'bad_redirect', reason: 'Nguồn chuyển hướng nhưng không cho địa chỉ.' };
            current = new URL(loc, current).toString();
            if (res.body?.cancel) await res.body.cancel();
            continue;
          }
          if (res.status === 404) return { ok: false, code: 'not_found', reason: 'Nguồn trả về 404.' };
          if (res.status < 200 || res.status >= 300) return { ok: false, code: 'http_' + res.status, reason: 'Nguồn trả về mã ' + res.status + '.' };
          const type = String(res.headers && res.headers.get ? res.headers.get('content-type') || '' : '').toLowerCase();
          if (type && !/^(text\/html|text\/plain|application\/xhtml\+xml)/.test(type)) return { ok: false, code: 'bad_type', reason: 'Nguồn trả về loại nội dung không đọc được (' + type.slice(0, 60) + ').' };
          const declared = Number(res.headers && res.headers.get ? res.headers.get('content-length') : NaN);
          if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, code: 'too_large', reason: 'Trang lớn hơn giới hạn ' + Math.round(maxBytes / 1024) + ' KB.' };
          const read = await Promise.race([readLimited(res, maxBytes, ctrl.signal), stopped]);
          if (!read.ok) return { ok: false, code: 'too_large', reason: 'Trang lớn hơn giới hạn ' + Math.round(maxBytes / 1024) + ' KB.' };
          return { ok: true, url: current, source, body: read.text, bytes: read.bytes };
        } catch (err) {
          return ctrl.signal.aborted
            ? { ok: false, code: timedOut ? 'timeout' : 'cancelled', reason: timedOut ? 'Quá thời gian chờ nguồn.' : 'Đã huỷ tải nguồn.' }
            : { ok: false, code: 'network', reason: 'Không kết nối được tới nguồn.' };
        }
      }
      return { ok: false, code: 'too_many_redirects', reason: 'Nguồn chuyển hướng quá nhiều lần.' };
    } finally { clearTimeout(timer); opts.signal?.removeEventListener('abort', cancel); ctrl.abort(); }
  }

  /** @param {any} res @param {number} maxBytes @param {AbortSignal} [signal] */
  async function readLimited(res, maxBytes, signal) {
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      signal?.addEventListener('abort', cancel, { once: true });
      /** @type {Uint8Array[]} */ const chunks = [];
      let bytes = 0;
      try {
        for (;;) {
          if (signal?.aborted) throw new Error('cancelled');
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) { try { await reader.cancel(); } catch (_) { /* bỏ qua */ } return { ok: false, text: '', bytes }; }
          chunks.push(value);
        }
      } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock?.(); }
      const all = new Uint8Array(bytes);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.byteLength; }
      return { ok: true, text: new TextDecoder('utf-8').decode(all), bytes };
    }
    const text = String(await res.text());
    const bytes = new TextEncoder().encode(text).byteLength;
    return bytes > maxBytes ? { ok: false, text: '', bytes } : { ok: true, text, bytes };
  }

  /** @param {string} code */
  function retryable(code) { return ['timeout', 'network', 'http_408', 'http_429', 'http_500', 'http_502', 'http_503', 'http_504'].includes(code); }

  return { DEFAULTS, safeFetch, readLimited, retryable };
});
