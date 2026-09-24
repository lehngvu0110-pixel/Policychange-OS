const test = require('node:test');
const assert = require('node:assert/strict');
const Benchmark = require('../bench/run.cjs');
const { loadProductionEngine } = require('../bench/production-adapter.cjs');
const PolicyProver = require('../js/policy-prover.js');

const SYSTEMS = ['naive', 'llmOnly', 'policyChangeOS'];
function metricFixture(id, groundTruth) {
  return {
    id,
    requestText:'fixture input',
    change:{ ruleId:'R-TEST', oldValue:'7 days', newValue:'5 days', issuerTier:2 },
    documents:[{ id:'DOC-A', tier:1, lines:['7 days'] }],
    llmMock:{ status:'ok', decision:'review', targets:[] },
    groundTruth
  };
}

test('fixture loader returns at least 24 unique, explicit benchmark cases', () => {
  const fixtures = Benchmark.loadFixtures();
  assert.ok(fixtures.length >= 24);
  assert.equal(new Set(fixtures.map(fixture => fixture.id)).size, fixtures.length);
  for (const fixture of fixtures) {
    assert.equal(Benchmark.validateFixture(fixture), true, fixture.id);
    assert.ok(fixture.groundTruth.expectedOutcome, fixture.id);
    assert.ok(Array.isArray(fixture.groundTruth.expectedMutations), fixture.id);
  }
});

test('fixture validator rejects missing ground truth with the fixture id in its error', () => {
  assert.throws(
    () => Benchmark.validateFixture({ id: 'BROKEN', documents: [], change: {}, llmMock: {} }),
    /BROKEN.*groundTruth/i
  );
});

test('every fixture produces one normalized result from each system', async () => {
  const fixtures = Benchmark.loadFixtures();
  const report = await Benchmark.runBenchmark({ fixtures });
  assert.equal(report.results.length, fixtures.length * SYSTEMS.length);
  for (const fixture of fixtures) for (const system of SYSTEMS) {
    const result = report.results.find(item => item.caseId === fixture.id && item.system === system);
    assert.ok(result, fixture.id + ' missing ' + system);
    assert.equal(typeof result.outcome, 'string');
    assert.equal(typeof result.autoPatched, 'boolean');
    assert.ok(Array.isArray(result.mutatedLocations));
    assert.ok(Array.isArray(result.mutatedDocuments));
    assert.equal(typeof result.requiresHuman, 'boolean');
    assert.equal(typeof result.refused, 'boolean');
    assert.equal(typeof result.reason, 'string');
    if (system === 'policyChangeOS') {
      const key = item => [item.documentId, item.lineIndex, item.outcome, item.category || null].join('|');
      assert.deepEqual(
        result.engineDecisions.map(key).sort(),
        fixture.groundTruth.expectedEngineDecisions.map(key).sort(),
        fixture.id + ' engine decision ground truth'
      );
    }
  }
});

test('actual PolicyChange-OS benchmark path preserves a real same-value U2 collision', async () => {
  const fixtures = Benchmark.loadFixtures();
  const fixture = fixtures.find(item => item.id === 'same-value-u2');
  assert.ok(fixture);
  const { results } = await Benchmark.runBenchmark({ fixtures:[fixture] });
  const actual = results.find(item => item.system === 'policyChangeOS');
  assert.ok(actual.engineDecisions.some(item => item.category === 'U2'));
  assert.equal(actual.mutatedLocations.length, 0);
});

test('naive and LLM-only baselines follow their fixture inputs without prover metadata', async () => {
  const fixtures = Benchmark.loadFixtures();
  const fixture = fixtures.find(item => item.id === 'same-value-u2');
  const { results } = await Benchmark.runBenchmark({ fixtures:[fixture] });
  const naive = results.find(item => item.system === 'naive');
  const llm = results.find(item => item.system === 'llmOnly');
  assert.ok(naive.mutatedLocations.length > 0);
  assert.ok(llm.mutatedLocations.length > 0);
  assert.equal(Object.hasOwn(naive, 'proof'), false);
  assert.equal(Object.hasOwn(llm, 'proof'), false);
});

