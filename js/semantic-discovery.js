(function attachSemanticDiscovery(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeSemanticDiscovery = api;
})(typeof globalThis === 'object' ? globalThis : this, function createSemanticDiscovery() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const DEFAULT_MAX_CANDIDATES = 40;
  const DEFAULT_MAX_LINE_LENGTH = 1500;
  const MAX_RESPONSE_CANDIDATES = 80;
  const RELATIONS = new Set(['supports', 'possibly_related', 'unrelated', 'uncertain']);
  const CANDIDATE_KEYS = ['ruleId', 'documentId', 'lineIndex', 'quote', 'start', 'end', 'relation', 'explanation', 'evidence'];

  // Provider boundary: candidate lines and the request are untrusted text data.
  // An adapter may return only evidence for these deterministic locations; it
  // receives no mutation, registry-edit, decision, commit, or undo capability.

  function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function hasOnlyKeys(value, keys) {
    return isRecord(value) && Object.keys(value).every(key => keys.includes(key));
  }

  function boundedInteger(value, fallback, max) {
    return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
  }

  function buildCandidateSet(options) {
    const { change, props, docs, matchesOldValue } = options || {};
    const maxCandidates = boundedInteger(options && options.maxCandidates, DEFAULT_MAX_CANDIDATES, DEFAULT_MAX_CANDIDATES);
    const maxLineLength = boundedInteger(options && options.maxLineLength, DEFAULT_MAX_LINE_LENGTH, DEFAULT_MAX_LINE_LENGTH);
    const docById = new Map((Array.isArray(docs) ? docs : []).filter(d => d && typeof d.id === 'string').map(d => [d.id, d]));
    const candidates = [];
    const excluded = [];
    if (!change || !change.rule || typeof change.rule.id !== 'string' || !Array.isArray(props) ||
        typeof matchesOldValue !== 'function') return { schemaVersion: SCHEMA_VERSION, candidates, excludedCount: 0 };

    for (const prop of props) {
      if (candidates.length >= maxCandidates) { excluded.push(prop && prop.id); continue; }
      if (!prop || typeof prop.docId !== 'string' || !Number.isInteger(prop.lineIndex) || prop.lineIndex < 0) continue;
      const doc = docById.get(prop.docId);
      if (!doc || !Array.isArray(doc.lines) || typeof doc.lines[prop.lineIndex] !== 'string') continue;
      const line = doc.lines[prop.lineIndex];
      let hasOldValue = false;
      try { hasOldValue = !!matchesOldValue(line, change.oldValue); } catch (_) { hasOldValue = false; }
      if (!hasOldValue || line.length > maxLineLength || line !== prop.line) continue;
      candidates.push({
        ruleId: change.rule.id,
        documentId: doc.id,
        lineIndex: prop.lineIndex,
        line,
        deterministicOutcome: prop.outcome,
        deterministicCategory: prop.category || null
      });
    }
    return { schemaVersion: SCHEMA_VERSION, candidates, excludedCount: excluded.length };
  }

  function parseOutput(raw) {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); }
      catch (_) { return null; }
    }
    return raw;
  }

  function validExcerpt(item, line) {
    return isRecord(item) && hasOnlyKeys(item, ['quote', 'start', 'end']) &&
      typeof item.quote === 'string' && item.quote.length > 0 &&
      Number.isInteger(item.start) && Number.isInteger(item.end) &&
      item.start >= 0 && item.end > item.start && item.end <= line.length &&
      line.slice(item.start, item.end) === item.quote;
  }

  function validateCandidates(raw, context) {
    const { change, registry, docs, candidateSet, matchesOldValue } = context || {};
    const valid = [];
    const rejected = [];
    const value = parseOutput(raw);
    if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'candidates']) ||
        value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.candidates) ||
        value.candidates.length > MAX_RESPONSE_CANDIDATES || !change || !change.rule ||
        !Array.isArray(registry) || !Array.isArray(docs) || !candidateSet ||
        !Array.isArray(candidateSet.candidates) || typeof matchesOldValue !== 'function') {
      return { valid, rejected: [{ reason: 'Malformed semantic-discovery response.' }], ok: false };
    }
    const rule = registry.find(item => item && item.id === change.rule.id);
    if (!rule) return { valid, rejected: [{ reason: 'Target policy is not in the current registry.' }], ok: false };
    const candidatesByKey = new Map(candidateSet.candidates.map(item => [keyOf(item.documentId, item.lineIndex), item]));
    const docsById = new Map(docs.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));

    for (const item of value.candidates) {
      let reason = 'Candidate failed deterministic validation.';
      if (!hasOnlyKeys(item, CANDIDATE_KEYS) || item.ruleId !== rule.id ||
          typeof item.documentId !== 'string' || !Number.isInteger(item.lineIndex) || item.lineIndex < 0 ||
          !RELATIONS.has(item.relation) || typeof item.explanation !== 'string' || item.explanation.length > 600 ||
          !Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.length > 8) {
        rejected.push({ reason }); continue;
      }
      const key = keyOf(item.documentId, item.lineIndex);
      const eligible = candidatesByKey.get(key);
      const doc = docsById.get(item.documentId);
      if (!eligible || !doc || !Array.isArray(doc.lines) || typeof doc.lines[item.lineIndex] !== 'string') {
        rejected.push({ reason: 'Location is not in the deterministic candidate set.' }); continue;
      }
      const line = doc.lines[item.lineIndex];
      let oldValueStillPresent = false;
      try { oldValueStillPresent = !!matchesOldValue(line, change.oldValue); } catch (_) { oldValueStillPresent = false; }
      if (line !== eligible.line || !oldValueStillPresent || !validExcerpt({ quote: item.quote, start: item.start, end: item.end }, line) ||
          item.evidence.some(excerpt => !validExcerpt(excerpt, line))) {
        rejected.push({ reason: 'Stale line, old value, quote, or evidence offsets.' }); continue;
      }
      valid.push({
        ruleId: item.ruleId,
        documentId: item.documentId,
        lineIndex: item.lineIndex,
        quote: item.quote,
        start: item.start,
        end: item.end,
        relation: item.relation,
        explanation: item.explanation,
        evidence: item.evidence.map(excerpt => ({ quote: excerpt.quote, start: excerpt.start, end: excerpt.end }))
      });
    }
    return { valid, rejected, ok: rejected.length === 0 };
  }

  function keyOf(documentId, lineIndex) { return `${documentId}\u0000${lineIndex}`; }

  function applyEvidenceToProps(props, candidates) {
    const byLocation = new Map();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const key = keyOf(candidate.documentId, candidate.lineIndex);
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key).push(candidate);
    }
    return (Array.isArray(props) ? props : []).map(prop => {
      const cleanProp = withoutSemanticMetadata(prop);
      const evidence = byLocation.get(keyOf(prop.docId, prop.lineIndex)) || [];
      if (!evidence.length) return { ...cleanProp, semanticHold: false };
      const relations = [...new Set(evidence.map(item => item.relation))];
      const semanticallyUnclear = relations.length !== 1 || relations[0] !== 'supports';
      return {
        ...cleanProp,
        semanticEvidence: evidence.map(item => ({
          relation: item.relation, quote: item.quote, start: item.start, end: item.end,
          explanation: item.explanation, evidence: item.evidence.map(excerpt => ({ ...excerpt }))
        })),
        semanticRelation: relations.length === 1 ? relations[0] : 'conflict',
        // Metadata can hold deterministic AUTO_PATCH for review, but never rewrites its classification.
        semanticHold: prop.outcome === 'AUTO_PATCH' && semanticallyUnclear
      };
    });
  }

  function withoutSemanticMetadata(prop) {
    const {
      semanticEvidence, semanticRelation, semanticHold, semanticHoldReviewed,
      semanticHoldApproved, ...engineProp
    } = prop;
    return engineProp;
  }

  function createUnavailableAdapter() {
    return Object.freeze({
      async discover() { return { available: false, reason: 'Semantic AI provider is not configured.' }; }
    });
  }

  function isPatchAllowed(prop) {
    if (!prop) return false;
    if (prop.outcome === 'AUTO_PATCH') return !prop.semanticHold || prop.semanticHoldApproved === true;
    return prop.outcome === 'ESCALATE' && prop.decided === true && prop.accepted === true;
  }

  async function discoverSemantics(options) {
    const { requestText, change, props, docs, registry, matchesOldValue, adapter } = options || {};
    const candidateSet = buildCandidateSet({
      change, props, docs, matchesOldValue,
      maxCandidates: options && options.maxCandidates,
      maxLineLength: options && options.maxLineLength
    });
    const untouched = (Array.isArray(props) ? props : []).map(prop => ({ ...withoutSemanticMetadata(prop), semanticHold: false }));
    if (!adapter || typeof adapter.discover !== 'function') {
      return { status: 'unavailable', props: untouched, candidateSet, valid: [], rejected: [] };
    }
    if (!candidateSet.candidates.length) {
      return { status: 'no_candidates', props: untouched, candidateSet, valid: [], rejected: [] };
    }
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      requestText: typeof requestText === 'string' ? requestText : '',
      targetPolicy: { ruleId: change.rule.id, name: change.rule.name, oldValue: change.oldValue, newValue: change.newValue },
      candidates: candidateSet.candidates.map(item => ({
        ruleId: item.ruleId, documentId: item.documentId, lineIndex: item.lineIndex, line: item.line
      }))
    };
    const timeoutMs = Number.isFinite(options && options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 8000;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => adapter.discover(payload, { signal: controller && controller.signal })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs); })
      ]);
      clearTimeout(timer);
      if (!response || response.available === false) {
        return { status: 'unavailable', props: untouched, candidateSet, valid: [], rejected: [] };
      }
      const raw = isRecord(response) && Object.prototype.hasOwnProperty.call(response, 'output') ? response.output : response;
      const checked = validateCandidates(raw, { change, registry, docs, candidateSet, matchesOldValue });
      if (checked.rejected.length) {
        return { status: 'rejected', props: untouched, candidateSet, valid: [], rejected: checked.rejected };
      }
      return {
        status: 'complete', candidateSet, valid: checked.valid, rejected: [],
        props: applyEvidenceToProps(props, checked.valid)
      };
    } catch (error) {
      clearTimeout(timer);
      if (error && error.code === 'TIMEOUT') {
        if (controller) controller.abort();
        return { status: 'timeout', props: untouched, candidateSet, valid: [], rejected: [] };
      }
      return { status: 'provider_failure', props: untouched, candidateSet, valid: [], rejected: [] };
    }
  }

  return Object.freeze({
    SCHEMA_VERSION, DEFAULT_MAX_CANDIDATES, DEFAULT_MAX_LINE_LENGTH,
    buildCandidateSet, validateCandidates, applyEvidenceToProps,
    createUnavailableAdapter, discoverSemantics, isPatchAllowed
  });
});
