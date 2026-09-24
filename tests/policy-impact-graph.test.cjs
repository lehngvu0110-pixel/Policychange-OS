const test = require('node:test');
const assert = require('node:assert/strict');
const ImpactGraph = require('../js/policy-impact-graph.js');

const registry = [
  { id: 'R-PK-01', name: 'Thời hạn phúc khảo', value: '7 ngày', source: 'Điều 4', owner: 'Phòng Đào tạo', aliases: ['phúc khảo'] },
  { id: 'R-KN-01', name: 'Thời hạn khiếu nại', value: '7 ngày', source: 'Điều 8', owner: 'Thanh tra', aliases: ['khiếu nại'] }
];
const change = { rule: registry[0], oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2 };
const docs = [
  { id: 'DOC-A', title: 'Quy trình phúc khảo', owner: 'Phòng Đào tạo', tier: 2, version: '1.0', lines: ['Người học có quyền phúc khảo trong 7 ngày.'] },
  { id: 'DOC-U1', title: 'Hướng dẫn', owner: 'Đơn vị', tier: 1, version: '1.0', lines: ['Hồ sơ gửi trong vòng 7 ngày.'] },
  { id: 'DOC-U2', title: 'Khiếu nại', owner: 'Thanh tra', tier: 2, version: '1.0', lines: ['Đơn khiếu nại được xử lý trong 7 ngày.'] },
  { id: 'DOC-U3', title: 'Quy chế', owner: 'Hiệu trưởng', tier: 3, version: '1.0', lines: ['Thí sinh phúc khảo trong 7 ngày.'] }
];

function prop(docId, outcome, category = null, overrides = {}) {
  const doc = docs.find(item => item.id === docId);
  const line = doc.lines[0];
  return {
    id: 'P-' + docId + '-0', docId, docTitle: doc.title, docOwner: doc.owner, docTier: doc.tier,
    lineIndex: 0, line, newLine: line.replace('7 ngày', '5 ngày'),
    hits: [{ index: line.indexOf('7 ngày'), text: '7 ngày' }],
    outcome, category, reason: outcome === 'AUTO_PATCH'
      ? 'Dòng có cụm từ neo vào R-PK-01 và tài liệu ở cấp, nằm trong thẩm quyền.'
      : 'Engine classified ' + category + '.',
    citation: 'R-PK-01 — Điều 4', decided: false, accepted: false,
    decisionLabel: null, ...overrides
  };
}

function input(props = [], overrides = {}) {
  return { change, registry, docs, props, ledger: [], semanticResult: null, ...overrides };
}

function node(graph, id) { return graph.nodes.find(item => item.id === id); }
function edge(graph, type, source, target) {
  return graph.edges.find(item => item.type === type && item.source === source && item.target === target);
}

function decisionId(docId) { return ImpactGraph.ids.decision(change.rule.id, docId, 0); }
function clauseId(docId) { return ImpactGraph.ids.clause(docId, 0); }

function semanticEvidence(line, relation = 'supports', overrides = {}) {
  const quote = 'phúc khảo';
  const start = line.indexOf(quote);
  return {
    relation, quote, start, end: start + quote.length,
    explanation: 'Quoted clause evidence.',
    evidence: [{ quote, start, end: start + quote.length }],
    ...overrides
  };
}

test('empty analysis produces a valid minimal graph', () => {
  const graph = ImpactGraph.buildImpactGraph(input());
  assert.deepEqual(graph.edges, []);
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].type, 'POLICY');
});

test('AUTO_PATCH graph connects the actual target policy, current clause, document, evidence, and decision', () => {
  const p = prop('DOC-A', 'AUTO_PATCH');
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decision = node(graph, decisionId('DOC-A'));
  const clause = node(graph, clauseId('DOC-A'));
  const policyId = ImpactGraph.ids.policy(change.rule.id);
  const policy = node(graph, policyId);
  const evidence = node(graph, ImpactGraph.ids.deterministic(decision.id));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.proposedLine, p.newLine);
  assert.equal(policy.proposedValue, change.newValue);
  assert.equal(clause.quote, docs[0].lines[0]);
  assert.ok(edge(graph, 'POLICY_TO_CLAUSE', policyId, clause.id));
  assert.ok(edge(graph, 'CLAUSE_TO_DOCUMENT', clause.id, ImpactGraph.ids.document('DOC-A')));
  assert.ok(edge(graph, 'DEPENDENCY_TO_CLAUSE', evidence.id, clause.id));
  assert.ok(edge(graph, 'DEPENDENCY_TO_DECISION', evidence.id, decision.id));
});