test('PolicyChange-OS executes the existing commit handler and records the proof basis in audit', async () => {
  const fixture = Benchmark.loadFixtures().find(item => item.id === 'safe-clear-anchor');
  const { results } = await Benchmark.runBenchmark({ fixtures:[fixture] });
  const actual = results.find(item => item.system === 'policyChangeOS');
  assert.equal(actual.auditEntries.length, 1);
  assert.equal(actual.auditEntries[0].action, 'PATCH dòng 1');
  assert.match(actual.auditEntries[0].basis, /deterministic proof proof-v1-/);
  assert.equal(actual.auditEntries[0].from, fixture.groundTruth.expectedMutations[0].from);
  assert.equal(actual.auditEntries[0].to, fixture.groundTruth.expectedMutations[0].to);
});

test('date component matching is excluded while the genuine policy value on the same line remains patchable', async () => {
  const fixtures = Benchmark.loadFixtures();
  const dateFixture = fixtures.find(item => item.id === 'number-inside-date');
  const safeFixture = fixtures.find(item => item.id === 'safe-clear-anchor');
  assert.ok(dateFixture);
  assert.ok(safeFixture);

  const { results } = await Benchmark.runBenchmark({ fixtures:[dateFixture, safeFixture] });
  const actual = results.filter(item => item.system === 'policyChangeOS');
  const dateResult = actual.find(item => item.caseId === dateFixture.id);
  const safeResult = actual.find(item => item.caseId === safeFixture.id);
  assert.equal(dateResult.outcome, 'AUTO_PATCH');
  assert.deepEqual(dateResult.mutatedLocations, dateFixture.groundTruth.expectedMutations);
  assert.equal(dateResult.proofs[0].allowed, true);
  assert.deepEqual(safeResult.mutatedLocations, safeFixture.groundTruth.expectedMutations);
});

test('unitless numeric analysis rejects slash dates and decimal components but retains ordinary punctuation', () => {
  const engine = loadProductionEngine({ registry:[{
    id:'R-TEST-7', name:'Appeal period', value:'7', tier:2, source:'Fixture', owner:'Office', aliases:['phúc khảo']
  }] });
  const rule = engine.registry[0];
  const change = { rule, oldValue:'7', newValue:'5', issuerTier:2 };
  const analyzeLine = text => engine.analyze(change, [{ id:'DOC-TEST', tier:2, lines:[text] }]).props;
  assert.deepEqual(analyzeLine('Phúc khảo period: 17/07/2025'), []);
  assert.deepEqual(analyzeLine('Phúc khảo fee: 7.5 million'), []);
  const hyphenated = analyzeLine('Thời hạn phúc khảo là 7-day appeal period.');
  assert.equal(hyphenated.length, 1);
  assert.equal(hyphenated[0].newLine, 'Thời hạn phúc khảo là 5-day appeal period.');
  const punctuated = analyzeLine('Thời hạn phúc khảo là 7, đủ thời gian.');
  assert.equal(punctuated.length, 1);
  assert.equal(punctuated[0].newLine, 'Thời hạn phúc khảo là 5, đủ thời gian.');
});

test('prover rejects a legacy date-only candidate after deterministic recheck', () => {
  const fixture = Benchmark.loadFixtures().find(item => item.id === 'number-inside-date');
  const runtime = loadProductionEngine({ registry:fixture.registryOverride });
  const rule = runtime.registry.find(item => item.id === fixture.change.ruleId);
  const change = { rule, oldValue:fixture.change.oldValue, newValue:fixture.change.newValue, issuerTier:fixture.change.issuerTier };
  const doc = { id:'DATE-ONLY', tier:2, owner:'Phòng Đào tạo', title:'Date only', version:'1.0', lines:['Sinh viên phúc khảo hoàn tất ngày 17/07/2025.'] };
  const expression = runtime.valueRegex(change.oldValue);
  expression.lastIndex = 0;
  const match = expression.exec(doc.lines[0]);
  assert.ok(match, 'legacy matcher must reproduce the historical date component candidate');
  const prop = {
    id:'P1', docId:doc.id, docTitle:doc.title, docOwner:doc.owner, docTier:doc.tier,
    lineIndex:0, line:doc.lines[0],
    newLine:doc.lines[0].replace(runtime.valueRegex(change.oldValue), value => runtime.renderValue(value, change.newValue)),
    hits:[{ index:match.index, text:match[0] }], outcome:'AUTO_PATCH', category:null
  };
  const proof = PolicyProver.proveAutomaticPatch(change, doc, prop, {
    registry:runtime.registry, docs:[doc], analyze:runtime.analyze, parseValue:runtime.parseValue,
    valueRegex:runtime.valueRegex, renderValue:runtime.renderValue, ownersOfLine:runtime.ownersOfLine,
    validatedEvidence:[]
  });
  assert.equal(proof.allowed, false);
});

