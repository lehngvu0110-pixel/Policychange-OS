'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PolicyAI = require('../js/policy-ai.js');
const SemanticDiscovery = require('../js/semantic-discovery.js');
const { loadProductionEngine } = require('./production-adapter.cjs');

const SYSTEMS = Object.freeze(['naive', 'llmOnly', 'policyChangeOS']);
const FIXTURE_PATH = path.join(__dirname, 'fixtures.json');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function validateFixture(fixture) {
  const id = fixture && typeof fixture.id === 'string' ? fixture.id : '<missing id>';
  const fail = message => { throw new Error('Fixture ' + id + ': ' + message); };
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) fail('must be an object.');
  if (!fixture.groundTruth || typeof fixture.groundTruth !== 'object') fail('groundTruth is required.');
  const truth = fixture.groundTruth;
  if (!['AUTO_PATCH', 'REVIEW', 'MIXED', 'REFUSE', 'NO_MATCH'].includes(truth.expectedOutcome)) fail('groundTruth.expectedOutcome is invalid.');
  if (!(truth.expectedCategory === null || ['U1', 'U2', 'U3'].includes(truth.expectedCategory))) fail('groundTruth.expectedCategory must be null or U1/U2/U3.');
  if (!Array.isArray(truth.expectedMutations) || !Array.isArray(truth.expectedEngineDecisions) ||
      typeof truth.requiresHuman !== 'boolean' || typeof truth.refused !== 'boolean') fail('groundTruth must explicitly include expectedMutations, expectedEngineDecisions, requiresHuman, and refused.');
  if (typeof fixture.requestText !== 'string' || !fixture.requestText.trim()) fail('requestText is required.');
  if (!fixture.change || typeof fixture.change.ruleId !== 'string' || typeof fixture.change.oldValue !== 'string' ||
      typeof fixture.change.newValue !== 'string' || !Number.isInteger(fixture.change.issuerTier)) fail('change must include ruleId, oldValue, newValue, and integer issuerTier.');
  if (fixture.change.issuerTier < 1 || fixture.change.issuerTier > 3) fail('issuerTier must be from 1 through 3.');
  if (!Array.isArray(fixture.documents) || !fixture.documents.length) fail('documents must be a non-empty array.');
  const documentIds = new Set();
  for (const doc of fixture.documents) {
    if (!doc || typeof doc.id !== 'string' || !Number.isInteger(doc.tier) || !Array.isArray(doc.lines) || !doc.lines.every(line => typeof line === 'string')) fail('each document needs an id, integer tier, and string lines.');
    if (documentIds.has(doc.id)) fail('document ids must be unique.');
    documentIds.add(doc.id);
  }
  if (fixture.registryOverride !== undefined && (!Array.isArray(fixture.registryOverride) || !fixture.registryOverride.every(rule => rule && typeof rule.id === 'string' && typeof rule.value === 'string' && Array.isArray(rule.aliases)))) fail('registryOverride must contain valid rule records.');
  if (!fixture.llmMock || !['ok', 'malformed', 'timeout', 'failure'].includes(fixture.llmMock.status) ||
      !['patch', 'review', 'refuse', 'global'].includes(fixture.llmMock.decision) || !Array.isArray(fixture.llmMock.targets)) fail('llmMock needs a supported status, decision, and targets array.');
  const mutationKeys = new Set();
  for (const mutation of truth.expectedMutations) {
    const doc = fixture.documents.find(item => item.id === mutation.documentId);
    if (!doc || !Number.isInteger(mutation.lineIndex) || typeof mutation.from !== 'string' || typeof mutation.to !== 'string' ||
        doc.lines[mutation.lineIndex] !== mutation.from) fail('groundTruth mutation must identify the exact original line and replacement.');
    const key = mutation.documentId + '\u0000' + mutation.lineIndex;
    if (mutationKeys.has(key)) fail('groundTruth mutations must not duplicate a document line.');
    mutationKeys.add(key);
  }
  for (const decision of truth.expectedEngineDecisions) {
    const doc = decision && fixture.documents.find(item => item.id === decision.documentId);
    if (!doc || !Number.isInteger(decision.lineIndex) || decision.lineIndex < 0 || decision.lineIndex >= doc.lines.length ||
        !['AUTO_PATCH', 'ESCALATE'].includes(decision.outcome) ||
        !(decision.category === null || ['U1', 'U2', 'U3'].includes(decision.category)) ||
        (decision.outcome === 'ESCALATE') !== (decision.category !== null)) fail('groundTruth engine decision must point to a document line and preserve AUTO_PATCH or ESCALATE/category.');
  }
  if (truth.refused && (truth.requiresHuman || truth.expectedMutations.length)) fail('a refusal cannot also require human review or expect automatic mutations.');
  if (truth.expectedOutcome === 'AUTO_PATCH' && (!truth.expectedMutations.length || truth.requiresHuman || truth.refused)) fail('AUTO_PATCH ground truth needs automatic mutations and no review/refusal.');
  if (fixture.semanticMock && !['ok', 'malformed', 'timeout', 'failure', 'unavailable'].includes(fixture.semanticMock.status)) fail('semanticMock.status is invalid.');
  if (fixture.mutationAfterAnalysis) {
    const { documentId, lineIndex, replacement } = fixture.mutationAfterAnalysis;
    if (!documentIds.has(documentId) || !Number.isInteger(lineIndex) || typeof replacement !== 'string') fail('mutationAfterAnalysis is malformed.');
  }
  return true;
}