test('prover hold is represented separately without rewriting the deterministic outcome', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { proof: { allowed: false, proofId: 'proof-v1-test', reasons: ['stale line'] } });
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decision = node(graph, decisionId('DOC-A'));
  assert.equal(decision.outcome, 'AUTO_PATCH');
  assert.equal(decision.prover.status, 'held');
  assert.equal(decision.prover.proofId, 'proof-v1-test');
  assert.deepEqual(decision.prover.reasons, ['stale line']);
});

test('U1 stays U1 and has no unsupported policy-to-clause edge', () => {
  const p = prop('DOC-U1', 'ESCALATE', 'U1');
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decision = node(graph, decisionId('DOC-U1'));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.category, 'U1');
  assert.equal(edge(graph, 'POLICY_TO_CLAUSE', ImpactGraph.ids.policy(change.rule.id), clauseId('DOC-U1')), undefined);
});

test('same-value foreign-policy collision remains U2 without a target-policy clause edge', () => {
  const p = prop('DOC-U2', 'ESCALATE', 'U2');
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decision = node(graph, decisionId('DOC-U2'));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.category, 'U2');
  assert.equal(edge(graph, 'POLICY_TO_CLAUSE', ImpactGraph.ids.policy(change.rule.id), clauseId('DOC-U2')), undefined);
});

test('authority conflict remains U3 and is never reclassified by the graph', () => {
  const p = prop('DOC-U3', 'ESCALATE', 'U3');
  const graph = ImpactGraph.buildImpactGraph(input([p]));

  assert.equal(node(graph, decisionId('DOC-U3')).outcome, p.outcome);
  assert.equal(node(graph, decisionId('DOC-U3')).category, 'U3');
});

test('validated AI evidence connects only to its exact current clause and actual decision', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { semanticEvidence: [semanticEvidence(docs[0].lines[0])] });
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decision = node(graph, decisionId('DOC-A'));
  const ai = graph.nodes.find(item => item.type === 'DEPENDENCY' && item.source === 'AI');

  assert.equal(ai.evidenceState, 'AI_VALIDATED');
  assert.ok(edge(graph, 'DEPENDENCY_TO_CLAUSE', ai.id, clauseId('DOC-A')));
  assert.ok(edge(graph, 'DEPENDENCY_TO_POLICY', ai.id, ImpactGraph.ids.policy(change.rule.id)));
  assert.ok(edge(graph, 'DEPENDENCY_TO_DECISION', ai.id, decision.id));
});

test('rejected AI response appears as a validation record without inferred clause or policy links', () => {
  const p = prop('DOC-A', 'AUTO_PATCH');
  const graph = ImpactGraph.buildImpactGraph(input([p], {
    semanticResult: { status: 'rejected', rejected: [{ reason: 'Stale or mismatched evidence.' }] }
  }));
  const rejected = graph.nodes.find(item => item.type === 'DEPENDENCY' && item.evidenceState === 'AI_REJECTED');

  assert.ok(rejected);
  assert.equal(rejected.reason, 'Stale or mismatched evidence.');
  assert.equal(graph.edges.some(item => item.source === rejected.id), false);
});

test('pending semantic discovery is visible as AI-unvalidated without a clause relationship', () => {
  const graph = ImpactGraph.buildImpactGraph(input([], {
    semanticResult: { status: 'pending' }
  }));
  const pending = graph.nodes.find(item => item.evidenceState === 'AI_UNVALIDATED');

  assert.ok(pending);
  assert.equal(pending.validationState, 'unvalidated');
  assert.equal(graph.edges.some(item => item.source === pending.id || item.target === pending.id), false);
});

test('conflicting AI evidence remains visible while the actual engine outcome stays unchanged', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, {
    semanticEvidence: [
      semanticEvidence(docs[0].lines[0], 'supports'),
      semanticEvidence(docs[0].lines[0], 'unrelated')
    ],
    semanticHold: true
  });
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decisions = graph.nodes.filter(item => item.type === 'DECISION');
  const ai = graph.nodes.filter(item => item.type === 'DEPENDENCY' && item.source === 'AI');

  assert.equal(ai.length, 2);
  assert.equal(node(graph, decisionId('DOC-A')).outcome, p.outcome);
  assert.equal(node(graph, decisionId('DOC-A')).humanReview.status, 'pending');
  assert.ok(decisions.every(decision => decision.outcome === p.outcome));
});

