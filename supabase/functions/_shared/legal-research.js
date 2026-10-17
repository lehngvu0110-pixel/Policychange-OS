// @ts-check
/** Trusted research reconstruction. Inputs express scope; only server cache evidence supplies documents and assessments. */
(function attach(/** @type {any} */ root, /** @type {(deps:any) => any} */ factory) {
  const g = root || {};
  const isNode = typeof module === 'object' && module.exports;
  // @ts-ignore -- CommonJS in Node, ordered globals in Deno.
  const deps = isNode ? { Refs: require('./legal-refs.js'), Page: require('./legal-page.js'), Fetch: require('./legal-fetch.js'), Discovery: require('./legal-discovery.js'), Status: require('./legal-status.js'), Sha: require('./sha256.js') }
    : { Refs: g.PolicyChangeLegalRefs, Page: g.PolicyChangeLegalPage, Fetch: g.PolicyChangeLegalFetch, Discovery: g.PolicyChangeLegalDiscovery, Status: g.PolicyChangeLegalStatus, Sha: g.PolicyChangeSha256 };
  const api = factory(deps);
  // @ts-ignore
  if (isNode) module.exports = api;
  if (root) root.PolicyChangeLegalResearch = api;
})(globalThis, function create(/** @type {any} */ deps) {
  const { Refs, Page, Fetch, Discovery, Status, Sha } = deps;

  /** Stable across JSONB key reordering. @param {any} value @returns {any} */
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => [k, canonical(value[k])]));
    return value;
  }
  /** @param {any} graph @param {any} assessments @param {string} asOf */
  function hashRun(graph, assessments, asOf) { return Sha.sha256Hex(JSON.stringify(canonical({ nodes: graph.nodes, edges: graph.edges, assessments, asOf }))); }

  /** @param {any} input */
  function validateRun(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    if (Object.keys(input).some(k => !['startText', 'startLabel', 'asOf', 'maxDepth', 'maxDocs'].includes(k))) return false;
    return typeof input.startText === 'string' && input.startText.length > 0 && input.startText.length <= 300000 &&
      typeof input.startLabel === 'string' && input.startLabel.length > 0 && input.startLabel.length <= 200 && Status.validDate(input.asOf) &&
      Number.isInteger(input.maxDepth) && input.maxDepth >= 1 && input.maxDepth <= 8 && Number.isInteger(input.maxDocs) && input.maxDocs >= 1 && input.maxDocs <= 200 &&
      Refs.extractReferences(input.startText).length > 0;
  }

  /** @param {any} row @param {string} now */
  function cacheDoc(row, now) {
    if (!row || row.evidence?.parserVersion !== Page.PARSER_VERSION || row.evidence?.identity?.verified !== true ||
        row.evidence.identity.canonicalId !== row.canonical_id || Refs.canonicalId(row.number) !== row.canonical_id ||
        typeof row.body_text !== 'string' || row.body_text.length > 300000 || row.content_sha256 !== Sha.sha256Hex(row.body_text) ||
        !Number.isFinite(Date.parse(row.cache_until)) || Date.parse(row.cache_until) <= Date.parse(now) ||
        !Number.isFinite(Date.parse(row.retrieved_at)) || Date.parse(row.retrieved_at) > Date.parse(now) ||
        !Array.isArray(row.sources) || !row.sources.length || row.sources.length > 5 ||
        row.sources.some((/** @type {any} */ s) => !Refs.sourceFor(s.url) || !Number.isFinite(Date.parse(s.retrievedAt)) || Date.parse(s.retrievedAt) > Date.parse(now))) return null;
    return { canonicalId: row.canonical_id, number: row.number, title: row.title, kind: row.kind, issuer: row.issuer,
      issueDate: row.issue_date, effectiveFrom: row.effective_from, expiresOn: row.expires_on, officialStatus: row.official_status,
      sources: row.sources.map((/** @type {any} */ s) => ({ ...s, tier: Refs.sourceFor(s.url).tier, name: Refs.sourceFor(s.url).name })),
      text: row.body_text, relations: row.relations || [], identity: row.evidence.identity, coverage: row.evidence.coverage,
      limitations: row.evidence.limitations || [], retrievalFailures: row.evidence.retrievalFailures || [], suspension: row.evidence.suspension || null, synthetic: false };
  }

  /** @param {any} input @param {(id:string) => Promise<any>} loadCache @param {() => string} now @param {AbortSignal} [signal] */
  async function rebuildRun(input, loadCache, now, signal) {
    if (!validateRun(input)) throw new Error('bad_run');
    const graph = await Discovery.discover({ start: { id: 'INPUT', title: input.startLabel, text: input.startText }, maxDepth: input.maxDepth, maxDocs: input.maxDocs, now, signal,
      adapter: { name: 'Server-validated cache evidence', live: true, resolve: async (/** @type {any} */ ref) => {
        const row = await loadCache(ref.canonicalId);
        const doc = cacheDoc(row, now());
        return doc ? { status: 'found', doc } : { status: 'error', code: 'unverified_cache', retryable: false, reason: 'Chưa có bằng chứng nguồn hợp lệ trong bộ nhớ đệm máy chủ; cần tra cứu lại.' };
      } } });
    const assessments = Status.assessAll(graph, input.asOf);
    const nodes = graph.nodes.map((/** @type {any} */ n) => ({ ...n, retry: undefined, ref: undefined, doc: n.doc ? { ...n.doc, text: undefined, relations: undefined } : undefined }));
    return { state: graph.state, adapter: graph.adapter, live: true, stopReasons: graph.stopReasons, limits: graph.limits, stats: graph.stats,
      graph: { ...graph, nodes }, assessments, evidenceHash: hashRun({ nodes, edges: graph.edges }, assessments, input.asOf), validatedAt: now() };
  }

  /** Candidate absence differs from inability to read a candidate. @param {string[]} links @param {string} id @param {any} opts */
  async function resolveCandidates(links, id, opts) {
    if (opts.signal?.aborted) return { status: 'error', code: 'cancelled', reason: 'Đã huỷ tra cứu.', retryable: false, failures: [] };
    const unique = [...new Set(links.map(u => { try { return Refs.normalizeUrl(u); } catch (_) { return u; } }))];
    if (!unique.length) return { status: 'not_found', code: 'no_candidates', reason: 'Lần tìm kiếm này chưa trả về trang thuộc các nguồn cho phép. Chưa thể xác minh văn bản; kết quả này không có nghĩa là văn bản không tồn tại.', failures: [] };
    /** @type {any[]} */ const failures = [];
    const seen = new Set();
    for (const link of unique.slice(0, 3)) {
      if (opts.signal?.aborted) { failures.push({ code: 'cancelled', reason: 'Đã huỷ tra cứu.', retryable: false }); break; }
      if (seen.has(link)) continue;
      seen.add(link);
      if (opts.beforeFetch) {
        try { await opts.beforeFetch(link, opts.signal); }
        catch (_) { failures.push({ url: link, code: opts.signal?.aborted ? 'cancelled' : 'source_busy', reason: 'Nguồn đang bận hoặc yêu cầu đã dừng.', retryable: !opts.signal?.aborted }); break; }
      }
      const got = await Fetch.safeFetch(link, { fetchImpl: opts.fetchImpl, signal: opts.signal });
      if (!got.ok) { failures.push({ url: link, code: got.code, reason: got.reason, retryable: Fetch.retryable(got.code) }); continue; }
      seen.add(Refs.normalizeUrl(got.url));
      let parsed;
      try { parsed = Page.parse({ html: got.body, url: got.url, requestedId: id, retrievedAt: opts.now(), source: got.source }); }
      catch (_) { parsed = { ok: false, code: 'parse_error', reason: 'Không đọc được cấu trúc trang nguồn.' }; }
      if (!parsed.ok) { failures.push({ url: got.url, code: parsed.code, reason: parsed.reason, retryable: false }); continue; }
      if (failures.length || unique.length > 3) {
        parsed.doc.coverage.relationships = 'unknown';
        parsed.doc.limitations.push('Còn trang ứng viên chưa đọc hoặc chưa xác minh được định danh.');
      }
      parsed.doc.retrievalFailures = failures.concat(unique.filter(u => !seen.has(u)).map(url => ({ url, code: 'candidate_unchecked', reason: 'Chưa tải hoặc đối chiếu trang ứng viên này.', retryable: false }))).slice(0, 12);
      return { status: 'found', doc: parsed.doc, failures };
    }
    if (unique.length > 3) failures.push({ code: 'candidate_budget', reason: 'Còn trang ứng viên ngoài giới hạn.', retryable: false });
    if (failures.every(f => f.code === 'not_found')) return { status: 'not_found', code: 'not_found', reason: 'Các trang tìm được đều trả lỗi 404. Chưa thể xác minh văn bản từ nguồn.', failures };
    const failure = failures.find(f => f.code !== 'not_found');
    return { status: 'error', code: failure.code, reason: failure.reason, retryable: failures.some(f => f.retryable), failures };
  }

  return { validateRun, cacheDoc, rebuildRun, resolveCandidates, hashRun };
});
