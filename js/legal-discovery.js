// @ts-check
/**
 * Khám phá văn bản pháp luật liên quan theo nhiều tầng (duyệt theo chiều rộng trên đồ thị quan hệ).
 *
 * Bắt đầu từ một văn bản đầu vào: trích số hiệu văn bản trong đó, nhờ một "adapter" tìm và tải từng văn bản
 * (kể cả văn bản người dùng chưa tải lên), rồi lại đọc quan hệ của văn bản vừa tìm được: văn bản nó dẫn chiếu,
 * văn bản sửa đổi, thay thế, bãi bỏ nó (theo metadata chính thức của nguồn). Lặp tới khi hết hoặc chạm giới hạn.
 *
 * - Có tập đã thăm để không tải lặp và không lặp vô hạn khi đồ thị có chu trình.
 * - Giới hạn độ sâu và số lượt tra (kể cả lỗi) là rào chắn an toàn; khi chạm giới hạn, phần chưa duyệt được trả về
 *   trong `frontier` và kết quả ghi rõ `state: 'partial'` kèm lý do. Không bao giờ trình bày kết quả cắt cụt là đầy đủ.
 * - Quan hệ chỉ được ghi khi có bằng chứng: metadata của nguồn, hoặc câu chữ trong văn bản (kèm trích dẫn).
 *   Không dùng mô hình ngôn ngữ để gán "sửa đổi" hay "bãi bỏ".
 * - Nội dung tải về là dữ liệu không tin cậy: chỉ được đọc bằng biểu thức trích số hiệu, không bao giờ được thực thi
 *   hay coi là mệnh lệnh.
 *
 * Adapter: { name, live:boolean, resolve(ref, {signal}) => Promise<{status:'found', doc} | {status:'not_found', reason}
 *            | {status:'error', reason, retryable?}> }
 */