function validateFixtures(fixtures) {
  if (!Array.isArray(fixtures) || !fixtures.length) throw new Error('Benchmark fixtures must be a non-empty array.');
  const ids = new Set();
  for (const fixture of fixtures) {
    validateFixture(fixture);
    if (ids.has(fixture.id)) throw new Error('Duplicate benchmark fixture id: ' + fixture.id);
    ids.add(fixture.id);
  }
  return true;
}

function loadFixtures(filePath = FIXTURE_PATH) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { throw new Error('Could not load benchmark fixtures: ' + error.message); }
  if (!parsed || parsed.schemaVersion !== 1 || parsed.registrySource !== 'production' || !Array.isArray(parsed.cases)) {
    throw new Error('Benchmark fixture file must have schemaVersion 1, registrySource production, and a cases array.');
  }
  validateFixtures(parsed.cases);
  return parsed.cases;
}

function numericToken(value) {
  const match = String(value || '').match(/[\d.,]+/u);
  return match ? match[0] : '';
}

function mutateLine(docs, documentId, lineIndex, oldToken, newToken) {
  const doc = docs.find(item => item.id === documentId);
  if (!doc || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= doc.lines.length) return null;
  const from = doc.lines[lineIndex];
  if (!oldToken || !from.includes(oldToken)) return null;
  const to = from.split(oldToken).join(newToken);
  if (to === from) return null;
  doc.lines[lineIndex] = to;
  return { documentId, lineIndex, from, to };
}

function mutateAllNumericOccurrences(docs, change) {
  const oldToken = numericToken(change.oldValue);
  const newToken = numericToken(change.newValue);
  if (!oldToken || !newToken) return [];
  const mutations = [];
  for (const doc of docs) for (let lineIndex = 0; lineIndex < doc.lines.length; lineIndex++) {
    const mutation = mutateLine(docs, doc.id, lineIndex, oldToken, newToken);
    if (mutation) mutations.push(mutation);
  }
  return mutations;
}

function baseResult(caseId, system, overrides = {}) {
  const result = {
    caseId, system, outcome: 'NO_MATCH', category: null, autoPatched: false,
    mutatedLocations: [], mutatedDocuments: [], requiresHuman: false, refused: false, reason: ''
  };
  return Object.assign(result, overrides);
}

