const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Demo = require('../js/policy-demo.js');
const SemanticDiscovery = require('../js/semantic-discovery.js');
const { loadProductionEngine } = require('../bench/production-adapter.cjs');

function loadBenchmarkCase(id) {
  const file = path.join(__dirname, '..', 'bench', 'fixtures.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).cases.find(item => item.id === id);
}

test('guided ambiguity scenario is copied from the existing benchmark fixture', () => {
  const fixture = loadBenchmarkCase('semantic-ambiguous');
  const scenario = Demo.getAmbiguityScenario();
  assert.equal(scenario.fixtureId, fixture.id);
  assert.equal(scenario.requestText, fixture.requestText);
  assert.deepEqual(scenario.change, fixture.change);
  assert.deepEqual(scenario.document, fixture.documents[0]);
  assert.deepEqual(scenario.semanticOutput, fixture.semanticMock.output);
});

test('safe/date demo passes actual analysis and proof, changes only the deadline, and audits the issue', () => {
  const scenario = Demo.getSafeDateScenario();
  const runtime = loadProductionEngine();
  const rule = runtime.registry.find(item => item.id === scenario.ruleId);
  const change = { rule, oldValue:rule.value, newValue:scenario.newValue, issuerTier:scenario.issuerTier };
  const documents = [scenario.document];
  const props = runtime.analyze(change, documents).props;
  assert.equal(props.length, 1);
  assert.equal(props[0].outcome, 'AUTO_PATCH');
  assert.equal(props[0].newLine, 'Nộp đơn phúc khảo trong 5 ngày kể từ ngày công bố điểm; ngày minh họa trên mẫu: 17/07/2025.');

  const committed = runtime.commit({
    appState:{ change, props, semanticResult:null },
    documents
  });
  assert.equal(committed.documents[0].lines[0], props[0].newLine);
  assert.equal(committed.ledger.length, 1);
  assert.match(committed.ledger[0].basis, /deterministic proof proof-v1-/);
});

test('issued demo proposal keeps its original successful proof for display after commit changes the live clause', () => {
  const proof = { allowed:true, proofId:'proof-v1-issued' };
  const proposal = { applied:true, proof };
  const displayed = Demo.proofForDisplay(proposal, () => {
    throw new Error('issued proof should not be recomputed against the post-commit clause');
  });
  assert.equal(displayed, proof);
});

test('unissued demo proposal still gets a fresh deterministic proof', () => {
  const proposal = { applied:false, proof:{ allowed:true, proofId:'stale' } };
  const fresh = { allowed:false, proofId:'proof-v1-current' };
  assert.equal(Demo.proofForDisplay(proposal, () => fresh), fresh);
});

test('ambiguity fixture adapter returns only a cloned, explicitly fixture-backed response', async () => {
  const adapter = Demo.createAmbiguityFixtureAdapter();
  const first = await adapter.discover({ candidates:[] });
  first.output.candidates[0].quote = 'altered';
  const second = await adapter.discover({ candidates:[] });
  assert.equal(second.available, true);
  assert.equal(second.output.candidates[0].quote, 'phúc khảo');
  assert.deepEqual(Object.keys(adapter), ['discover']);
});

test('fixture evidence reaches the real validator and causes a human hold without changing engine classification', async () => {
  const scenario = Demo.getAmbiguityScenario();
  const fixture = loadBenchmarkCase(scenario.fixtureId);
  const runtime = loadProductionEngine();
  const rule = runtime.registry.find(item => item.id === scenario.change.ruleId);
  const change = { rule, oldValue:scenario.change.oldValue, newValue:scenario.change.newValue, issuerTier:scenario.change.issuerTier };
  const docs = [{ ...scenario.document, title:'Ambiguous review fixture', owner:'Phòng Đào tạo', version:'1.0' }];
  const props = runtime.analyze(change, docs).props;
  const result = await SemanticDiscovery.discoverSemantics({
    requestText:scenario.requestText, change, props, docs, registry:runtime.registry,
    matchesOldValue(line, oldValue) { const re=runtime.valueRegex(oldValue); re.lastIndex=0; return re.test(line); },
    adapter:Demo.createAmbiguityFixtureAdapter()
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.valid, fixture.semanticMock.output.candidates.map(item => ({
    ruleId:item.ruleId, documentId:item.documentId, lineIndex:item.lineIndex, quote:item.quote,
    start:item.start, end:item.end, relation:item.relation, explanation:item.explanation,
    evidence:item.evidence
  })));
  assert.equal(result.props[0].outcome, 'AUTO_PATCH');
  assert.equal(result.props[0].semanticHold, true);
  assert.equal(SemanticDiscovery.isPatchAllowed(result.props[0]), false);
});
