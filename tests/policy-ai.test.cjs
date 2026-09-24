const test = require('node:test');
const assert = require('node:assert/strict');
const PolicyAI = require('../js/policy-ai.js');

const registry = [
  {
    id: 'R-PK-01',
    name: 'Thời hạn sinh viên nộp đơn phúc khảo',
    value: '7 ngày',
    tier: 3,
    source: 'Điều 24.1 Quy định công tác học vụ',
    owner: 'Phòng Đào tạo',
    aliases: ['phúc khảo', 'chấm lại bài thi']
  },
  {
    id: 'R-KN-01',
    name: 'Thời hạn phản hồi khiếu nại',
    value: '7 ngày',
    tier: 3,
    source: 'Điều 31.1 Quy định công tác học vụ',
    owner: 'Phòng Thanh tra – Pháp chế',
    aliases: ['khiếu nại', 'đơn thư']
  }
];

const requestText = 'Rút thời hạn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng ban hành.';

function evidenceFor(text, field, quote) {
  const start = text.indexOf(quote);
  assert.notEqual(start, -1, `test fixture must contain ${quote}`);
  return { field, quote, start, end: start + quote.length };
}

function candidate(overrides = {}) {
  const evidence = [
    evidenceFor(requestText, 'policy', 'phúc khảo'),
    evidenceFor(requestText, 'oldValue', '7 ngày'),
    evidenceFor(requestText, 'newValue', '5 ngày')
  ];
  if (!Object.hasOwn(overrides, 'issuerTier') || overrides.issuerTier !== undefined) {
    evidence.push(evidenceFor(requestText, 'issuerTier', 'Trưởng phòng'));
  }
  return {
    schemaVersion: 1,
    status: 'candidate',
    scope: 'single_policy',
    ruleId: 'R-PK-01',
    oldValue: '7 ngày',
    newValue: '5 ngày',
    issuerTier: 2,
    evidence,
    ...overrides
  };
}

function dependencies({ output, available = true, parseResult, timeoutMs } = {}) {
  let calls = { provider: 0, parser: 0 };
  return {
    calls,
    adapter: {
      async extract(input) {
        calls.provider++;
        assert.equal(input.requestText, requestText);
        assert.equal(input.registry.length, 2);
        if (!available) return { available: false, reason: 'provider unavailable' };
        return { available: true, output };
      }
    },
    parseDeterministically(text) {
      calls.parser++;
      assert.equal(text, requestText);
      return parseResult || { ok: true, ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2 };
    },
    timeoutMs
  };
}

const normalizeValue = value => {
  const m = String(value).trim().toLowerCase().match(/^(\d+)\s*(.*)$/u);
  return m ? `${Number(m[1])}|${m[2].replace(/\s+/g, ' ')}` : null;
};

