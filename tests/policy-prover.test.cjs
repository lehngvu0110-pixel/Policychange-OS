const test = require('node:test');
const assert = require('node:assert/strict');
const Prover = require('../js/policy-prover.js');

const registry = [
  { id: 'R-PK-01', name: 'Thời hạn phúc khảo', value: '7 ngày', tier: 3, source: 'Điều 24', owner: 'Đào tạo', aliases: ['phúc khảo'] },
  { id: 'R-KN-01', name: 'Thời hạn khiếu nại', value: '7 ngày', tier: 3, source: 'Điều 31', owner: 'Thanh tra', aliases: ['khiếu nại'] }
];
const line = 'Sinh viên nộp đơn phúc khảo trong 7 ngày.';
const change = { rule: registry[0], oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2 };
const document = { id: 'DOC-1', title: 'Quy trình phúc khảo', owner: 'Đào tạo', tier: 1, version: '1.0', lines: [line] };

function parseValue(value) {
  const match = String(value || '').match(/^(\d+)\s*(.*)$/u);
  return { raw: String(value || ''), num: match ? Number(match[1]) : null, unit: match ? match[2].trim().toLowerCase() : '' };
}

function valueRegex(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\s+/g, '\\s+');
  return new RegExp(escaped, 'g');
}
function renderValue(_match, value) { return value; }
function ownersOfLine(text) { return registry.filter(rule => rule.aliases.some(alias => text.toLowerCase().includes(alias))); }

// Mirrors the public deterministic analyze contract: the production prover receives
// the real analyze function; these tests exercise that boundary and its outcomes.
function analyze(candidateChange, documents) {
  const props = [];
  for (const doc of documents) for (let lineIndex = 0; lineIndex < doc.lines.length; lineIndex++) {
    const source = doc.lines[lineIndex];
    const re = valueRegex(candidateChange.oldValue);
    const hits = [...source.matchAll(re)].map(hit => ({ index: hit.index, text: hit[0] }));
    if (!hits.length) continue;
    const owners = ownersOfLine(source);
    const foreign = owners.find(owner => owner.id !== candidateChange.rule.id && parseValue(owner.value).num === parseValue(candidateChange.oldValue).num);
    const target = owners.some(owner => owner.id === candidateChange.rule.id);
    const category = foreign && !target ? 'U2' : doc.tier > candidateChange.issuerTier ? 'U3' : !owners.length ? 'U1' : null;
    props.push({
      docId: doc.id, lineIndex, line: source, newLine: source.replace(valueRegex(candidateChange.oldValue), value => renderValue(value, candidateChange.newValue)),
      hits, outcome: category ? 'ESCALATE' : 'AUTO_PATCH', category
    });
  }
  return { props };
}

function proposal(overrides = {}) {
  const index = line.indexOf('7 ngày');
  return {
    id: 'P-DOC-1-0', docId: document.id, lineIndex: 0, line,
    newLine: 'Sinh viên nộp đơn phúc khảo trong 5 ngày.',
    hits: [{ index, text: '7 ngày' }], outcome: 'AUTO_PATCH', category: null,
    reason: 'Target policy anchor and authority passed.', citation: 'R-PK-01 — Điều 24',
    ...overrides
  };
}

function prove({ change: nextChange = change, doc = document, prop = proposal(), rules = registry, docs = [document], engine = analyze, ...extra } = {}) {
  const validatedEvidence = Object.hasOwn(extra, 'validatedEvidence') ? extra.validatedEvidence :
    (Array.isArray(prop.semanticEvidence) ? prop.semanticEvidence.map(item => ({
      ruleId: nextChange.rule.id, documentId: prop.docId, lineIndex: prop.lineIndex,
      quote: item.quote, start: item.start, end: item.end, relation: item.relation,
      explanation: item.explanation, evidence: item.evidence
    })) : []);
  return Prover.proveAutomaticPatch(nextChange, doc, prop, {
    registry: rules, docs, analyze: engine, parseValue, valueRegex, renderValue, ownersOfLine,
    validatedEvidence,
    ...extra
  });
}

function evidence(relation = 'supports', overrides = {}) {
  const quote = 'phúc khảo';
  const start = line.indexOf(quote);
  return { relation, quote, start, end: start + quote.length, explanation: 'Clause quote', evidence: [{ quote, start, end: start + quote.length }], ...overrides };
}

test('valid AUTO_PATCH with deterministic proof is allowed', () => {
  const result = prove();
  assert.equal(result.allowed, true, JSON.stringify(result.checks.filter(check => !check.passed)));
  assert.equal(result.decision, 'AUTO_PATCH');
  assert.ok(result.checks.every(check => check.passed));
});

test('exact old value on the exact anchored line is proven', () => {
  const result = prove();
  assert.equal(result.analyzedLine, line);
  assert.deepEqual(result.anchor.aliases, ['phúc khảo']);
  assert.equal(result.oldValue, '7 ngày');
});

test('valid authority is established by the deterministic engine', () => {
  assert.equal(prove().authority.permits, true);
});

test('valid Phase 2 evidence can retain, but not create, AUTO_PATCH', () => {
  const result = prove({ prop: proposal({ semanticEvidence: [evidence()] }) });
  assert.equal(result.allowed, true);
  assert.equal(result.evidenceRefs.length, 1);
});

test('missing registry entry is blocked', () => {
  assert.equal(prove({ rules: [] }).allowed, false);
});

test('wrong registered old value is blocked', () => {
  const rules = [{ ...registry[0], value: '8 ngày' }, registry[1]];
  assert.equal(prove({ rules }).allowed, false);
});