function finishMutationResult(result, mutations) {
  const sorted = mutations.slice().sort((a, b) => a.documentId.localeCompare(b.documentId) || a.lineIndex - b.lineIndex);
  return Object.assign(result, {
    mutatedLocations: sorted,
    mutatedDocuments: [...new Set(sorted.map(item => item.documentId))].sort(),
    autoPatched: sorted.length > 0
  });
}

function runNaive(fixture) {
  const docs = clone(fixture.documents);
  const mutations = mutateAllNumericOccurrences(docs, fixture.change);
  const result = baseResult(fixture.id, 'naive', {
    outcome: mutations.length ? 'AUTO_PATCH' : 'NO_MATCH',
    reason: 'Replaced every literal occurrence of the old numeric token; no registry, authority, anchor, evidence, or prover checks.'
  });
  return finishMutationResult(result, mutations);
}

function runLLMOnly(fixture) {
  const docs = clone(fixture.documents);
  const mock = fixture.llmMock;
  if (mock.status !== 'ok') {
    const why = mock.status === 'malformed' ? 'Malformed model output.' : 'Mock model ' + mock.status + '.';
    return baseResult(fixture.id, 'llmOnly', { outcome:'REFUSE', refused:true, reason:why });
  }
  if (mock.decision === 'refuse') return baseResult(fixture.id, 'llmOnly', { outcome:'REFUSE', refused:true, reason:mock.reason || 'Mock model refused.' });
  if (mock.decision === 'review') return baseResult(fixture.id, 'llmOnly', { outcome:'REVIEW', requiresHuman:true, reason:mock.reason || 'Mock model requests review.' });
  const mutations = [];
  if (mock.decision === 'global') {
    mutations.push(...mutateAllNumericOccurrences(docs, fixture.change));
  } else {
    const oldToken = numericToken(fixture.change.oldValue);
    const newToken = numericToken(fixture.change.newValue);
    for (const target of mock.targets) {
      if (!target || typeof target.documentId !== 'string' || !Number.isInteger(target.lineIndex)) continue;
      const mutation = mutateLine(docs, target.documentId, target.lineIndex, oldToken, newToken);
      if (mutation) mutations.push(mutation);
    }
  }
  const result = baseResult(fixture.id, 'llmOnly', {
    outcome:mutations.length ? 'AUTO_PATCH' : 'NO_MATCH',
    reason:mock.reason || 'Followed the fixture-provided model response; no policy registry or deterministic prover was used.'
  });
  return finishMutationResult(result, mutations);
}

function policyValueKey(parseValue, value) {
  const parsed = parseValue(value);
  return parsed.num === null ? null : JSON.stringify([parsed.num, parsed.unit]);
}

async function resolveFixtureChange(fixture, runtime) {
  const result = await PolicyAI.resolveRequest({
    requestText: fixture.requestText,
    registry: runtime.registry,
    adapter: PolicyAI.createUnavailableAdapter(),
    parseDeterministically: runtime.parseFreeText,
    normalizeValue: value => policyValueKey(runtime.parseValue, value),
    timeoutMs: 10
  });
  if (result.status !== 'deterministic_fallback' && result.status !== 'ai_candidate') {
    return { refusal: true, reason: result.reason || 'Request could not be resolved.', status: result.status };
  }
  const inputChange = result.change;
  if (!inputChange || inputChange.ruleId !== fixture.change.ruleId ||
      inputChange.oldValue !== fixture.change.oldValue || inputChange.newValue !== fixture.change.newValue ||
      inputChange.issuerTier !== fixture.change.issuerTier) {
    return { refusal: true, reason: 'Resolved request does not match its explicit fixture change.', status: 'fixture_mismatch' };
  }
  const rule = runtime.registry.find(item => item.id === inputChange.ruleId);
  if (!rule) return { refusal: true, reason: 'Requested policy is absent from the registry.', status: 'refusal' };
  return {
    refusal:false,
    change:{ rule, oldValue:inputChange.oldValue, newValue:inputChange.newValue, issuerTier:inputChange.issuerTier },
    status:result.status
  };
}

