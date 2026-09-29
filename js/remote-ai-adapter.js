// @ts-check
/**
 * Adapter AI phía trình duyệt: gọi Edge Function `ai-extract` / `ai-discover` (khoá OpenAI chỉ nằm ở máy chủ).
 * Tuân đúng hợp đồng của policy-ai.js (`extract`) và semantic-discovery.js (`discover`):
 * mọi lỗi mạng / máy chủ / hết giờ đều trả `{ available:false, reason }`, không bao giờ ném lỗi,
 * để hệ thống lùi về động cơ tiền định.
 */
(function attachRemoteAI(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeRemoteAI = api;
})(typeof globalThis === 'object' ? globalThis : this, function createRemoteAI() {
  'use strict';

  /**
   * @param {{ functionsUrl:string, apiKey?:string, fetchImpl?:typeof fetch }} options
   */
  function create(options) {
    const base = String(options && options.functionsUrl || '').replace(/\/+$/, '');
    const doFetch = (options && options.fetchImpl) || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    /** @type {Record<string,string>} */
    const headers = { 'Content-Type': 'application/json' };
    if (options && options.apiKey) { headers.apikey = options.apiKey; headers.Authorization = 'Bearer ' + options.apiKey; }

    /** @param {string} name @param {any} body @param {{ signal?:AbortSignal }} [opts] */
    async function call(name, body, opts) {
      if (!base || !doFetch) return { available: false, reason: 'Chưa cấu hình máy chủ AI.' };
      try {
        const response = await doFetch(base + '/' + name, { method: 'POST', headers, body: JSON.stringify(body), signal: opts && opts.signal });
        let data = null;
        try { data = await response.json(); } catch (_) { data = null; }
        if (!response.ok || !data || typeof data !== 'object') {
          return { available: false, reason: (data && typeof data.message === 'string') ? data.message : 'Máy chủ AI trả lỗi ' + response.status + '.' };
        }
        if (data.available !== true) return { available: false, reason: typeof data.reason === 'string' ? data.reason : 'AI không khả dụng.' };
        return { available: true, output: data.output, model: data.model || null, dropped: data.dropped || 0 };
      } catch (error) {
        const aborted = error && typeof error === 'object' && /** @type {any} */ (error).name === 'AbortError';
        return { available: false, reason: aborted ? 'AI hết thời gian chờ.' : 'Không kết nối được máy chủ AI.' };
      }
    }

    /** Kiểm tra máy chủ AI đã được cấu hình chưa (không tốn lượt gọi mô hình). */
    async function status() {
      return call('ai-extract', { probe: true });
    }

    return Object.freeze({
      /** @param {{ requestText:string, registry:any[] }} input @param {{ signal?:AbortSignal }} [opts] */
      extract: (input, opts) => call('ai-extract', { requestText: input.requestText, registry: input.registry }, opts),
      /** @param {any} payload @param {{ signal?:AbortSignal }} [opts] */
      discover: (payload, opts) => call('ai-discover', payload, opts),
      status
    });
  }

  return Object.freeze({ create });
});