test('accepts a complete proposal only when registry, values, tier, and request evidence validate', () => {
  const result = PolicyAI.validateOutput(JSON.stringify(candidate()), {
    requestText, registry, normalizeValue
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.change, {
    ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2
  });
});

test('rejects malformed JSON instead of returning a partial candidate', () => {
  const result = PolicyAI.validateOutput('{"status":"candidate"', {
    requestText, registry, normalizeValue
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'rejected');
});

test('rejects a candidate for a rule absent from the registry', () => {
  const result = PolicyAI.validateOutput(candidate({ ruleId: 'R-NOT-REGISTERED' }), {
    requestText, registry, normalizeValue
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'rejected');
});

test('rejects an old value that does not match the selected registered policy', () => {
  const result = PolicyAI.validateOutput(candidate({ oldValue: '8 ngày' }), {
    requestText, registry, normalizeValue
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'rejected');
});

test('rejects invalid, unchanged, or unparseable new values', () => {
  for (const newValue of ['7 ngày', '', 'năm ngày']) {
    const result = PolicyAI.validateOutput(candidate({ newValue }), {
      requestText, registry, normalizeValue
    });
    assert.equal(result.ok, false, `expected ${JSON.stringify(newValue)} to be rejected`);
  }
});

test('rejects invalid authority tiers and requires clarification when a tier is omitted', () => {
  const invalid = PolicyAI.validateOutput(candidate({ issuerTier: 4 }), {
    requestText, registry, normalizeValue
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.kind, 'rejected');

  const missing = PolicyAI.validateOutput(candidate({ issuerTier: undefined }), {
    requestText, registry, normalizeValue
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.needsIssuerTier, true);
});

test('rejects an authority tier that is not supported by request evidence', () => {
  const result = PolicyAI.validateOutput(candidate({ issuerTier: 3 }), {
    requestText, registry, normalizeValue
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'rejected');
});

test('rejects global-scope and unknown-schema fields in AI candidates', () => {
  const global = PolicyAI.validateOutput(candidate({ scope: 'global' }), {
    requestText, registry, normalizeValue
  });
  const extra = PolicyAI.validateOutput(candidate({ outcome: 'AUTO_PATCH' }), {
    requestText, registry, normalizeValue
  });

  assert.equal(global.ok, false);
  assert.equal(extra.ok, false);
});

test('rejects evidence whose quote or offsets do not match the original request', () => {
  const badEvidence = candidate();
  badEvidence.evidence[1] = { field: 'oldValue', quote: '8 ngày', start: 0, end: 6 };
  const result = PolicyAI.validateOutput(badEvidence, { requestText, registry, normalizeValue });

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'rejected');
});

test('rejects a proposed value that differs from its quoted request evidence', () => {
  const result = PolicyAI.validateOutput(candidate({ newValue: '6 ngày' }), {
    requestText, registry, normalizeValue
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'rejected');
});

test('rejects unsupported value text and values from a different unit family', () => {
  const unsupportedText = requestText.replace('5 ngày', '5 ngày tùy ý');
  const unsupported = candidate({ newValue: '5 ngày tùy ý' });
  unsupported.evidence = [
    evidenceFor(unsupportedText, 'policy', 'phúc khảo'),
    evidenceFor(unsupportedText, 'oldValue', '7 ngày'),
    evidenceFor(unsupportedText, 'newValue', '5 ngày tùy ý'),
    evidenceFor(unsupportedText, 'issuerTier', 'Trưởng phòng')
  ];
  const wrongUnitText = requestText.replace('5 ngày', '5 tín chỉ');
  const wrongUnit = candidate({ newValue: '5 tín chỉ' });
  wrongUnit.evidence = [
    evidenceFor(wrongUnitText, 'policy', 'phúc khảo'),
    evidenceFor(wrongUnitText, 'oldValue', '7 ngày'),
    evidenceFor(wrongUnitText, 'newValue', '5 tín chỉ'),
    evidenceFor(wrongUnitText, 'issuerTier', 'Trưởng phòng')
  ];

  assert.equal(PolicyAI.validateOutput(unsupported, {
    requestText: unsupportedText, registry, normalizeValue
  }).ok, false);
  assert.equal(PolicyAI.validateOutput(wrongUnit, {
    requestText: wrongUnitText, registry, normalizeValue
  }).ok, false);
});

test('treats explicit global-scope requests as refusal without calling AI or fallback', async () => {
  const calls = { provider: 0, parser: 0 };
  const result = await PolicyAI.resolveRequest({
    requestText: 'Đổi tất cả thời hạn 7 ngày thành 5 ngày.',
    registry,
    adapter: { async extract() { calls.provider++; return { available: true, output: candidate() }; } },
    parseDeterministically() { calls.parser++; return { ok: true }; },
    normalizeValue,
    timeoutMs: 20
  });

  assert.equal(result.status, 'refusal');
  assert.deepEqual(calls, { provider: 0, parser: 0 });
});

test('refuses common global-scope phrasings before calling either parser', async () => {
  for (const text of [
    'Change every 7-day deadline to 5 days.',
    'Đổi toàn bộ thời hạn 7 ngày thành 5 ngày.',
    'Change every occurrence of 7 days to 5 days.'
  ]) {
    let calls = 0;
    const result = await PolicyAI.resolveRequest({
      requestText: text, registry,
      adapter: { async extract() { calls++; return { available: true, output: candidate() }; } },
      parseDeterministically() { calls++; return { ok: true }; },
      normalizeValue, timeoutMs: 20
    });
    assert.equal(result.status, 'refusal', text);
    assert.equal(calls, 0, text);
  }
});

test('returns a validated AI candidate without invoking deterministic fallback', async () => {
  const deps = dependencies({ output: candidate() });
  const result = await PolicyAI.resolveRequest({
    requestText, registry, adapter: deps.adapter,
    parseDeterministically: deps.parseDeterministically,
    normalizeValue, timeoutMs: 20
  });

  assert.equal(result.status, 'ai_candidate');
  assert.deepEqual(result.change, {
    ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2
  });
  assert.deepEqual(deps.calls, { provider: 1, parser: 0 });
});

test('does not choose a default tier for an otherwise valid AI candidate with no tier', async () => {
  const deps = dependencies({ output: candidate({ issuerTier: undefined }) });
  const result = await PolicyAI.resolveRequest({
    requestText, registry, adapter: deps.adapter,
    parseDeterministically: deps.parseDeterministically,
    normalizeValue, timeoutMs: 20
  });

  assert.equal(result.status, 'clarification');
  assert.deepEqual(deps.calls, { provider: 1, parser: 0 });
});

test('uses only deterministic-parser fields after the provider is unavailable', async () => {
  const deps = dependencies({
    available: false,
    parseResult: { ok: true, ruleId: 'R-KN-01', oldValue: '7 ngày', newValue: '9 ngày', issuerTier: 1 }
  });
  const result = await PolicyAI.resolveRequest({
    requestText, registry, adapter: deps.adapter,
    parseDeterministically: deps.parseDeterministically,
    normalizeValue, timeoutMs: 20
  });

  assert.equal(result.status, 'deterministic_fallback');
  assert.equal(result.aiStatus, 'unavailable');
  assert.deepEqual(result.change, {
    ruleId: 'R-KN-01', oldValue: '7 ngày', newValue: '9 ngày', issuerTier: 1
  });
  assert.deepEqual(deps.calls, { provider: 1, parser: 1 });
});

test('rejects invalid AI output and never merges it with deterministic fallback fields', async () => {
  const deps = dependencies({
    output: candidate({ ruleId: 'R-NOT-REGISTERED', issuerTier: 3 }),
    parseResult: { ok: true, ruleId: 'R-KN-01', oldValue: '7 ngày', newValue: '9 ngày', issuerTier: 1 }
  });
  const result = await PolicyAI.resolveRequest({
    requestText, registry, adapter: deps.adapter,
    parseDeterministically: deps.parseDeterministically,
    normalizeValue, timeoutMs: 20
  });

  assert.equal(result.status, 'deterministic_fallback');
  assert.equal(result.aiStatus, 'rejected');
  assert.deepEqual(result.change, {
    ruleId: 'R-KN-01', oldValue: '7 ngày', newValue: '9 ngày', issuerTier: 1
  });
});

test('falls back after a provider timeout and reports timeout distinctly', async () => {
  let capturedSignal;
  const result = await PolicyAI.resolveRequest({
    requestText,
    registry,
    adapter: { extract: (_input, options) => { capturedSignal = options.signal; return new Promise(() => {}); } },
    parseDeterministically: () => ({ ok: true, ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2 }),
    normalizeValue,
    timeoutMs: 5
  });

  assert.equal(result.status, 'deterministic_fallback');
  assert.equal(result.aiStatus, 'timeout');
  assert.equal(capturedSignal.aborted, true);
});

test('reports clarification rather than producing a change when both paths are ambiguous', async () => {
  const deps = dependencies({
    available: false,
    parseResult: { ok: false, msg: 'Có nhiều quy định đang mang giá trị 7 ngày.' }
  });
  const result = await PolicyAI.resolveRequest({
    requestText, registry, adapter: deps.adapter,
    parseDeterministically: deps.parseDeterministically,
    normalizeValue, timeoutMs: 20
  });

  assert.equal(result.status, 'clarification');
  assert.equal(result.change, undefined);
});

test('does not turn ambiguous AI policy extraction into a change when fallback cannot resolve it', async () => {
  const ambiguous = {
    schemaVersion: 1,
    status: 'ambiguous',
    reason: 'Two registered policies match the request.',
    candidateRuleIds: ['R-PK-01', 'R-KN-01']
  };
  const deps = dependencies({
    output: ambiguous,
    parseResult: { ok: false, msg: 'Có nhiều quy định đang mang giá trị 7 ngày.' }
  });
  const result = await PolicyAI.resolveRequest({
    requestText, registry, adapter: deps.adapter,
    parseDeterministically: deps.parseDeterministically,
    normalizeValue, timeoutMs: 20
  });

  assert.equal(result.status, 'clarification');
  assert.equal(result.aiStatus, 'ambiguous');
  assert.equal(result.change, undefined);
});

test('uses deterministic fallback after a provider exception', async () => {
  const result = await PolicyAI.resolveRequest({
    requestText,
    registry,
    adapter: { async extract() { throw new Error('network unavailable'); } },
    parseDeterministically: () => ({ ok: true, ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2 }),
    normalizeValue,
    timeoutMs: 20
  });

  assert.equal(result.status, 'deterministic_fallback');
  assert.equal(result.aiStatus, 'provider_failure');
});

test('rejects invalid deterministic-fallback values instead of populating a change', async () => {
  const result = await PolicyAI.resolveRequest({
    requestText,
    registry,
    adapter: PolicyAI.createUnavailableAdapter(),
    parseDeterministically: () => ({ ok: true, ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày ghi chú', issuerTier: 2 }),
    normalizeValue,
    timeoutMs: 20
  });

  assert.equal(result.status, 'refusal');
  assert.equal(result.change, undefined);
});

test('gives an adapter only a copy of registry data and no document or mutation APIs', async () => {
  const originalAlias = registry[0].aliases[0];
  const result = await PolicyAI.resolveRequest({
    requestText,
    registry,
    adapter: {
      async extract(input) {
        assert.deepEqual(Object.keys(input).sort(), ['registry', 'requestText']);
        assert.deepEqual(Object.keys(input.registry[0]).sort(), ['aliases', 'id', 'name', 'owner', 'source', 'tier', 'value']);
        input.registry[0].aliases[0] = 'forged alias';
        return { available: true, output: JSON.stringify(candidate()) };
      }
    },
    parseDeterministically: () => { throw new Error('valid AI candidate must not fall back'); },
    normalizeValue,
    timeoutMs: 20
  });

  assert.equal(result.status, 'ai_candidate');
  assert.equal(registry[0].aliases[0], originalAlias);
});

test('the unavailable adapter does not transmit the request or fabricate a candidate', async () => {
  const adapter = PolicyAI.createUnavailableAdapter();
  const result = await adapter.extract({ requestText, registry });

  assert.deepEqual(result, { available: false, reason: 'AI provider is not configured.' });
});