async function discoverSemantics(fixture, runtime, change, props, docs) {
  if (!fixture.semanticMock) return { props, status:'not_requested', valid:[], rejected:[] };
  const mock = fixture.semanticMock;
  const adapter = {
    async discover() {
      if (mock.status === 'timeout') return new Promise(() => {});
      if (mock.status === 'failure') throw new Error('Fixture semantic provider failure.');
      if (mock.status === 'unavailable') return { available:false };
      if (mock.status === 'malformed') return { available:true, output:mock.output === undefined ? '{bad json' : mock.output };
      return { available:true, output:mock.output };
    }
  };
  return SemanticDiscovery.discoverSemantics({
    requestText:fixture.requestText,
    change,
    props,
    docs,
    registry:runtime.registry,
    matchesOldValue(line, oldValue) {
      const expression = runtime.valueRegex(oldValue);
      expression.lastIndex = 0;
      return expression.test(line);
    },
    adapter,
    timeoutMs:5
  });
}

async function runPolicyChangeOS(fixture, htmlPath) {
  const runtime = loadProductionEngine({ htmlPath, registry:fixture.registryOverride });
  const docs = clone(fixture.documents);
  const resolved = await resolveFixtureChange(fixture, runtime);
  if (resolved.refusal) {
    return baseResult(fixture.id, 'policyChangeOS', {
      outcome:'REFUSE', refused:true, reason:resolved.reason, semanticStatus:'not_run', engineDecisions:[]
    });
  }
  const change = resolved.change;
  const analysis = runtime.analyze(change, docs);
  let props = analysis.props;
  if (fixture.mutationAfterAnalysis) {
    const target = fixture.mutationAfterAnalysis;
    const doc = docs.find(item => item.id === target.documentId);
    if (doc && target.lineIndex < doc.lines.length) doc.lines[target.lineIndex] = target.replacement;
  }
  const semantic = await discoverSemantics(fixture, runtime, change, props, docs);
  props = semantic.props;
  const engineDecisions = props.map(prop => ({
    documentId:prop.docId, lineIndex:prop.lineIndex, outcome:prop.outcome, category:prop.category || null
  }));
  const appState = { change, props, semanticResult:{ status:semantic.status, valid:semantic.valid || [], rejected:semantic.rejected || [] } };
  const committed = runtime.commit({ appState, documents:docs });
  const committedProps = committed.appState.props;
  const patchEntries = committed.ledger.filter(entry => entry.action.startsWith('PATCH'));
  const mutations = patchEntries.map(entry => ({
    documentId:entry.docId, lineIndex:entry.lineIndex, from:entry.from, to:entry.to
  }));
  const proofs = committedProps.filter(prop => prop.proof).map(prop => ({
    documentId:prop.docId, lineIndex:prop.lineIndex, allowed:prop.proof.allowed,
    proofId:prop.proof.proofId, reasons:prop.proof.reasons
  }));
  let requiresHuman = false;
  const categories = new Set();
  for (const prop of committedProps) {
    if (prop.outcome === 'ESCALATE') {
      requiresHuman = true;
      if (prop.category) categories.add(prop.category);
      continue;
    }
    if (prop.semanticHold) requiresHuman = true;
    if (prop.outcome === 'AUTO_PATCH' && prop.proof && !prop.proof.allowed) requiresHuman = true;
  }
  const autoPatched = mutations.length > 0;
  const outcome = autoPatched && requiresHuman ? 'MIXED' : autoPatched ? 'AUTO_PATCH' : requiresHuman ? 'REVIEW' : props.length ? 'NO_MATCH' : 'NO_MATCH';
  const categoriesList = [...categories];
  const category = categoriesList.length === 1 ? categoriesList[0] : null;
  const reason = requiresHuman
    ? proofs.flatMap(item => item.reasons).join(' ') || committedProps.filter(item => item.outcome === 'ESCALATE' || item.semanticHold).map(item => item.reason).join(' ')
    : props.filter(item => item.outcome === 'AUTO_PATCH').map(item => item.reason).join(' ');
  const result = baseResult(fixture.id, 'policyChangeOS', {
    outcome, category, requiresHuman, refused:false, reason,
    engineDecisions, proofs, semanticStatus:semantic.status,
    auditEntries:patchEntries.map(entry => ({
      seq:entry.seq, action:entry.action, documentId:entry.docId, lineIndex:entry.lineIndex,
      from:entry.from, to:entry.to, basis:entry.basis
    }))
  });
  return finishMutationResult(result, mutations);
}