test('metric calculations use explicit ground truth and catch false automatic mutation', () => {
  const fixtures = [
    metricFixture('SAFE', { expectedOutcome:'AUTO_PATCH', expectedCategory:null, expectedMutations:[{ documentId:'DOC-A', lineIndex:0, from:'7 days', to:'5 days' }], requiresHuman:false, refused:false, expectedEngineDecisions:[] }),
    metricFixture('REFUSE', { expectedOutcome:'REFUSE', expectedCategory:null, expectedMutations:[], requiresHuman:false, refused:true, expectedEngineDecisions:[] })
  ];
  const correctSafe = { caseId:'SAFE', outcome:'AUTO_PATCH', category:null, autoPatched:true, mutatedLocations:[{ documentId:'DOC-A', lineIndex:0, from:'7 days', to:'5 days' }], requiresHuman:false, refused:false };
  const badRefusal = { caseId:'REFUSE', outcome:'AUTO_PATCH', category:null, autoPatched:true, mutatedLocations:[{ documentId:'DOC-B', lineIndex:0, from:'7 days', to:'5 days' }], requiresHuman:false, refused:false };
  const noPatch = (caseId, system, outcome='NO_MATCH') => ({ caseId, system, outcome, category:null, autoPatched:false, mutatedLocations:[], requiresHuman:false, refused:false });
  const results = [
    { ...correctSafe, system:'policyChangeOS' }, noPatch('SAFE','naive'), noPatch('SAFE','llmOnly'),
    { ...badRefusal, system:'policyChangeOS' }, noPatch('REFUSE','naive','REFUSE'), noPatch('REFUSE','llmOnly','REFUSE')
  ];
  const metrics = Benchmark.calculateMetrics(results, fixtures).systems.policyChangeOS;
  assert.equal(metrics.totalCases, 2);
  assert.equal(metrics.falseAutoPatchCases, 1);
  assert.equal(metrics.autoPatchCases, 2);
  assert.equal(metrics.falseAutoPatchRate, 0.5);
  assert.equal(metrics.unsafeMutationCount, 1);
  assert.equal(metrics.correctMutationRate, 0.5);
  assert.equal(metrics.missedSafeAutomationRate, 0);
  assert.equal(metrics.correctRefusalRate, 0);
});

test('false auto-patch rate is null when no system performed an automatic mutation', () => {
  const fixtures = [metricFixture('REVIEW', { expectedOutcome:'REVIEW', expectedCategory:'U1', expectedMutations:[], requiresHuman:true, refused:false, expectedEngineDecisions:[] })];
  const results = SYSTEMS.map(system => ({ caseId:'REVIEW', system, outcome:'REVIEW', category:'U1', autoPatched:false, mutatedLocations:[], requiresHuman:true, refused:false }));
  assert.equal(Benchmark.calculateMetrics(results, fixtures).systems.llmOnly.falseAutoPatchRate, null);
});

test('runner fails clearly when a fixture is omitted from any system output', async () => {
  const fixtures = Benchmark.loadFixtures().slice(0, 1);
  const report = await Benchmark.runBenchmark({ fixtures });
  assert.throws(
    () => Benchmark.calculateMetrics(report.results.slice(0, 2), fixtures),
    /expected 3.*results/i
  );
});

test('benchmark results are deterministic across fresh executions', async () => {
  const fixtures = Benchmark.loadFixtures();
  const first = await Benchmark.runBenchmark({ fixtures });
  const second = await Benchmark.runBenchmark({ fixtures });
  assert.deepEqual(first.results, second.results);
  assert.deepEqual(first.metrics, second.metrics);
});
