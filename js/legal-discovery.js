// @ts-check
/**
 * Khám phá văn bản pháp luật liên quan theo nhiều tầng (duyệt theo chiều rộng trên đồ thị quan hệ).
 *
 * Bắt đầu từ một văn bản đầu vào: trích số hiệu văn bản trong đó, nhờ một "adapter" tìm và tải từng văn bản
 * (kể cả văn bản người dùng chưa tải lên), rồi lại đọc quan hệ của văn bản vừa tìm được: văn bản nó dẫn chiếu,
 * văn bản sửa đổi, thay thế, bãi bỏ nó (theo metadata chính thức của nguồn). Lặp tới khi hết hoặc chạm giới hạn.
 *
 * - Có tập đã thăm để không tải lặp và không lặp vô hạn khi đồ thị có chu trình.
 * - Giới hạn độ sâu và số văn bản là rào chắn an toàn; khi chạm giới hạn, phần chưa duyệt được trả về
 *   trong `frontier` và kết quả ghi rõ `state: 'partial'` kèm lý do. Không bao giờ trình bày kết quả cắt cụt là đầy đủ.
 * - Quan hệ chỉ được ghi khi có bằng chứng: metadata của nguồn, hoặc câu chữ trong văn bản (kèm trích dẫn).
 *   Không dùng mô hình ngôn ngữ để gán "sửa đổi" hay "bãi bỏ".
 * - Nội dung tải về là dữ liệu không tin cậy: chỉ được đọc bằng biểu thức trích số hiệu, không bao giờ được thực thi
 *   hay coi là mệnh lệnh.
 *
 * Adapter: { name, live:boolean, resolve(ref) => Promise<{status:'found', doc} | {status:'not_found', reason}
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
  const DEFAULTS = Object.freeze({ maxDepth: 3, maxDocs: 25, timeoutMs: 15000 });

  /** @param {Promise<any>} p @param {number} ms */
  function withTimeout(p, ms) {
    /** @type {any} */ let timer;
    return Promise.race([p, new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'error', reason: 'Quá thời gian chờ ' + Math.round(ms / 1000) + ' giây', retryable: true }), ms); })])
      .finally(() => clearTimeout(timer));
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
      synthetic: !!d.synthetic
    };
  }

  /**
   * @param {{
   *   start: { id:string, title:string, text:string },
   *   adapter: { name:string, live?:boolean, resolve:(ref:any) => Promise<any> },
   *   maxDepth?: number, maxDocs?: number, timeoutMs?: number,
   *   onProgress?: (p:any) => void, now?: () => string, resume?: any
   * }} opts
   */
  async function discover(opts) {
    const adapter = opts.adapter;
    const now = opts.now || (() => new Date().toISOString());
    const prev = opts.resume || null;
    const limits = {
      maxDepth: Math.max(1, Math.min(8, Number(opts.maxDepth ?? (prev ? prev.limits.maxDepth : DEFAULTS.maxDepth)))),
      maxDocs: Math.max(1, Math.min(200, Number(opts.maxDocs ?? (prev ? prev.limits.maxDocs : DEFAULTS.maxDocs)))),
      timeoutMs: Math.max(1000, Number(opts.timeoutMs ?? DEFAULTS.timeoutMs))
    };
    /** @type {Map<string, any>} */ const nodes = new Map(prev ? prev.nodes.map((/** @type {any} */ n) => [n.id, { ...n }]) : []);
    /** @type {any[]} */ const edges = prev ? prev.edges.map((/** @type {any} */ e) => ({ ...e })) : [];
    const edgeKeys = new Set(edges.map(e => e.from + '|' + e.to + '|' + e.type + '|' + e.basis));
    /** @type {any[]} */ const errors = prev ? prev.errors.filter((/** @type {any} */ e) => !e.retryable) : [];
    const visited = new Set(prev ? prev.nodes.filter((/** @type {any} */ n) => n.resolution !== 'pending' && n.resolution !== 'error').map((/** @type {any} */ n) => n.id) : []);
    /** @type {any[]} */ const queue = prev ? prev.frontier.concat(prev.nodes.filter((/** @type {any} */ n) => n.resolution === 'error').map((/** @type {any} */ n) => n.retry).filter(Boolean)) : [];
    /** @type {any[]} */ const frontier = [];
    const stopReasons = new Set();
    const startId = prev ? prev.startId : 'START';
    const runStarted = prev ? prev.startedAt : now();

    /** @param {any} e */
    function addEdge(e) {
      const k = e.from + '|' + e.to + '|' + e.type + '|' + e.basis;
      if (edgeKeys.has(k) || e.from === e.to) return;
      edgeKeys.add(k); edges.push(e);
    }
    /** @param {string} id @param {any} ref @param {number} depth @param {string|null} from @param {string} type */
    function enqueue(id, ref, depth, from, type) {
      if (!nodes.has(id)) nodes.set(id, { id, depth, direct: depth === 1, resolution: 'pending', label: ref.raw || id, ref, via: [] });
      const n = nodes.get(id);
      if (from) n.via.push({ from, type });
      if (depth < n.depth) { n.depth = depth; n.direct = depth === 1; }
      if (!visited.has(id)) queue.push({ id, ref, depth, from, type });
    }
    /** Đọc số hiệu trong văn bản của một nút và thêm cạnh + hàng đợi. @param {string} fromId @param {string} text @param {number} depth @param {any} source */
    function expandText(fromId, text, depth, source) {
      const found = Refs.dedupeReferences(Refs.extractReferences(String(text || '').slice(0, MAX_TEXT)));
      for (const r of found) {
        if (r.canonicalId === fromId) continue;
        addEdge({ from: fromId, to: r.canonicalId, type: r.relation, basis: r.relationBasis === 'text_cue' ? 'text_cue' : 'text_citation',
          quote: r.context, cue: r.cue, scope: r.scope, provisions: r.provisions, source: source || null, effectiveFrom: null });
        enqueue(r.canonicalId, { raw: r.raw, canonicalId: r.canonicalId, number: r.number, year: r.year, symbol: r.symbol, kind: r.kind, issuer: r.issuer },
          depth + 1, fromId, r.relation);
      }
      return found.length;
    }

    if (!prev) {
      nodes.set(startId, { id: startId, depth: 0, direct: false, resolution: 'start', label: opts.start.title || 'Văn bản đầu vào',
        doc: { canonicalId: startId, title: opts.start.title, text: String(opts.start.text || '').slice(0, MAX_TEXT), sources: [], relations: [], managedDocId: opts.start.id },
        via: [] });
      visited.add(startId);
      expandText(startId, opts.start.text, 0, null);
    }

    let resolved = [...nodes.values()].filter(n => n.resolution === 'found' || n.resolution === 'not_found').length;
    while (queue.length) {
      const item = queue.shift();
      if (visited.has(item.id)) continue;
      if (item.depth > limits.maxDepth) { frontier.push(item); stopReasons.add('depth'); continue; }
      if (resolved >= limits.maxDocs) { frontier.push(item); stopReasons.add('count'); continue; }
      visited.add(item.id);
      const node = nodes.get(item.id);
      if (opts.onProgress) opts.onProgress({ phase: 'resolve', id: item.id, depth: item.depth, done: resolved, queued: queue.length });
      /** @type {any} */ let res;
      try { res = await withTimeout(Promise.resolve(adapter.resolve(item.ref)), limits.timeoutMs); }
      catch (err) { res = { status: 'error', reason: String((/** @type {any} */ (err)).message || err).slice(0, 300), retryable: true }; }
      if (!res || typeof res !== 'object') res = { status: 'error', reason: 'Nguồn trả về dữ liệu không hợp lệ', retryable: false };

      if (res.status === 'found' && res.doc) {
        resolved++;
        const doc = cleanDoc(res.doc);
        // Văn bản tìm được phải đúng là văn bản được hỏi. Nếu nguồn trả về văn bản khác số hiệu thì không nhận.
        if (doc.canonicalId !== item.id) {
          node.resolution = 'not_found';
          node.reason = doc.canonicalId ? 'Nguồn trả về văn bản khác số hiệu (' + doc.canonicalId + '), không nhận' : 'Nguồn trả về văn bản không rõ số hiệu, không nhận';
          continue;
        }
        node.resolution = 'found'; node.doc = doc; node.label = doc.number || node.label; node.synthetic = doc.synthetic;
        const primary = doc.sources.find((/** @type {any} */ s) => s.tier === 'primary') || doc.sources[0] || null;
        for (const rel of doc.relations) {
          if (!rel || !Refs.RELATIONS.includes(rel.type)) continue;
          const other = Refs.canonicalId(String(rel.target || ''));
          if (!other) continue;
          const incoming = rel.direction === 'in';
          addEdge({ from: incoming ? other : item.id, to: incoming ? item.id : other, type: rel.type, basis: 'official_metadata',
            quote: rel.quote ? String(rel.quote).slice(0, 400) : null, scope: rel.scope === 'partial' ? 'partial' : (rel.type === 'REPEALS' ? 'whole' : null),
            provisions: rel.provisions ? String(rel.provisions).slice(0, 200) : null, effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(rel.effectiveFrom || '') ? rel.effectiveFrom : null,
            source: primary });
          enqueue(other, { raw: String(rel.target), canonicalId: other }, item.depth + 1, item.id, incoming ? 'REVERSE_' + rel.type : rel.type);
        }
        node.textRefs = expandText(item.id, doc.text, item.depth, primary);
      } else if (res.status === 'not_found') {
        resolved++;
        node.resolution = 'not_found'; node.reason = String(res.reason || 'Không tìm thấy trên nguồn đã cấu hình').slice(0, 300);
      } else {
        node.resolution = 'error'; node.reason = String(res.reason || 'Lỗi không rõ').slice(0, 300);
        node.retry = res.retryable ? item : null;
        errors.push({ id: item.id, reason: node.reason, retryable: !!res.retryable });
      }
    }

    for (const f of frontier) { const n = nodes.get(f.id); if (n && n.resolution === 'pending') n.stoppedBy = f.depth > limits.maxDepth ? 'depth' : 'count'; }
    if (errors.length) stopReasons.add('errors');
    const all = [...nodes.values()];
    const unresolved = all.filter(n => n.resolution === 'not_found' || n.resolution === 'error')
      .map(n => ({ id: n.id, label: n.label, reason: n.reason, resolution: n.resolution }));
    const complete = frontier.length === 0 && !errors.some(e => e.retryable);
    return {
      startId, adapter: adapter.name, live: !!adapter.live, limits, startedAt: runStarted, finishedAt: now(),
      state: complete ? 'complete' : 'partial', stopReasons: [...stopReasons],
      nodes: all, edges, frontier, unresolved, errors,
      stats: {
        found: all.filter(n => n.resolution === 'found').length, notFound: all.filter(n => n.resolution === 'not_found').length,
        errors: errors.length, pending: frontier.length, maxDepthReached: Math.max(0, ...all.filter(n => n.resolution === 'found').map(n => n.depth))
      }
    };
  }

  /**
   * Tiếp tục từ kết quả dang dở: nới giới hạn rồi duyệt tiếp phần frontier và thử lại các lỗi tạm thời.
   * @param {any} prev @param {{ adapter:any, addDepth?:number, addDocs?:number, timeoutMs?:number, onProgress?:any, now?:any }} opts
   */
  function continueDiscovery(prev, opts) {
    return discover({
      start: { id: prev.startId, title: '', text: '' }, adapter: opts.adapter, resume: prev,
      maxDepth: prev.limits.maxDepth + (opts.addDepth ?? 1), maxDocs: prev.limits.maxDocs + (opts.addDocs ?? 10),
      timeoutMs: opts.timeoutMs, onProgress: opts.onProgress, now: opts.now
    });
  }

  /** Lý do dừng bằng lời thường. @param {string} r */
  function stopReasonLabel(r) {
    return r === 'depth' ? 'Chạm giới hạn độ sâu' : r === 'count' ? 'Chạm giới hạn số văn bản' : r === 'errors' ? 'Có nguồn lỗi hoặc không truy cập được' : r;
  }

  return { DEFAULTS, discover, continueDiscovery, stopReasonLabel };
});
