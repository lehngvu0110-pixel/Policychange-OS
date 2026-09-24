(function attachPolicyAI(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeAI = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyAI() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const DEFAULT_TIMEOUT_MS = 8000;
  const CANDIDATE_KEYS = ['schemaVersion', 'status', 'scope', 'ruleId', 'oldValue', 'newValue', 'issuerTier', 'evidence'];
  const AMBIGUOUS_KEYS = ['schemaVersion', 'status', 'reason', 'candidateRuleIds'];
  const REFUSAL_KEYS = ['schemaVersion', 'status', 'reason'];
  const EVIDENCE_KEYS = ['field', 'quote', 'start', 'end'];

  // Adapter contract: extract({requestText, registry}, {signal}) resolves to either
  // {available:false, reason} or {available:true, output}, where output is
  // JSON/plain data in the candidate, ambiguous, or refuse schema below.
  // Candidate schema has no decision/action field; evidence offsets are JS
  // string offsets into requestText. Adapter input contains no documents or
  // mutation/issue/undo functions, and every returned value stays untrusted.

  function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function hasOnlyKeys(value, allowed) {
    return isRecord(value) && Object.keys(value).every(key => allowed.includes(key));
  }

  function cleanText(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isGlobalScopeRequest(text) {
    const value = String(text || '').toLowerCase();
    return /\b(?:mọi|tất cả)\s+(?:các\s+)?(?:thời\s+hạn|hạn|deadline|quy\s+định)(?=\s|$)/iu.test(value) ||
      /\b(?:đổi|thay|cập\s+nhật)\s+(?:mọi|tất\s+cả)(?=\s|$)/iu.test(value) ||
      /\b(?:mọi|tất\s+cả|toàn\s+bộ)(?=\s|$).{0,40}\b(?:thời\s+hạn|hạn|deadline|quy\s+định|chỗ|vị\s+trí|con\s+số)(?=\s|$)/iu.test(value) ||
      /\b(?:change|update|replace|revise)\s+(?:all|every)\b/iu.test(value) ||
      /\b(?:all|every)\s+(?:the\s+)?(?:\d+\s*[- ]?day\s+)?(?:deadlines?|rules?|occurrences?|values?)\b/iu.test(value) ||
      /\b(?:every|all)\b.{0,40}\b(?:deadlines?|rules?|occurrences?|values?)\b/iu.test(value);
  }

  function tierCue(text) {
    const value = String(text || '').toLowerCase();
    const matches = [];
    if (/hiệu\s+trưởng|hội\s+đồng\s+trường|phó\s+hiệu\s+trưởng/u.test(value)) matches.push(3);
    if (/chuyên\s+viên|tổ\s+(?:công\s+tác|nghiệp|chuyên\s+môn)|bộ\s+phận|văn\s+phòng/u.test(value)) matches.push(1);
    if (/trưởng\s*(?:phòng|đơn\s+vị)/u.test(value)) matches.push(2);
    const unique = [...new Set(matches)];
    return unique.length === 1 ? unique[0] : null;
  }

  function valueShape(value) {
    const match = String(value || '').trim().match(/^((?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?)\s*(triệu|tr|tỉ|tỷ|nghìn|ngàn)?\s*(ngày\s+làm\s+việc|ngày|tín\s+chỉ|đồng|vnđ|vnd)?$/iu);
    if (!match) return null;
    const scale = (match[2] || '').toLowerCase();
    const suffix = (match[3] || '').toLowerCase().replace(/\s+/g, ' ');
    if (scale && ['ngày', 'ngày làm việc', 'tín chỉ'].includes(suffix)) return null;
    let family = 'scalar';
    if (scale || /^(?:đồng|vnđ|vnd)$/.test(suffix)) family = 'money';
    else if (suffix === 'ngày') family = 'calendar_days';
    else if (suffix === 'ngày làm việc') family = 'business_days';
    else if (suffix === 'tín chỉ') family = 'credits';
    return { family, numericText: match[1] };
  }

  function valueMatchesPolicy(value, ruleValue) {
    const proposed = valueShape(value);
    const registered = valueShape(ruleValue);
    if (!proposed || !registered) return false;
    if (proposed.family === registered.family) return true;
    if (registered.family === 'money' && proposed.family === 'scalar') {
      const number = Number(proposed.numericText.replace(/\./g, '').replace(/,/g, '.'));
      return Number.isFinite(number) && number >= 1000;
    }
    return false;
  }

  function evidenceError(evidence, requestText, normalizeValue, registry, rule, proposal) {
    if (!Array.isArray(evidence)) return 'Evidence must be an array.';
    const fields = new Map();
    for (const item of evidence) {
      if (!hasOnlyKeys(item, EVIDENCE_KEYS) || !['policy', 'oldValue', 'newValue', 'issuerTier'].includes(item.field) ||
          !cleanText(item.quote) || !Number.isInteger(item.start) || !Number.isInteger(item.end) ||
          item.start < 0 || item.end <= item.start || item.end > requestText.length ||
          requestText.slice(item.start, item.end) !== item.quote || fields.has(item.field)) {
        return 'Evidence does not exactly match the original request.';
      }
      fields.set(item.field, item.quote);
    }
    for (const required of ['policy', 'oldValue', 'newValue']) {
      if (!fields.has(required)) return `Missing ${required} evidence.`;
    }
    const policyQuote = fields.get('policy').toLowerCase();
    const matchingRules = registry.filter(candidate => {
      const terms = [candidate.id, candidate.name, ...(Array.isArray(candidate.aliases) ? candidate.aliases : [])]
        .filter(cleanText).map(term => term.toLowerCase());
      return terms.some(term => policyQuote.includes(term));
    });
    if (matchingRules.length !== 1 || matchingRules[0].id !== rule.id) {
      return 'Policy evidence is missing or ambiguous.';
    }
    if (normalizeValue(fields.get('oldValue')) !== normalizeValue(proposal.oldValue) ||
        normalizeValue(proposal.oldValue) !== normalizeValueFromRule(rule, normalizeValue)) {
      return 'Old-value evidence does not match the registered current value.';
    }
    if (!normalizeValue(fields.get('newValue')) ||
        normalizeValue(fields.get('newValue')) !== normalizeValue(proposal.newValue)) {
      return 'New-value evidence does not match the proposed value.';
    }
    if (fields.has('issuerTier') && proposal.issuerTier === undefined) {
      return 'Issuer-tier evidence was supplied without an issuer tier.';
    }
    if (fields.get('issuerTier') !== undefined && tierCue(fields.get('issuerTier')) === null) {
      return 'Issuer-tier evidence is missing or ambiguous.';
    }
    return null;
  }

  function normalizeValueFromRule(rule, normalizeValue) {
    try { return normalizeValue(rule.value); } catch (_) { return null; }
  }

  function validateOutput(raw, options) {
    const { requestText, registry, normalizeValue } = options || {};
    if (typeof requestText !== 'string' || !Array.isArray(registry) || typeof normalizeValue !== 'function') {
      return { ok: false, kind: 'rejected', reason: 'Validation context is incomplete.' };
    }

    let value = raw;
    if (typeof raw === 'string') {
      try { value = JSON.parse(raw); }
      catch (_) { return { ok: false, kind: 'rejected', reason: 'AI output is not valid JSON.' }; }
    }
    if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION || !cleanText(value.status)) {
      return { ok: false, kind: 'rejected', reason: 'AI output does not match the supported schema.' };
    }

    if (value.status === 'ambiguous') {
      if (!hasOnlyKeys(value, AMBIGUOUS_KEYS) || !cleanText(value.reason) ||
          !Array.isArray(value.candidateRuleIds) || value.candidateRuleIds.length === 0 ||
          value.candidateRuleIds.some(id => !registry.some(rule => rule.id === id))) {
        return { ok: false, kind: 'rejected', reason: 'Ambiguous output contains invalid registry references.' };
      }
      return { ok: false, kind: 'ambiguous', reason: value.reason };
    }

    if (value.status === 'refuse') {
      if (!hasOnlyKeys(value, REFUSAL_KEYS) || !cleanText(value.reason)) {
        return { ok: false, kind: 'rejected', reason: 'Refusal output does not match the supported schema.' };
      }
      return { ok: false, kind: 'refused', reason: value.reason };
    }

    if (value.status !== 'candidate' || !hasOnlyKeys(value, CANDIDATE_KEYS) ||
        value.scope !== 'single_policy' || !cleanText(value.ruleId) ||
        !cleanText(value.oldValue) || !cleanText(value.newValue) ||
        !Array.isArray(value.evidence)) {
      return { ok: false, kind: 'rejected', reason: 'Candidate fields do not match the supported schema.' };
    }

    const rule = registry.find(item => item && item.id === value.ruleId);
    if (!rule) return { ok: false, kind: 'rejected', reason: 'Candidate policy is not in the registry.' };

    let evidenceProblem;
    try { evidenceProblem = evidenceError(value.evidence, requestText, normalizeValue, registry, rule, value); }
    catch (_) { return { ok: false, kind: 'rejected', reason: 'Evidence validation failed.' }; }
    if (evidenceProblem) return { ok: false, kind: 'rejected', reason: evidenceProblem };

    let currentKey;
    let oldKey;
    let newKey;
    try {
      currentKey = normalizeValue(rule.value);
      oldKey = normalizeValue(value.oldValue);
      newKey = normalizeValue(value.newValue);
    } catch (_) {
      return { ok: false, kind: 'rejected', reason: 'Value validation failed.' };
    }
    if (!currentKey || !oldKey || !newKey || oldKey !== currentKey) {
      return { ok: false, kind: 'rejected', reason: 'Old or new value is invalid for the selected policy.' };
    }
    if (!valueMatchesPolicy(value.newValue, rule.value)) {
      return { ok: false, kind: 'rejected', reason: 'New value does not match the registered value unit.' };
    }
    if (newKey === currentKey) return { ok: false, kind: 'rejected', reason: 'New value is unchanged.' };

    if (value.issuerTier !== undefined && (!Number.isInteger(value.issuerTier) || value.issuerTier < 1 || value.issuerTier > 3)) {
      return { ok: false, kind: 'rejected', reason: 'Issuer tier must be 1, 2, or 3.' };
    }
    if (value.issuerTier !== undefined) {
      const tierEvidence = value.evidence.find(item => item.field === 'issuerTier');
      if (!tierEvidence || tierCue(tierEvidence.quote) !== value.issuerTier) {
        return { ok: false, kind: 'rejected', reason: 'Issuer tier is not supported by request evidence.' };
      }
    }

    if (isGlobalScopeRequest(requestText)) {
      return { ok: false, kind: 'rejected', reason: 'Global-scope requests are not accepted.' };
    }

    return {
      ok: true,
      needsIssuerTier: value.issuerTier === undefined,
      change: {
        ruleId: rule.id,
        oldValue: rule.value,
        newValue: value.newValue.trim(),
        issuerTier: value.issuerTier
      },
      evidence: value.evidence.map(item => ({ ...item }))
    };
  }

  function createUnavailableAdapter() {
    return Object.freeze({
      async extract() {
        return { available: false, reason: 'AI provider is not configured.' };
      }
    });
  }

  function fallbackResult(parsed, registry, normalizeValue, aiStatus, aiReason) {
    if (!parsed || parsed.ok !== true) {
      const message = parsed && cleanText(parsed.msg) ? parsed.msg : 'Deterministic parser could not interpret the request.';
      const ambiguous = /nhiều quy định|chưa nêu rõ|chưa rõ|hãy chọn|ambiguous|clarif/iu.test(message);
      return {
        status: ambiguous ? 'clarification' : 'refusal',
        aiStatus,
        reason: message,
        aiReason
      };
    }

    const rule = registry.find(item => item && item.id === parsed.ruleId);
    if (!rule || typeof normalizeValue !== 'function') {
      return { status: 'refusal', aiStatus, reason: 'Deterministic parser returned an unknown policy.', aiReason };
    }
    let currentKey;
    let oldKey;
    let newKey;
    try {
      currentKey = normalizeValue(rule.value);
      oldKey = normalizeValue(parsed.oldValue);
      newKey = normalizeValue(parsed.newValue);
    } catch (_) {
      currentKey = oldKey = newKey = null;
    }
    if (!currentKey || oldKey !== currentKey || !newKey || newKey === currentKey ||
        !valueMatchesPolicy(parsed.newValue, rule.value) ||
        !Number.isInteger(parsed.issuerTier) || parsed.issuerTier < 1 || parsed.issuerTier > 3) {
      return { status: 'refusal', aiStatus, reason: 'Deterministic parser result failed input validation.', aiReason };
    }
    return {
      status: 'deterministic_fallback',
      aiStatus,
      aiReason,
      change: {
        ruleId: rule.id,
        oldValue: rule.value,
        newValue: String(parsed.newValue).trim(),
        issuerTier: parsed.issuerTier
      }
    };
  }

  async function resolveRequest(options) {
    const { requestText, registry, adapter, parseDeterministically, normalizeValue } = options || {};
    const timeoutMs = Number.isFinite(options && options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    if (typeof requestText !== 'string' || !Array.isArray(registry) ||
        typeof parseDeterministically !== 'function' || typeof normalizeValue !== 'function') {
      return { status: 'refusal', reason: 'Request validation context is incomplete.' };
    }
    if (!requestText.trim()) return { status: 'clarification', reason: 'Enter a change request.' };
    if (isGlobalScopeRequest(requestText)) {
      return { status: 'refusal', reason: 'Global-scope requests must be narrowed to one registered policy.' };
    }

    let aiStatus = 'unavailable';
    let aiReason = 'AI provider is not configured.';
    const activeAdapter = adapter || createUnavailableAdapter();
    if (typeof activeAdapter.extract === 'function') {
      let timer;
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = new Promise(resolve => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          resolve({ timedOut: true });
        }, timeoutMs);
      });
      try {
        const response = await Promise.race([
          Promise.resolve().then(() => activeAdapter.extract({
              requestText,
              registry: registry.map(rule => ({
                id: rule.id, name: rule.name, value: rule.value, tier: rule.tier,
                source: rule.source, owner: rule.owner,
                aliases: Array.isArray(rule.aliases) ? [...rule.aliases] : []
              }))
            }, { signal: controller ? controller.signal : undefined })),
          timeout
        ]);
        if (timer) clearTimeout(timer);
        if (response && response.timedOut) {
          aiStatus = 'timeout';
          aiReason = 'AI extraction timed out.';
        } else if (!response || response.available !== true) {
          aiStatus = 'unavailable';
          aiReason = response && cleanText(response.reason) ? response.reason : 'AI provider is unavailable.';
        } else {
          const checked = validateOutput(response.output, { requestText, registry, normalizeValue });
          if (checked.ok && checked.needsIssuerTier) {
            return {
              status: 'clarification', aiStatus: 'candidate',
              reason: 'Select the authority tier before continuing.'
            };
          }
          if (checked.ok) return { status: 'ai_candidate', aiStatus: 'candidate', change: checked.change, evidence: checked.evidence };
          aiStatus = checked.kind === 'ambiguous' ? 'ambiguous' : 'rejected';
          aiReason = checked.reason;
        }
      } catch (_) {
        if (timer) clearTimeout(timer);
        aiStatus = 'provider_failure';
        aiReason = 'AI provider failed; using the deterministic parser.';
      }
    }

    let parsed;
    try { parsed = parseDeterministically(requestText); }
    catch (_) { parsed = { ok: false, msg: 'Deterministic parser failed.' }; }
    return fallbackResult(parsed, registry, normalizeValue, aiStatus, aiReason);
  }

  return Object.freeze({
    SCHEMA_VERSION,
    DEFAULT_TIMEOUT_MS,
    createUnavailableAdapter,
    isGlobalScopeRequest,
    validateOutput,
    resolveRequest
  });
});