function mutationKey(mutation) {
  return [mutation.documentId, mutation.lineIndex, mutation.from, mutation.to].join('\u0000');
}

function decisionKey(decision) {
  return [decision.documentId, decision.lineIndex, decision.outcome, decision.category || null].join('\u0000');
}

function calculateMetrics(results, fixtures) {
  validateFixtures(fixtures);
  const expectedCount = fixtures.length * SYSTEMS.length;
  if (!Array.isArray(results) || results.length !== expectedCount) {
    throw new Error('Expected ' + expectedCount + ' system results for ' + fixtures.length + ' fixtures.');
  }
  const expectedPairs = new Set(fixtures.flatMap(fixture => SYSTEMS.map(system => fixture.id + '\u0000' + system)));
  const seen = new Set();
  for (const result of results) {
    const key = result && result.caseId + '\u0000' + result.system;
    if (!expectedPairs.has(key) || seen.has(key)) throw new Error('Unexpected or duplicate benchmark result: ' + key);
    seen.add(key);
  }
  const output = {};
  for (const system of SYSTEMS) {
    const systemResults = results.filter(result => result.system === system);
    let correctDecisionCount = 0;
    let correctMutationCount = 0;
    let correctEngineClassificationCount = 0;
    let unsafeMutationCount = 0;
    let autoPatchCases = 0;
    let falseAutoPatchCases = 0;
    let correctRefusalCount = 0;
    let refusalCases = 0;
    let correctEscalationCount = 0;
    let escalationCases = 0;
    let safeAutomationCases = 0;
    let missedSafeAutomationCases = 0;
    for (const fixture of fixtures) {
      const result = systemResults.find(item => item.caseId === fixture.id);
      const truth = fixture.groundTruth;
      if (result.outcome === truth.expectedOutcome && result.category === truth.expectedCategory &&
          result.requiresHuman === truth.requiresHuman && result.refused === truth.refused) correctDecisionCount++;
      if (system === 'policyChangeOS') {
        const expectedDecisions = truth.expectedEngineDecisions.map(decisionKey).sort();
        const actualDecisions = (result.engineDecisions || []).map(decisionKey).sort();
        if (JSON.stringify(expectedDecisions) === JSON.stringify(actualDecisions)) correctEngineClassificationCount++;
      }
      const expected = truth.expectedMutations.map(mutationKey).sort();
      const actual = result.mutatedLocations.map(mutationKey).sort();
      if (JSON.stringify(expected) === JSON.stringify(actual)) correctMutationCount++;
      const expectedSet = new Set(expected);
      const unsafe = result.mutatedLocations.filter(mutation => !expectedSet.has(mutationKey(mutation)));
      unsafeMutationCount += unsafe.length;
      if (result.autoPatched) {
        autoPatchCases++;
        if (unsafe.length) falseAutoPatchCases++;
      }
      if (truth.refused) {
        refusalCases++;
        if (result.refused && !result.autoPatched) correctRefusalCount++;
      }
      if (truth.requiresHuman) {
        escalationCases++;
        if (result.requiresHuman) correctEscalationCount++;
      }
      if (truth.expectedMutations.length) {
        safeAutomationCases++;
        if (!truth.expectedMutations.every(expectedMutation => result.mutatedLocations.some(mutation => mutationKey(mutation) === mutationKey(expectedMutation)))) missedSafeAutomationCases++;
      }
    }
    output[system] = {
      totalCases:fixtures.length,
      correctDecisionCount,
      correctDecisionRate:correctDecisionCount / fixtures.length,
      correctEngineClassificationCount:system === 'policyChangeOS' ? correctEngineClassificationCount : null,
      correctEngineClassificationRate:system === 'policyChangeOS' ? correctEngineClassificationCount / fixtures.length : null,
      falseAutoPatchCases,
      autoPatchCases,
      falseAutoPatchRate:autoPatchCases ? falseAutoPatchCases / autoPatchCases : null,
      unsafeMutationCount,
      correctRefusalRate:refusalCases ? correctRefusalCount / refusalCases : null,
      correctEscalationRate:escalationCases ? correctEscalationCount / escalationCases : null,
      correctMutationRate:correctMutationCount / fixtures.length,
      missedSafeAutomationRate:safeAutomationCases ? missedSafeAutomationCases / safeAutomationCases : null,
      correctMutationCount,
      safeAutomationCases
    };
  }
  return { totalCases:fixtures.length, systems:output };
}