test('held AUTO_PATCH is represented as pending human review without changing outcome', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { semanticHold: true });
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decision = node(graph, decisionId('DOC-A'));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.humanReview.status, 'pending');
});

test('human approval of a held AUTO_PATCH is represented separately from engine outcome', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, {
    semanticHold: true, semanticHoldReviewed: true, semanticHoldApproved: true
  });
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const decision = node(graph, decisionId('DOC-A'));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.humanReview.status, 'approved');
});

test('human rejection of a held AUTO_PATCH is represented with its actual audit event', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, {
    semanticHold: true, semanticHoldReviewed: true, semanticHoldApproved: false
  });
  const ledger = [{
    seq: 7, ts: '2026-09-24T00:00:00.000Z', actor: 'Người rà soát', docId: 'DOC-A',
    action: 'GIỮ NGUYÊN dòng 1', from: p.line, to: p.line, basis: 'Human review'
  }];
  const graph = ImpactGraph.buildImpactGraph(input([p], { ledger }));
  const decision = node(graph, decisionId('DOC-A'));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.humanReview.status, 'rejected');
  assert.ok(edge(graph, 'DECISION_TO_AUDIT', decision.id, ImpactGraph.ids.audit(7)));
});

test('issued patch is represented from current document and actual ledger state', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { applied: true });
  const ledger = [{
    seq: 3, ts: '2026-09-24T00:00:00.000Z', actor: 'AI · động cơ tiền định',
    docId: 'DOC-A', lineIndex: 0, action: 'PATCH dòng 1', from: p.line,
    to: p.newLine, basis: p.citation, propId: p.id, reverted: false
  }];
  const issuedDocs = docs.map(doc => doc.id === 'DOC-A'
    ? { ...doc, lines: [p.newLine], version: '1.1' } : doc);
  const graph = ImpactGraph.buildImpactGraph(input([p], { docs: issuedDocs, ledger }));
  const decision = node(graph, decisionId('DOC-A'));
  const clause = node(graph, clauseId('DOC-A'));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.issueState, 'issued');
  assert.equal(clause.quote, p.newLine);
  assert.equal(clause.matchesAnalysisSnapshot, false);
  assert.ok(edge(graph, 'DECISION_TO_AUDIT', decision.id, ImpactGraph.ids.audit(3)));
});

test('undo state is represented from actual reverted patch and undo ledger records', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { applied: false });
  const ledger = [
    { seq: 3, ts: 't1', actor: 'AI', docId: 'DOC-A', lineIndex: 0, action: 'PATCH dòng 1', from: p.line, to: p.newLine, basis: 'issued', propId: p.id, reverted: true },
    { seq: 4, ts: 't2', actor: 'Người', docId: 'DOC-A', action: 'HOÀN TÁC bản ghi #3', from: p.newLine, to: p.line, basis: 'reverted', propId: p.id }
  ];
  const graph = ImpactGraph.buildImpactGraph(input([p], { ledger }));
  const decision = node(graph, decisionId('DOC-A'));

  assert.equal(decision.outcome, p.outcome);
  assert.equal(decision.issueState, 'reverted');
  assert.ok(edge(graph, 'DECISION_TO_AUDIT', decision.id, ImpactGraph.ids.audit(3)));
  assert.ok(edge(graph, 'DECISION_TO_AUDIT', decision.id, ImpactGraph.ids.audit(4)));
});

test('a later reissue after undo is shown as issued from the latest audit state', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { applied: true });
  const ledger = [
    { seq: 3, ts: 't1', actor: 'AI', docId: 'DOC-A', lineIndex: 0, action: 'PATCH dòng 1', from: p.line, to: p.newLine, basis: 'first issue', propId: p.id, reverted: true },
    { seq: 4, ts: 't2', actor: 'Người', docId: 'DOC-A', action: 'HOÀN TÁC bản ghi #3', from: p.newLine, to: p.line, basis: 'reverted', propId: p.id },
    { seq: 5, ts: 't3', actor: 'AI', docId: 'DOC-A', lineIndex: 0, action: 'PATCH dòng 1', from: p.line, to: p.newLine, basis: 'reissued', propId: p.id, reverted: false }
  ];
  const issuedDocs = docs.map(doc => doc.id === 'DOC-A'
    ? { ...doc, lines: [p.newLine], version: '1.3' } : doc);
  const graph = ImpactGraph.buildImpactGraph(input([p], { docs: issuedDocs, ledger }));

  assert.equal(node(graph, decisionId('DOC-A')).issueState, 'issued');
});

