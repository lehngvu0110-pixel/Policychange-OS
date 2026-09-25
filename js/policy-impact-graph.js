(function attachPolicyImpactGraph(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeImpactGraph = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyImpactGraph() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const AI_RELATIONS = new Set(['supports', 'possibly_related', 'unrelated', 'uncertain']);

  function part(value) { return encodeURIComponent(String(value)); }
  const ids = Object.freeze({
    policy: ruleId => 'policy:' + part(ruleId),
    document: documentId => 'document:' + part(documentId),
    clause: (documentId, lineIndex) => 'clause:' + part(documentId) + ':' + lineIndex,
    decision: (ruleId, documentId, lineIndex) =>
      'decision:' + part(ruleId || 'missing-rule') + ':' + part(documentId) + ':' + lineIndex,
    deterministic: decisionId => 'evidence:deterministic:' + part(decisionId),
    semantic: (decisionId, index) => 'evidence:ai:' + part(decisionId) + ':' + index,
    rejected: (ruleId, index) => 'evidence:ai-rejected:' + part(ruleId || 'missing-rule') + ':' + index,
    pending: ruleId => 'evidence:ai-unvalidated:' + part(ruleId || 'missing-rule'),
    audit: seq => 'audit:' + part(seq),
    edge: (type, source, target) => 'edge:' + part(type) + ':' + part(source) + ':' + part(target)
  });

  function relationForDecision(prop) {
    if (prop.outcome === 'AUTO_PATCH') return 'supports_target';
    if (prop.category === 'U1') return 'unanchored_value';
    if (prop.category === 'U2') return 'same_value_foreign_policy';
    if (prop.category === 'U3') return 'authority_conflict';
    if (prop.outcome === 'REFUSE') return 'refused';
    return 'engine_decision';
  }

  function hasDeterministicTargetAnchor(prop, rule) {
    return !!rule && prop.outcome === 'AUTO_PATCH' &&
      typeof prop.reason === 'string' &&
      prop.reason.startsWith('Dòng có cụm từ neo vào ' + rule.id + ' ');
  }

  function matchesExcerpt(line, excerpt) {
    return !!excerpt && typeof excerpt.quote === 'string' && excerpt.quote.length > 0 &&
      Number.isInteger(excerpt.start) && Number.isInteger(excerpt.end) &&
      excerpt.start >= 0 && excerpt.end > excerpt.start && excerpt.end <= line.length &&
      line.slice(excerpt.start, excerpt.end) === excerpt.quote;
  }

  function stateForHumanReview(prop) {
    if (prop.semanticHold) {
      if (!prop.semanticHoldReviewed) return 'pending';
      return prop.semanticHoldApproved === true ? 'approved' : 'rejected';
    }
    if (prop.decided === true) return prop.accepted === true ? 'approved' : 'rejected';
    return prop.category ? 'pending' : 'not_required';
  }

  function undoTargetSequence(entry) {
    if (!entry || typeof entry.action !== 'string') return null;
    const match = entry.action.match(/^HOÀN TÁC bản ghi #(\d+)$/u);
    if (!match) return null;
    const sequence = Number(match[1]);
    return entry.revertsSeq === undefined || entry.revertsSeq === sequence ? sequence : null;
  }

  function relatedAudit(prop, ledger) {
    const entries = Array.isArray(ledger) ? ledger : [];
    const patches = entries.filter(entry => entry && entry.docId === prop.docId &&
      entry.lineIndex === prop.lineIndex && entry.propId === prop.id &&
      typeof entry.action === 'string' && entry.action.startsWith('PATCH'));
    const related = new Map();
    for (const entry of patches) related.set(entry.seq, entry);
    for (const entry of entries) {
      if (!entry || entry.docId !== prop.docId) continue;
      const undoSeq = undoTargetSequence(entry);
      if (undoSeq !== null && patches.some(patch => patch.seq === undoSeq)) {
        related.set(entry.seq, entry);
        continue;
      }
      const sameLineAction = entry.action === 'GIỮ NGUYÊN dòng ' + (prop.lineIndex + 1) ||
        entry.action === 'TỪ CHỐI SỬA dòng ' + (prop.lineIndex + 1);
      if (sameLineAction && (entry.propId === prop.id || entry.from === prop.line)) {
        related.set(entry.seq, entry);
      }
    }
    return [...related.values()].sort((left, right) => Number(left.seq) - Number(right.seq));
  }

  function buildImpactGraph(input) {
    const state = input || {};
    const change = state.change || null;
    const props = Array.isArray(state.props) ? state.props : [];
    const docs = Array.isArray(state.docs) ? state.docs : [];
    const registry = Array.isArray(state.registry) ? state.registry : [];
    const ledger = Array.isArray(state.ledger) ? state.ledger : [];
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();
    const edgeIds = new Set();
    const docById = new Map(docs.filter(doc => doc && typeof doc.id === 'string').map(doc => [doc.id, doc]));
    const rule = change && change.rule && registry.find(candidate => candidate && candidate.id === change.rule.id);
    const policyNodeId = rule ? ids.policy(rule.id) : null;

    function addNode(node) {
      if (!node || typeof node.id !== 'string' || nodeIds.has(node.id)) return;
      nodeIds.add(node.id);
      nodes.push(node);
    }

    function addEdge(type, source, target, relation) {
      if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return;
      const id = ids.edge(type, source, target);
      if (edgeIds.has(id)) return;
      edgeIds.add(id);
      edges.push({ id, type, source, target, ...(relation ? { relation } : {}) });
    }

    if (rule) {
      addNode({
        id: policyNodeId, type: 'POLICY', ruleId: rule.id,
        name: rule.name, value: rule.value,
        proposedValue: change.newValue,
        source: rule.source || null, owner: rule.owner || null
      });
    }

    for (const prop of props) {
      if (!prop || typeof prop.docId !== 'string' || !Number.isInteger(prop.lineIndex) || prop.lineIndex < 0) continue;
      const decisionNodeId = ids.decision(change && change.rule && change.rule.id, prop.docId, prop.lineIndex);
      const doc = docById.get(prop.docId);
      const hasCurrentLine = !!doc && Array.isArray(doc.lines) &&
        typeof doc.lines[prop.lineIndex] === 'string';
      const currentLine = hasCurrentLine ? doc.lines[prop.lineIndex] : null;
      const snapshotMatches = hasCurrentLine && currentLine === prop.line;
      const clauseNodeId = hasCurrentLine ? ids.clause(prop.docId, prop.lineIndex) : null;

      if (doc) {
        addNode({
          id: ids.document(doc.id), type: 'DOCUMENT', documentId: doc.id,
          title: doc.title, owner: doc.owner, tier: doc.tier, version: doc.version
        });
      }
      if (hasCurrentLine) {
        addNode({
          id: clauseNodeId, type: 'CLAUSE', documentId: doc.id, lineIndex: prop.lineIndex,
          quote: currentLine, isCurrent: true, matchesAnalysisSnapshot: snapshotMatches
        });
        addEdge('CLAUSE_TO_DOCUMENT', clauseNodeId, ids.document(doc.id));
      }

      const auditEntries = relatedAudit(prop, ledger);
      const reversedPatches = new Set(auditEntries.map(undoTargetSequence).filter(value => value !== null));
      for (const entry of auditEntries) {
        addNode({
          id: ids.audit(entry.seq), type: 'AUDIT_EVENT', sequence: entry.seq,
          timestamp: entry.ts || null, actor: entry.actor || null, action: entry.action,
          basis: entry.basis || null, hash: entry.hash || null, prevHash: entry.prevHash || null,
          reverted: entry.action.startsWith('PATCH') ? reversedPatches.has(entry.seq) : undoTargetSequence(entry) !== null
        });
      }
      const relatedPatches = auditEntries.filter(entry => entry.action.startsWith('PATCH'));
      let ledgerIssueState = null;
      for (const entry of auditEntries) {
        if (entry.action.startsWith('PATCH')) ledgerIssueState = 'issued';
        else if (undoTargetSequence(entry) !== null) ledgerIssueState = 'reverted';
      }
      const issueState = ledgerIssueState ||
        (prop.applied === true ? 'issued' : 'not_issued');

      const decision = {
        id: decisionNodeId, type: 'DECISION', ruleId: change && change.rule ? change.rule.id : null,
        documentId: prop.docId, lineIndex: prop.lineIndex,
        outcome: prop.outcome, category: prop.category || null,
        reason: prop.reason || null, citation: prop.citation || null,
        analyzedLine: typeof prop.line === 'string' ? prop.line : null,
        proposedLine: typeof prop.newLine === 'string' ? prop.newLine : null,
        humanReview: {
          status: stateForHumanReview(prop),
          decisionLabel: prop.decisionLabel || null
        },
        prover: prop.outcome === 'AUTO_PATCH' ? {
          status: prop.proof && prop.proof.allowed === true ? 'passed' : 'held',
          proofId: prop.proof && typeof prop.proof.proofId === 'string' ? prop.proof.proofId : null,
          reasons: prop.proof && Array.isArray(prop.proof.reasons) ? prop.proof.reasons.slice() : []
        } : { status: 'not_required', proofId: null, reasons: [] },
        issueState, applied: prop.applied === true, reverted: issueState === 'reverted',
        matchesAnalysisSnapshot: snapshotMatches
      };
      addNode(decision);

      const deterministicId = ids.deterministic(decisionNodeId);
      addNode({
        id: deterministicId, type: 'DEPENDENCY', source: 'DETERMINISTIC',
        evidenceState: 'DETERMINISTIC', validationState: 'validated',
        relationship: relationForDecision(prop), ruleId: change && change.rule ? change.rule.id : null,
        documentId: prop.docId, lineIndex: prop.lineIndex,
        quote: typeof prop.line === 'string' ? prop.line : null,
        evidence: Array.isArray(prop.hits) ? prop.hits.map(hit => ({
          quote: hit.text, start: hit.index, end: hit.index + String(hit.text || '').length
        })) : [],
        explanation: prop.reason || null, currentClauseMatch: snapshotMatches
      });
      if (policyNodeId) addEdge('DEPENDENCY_TO_POLICY', deterministicId, policyNodeId);
      if (snapshotMatches) {
        addEdge('DEPENDENCY_TO_CLAUSE', deterministicId, clauseNodeId);
        if (hasDeterministicTargetAnchor(prop, rule)) {
          addEdge('POLICY_TO_CLAUSE', policyNodeId, clauseNodeId);
        }
      }
      addEdge('DEPENDENCY_TO_DECISION', deterministicId, decisionNodeId);

      const semanticEvidence = Array.isArray(prop.semanticEvidence) ? prop.semanticEvidence : [];
      semanticEvidence.forEach((evidence, index) => {
        const valid = !!rule && AI_RELATIONS.has(evidence && evidence.relation) &&
          typeof evidence.explanation === 'string' && evidence.explanation.length <= 600 &&
          typeof prop.line === 'string' && matchesExcerpt(prop.line, evidence) &&
          Array.isArray(evidence.evidence) && evidence.evidence.length > 0 &&
          evidence.evidence.length <= 8 && evidence.evidence.every(item => matchesExcerpt(prop.line, item));
        if (!valid) {
          const rejectedId = ids.semantic(decisionNodeId, index);
          addNode({
            id: rejectedId, type: 'DEPENDENCY', source: 'AI',
            evidenceState: 'AI_REJECTED', validationState: 'rejected',
            relationship: evidence && AI_RELATIONS.has(evidence.relation) ? evidence.relation : null,
            ruleId: change && change.rule ? change.rule.id : null,
            documentId: prop.docId, lineIndex: prop.lineIndex,
            quote: evidence && typeof evidence.quote === 'string' ? evidence.quote : null,
            explanation: 'Evidence did not pass graph-time reference validation.',
            currentClauseMatch: false
          });
          return;
        }
        const evidenceId = ids.semantic(decisionNodeId, index);
        addNode({
          id: evidenceId, type: 'DEPENDENCY', source: 'AI',
          evidenceState: 'AI_VALIDATED', validationState: 'validated',
          relationship: evidence.relation, ruleId: change.rule.id,
          documentId: prop.docId, lineIndex: prop.lineIndex,
          quote: evidence.quote,
          evidence: evidence.evidence.map(item => ({ quote: item.quote, start: item.start, end: item.end })),
          explanation: evidence.explanation,
          currentClauseMatch: snapshotMatches
        });
        if (snapshotMatches) addEdge('DEPENDENCY_TO_CLAUSE', evidenceId, clauseNodeId);
        addEdge('DEPENDENCY_TO_POLICY', evidenceId, policyNodeId);
        addEdge('DEPENDENCY_TO_DECISION', evidenceId, decisionNodeId);
      });

      for (const entry of auditEntries) {
        addEdge('DECISION_TO_AUDIT', decisionNodeId, ids.audit(entry.seq));
      }
    }

    const semanticResult = state.semanticResult;
    if (semanticResult && semanticResult.status === 'pending') {
      const pendingId = ids.pending(change && change.rule && change.rule.id);
      addNode({
        id: pendingId, type: 'DEPENDENCY', source: 'AI',
        evidenceState: 'AI_UNVALIDATED', validationState: 'unvalidated',
        relationship: null, ruleId: change && change.rule ? change.rule.id : null,
        explanation: 'Semantic discovery is pending validation; no clause relationship is asserted.'
      });
    } else if (semanticResult && semanticResult.status === 'rejected') {
      const rejected = Array.isArray(semanticResult.rejected) && semanticResult.rejected.length
        ? semanticResult.rejected : [{ reason: 'AI response was rejected.' }];
      rejected.forEach((item, index) => {
        addNode({
          id: ids.rejected(change && change.rule && change.rule.id, index),
          type: 'DEPENDENCY', subtype: 'VALIDATION_REPORT', source: 'AI',
          evidenceState: 'AI_REJECTED', validationState: 'rejected',
          relationship: null, ruleId: change && change.rule ? change.rule.id : null,
          reason: item && typeof item.reason === 'string' ? item.reason : 'AI evidence was rejected.'
        });
      });
    }

    return { schemaVersion: SCHEMA_VERSION, nodes, edges };
  }

  return Object.freeze({ SCHEMA_VERSION, ids, buildImpactGraph });
});