(function attachLegalDiscovery(/** @type {any} */ root, /** @type {(r:any) => any} */ factory) {
  const g = /** @type {any} */ (root || {});
  // @ts-ignore -- CommonJS khi chạy trong Node.
  const refs = typeof module === 'object' && module.exports ? require('./legal-refs.js') : g.PolicyChangeLegalRefs;
  const api = factory(refs);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLegalDiscovery = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLegalDiscovery(/** @type {any} */ Refs) {
  'use strict';

  const MAX_TEXT = 300000; // ký tự đọc tối đa mỗi văn bản, chặn văn bản quá lớn
  const DEFAULTS = Object.freeze({ maxDepth: 3, maxDocs: 25, timeoutMs: 45000, maxNodes: 1000, maxEdges: 4000, maxRetries: 2 });

  /** @param {any} adapter @param {any} ref @param {number} ms @param {AbortSignal} [signal] */
  async function resolveBounded(adapter, ref, ms, signal) {
    const ctrl = new AbortController();
    /** @type {any} */ let timer;
    /** @type {any} */ let cancel;
    const stopped = new Promise(resolve => {
      const stop = (/** @type {string} */ code) => { ctrl.abort(); resolve({ status: 'error', code, reason: code === 'timeout' ? 'Quá thời gian chờ tra cứu' : 'Đã huỷ tra cứu', retryable: true }); };
      cancel = () => stop('cancelled');
      timer = setTimeout(() => stop('timeout'), ms);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
    try { return await Promise.race([stopped, Promise.resolve().then(() => ctrl.signal.aborted ? stopped : adapter.resolve(ref, { signal: ctrl.signal }))]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }

  /** Chỉ giữ các trường dữ liệu đã biết của văn bản tải về; ép kiểu chuỗi, cắt độ dài. @param {any} d */
  function cleanDoc(d) {
    const str = (/** @type {any} */ v, n = 500) => (v == null ? null : String(v).slice(0, n));
    const date = (/** @type {any} */ v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    return {
      canonicalId: Refs.canonicalId(String(d.canonicalId || d.number || '')),
      number: str(d.number, 80), kind: str(d.kind, 60), title: str(d.title, 400), issuer: str(d.issuer, 200),
      issueDate: date(d.issueDate), effectiveFrom: date(d.effectiveFrom), expiresOn: date(d.expiresOn),
      officialStatus: d.officialStatus && typeof d.officialStatus === 'object'
        ? { label: str(d.officialStatus.label, 80), raw: str(d.officialStatus.raw, 300), observedAt: str(d.officialStatus.observedAt, 40) } : null,
      sources: Array.isArray(d.sources) ? d.sources.slice(0, 5).map((/** @type {any} */ s) => ({
        name: str(s.name, 120), url: str(s.url, 600), tier: s.tier === 'primary' ? 'primary' : 'secondary', retrievedAt: str(s.retrievedAt, 40)
      })) : [],
      text: str(d.text, MAX_TEXT) || '',
      relations: Array.isArray(d.relations) ? d.relations.slice(0, 200) : [],
      coverage: { relationships: d.coverage?.relationships === 'complete' ? 'complete' : 'unknown', history: d.coverage?.history === 'complete' ? 'complete' : 'unknown' },
      identity: d.identity && { verified: d.identity.verified === true, canonicalId: str(d.identity.canonicalId, 80), method: str(d.identity.method, 80), quote: str(d.identity.quote, 400) },
      suspension: d.suspension ? { from: date(d.suspension.from), until: date(d.suspension.until), scope: d.suspension.scope === 'whole' ? 'whole' : 'partial', raw: str(d.suspension.raw, 300) } : null,
      limitations: Array.isArray(d.limitations) ? d.limitations.slice(0, 10).map((/** @type {any} */ x) => str(x, 400)) : [],
      retrievalFailures: cleanFailures(d.retrievalFailures),
      synthetic: !!d.synthetic
    };
  }

  /** @param {any} input */
  function cleanFailures(input) {
    return Array.isArray(input) ? input.slice(0, 12).map((/** @type {any} */ f) => ({ code: String(f?.code || 'unknown').slice(0, 60),
      reason: String(f?.reason || 'Chưa xác minh được trang ứng viên.').slice(0, 300), url: typeof f?.url === 'string' ? f.url.slice(0, 600) : null, retryable: f?.retryable === true })) : [];
  }

  /**
   * @param {{
   *   start: { id:string, title:string, text:string },
   *   adapter: { name:string, live?:boolean, resolve:(ref:any, context?:any) => Promise<any> },
   *   maxDepth?: number, maxDocs?: number, timeoutMs?: number, totalTimeoutMs?:number, signal?:AbortSignal,
   *   onProgress?: (p:any) => void, now?: () => string, resume?: any
   * }} opts
   */
  async function discover(opts) {
    const adapter = opts.adapter;
    const now = opts.now || (() => new Date().toISOString());
    const prev = opts.resume || null;
    const limit = (/** @type {any} */ value, /** @type {number} */ fallback, /** @type {number} */ max) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(max, Math.floor(Number(value)))) : fallback;
    const limits = {
      maxDepth: limit(opts.maxDepth ?? prev?.limits.maxDepth, DEFAULTS.maxDepth, 8),
      maxDocs: limit(opts.maxDocs ?? prev?.limits.maxDocs, DEFAULTS.maxDocs, 200),
      timeoutMs: limit(opts.timeoutMs, DEFAULTS.timeoutMs, 60000),
      totalTimeoutMs: limit(opts.totalTimeoutMs, 120000, 120000),
      maxNodes: DEFAULTS.maxNodes, maxEdges: DEFAULTS.maxEdges, maxRetries: DEFAULTS.maxRetries
    };
    const runController = new AbortController();
    const cancel = () => runController.abort();
    let deadline = false;
    const runTimer = setTimeout(() => { deadline = true; runController.abort(); }, limits.totalTimeoutMs);
    opts.signal?.addEventListener('abort', cancel, { once: true });
    if (opts.signal?.aborted) cancel();
    try {
      /** @type {Map<string, any>} */ const nodes = new Map(prev ? prev.nodes.map((/** @type {any} */ n) => [n.id, { ...n }]) : []);
      /** @type {any[]} */ const edges = prev ? prev.edges.map((/** @type {any} */ e) => ({ ...e })) : [];
      const edgeKey = (/** @type {any} */ e) => [e.from, e.to, e.type, e.basis, e.scope || '', e.provisions || '', e.effectiveFrom || ''].join('|');
      const edgeKeys = new Set(edges.map(edgeKey));
      const visited = new Set(prev ? prev.nodes.filter((/** @type {any} */ n) => n.resolution !== 'pending' && n.resolution !== 'error').map((/** @type {any} */ n) => n.id) : []);
      /** @type {any[]} */ const queue = prev ? [...new Map(prev.frontier.concat(prev.nodes.filter((/** @type {any} */ n) => n.resolution === 'error').map((/** @type {any} */ n) => n.retry).filter(Boolean)).map((/** @type {any} */ i) => [i.id, i])).values()] : [];
      const queued = new Set(queue.map(i => i.id));
      /** @type {any[]} */ const frontier = [];
      const stopReasons = new Set();
      const limitations = new Set(prev?.limitations || []);
      let attempts = Number(prev?.stats.attempts) || 0;
      const startId = prev ? prev.startId : 'START';
      const runStarted = prev ? prev.startedAt : now();

      /** @param {any} e */
      function addEdge(e) {
        const k = edgeKey(e);
        if (edgeKeys.has(k) || e.from === e.to) return;
        if (edges.length >= limits.maxEdges) { limitations.add('Đã đạt giới hạn số quan hệ.'); stopReasons.add('edges'); return; }
        edgeKeys.add(k); edges.push(e);
      }
      /** @param {string} id @param {any} ref @param {number} depth @param {string|null} from @param {string} type */
      function enqueue(id, ref, depth, from, type) {
        if (!nodes.has(id) && nodes.size >= limits.maxNodes + 1) { limitations.add('Đã đạt giới hạn số nút; còn tham chiếu chưa ghi được vào đồ thị.'); stopReasons.add('nodes'); return; }
        if (!nodes.has(id)) nodes.set(id, { id, depth, direct: depth === 1, resolution: 'pending', label: ref.raw || id, ref, via: [] });
        const n = nodes.get(id);
        if (from && !n.via.some((/** @type {any} */ v) => v.from === from && v.type === type)) n.via.push({ from, type });
        if (depth < n.depth) { n.depth = depth; n.direct = depth === 1; }
        if (!visited.has(id) && !queued.has(id)) { queued.add(id); queue.push({ id, ref, depth, from, type }); }
      }
      /** Đọc số hiệu trong văn bản của một nút và thêm cạnh + hàng đợi. @param {string} fromId @param {string} text @param {number} depth @param {any} source */
      function expandText(fromId, text, depth, source) {
        const found = Refs.extractReferences(String(text || '').slice(0, MAX_TEXT));
        for (const r of found) {
          if (r.canonicalId === fromId) continue;
          addEdge({ from: fromId, to: r.canonicalId, type: r.relation, basis: r.relationBasis === 'text_cue' ? 'text_cue' : 'text_citation',
            quote: r.context, cue: r.cue, scope: r.scope, provisions: r.provisions, source: source || null, provenance: source ? 'source_text' : 'user_input', effectiveFrom: null });
          enqueue(r.canonicalId, { raw: r.raw, canonicalId: r.canonicalId, number: r.number, year: r.year, symbol: r.symbol, kind: r.kind, issuer: r.issuer },
            depth + 1, fromId, r.relation);
        }
        return found.length;
      }

      if (!prev) {
        if (String(opts.start.text || '').length > MAX_TEXT) limitations.add('Văn bản đầu vào vượt giới hạn đọc; đã cắt nội dung.');
        nodes.set(startId, { id: startId, depth: 0, direct: false, resolution: 'start', label: opts.start.title || 'Văn bản đầu vào',
          doc: { canonicalId: startId, title: opts.start.title, text: String(opts.start.text || '').slice(0, MAX_TEXT), sources: [], relations: [], managedDocId: opts.start.id },
          via: [] });
        visited.add(startId);
        expandText(startId, opts.start.text, 0, null);
      }

      while (queue.length) {
        const item = queue.shift();
        if (visited.has(item.id)) continue;
        if (item.depth > limits.maxDepth) { frontier.push(item); stopReasons.add('depth'); continue; }
        if (runController.signal.aborted) { frontier.push(item); stopReasons.add(deadline ? 'time' : 'cancelled'); continue; }
        if (attempts >= limits.maxDocs) { frontier.push(item); stopReasons.add('count'); continue; }
        visited.add(item.id);
        const node = nodes.get(item.id);
        if (opts.onProgress) opts.onProgress({ phase: 'resolve', id: item.id, depth: item.depth, done: attempts, queued: queue.length });
        attempts++; node.attempts = (node.attempts || 0) + 1;
        /** @type {any} */ let res;
        try { res = await resolveBounded(adapter, item.ref, limits.timeoutMs, runController.signal); }
        catch (_) { res = { status: 'error', code: 'network', reason: 'Không kết nối được nguồn tra cứu.', retryable: true }; }
        if (!res || typeof res !== 'object') res = { status: 'error', reason: 'Nguồn trả về dữ liệu không hợp lệ', retryable: false };

        if (res.status === 'found' && res.doc) {
          const doc = cleanDoc(res.doc);
          // Văn bản tìm được phải đúng là văn bản được hỏi. Nếu nguồn trả về văn bản khác số hiệu thì không nhận.
          if (doc.canonicalId !== item.id) {
            node.resolution = 'error'; node.code = 'identity_unverified'; node.retry = null;
            node.reason = doc.canonicalId ? 'Nguồn trả về văn bản khác số hiệu (' + doc.canonicalId + '), không nhận' : 'Nguồn trả về văn bản không rõ số hiệu, không nhận';
            continue;
          }
          node.resolution = 'found'; node.doc = doc; node.label = doc.number || node.label; node.synthetic = doc.synthetic;
          delete node.reason; delete node.retry; delete node.code; delete node.failures; delete node.stoppedBy;
          if (String(res.doc.text || '').length > MAX_TEXT || (res.doc.relations || []).length > 200 || (res.doc.sources || []).length > 5) {
            doc.coverage.relationships = 'unknown'; doc.limitations.push('Nội dung hoặc quan hệ vượt giới hạn đọc.');
          }
          const primary = doc.sources.find((/** @type {any} */ s) => s.tier === 'primary') || doc.sources[0] || null;
          for (const rel of doc.relations) {
            if (!rel || !Refs.RELATIONS.includes(rel.type) || !['in', 'out'].includes(rel.direction)) { doc.coverage.relationships = 'unknown'; doc.limitations.push('Có cấu trúc quan hệ chưa đọc được.'); continue; }
            const other = Refs.canonicalId(String(rel.target || ''));
            if (!other || !Refs.extractReferences(String(rel.target)).some((/** @type {any} */ r) => r.canonicalId === other)) { doc.coverage.relationships = 'unknown'; continue; }
            const incoming = rel.direction === 'in';
            addEdge({ from: incoming ? other : item.id, to: incoming ? item.id : other, type: rel.type, basis: rel.basis === 'text_cue' ? 'text_cue' : 'official_metadata',
              quote: rel.quote ? String(rel.quote).slice(0, 400) : null, scope: ['whole', 'partial'].includes(rel.scope) ? rel.scope : null,
              provisions: rel.provisions ? String(rel.provisions).slice(0, 200) : null, effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(rel.effectiveFrom || '') ? rel.effectiveFrom : null,
              source: primary, provenance: rel.provenance ? String(rel.provenance).slice(0, 200) : 'source_metadata' });
            enqueue(other, { raw: String(rel.target), canonicalId: other }, item.depth + 1, item.id, incoming ? 'REVERSE_' + rel.type : rel.type);
          }
          node.textRefs = expandText(item.id, doc.text, item.depth, primary);
        } else if (res.status === 'not_found') {
          node.resolution = 'not_found'; node.reason = String(res.reason || 'Không tìm thấy trên nguồn đã cấu hình').slice(0, 300);
        } else {
          node.resolution = 'error'; node.reason = String(res.reason || 'Lỗi không rõ').slice(0, 300);
          node.code = String(res.code || 'retrieval_error').slice(0, 60);
          node.failures = cleanFailures(res.failures);
          node.retry = res.retryable && node.attempts <= limits.maxRetries ? item : null;
        }
      }

      for (const f of frontier) { const n = nodes.get(f.id); if (n && n.resolution === 'pending') n.stoppedBy = f.depth > limits.maxDepth ? 'depth' : 'count'; }
      const all = [...nodes.values()];
      const errors = all.filter(n => n.resolution === 'error').map(n => ({ id: n.id, reason: n.reason, code: n.code, retryable: !!n.retry }));
      if (errors.length) stopReasons.add('errors');
      if (runController.signal.aborted) stopReasons.add(deadline ? 'time' : 'cancelled');
      const unresolved = all.filter(n => ['pending', 'not_found', 'error'].includes(n.resolution))
        .map(n => ({ id: n.id, label: n.label, reason: n.reason || 'Chưa tra do giới hạn hoặc đã huỷ.', resolution: n.resolution, code: n.code }));
      if (unresolved.some(n => n.resolution === 'not_found')) stopReasons.add('unresolved');
      for (const n of all) if (n.resolution === 'found' && (n.doc.coverage.relationships !== 'complete' || n.doc.retrievalFailures.length)) stopReasons.add('coverage');
      const complete = frontier.length === 0 && unresolved.length === 0 && !limitations.size && !stopReasons.has('coverage');
      return {
        startId, adapter: adapter.name, live: !!adapter.live, limits, startedAt: runStarted, finishedAt: now(),
        state: complete ? 'complete' : 'partial', stopReasons: [...stopReasons], limitations: [...limitations],
        nodes: all, edges, frontier, unresolved, errors,
        stats: {
          found: all.filter(n => n.resolution === 'found').length, notFound: all.filter(n => n.resolution === 'not_found').length,
          errors: errors.length, attempts, pending: frontier.length, maxDepthReached: Math.max(0, ...all.filter(n => n.resolution === 'found').map(n => n.depth))
        }
      };
    } finally { clearTimeout(runTimer); opts.signal?.removeEventListener('abort', cancel); }
  }

  /**
   * Tiếp tục từ kết quả dang dở: nới giới hạn rồi duyệt tiếp phần frontier và thử lại các lỗi tạm thời.
   * @param {any} prev @param {{ adapter:any, addDepth?:number, addDocs?:number, timeoutMs?:number, signal?:AbortSignal, onProgress?:any, now?:any }} opts
   */
  function continueDiscovery(prev, opts) {
    return discover({
      start: { id: prev.startId, title: '', text: '' }, adapter: opts.adapter, resume: prev,
      maxDepth: prev.limits.maxDepth + (opts.addDepth ?? 1), maxDocs: prev.limits.maxDocs + (opts.addDocs ?? 10),
      timeoutMs: opts.timeoutMs, signal: opts.signal, onProgress: opts.onProgress, now: opts.now
    });
  }

  /** Lý do dừng bằng lời thường. @param {string} r */
  function stopReasonLabel(r) {
    return ({ depth: 'Chạm giới hạn độ sâu', count: 'Chạm giới hạn số lượt tra cứu (kể cả lượt lỗi)', errors: 'Có nguồn lỗi hoặc không truy cập được', unresolved: 'Còn tham chiếu chưa tìm được', coverage: 'Chưa xác minh đầy đủ quan hệ tại nguồn', cancelled: 'Đã huỷ tra cứu', time: 'Chạm giới hạn thời gian tra cứu', nodes: 'Chạm giới hạn số nút', edges: 'Chạm giới hạn số quan hệ' })[r] || r;
  }

  return { DEFAULTS, discover, continueDiscovery, stopReasonLabel };
});