test('stale clause snapshots keep the current clause but do not connect old evidence to it', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { semanticEvidence: [semanticEvidence(docs[0].lines[0])] });
  const currentDocs = docs.map(doc => doc.id === 'DOC-A' ? { ...doc, lines: ['Replacement current clause.'] } : doc);
  const graph = ImpactGraph.buildImpactGraph(input([p], { docs: currentDocs }));
  const clause = node(graph, clauseId('DOC-A'));
  const ai = graph.nodes.find(item => item.type === 'DEPENDENCY' && item.source === 'AI');

  assert.equal(clause.quote, 'Replacement current clause.');
  assert.equal(clause.matchesAnalysisSnapshot, false);
  assert.equal(edge(graph, 'DEPENDENCY_TO_CLAUSE', ai.id, clause.id), undefined);
});

test('missing document leaves the decision but creates no dangling clause or document edge', () => {
  const p = prop('DOC-A', 'AUTO_PATCH');
  const graph = ImpactGraph.buildImpactGraph(input([p], { docs: docs.filter(doc => doc.id !== 'DOC-A') }));

  assert.ok(node(graph, decisionId('DOC-A')));
  assert.equal(node(graph, clauseId('DOC-A')), undefined);
  assert.equal(node(graph, ImpactGraph.ids.document('DOC-A')), undefined);
});

test('missing registry rule creates no policy node or policy dependency edge', () => {
  const p = prop('DOC-A', 'AUTO_PATCH');
  const graph = ImpactGraph.buildImpactGraph(input([p], { registry: registry.filter(rule => rule.id !== change.rule.id) }));

  assert.equal(node(graph, ImpactGraph.ids.policy(change.rule.id)), undefined);
  assert.equal(graph.edges.some(item => item.type === 'DEPENDENCY_TO_POLICY'), false);
  assert.equal(node(graph, decisionId('DOC-A')).outcome, p.outcome);
});

test('invalid AI dependency is marked rejected and cannot create evidence edges', () => {
  const invalid = semanticEvidence(docs[0].lines[0], 'supports', { start: -1 });
  const p = prop('DOC-A', 'AUTO_PATCH', null, { semanticEvidence: [invalid] });
  const graph = ImpactGraph.buildImpactGraph(input([p]));
  const rejected = graph.nodes.find(item => item.type === 'DEPENDENCY' && item.evidenceState === 'AI_REJECTED');

  assert.ok(rejected);
  assert.equal(graph.edges.some(item => item.source === rejected.id), false);
});

test('mutating the derived graph cannot mutate registry, documents, props, or ledger', () => {
  const p = prop('DOC-A', 'AUTO_PATCH', null, { semanticEvidence: [semanticEvidence(docs[0].lines[0])] });
  const ledger = [{ seq: 1, docId: 'DOC-A', action: 'PATCH dòng 1', from: p.line, to: p.newLine, propId: p.id }];
  const source = input([p], { ledger });
  const before = structuredClone(source);
  const graph = ImpactGraph.buildImpactGraph(source);

  graph.nodes.find(item => item.type === 'CLAUSE').quote = 'tampered';
  graph.nodes.find(item => item.type === 'POLICY').name = 'tampered';
  graph.edges.push({ id: 'tampered', type: 'FAKE', source: 'x', target: 'y' });

  assert.deepEqual(source, before);
});

test('every decision node copies the actual engine outcome without reclassification', () => {
  const props = [
    prop('DOC-A', 'AUTO_PATCH'),
    prop('DOC-U1', 'ESCALATE', 'U1'),
    prop('DOC-U2', 'ESCALATE', 'U2'),
    prop('DOC-U3', 'ESCALATE', 'U3')
  ];
  const graph = ImpactGraph.buildImpactGraph(input(props));

  for (const p of props) {
    const decision = node(graph, decisionId(p.docId));
    assert.equal(decision.outcome, p.outcome);
    assert.equal(decision.category, p.category);
  }
  assert.equal(graph.nodes.some(item => item.outcome === 'NOT_AFFECTED'), false);
});

test('a refusal is represented only when supplied as an actual engine result', () => {
  const refused = { ...prop('DOC-A', 'REFUSE', null), reason: 'Engine refused this request.' };
  const graph = ImpactGraph.buildImpactGraph(input([refused]));

  assert.equal(node(graph, decisionId('DOC-A')).outcome, 'REFUSE');
});