async function runBenchmark(options = {}) {
  const fixtures = options.fixtures || loadFixtures();
  validateFixtures(fixtures);
  const htmlPath = options.htmlPath;
  const results = [];
  for (const fixture of fixtures) {
    results.push(runNaive(fixture));
    results.push(runLLMOnly(fixture));
    results.push(await runPolicyChangeOS(fixture, htmlPath));
  }
  return { fixtureCount:fixtures.length, systems:SYSTEMS.slice(), results, metrics:calculateMetrics(results, fixtures) };
}

function percent(value) { return value === null ? 'n/a' : (value * 100).toFixed(1) + '%'; }

function renderReport(report, fixtures) {
  const lines = [
    'PolicyChange-OS Phase 5 benchmark',
    report.fixtureCount + ' synthetic fixtures · systems: naive, llmOnly, policyChangeOS',
    '',
    'Per-case outcomes (mutations are automatic document lines):',
    'case | ground truth | naive | llmOnly | PolicyChange-OS'
  ];
  for (const fixture of fixtures) {
    const short = system => {
      const result = report.results.find(item => item.caseId === fixture.id && item.system === system);
      return result.outcome + (result.category ? '/' + result.category : '') + ' (' + result.mutatedLocations.length + ')';
    };
    lines.push(fixture.id + ' | ' + fixture.groundTruth.expectedOutcome +
      (fixture.groundTruth.expectedCategory ? '/' + fixture.groundTruth.expectedCategory : '') +
      ' (' + fixture.groundTruth.expectedMutations.length + ') | ' +
      short('naive') + ' | ' + short('llmOnly') + ' | ' + short('policyChangeOS'));
  }
  lines.push('', 'Metrics (rates use 0–1 fractions; false-auto-patch denominator is cases with at least one automatic mutation):');
  for (const system of SYSTEMS) {
    const metric = report.metrics.systems[system];
    lines.push(system + ': false auto-patch ' + percent(metric.falseAutoPatchRate) +
      ' (' + metric.falseAutoPatchCases + '/' + metric.autoPatchCases + '), unsafe mutations ' + metric.unsafeMutationCount +
      ', refusal ' + percent(metric.correctRefusalRate) +
      ', escalation ' + percent(metric.correctEscalationRate) +
      ', decision ' + percent(metric.correctDecisionRate) +
      ', mutation ' + percent(metric.correctMutationRate) +
      ', missed safe automation ' + percent(metric.missedSafeAutomationRate));
  }
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const fixtures = loadFixtures();
  const report = await runBenchmark({ fixtures });
  if (argv.includes('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else process.stdout.write(renderReport(report, fixtures) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(error.stack + '\n');
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ SYSTEMS, loadFixtures, validateFixture, validateFixtures, runBenchmark, calculateMetrics, renderReport });