test('wrong target document is blocked', () => {
  const wrong = { ...document, id: 'DOC-OTHER' };
  assert.equal(prove({ doc: wrong }).allowed, false);
});

test('wrong line index is blocked', () => {
  assert.equal(prove({ prop: proposal({ lineIndex: 2 }) }).allowed, false);
});

test('stale analyzed line is blocked', () => {
  const changed = { ...document, lines: ['Sinh viên nộp đơn phúc khảo trong 9 ngày.'] };
  assert.equal(prove({ doc: changed }).allowed, false);
});

test('missing target anchor is blocked', () => {
  const unanchored = { ...document, lines: ['Sinh viên gửi hồ sơ trong 7 ngày.'] };
  const p = proposal({ line: unanchored.lines[0], newLine: 'Sinh viên gửi hồ sơ trong 5 ngày.' });
  assert.equal(prove({ doc: unanchored, prop: p }).allowed, false);
});

test('foreign same-value policy cannot authorize the requested policy', () => {
  const foreign = { ...document, lines: ['Đơn khiếu nại được phản hồi trong 7 ngày.'] };
  const p = proposal({ line: foreign.lines[0], newLine: 'Đơn khiếu nại được phản hồi trong 5 ngày.', outcome: 'ESCALATE', category: 'U2' });
  const result = prove({ doc: foreign, prop: p });
  assert.equal(result.allowed, false);
  assert.equal(result.engineDecision, 'ESCALATE');
  assert.equal(result.engineCategory, 'U2');
});

for (const category of ['U1', 'U2', 'U3']) {
  test(`${category} cannot be upgraded to AUTO_PATCH`, () => {
    const result = prove({ prop: proposal({ outcome: 'ESCALATE', category, semanticEvidence: [evidence()] }) });
    assert.equal(result.allowed, false);
  });
}

test('invalid AI evidence is blocked', () => {
  assert.equal(prove({ prop: proposal({ semanticEvidence: [{ relation: 'supports', quote: 'not here', start: 0, end: 8, explanation: 'bad', evidence: [] }] }) }).allowed, false);
});

test('stale AI evidence is blocked', () => {
  assert.equal(prove({ prop: proposal({ semanticEvidence: [evidence('supports', { start: 0, end: 9 })] }) }).allowed, false);
});

test('AI evidence absent from Phase 2 validated output is blocked', () => {
  assert.equal(prove({ prop: proposal({ semanticEvidence: [evidence()] }), validatedEvidence: [] }).allowed, false);
});

test('conflicting AI evidence holds until an explicit human approval', () => {
  const prop = proposal({ semanticEvidence: [evidence('supports'), evidence('uncertain')], semanticRelation: 'conflict', semanticHold: true });
  assert.equal(prove({ prop }).allowed, false);
  assert.equal(prove({ prop: { ...prop, semanticHoldReviewed: true, semanticHoldApproved: true } }).allowed, true);
});

test('malformed proof input fails closed without throwing', () => {
  const result = Prover.proveAutomaticPatch(null, null, null, {});
  assert.equal(result.allowed, false);
});

test('global replacement proposal is blocked', () => {
  assert.equal(prove({ prop: proposal({ newLine: 'Replace every 7-day deadline with 5 days.' }) }).allowed, false);
});

test('target mutation changed after analysis is blocked', () => {
  const doc = { ...document, lines: ['Sinh viên nộp đơn phúc khảo trong 7 ngày và 7 ngày nữa.'] };
  assert.equal(prove({ doc }).allowed, false);
});

test('proof records the exact reversible before and after snapshots', () => {
  const result = prove();
  assert.equal(result.reversible, true);
  assert.equal(result.from, line);
  assert.equal(result.to, proposal().newLine);
});

test('proof does not mutate engine result or proposal state', () => {
  const prop = proposal();
  const before = structuredClone(prop);
  prove({ prop });
  assert.deepEqual(prop, before);
});

test('proof does not mutate documents', () => {
  const docs = [structuredClone(document)];
  const before = structuredClone(docs);
  prove({ docs, doc: docs[0] });
  assert.deepEqual(docs, before);
});

test('proof does not mutate registry', () => {
  const rules = structuredClone(registry);
  const before = structuredClone(rules);
  prove({ rules });
  assert.deepEqual(rules, before);
});

test('proof is serializable and stable for identical input', () => {
  const first = prove();
  const second = prove();
  assert.doesNotThrow(() => JSON.stringify(first));
  assert.equal(first.proofId, second.proofId);
});

test('an overconfident AI claim cannot override deterministic same-value collision', () => {
  const doc = { ...document, lines: ['Đơn khiếu nại được phản hồi trong 7 ngày.'] };
  const p = proposal({ docId: doc.id, line: doc.lines[0], newLine: 'Đơn khiếu nại được phản hồi trong 5 ngày.', outcome: 'AUTO_PATCH', category: null,
    semanticEvidence: [evidence('supports', { quote: '7 ngày', start: doc.lines[0].indexOf('7 ngày'), end: doc.lines[0].indexOf('7 ngày') + 6 })] });
  const result = prove({ doc, prop: p });
  assert.equal(result.allowed, false);
  assert.equal(result.engineCategory, 'U2');
});

test('audit basis can identify the proof while preserving the existing reversible ledger shape', () => {
  const result = prove();
  const ledgerEntry = { seq: 1, action: 'PATCH dòng 1', from: result.from, to: result.to, basis: `R-PK-01 · proof ${result.proofId} · ${result.checks.filter(check => check.passed).map(check => check.id).join(',')}` };
  assert.match(ledgerEntry.basis, new RegExp(result.proofId));
  assert.equal(ledgerEntry.from, line);
  assert.equal(ledgerEntry.to, proposal().newLine);
});
