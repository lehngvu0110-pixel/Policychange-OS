'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PolicyAI = require('../js/policy-ai.js');
const PolicyProver = require('../js/policy-prover.js');
const { loadProductionEngine } = require('../bench/production-adapter.cjs');

const engine = loadProductionEngine();
const targetRule = engine.registry.find(rule => rule.id === 'R-PK-01');
const change = { rule:targetRule, oldValue:'7 ngày', newValue:'5 ngày', issuerTier:2 };

test('target and foreign same-value anchors on one line retain U2 and never commit either occurrence', () => {
  const line = 'Phúc khảo được xử lý trong 7 ngày; khiếu nại được phản hồi trong 7 ngày.';
  const document = { id:'MIXED', title:'Mixed clause', owner:'Office', tier:2, version:'1.0', lines:[line] };
  const analysis = engine.analyze(change, [document]);
  assert.equal(analysis.props.length, 1);
  assert.equal(analysis.props[0].outcome, 'ESCALATE');
  assert.equal(analysis.props[0].category, 'U2');

  const proposal = {
    ...analysis.props[0], outcome:'AUTO_PATCH', category:null,
    newLine:'Phúc khảo được xử lý trong 5 ngày; khiếu nại được phản hồi trong 5 ngày.'
  };
  const proof = PolicyProver.proveAutomaticPatch(change, document, proposal, {
    registry:engine.registry, docs:[document], parseValue:engine.parseValue,
    valueRegex:engine.valueRegex, renderValue:engine.renderValue, ownersOfLine:engine.ownersOfLine,
    analyze:() => ({ props:[proposal] }), validatedEvidence:[]
  });
  assert.equal(proof.allowed, false);
  assert.equal(proof.checks.find(check => check.id === 'registered_policy_anchor').passed, false);

  const committed = engine.commit({ appState:{ change, props:analysis.props }, documents:[document] });
  assert.equal(committed.documents[0].lines[0], line);
  assert.equal(committed.ledger.some(entry => entry.action.startsWith('PATCH')), false);
});

test('range endpoints with hyphen, en dash, em dash, and whitespace are not policy-value proposals', () => {
  const lines = [
    'Thời hạn phúc khảo là 5-7 ngày.',
    'Thời hạn phúc khảo là 5 – 7 ngày.',
    'Thời hạn phúc khảo là 5—7 ngày.'
  ];
  for (const line of lines) {
    const proposals = engine.analyze(change, [{ id:'RANGE', tier:2, lines:[line] }]).props;
    assert.equal(proposals.length, 0, line);
  }
  const unitless = loadProductionEngine({ registry:[{
    id:'R-TEST-7', name:'Appeal period', value:'7', tier:2, source:'Fixture', owner:'Office', aliases:['phúc khảo']
  }] });
  const unitlessRule = unitless.registry[0];
  const punctuation = unitless.analyze({ rule:unitlessRule, oldValue:'7', newValue:'5', issuerTier:2 },
    [{ id:'SAFE', tier:2, lines:['Thời hạn phúc khảo là 7, đủ thời gian.'] }]).props;
  assert.equal(punctuation[0].newLine, 'Thời hạn phúc khảo là 5, đủ thời gian.');
});

test('prover independently rejects a forged AUTO_PATCH for a range endpoint', () => {
  const line = 'Thời hạn phúc khảo là 5–7 ngày.';
  const document = { id:'RANGE-PROOF', title:'Range', owner:'Office', tier:2, version:'1.0', lines:[line] };
  const forged = {
    id:'P1', docId:document.id, lineIndex:0, line,
    newLine:'Thời hạn phúc khảo là 5–5 ngày.',
    hits:[{ index:line.indexOf('7 ngày'), text:'7 ngày' }], outcome:'AUTO_PATCH', category:null
  };
  const proof = PolicyProver.proveAutomaticPatch(change, document, forged, {
    registry:engine.registry, docs:[document], parseValue:engine.parseValue,
    valueRegex:engine.valueRegex, renderValue:engine.renderValue, ownersOfLine:engine.ownersOfLine,
    analyze:() => ({ props:[forged] }), validatedEvidence:[]
  });
  assert.equal(proof.allowed, false);
  assert.equal(proof.checks.find(check => check.id === 'exact_old_value_occurrences').passed, false);
});

