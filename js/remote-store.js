// @ts-check
/**
 * Máy khách REST tối giản cho Supabase — không cần thư viện ngoài, chạy được cả khi mở index.html bằng file://.
 *
 * - ĐỌC: PostgREST (/rest/v1) với khoá anon hoặc phiên đăng nhập; RLS chỉ cho đọc workspace demo hoặc
 *   workspace mà người dùng là thành viên.
 * - GHI: chỉ qua Edge Function `policy-api` — máy chủ chạy lại động cơ, kiểm quyền rồi ghi trong một giao dịch.
 * - ĐĂNG NHẬP: GoTrue (/auth/v1) bằng email + mật khẩu do quản trị cấp; phiên lưu ở localStorage của trình duyệt.
 */
(function attachRemoteStore(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const g = /** @type {any} */ (root || {});
  // @ts-ignore
  const Server = typeof module === 'object' && module.exports ? require('./policy-server.js') : g.PolicyChangeServer;
  const api = factory(Server);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeRemote = api;
})(typeof globalThis === 'object' ? globalThis : this, function createRemoteStore(/** @type {any} */ Server) {
  'use strict';

  const SESSION_KEY = 'policychange-os:session';
  const PAGE = 1000;

  /**
   * @param {{ url:string, anonKey:string, fetchImpl?:typeof fetch, storage?:Storage|null, timeoutMs?:number }} options
   */
  function create(options) {
    const base = String(options && options.url || '').replace(/\/+$/, '');
    const anonKey = String(options && options.anonKey || '');
    const doFetch = (options && options.fetchImpl) || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const storage = options && options.storage !== undefined ? options.storage : (typeof localStorage === 'object' ? localStorage : null);
    const timeoutMs = Number(options && options.timeoutMs) || 12000;
    /** @type {null|{ access_token:string, refresh_token:string, expires_at:number, email:string }} */
    let session = null;
    try { const raw = storage && storage.getItem(SESSION_KEY); session = raw ? JSON.parse(raw) : null; } catch (_) { session = null; }

    const configured = !!(base && anonKey && doFetch);

    /** @param {any} value */
    function saveSession(value) {
      session = value;
      try { if (storage) { if (value) storage.setItem(SESSION_KEY, JSON.stringify(value)); else storage.removeItem(SESSION_KEY); } } catch (_) { /* bỏ qua */ }
    }

    /**
     * @param {string} path @param {RequestInit & { headers?:Record<string,string> }} init
     * @returns {Promise<{ ok:boolean, status:number, data:any, headers?:Headers, networkError?:boolean }>}
     */
    async function request(path, init) {
      if (!configured || !doFetch) return { ok: false, status: 0, data: null, networkError: true };
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await doFetch(base + path, { ...init, signal: controller ? controller.signal : undefined });
        let data = null;
        const text = await response.text();
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        return { ok: response.ok, status: response.status, data, headers: response.headers };
      } catch (_) {
        return { ok: false, status: 0, data: null, networkError: true };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    /** Làm mới phiên nếu sắp hết hạn; phiên hỏng thì đăng xuất. */
    async function accessToken() {
      if (!session) return anonKey;
      if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
      const res = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (res.ok && res.data && res.data.access_token) {
        saveSession({ access_token: res.data.access_token, refresh_token: res.data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + Number(res.data.expires_in || 3600), email: session.email });
        return session.access_token;
      }
      if (!res.networkError) saveSession(null);
      return anonKey;
    }

    /** @param {Record<string,string>} [extra] */
    async function headers(extra) {
      return { apikey: anonKey, Authorization: 'Bearer ' + await accessToken(), ...(extra || {}) };
    }

    /** @param {string} table @param {string} query */
    async function selectAll(table, query) {
      /** @type {any[]} */ const rows = [];
      for (let from = 0; from < 100000; from += PAGE) {
        const res = await request('/rest/v1/' + table + '?' + query, { method: 'GET',
          headers: await headers({ Range: from + '-' + (from + PAGE - 1), 'Range-Unit': 'items' }) });
        if (!res.ok || !Array.isArray(res.data)) return { ok: false, rows, res };
        rows.push(...res.data);
        if (res.data.length < PAGE) break;
      }
      return { ok: true, rows, res: null };
    }

    /**
     * Nạp toàn bộ trạng thái một workspace.
     * @param {string} workspace
     */
    async function loadWorkspace(workspace) {
      const ws = encodeURIComponent(workspace);
      const head = await request('/rest/v1/workspaces?select=id,name,mode,ledger_seq,ledger_tail&id=eq.' + ws, { method: 'GET', headers: await headers() });
      if (head.networkError) return { ok: false, reason: 'network', message: 'Không kết nối được máy chủ.' };
      if (!head.ok || !Array.isArray(head.data)) return { ok: false, reason: 'error', message: 'Máy chủ trả lỗi ' + head.status + '.' };
      if (!head.data.length) return { ok: false, reason: 'forbidden', message: 'Không có quyền đọc workspace này (cần đăng nhập và được cấp quyền).' };
      const [policies, documents, audit, feedback, openChanges, decisions] = await Promise.all([
        selectAll('policies', 'select=*&workspace_id=eq.' + ws + '&order=position.asc,id.asc'),
        selectAll('documents', 'select=*&workspace_id=eq.' + ws + '&order=position.asc,id.asc'),
        selectAll('audit_log', 'select=*&workspace_id=eq.' + ws + '&order=seq.asc'),
        selectAll('feedback_events', 'select=rule_id,category,doc_id,line_index,line,answer,actor,created_at&workspace_id=eq.' + ws + '&order=id.asc'),
        selectAll('open_changes', 'select=*&workspace_id=eq.' + ws + '&order=created_at.asc'),
        selectAll('change_decisions', 'select=*&workspace_id=eq.' + ws + '&order=created_at.asc')
      ]);
      if (!policies.ok || !documents.ok || !audit.ok || !feedback.ok || !openChanges.ok || !decisions.ok) {
        return { ok: false, reason: 'error', message: 'Không nạp đủ dữ liệu workspace.' };
      }
      return {
        ok: true,
        workspace: head.data[0],
        registry: policies.rows.map(Server.fromDbPolicy),
        docs: documents.rows.map(Server.fromDbDocument),
        ledger: audit.rows.map(Server.fromDbRecord),
        feedback: feedback.rows.map(r => ({ ruleId: r.rule_id, category: r.category, docId: r.doc_id, lineIndex: r.line_index,
          line: r.line, answer: r.answer, actor: r.actor, ts: r.created_at })),
        openChanges: openChanges.rows.map(Server.fromDbOpenChange),
        decisions: decisions.rows.map(Server.fromDbDecision)
      };
    }

    /** Đuôi sổ kiểm toán hiện tại — dùng để phát hiện người khác vừa cập nhật. @param {string} workspace */
    async function tail(workspace) {
      const res = await request('/rest/v1/workspaces?select=ledger_seq,ledger_tail&id=eq.' + encodeURIComponent(workspace), { method: 'GET', headers: await headers() });
      if (!res.ok || !Array.isArray(res.data) || !res.data.length) return null;
      return { seq: res.data[0].ledger_seq, hash: res.data[0].ledger_tail };
    }

    /**
     * Gọi policy-api. Trả { ok, status, data } — data là JSON máy chủ (có message tiếng Việt khi lỗi).
     * @param {Record<string, any>} body
     */
    async function call(body) {
      const res = await request('/functions/v1/policy-api', { method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      if (res.networkError) return { ok: false, status: 0, data: { error: 'network', message: 'Không kết nối được máy chủ; chưa có thay đổi nào được lưu.' } };
      return { ok: res.ok, status: res.status, data: res.data || {} };
    }

    /** @param {string} email @param {string} password */
    async function signIn(email, password) {
      const res = await request('/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') })
      });
      if (res.ok && res.data && res.data.access_token) {
        saveSession({ access_token: res.data.access_token, refresh_token: res.data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + Number(res.data.expires_in || 3600), email: String(email).trim() });
        return { ok: true };
      }
      return { ok: false, message: res.networkError ? 'Không kết nối được máy chủ.' : 'Email hoặc mật khẩu không đúng.' };
    }

    async function signOut() {
      if (session) {
        await request('/auth/v1/logout', { method: 'POST', headers: { apikey: anonKey, Authorization: 'Bearer ' + session.access_token } });
      }
      saveSession(null);
    }

    return Object.freeze({
      configured,
      get session() { return session ? { email: session.email } : null; },
      loadWorkspace, tail, call, signIn, signOut, accessToken
    });
  }

  return Object.freeze({ create, SESSION_KEY });
});
