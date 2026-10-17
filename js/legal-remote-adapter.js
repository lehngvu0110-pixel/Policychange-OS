// @ts-check
/**
 * Adapter tra cứu trực tuyến phía trình duyệt: gọi Edge Function `legal-discover`.
 * Khoá nhà cung cấp tìm kiếm chỉ nằm ở máy chủ. Mọi lỗi mạng đều trả về một trạng thái rõ ràng, không ném lỗi.
 * Khi máy chủ báo "unavailable" (chưa cấu hình, hết hạn mức) adapter ghi nhận lại để giao diện nói thật là
 * không tra cứu trực tuyến được, thay vì coi như "không tìm thấy".
 */
(function attachLegalRemote(/** @type {any} */ root, /** @type {() => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLegalRemote = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLegalRemote() {
  'use strict';

  /** @param {{ functionsUrl:string, apiKey?:string, fetchImpl?:typeof fetch, token?:() => (string|null|Promise<string|null>) }} options */
  function create(options) {
    const base = String(options && options.functionsUrl || '').replace(/\/+$/, '');
    const doFetch = (options && options.fetchImpl) || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

    /** @param {any} body */
    async function post(body, /** @type {{signal?:AbortSignal}} */ context = {}) {
      if (!base || !doFetch) return { ok: false, status: 0, data: { message: 'Chế độ Ngoại tuyến: không có máy chủ.' } };
      /** @type {Record<string,string>} */ const headers = { 'Content-Type': 'application/json' };
      if (options.apiKey) headers.apikey = options.apiKey;
      let tok = null;
      try { tok = options.token ? await options.token() : null; } catch (_) { tok = null; }
      headers.Authorization = 'Bearer ' + (tok || options.apiKey || '');
      const ctrl = new AbortController();
      const cancel = () => ctrl.abort();
      context.signal?.addEventListener('abort', cancel, { once: true });
      if (context.signal?.aborted) cancel();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      try {
        const res = await doFetch(base + '/legal-discover', { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
        let data = null;
        try { data = await res.json(); } catch (_) { data = null; }
        return { ok: res.ok && !!data, status: res.status, data: data || {} };
      } catch (_) {
        return { ok: false, status: 0, data: { code: ctrl.signal.aborted ? context.signal?.aborted ? 'cancelled' : 'timeout' : 'network', message: ctrl.signal.aborted ? 'Đã huỷ hoặc quá thời gian chờ máy chủ tra cứu.' : 'Không kết nối được máy chủ tra cứu.' } };
      } finally { clearTimeout(timer); context.signal?.removeEventListener('abort', cancel); }
    }

    const adapter = {
      name: 'Tra cứu trực tuyến (vbpl.vn, vanban.chinhphu.vn, Công báo)', live: true, synthetic: false,
      /** Lý do không tra cứu được, nếu máy chủ đã báo. */
      unavailable: /** @type {string|null} */ (null),
      async status() {
        const r = await post({ action: 'status' });
        if (!r.ok) return { configured: false, reason: r.status === 404 ? 'Máy chủ chưa triển khai chức năng tra cứu (legal-discover).' : (r.data.message || 'Máy chủ tra cứu không phản hồi.') };
        return { configured: r.data.configured === true, provider: r.data.provider || null, reason: r.data.reason || null, sources: r.data.sources || [] };
      },
      /** @param {any} ref */
      async resolve(ref, /** @type {{signal?:AbortSignal}} */ context = {}) {
        if (adapter.unavailable) return { status: 'error', reason: adapter.unavailable, retryable: true };
        const r = await post({ action: 'resolve', ref: { canonicalId: ref.canonicalId, raw: ref.raw } }, context);
        if (!r.ok) return { status: 'error', code: r.data.code || 'http_' + r.status, reason: r.data.message || 'Máy chủ tra cứu trả lỗi ' + r.status + '.', retryable: r.status === 0 || r.status === 408 || r.status === 429 || r.status >= 500 };
        const d = r.data;
        if (d.status === 'unavailable') { adapter.unavailable = String(d.reason || 'Không tra cứu trực tuyến được.'); return { status: 'error', reason: adapter.unavailable, retryable: true }; }
        if (d.status === 'found' && d.doc) return { status: 'found', doc: { ...d.doc, synthetic: false,
          limitations: (d.doc.limitations || []).concat(d.cacheWarning ? [String(d.cacheWarning)] : []) } };
        if (d.status === 'not_found') return { status: 'not_found', reason: String(d.reason || 'Không tìm thấy') };
        return { status: 'error', code: String(d.code || 'retrieval_error'), reason: String(d.reason || 'Lỗi không rõ'), retryable: d.retryable === true, failures: Array.isArray(d.failures) ? d.failures.slice(0, 12) : [] };
      },
      /** @param {{ workspace:string, persona?:string, run:any }} input */
      async saveRun(input) { return post({ action: 'save_run', ...input }); }
    };
    return adapter;
  }

  return Object.freeze({ create });
});