test('deterministic parser asks for issuer authority instead of silently defaulting tier two', () => {
  const parsed = engine.parseFreeText('Rút thời hạn phúc khảo từ 7 ngày xuống 5 ngày.');
  assert.equal(parsed.ok, false);
});

test('explicit tier-two request remains parseable and unavailable AI reports missing authority as clarification', async () => {
  const parsed = engine.parseFreeText('Rút thời hạn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng ban hành.');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ruleId, 'R-PK-01');
  assert.equal(parsed.issuerTier, 2);

  const result = await PolicyAI.resolveRequest({
    requestText:'Rút thời hạn phúc khảo từ 7 ngày xuống 5 ngày.',
    registry:engine.registry,
    adapter:PolicyAI.createUnavailableAdapter(),
    parseDeterministically:engine.parseFreeText,
    normalizeValue:value => JSON.stringify([engine.parseValue(value).num, engine.parseValue(value).unit])
  });
  assert.equal(result.status, 'clarification');
});

test('equal policy matches clarify independently of registry order', () => {
  const request = 'Thay đổi thời hạn phúc khảo và khiếu nại từ 7 ngày xuống 5 ngày, do Trưởng phòng ban hành.';
  const reversed = loadProductionEngine({ registry:[...engine.registry].reverse() });
  for (const runtime of [engine, reversed]) {
    const parsed = runtime.parseFreeText(request);
    assert.equal(parsed.ok, false);
    assert.match(parsed.msg, /chưa rõ|hãy chọn|nhiều quy định/i);
  }
});

test('HTML text escaping renders an XSS payload as inert text', () => {
  const SafeHTML = require('../js/safe-html.js');
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  assert.equal(SafeHTML.escapeText(payload), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
});

test('invalid dotted decimals are refused while Vietnamese grouping and decimal comma remain valid', () => {
  assert.equal(engine.parseValue('10.5 triệu').num, null);
  assert.equal(engine.parseValue('10,5 triệu').num, 10500000);
  assert.equal(engine.parseValue('10.500.000 đồng').num, 10500000);
  assert.equal(engine.parseFreeText('Đổi hạn mức tạm ứng từ 10 triệu lên 10.5 triệu, do Trưởng phòng ban hành.').ok, false);
});

test('undo restores an unchanged issued line using an append-only, verifiable reversal event', () => {
  const line = 'Đơn phúc khảo phải nộp trong 7 ngày.';
  const document = { id:'UNDO-SAFE', title:'Appeal', owner:'Office', tier:2, version:'1.0', lines:[line] };
  const props = engine.analyze(change, [document]).props;
  const issued = engine.commit({ appState:{ change, props }, documents:[document] });
  const originalEntry = structuredClone(issued.ledger[0]);
  assert.equal(engine.verifyLedger(issued.ledger), true);

  const undone = engine.undo({ appState:issued.appState, documents:issued.documents, auditLedger:issued.ledger, seq:1 });
  assert.equal(undone.documents[0].lines[0], line);
  assert.equal(undone.ledger.length, 2);
  assert.deepEqual(undone.ledger[0], originalEntry);
  assert.equal(undone.ledger[1].revertsSeq, 1);
  assert.equal(undone.chainValid, true);
  assert.equal(engine.verifyLedger(undone.ledger), true);

  const tampered = structuredClone(undone.ledger);
  tampered[1].revertsSeq = 99;
  assert.equal(engine.verifyLedger(tampered), false);
});

test('undo refuses a stale line without marking or logging a reversal', () => {
  const document = { id:'UNDO-STALE', title:'Appeal', owner:'Office', tier:2, version:'1.0',
    lines:['Đơn phúc khảo phải nộp trong 7 ngày.'] };
  const props = engine.analyze(change, [document]).props;
  const issued = engine.commit({ appState:{ change, props }, documents:[document] });
  const laterDocs = structuredClone(issued.documents);
  laterDocs[0].lines[0] += ' Bổ sung thông tin mới.';
  const result = engine.undo({ appState:issued.appState, documents:laterDocs, auditLedger:issued.ledger, seq:1 });
  assert.deepEqual(result.documents, laterDocs);
  assert.deepEqual(result.ledger, issued.ledger);
  assert.match(result.message, /Không thể hoàn tác/);
  assert.equal(result.chainValid, true);
});
