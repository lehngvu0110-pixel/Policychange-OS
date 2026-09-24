(function attachPolicyProver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangePolicyProver = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyProver() {
  'use strict';

  const VERSION = 1;
  const RELATIONS = new Set(['supports', 'possibly_related', 'unrelated', 'uncertain']);

  function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function stableId(parts) {
    const source = parts.map(value => String(value == null ? '' : value)).join('\u0000');
    let hash = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return 'proof-v1-' + hash.toString(16).padStart(8, '0');
  }

  function check(checks, id, passed, detail) {
    checks.push({ id, passed: passed === true, detail });
  }

  function quoteMatches(line, evidence) {
    return isRecord(evidence) && typeof evidence.quote === 'string' && evidence.quote.length > 0 &&
      Number.isInteger(evidence.start) && Number.isInteger(evidence.end) &&
      evidence.start >= 0 && evidence.end > evidence.start && evidence.end <= line.length &&
      evidence.end - evidence.start === evidence.quote.length &&
      line.slice(evidence.start, evidence.end) === evidence.quote;
  }

  function isStructuredNumericOccurrence(line, index, text) {
    const numeric = String(text || '').match(/^[\d.,]+/);
    if (!numeric) return false;
    const before = index > 0 ? line[index - 1] : '';
    const after = line[index + numeric[0].length] || '';
    if (/[\d/]/.test(before) || /[\d/]/.test(after)) return true;
    const beforePrevious = index > 1 ? line[index - 2] : '';
    const afterNext = line[index + numeric[0].length + 1] || '';
    return (/[.,]/.test(before) && /\d/.test(beforePrevious)) || (/[.,]/.test(after) && /\d/.test(afterNext));
  }

  function evidenceCheck(prop, rule, doc, line, humanApproved, validatedEvidence) {
    const hasEvidence = Object.prototype.hasOwnProperty.call(prop, 'semanticEvidence');
    const evidence = hasEvidence ? prop.semanticEvidence : [];
    if (!hasEvidence && prop.semanticHold !== true) return { valid: true, refs: [], detail: 'No semantic evidence was attached.' };
    if (!Array.isArray(evidence) || evidence.length > 40) return { valid: false, refs: [], detail: 'Semantic evidence is malformed.' };
    if (prop.semanticHold === true && !humanApproved) return { valid: false, refs: [], detail: 'Semantic evidence is held for human review.' };
    if (prop.semanticHoldReviewed === true && prop.semanticHoldApproved !== true) return { valid: false, refs: [], detail: 'Human review rejected this semantic proposal.' };

    const refs = [];
    for (let index = 0; index < evidence.length; index++) {
      const item = evidence[index];
      if (!isRecord(item) || !RELATIONS.has(item.relation) || typeof item.explanation !== 'string' || item.explanation.length > 600 ||
          !quoteMatches(line, item) || !Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.length > 8 ||
          !item.evidence.every(excerpt => quoteMatches(line, excerpt))) {
        return { valid: false, refs: [], detail: 'Semantic evidence failed line, quote, relation, or excerpt validation.' };
      }
      if (item.relation !== 'supports' && !humanApproved) {
        return { valid: false, refs: [], detail: 'Non-supporting or uncertain semantic evidence requires human review.' };
      }
      const source = Array.isArray(validatedEvidence) && validatedEvidence.find(candidate => candidate &&
        candidate.ruleId === rule.id && candidate.documentId === doc.id && candidate.lineIndex === prop.lineIndex &&
        candidate.relation === item.relation && candidate.quote === item.quote && candidate.start === item.start && candidate.end === item.end &&
        candidate.explanation === item.explanation && JSON.stringify(candidate.evidence) === JSON.stringify(item.evidence));
      if (!source) return { valid: false, refs: [], detail: 'Evidence is not present in the accepted Phase 2 validation result for this policy, document, and line.' };
      refs.push({ ruleId: rule.id, documentId: doc.id, lineIndex: prop.lineIndex, evidenceIndex: index, relation: item.relation, quote: item.quote, start: item.start, end: item.end });
    }
    if (prop.semanticRelation === 'conflict' && !humanApproved) return { valid: false, refs: [], detail: 'Conflicting semantic relations require human review.' };
    return { valid: true, refs, detail: humanApproved ? 'Evidence was revalidated and explicitly approved by a human reviewer.' : 'Evidence was revalidated against this registered policy and exact current clause.' };
  }

  function proveAutomaticPatch(change, document, proposal, context) {
    const ctx = isRecord(context) ? context : {};
    const prop = isRecord(proposal) ? proposal : {};
    const checks = [];
    const reasons = [];
    const registry = Array.isArray(ctx.registry) ? ctx.registry : [];
    const docs = Array.isArray(ctx.docs) ? ctx.docs : [];
    const validTop = isRecord(change) && isRecord(document) && isRecord(proposal) &&
      typeof proposal.docId === 'string' && Number.isInteger(proposal.lineIndex) && proposal.lineIndex >= 0;
    check(checks, 'well_formed_input', validTop, validTop ? 'Change, document, and proposal references are present.' : 'Required proof inputs are malformed or missing.');

    const ruleId = change && change.rule && typeof change.rule.id === 'string' ? change.rule.id : null;
    const rule = ruleId ? registry.find(item => item && item.id === ruleId) : null;
    const registryValid = !!rule && !!change.rule && change.rule.value === rule.value && Array.isArray(rule.aliases) && rule.aliases.length > 0;
    check(checks, 'registry_membership', registryValid, registryValid ? 'Requested policy is present in the current registry.' : 'Requested policy is absent, inconsistent, or has no registered scope aliases.');

    const oldParsed = typeof ctx.parseValue === 'function' && change ? ctx.parseValue(change.oldValue) : null;
    const registeredParsed = rule && typeof ctx.parseValue === 'function' ? ctx.parseValue(rule.value) : null;
    const newParsed = typeof ctx.parseValue === 'function' && change ? ctx.parseValue(change.newValue) : null;
    const oldValueValid = !!oldParsed && !!registeredParsed && Number.isFinite(oldParsed.num) && oldParsed.num === registeredParsed.num &&
      String(oldParsed.unit || '').toLowerCase() === String(registeredParsed.unit || '').toLowerCase();
    check(checks, 'registered_old_value', oldValueValid, oldValueValid ? 'Requested old value matches the registered current value.' : 'Requested old value does not match the registered value.');
    const newValueValid = !!oldParsed && !!newParsed && Number.isFinite(newParsed.num) && newParsed.num !== oldParsed.num &&
      String(newParsed.unit || '').toLowerCase() === String(oldParsed.unit || '').toLowerCase() &&
      typeof change.newValue === 'string' && change.newValue.trim().length > 0;
    check(checks, 'new_value_valid', newValueValid, newValueValid ? 'New value is parseable, changes the old value, and preserves its unit.' : 'New value is invalid, unchanged, or changes the registered unit.');

    const proposalAuto = prop.outcome === 'AUTO_PATCH' && (prop.category === null || prop.category === undefined);
    check(checks, 'engine_proposed_auto', proposalAuto, proposalAuto ? 'The existing engine proposed AUTO_PATCH.' : 'Only an existing AUTO_PATCH can be proved; escalation or review cannot be upgraded.');

    const docsEntry = typeof prop.docId === 'string' ? docs.find(item => item && item.id === prop.docId) : null;
    const docKnown = !!docsEntry && !!document && document.id === prop.docId && docsEntry.id === document.id;
    check(checks, 'document_membership', docKnown, docKnown ? 'Target document is present in the current document set.' : 'Target document is absent or does not match the proposal.');
    const line = docKnown && Array.isArray(document.lines) && prop.lineIndex < document.lines.length ? document.lines[prop.lineIndex] : null;
    const exactLine = typeof line === 'string' && line === prop.line && typeof prop.newLine === 'string';
    check(checks, 'current_line_snapshot', exactLine, exactLine ? 'Current document line still matches the analyzed snapshot.' : 'Target line is missing or stale.');

    const oldRegex = typeof ctx.valueRegex === 'function' && change ? ctx.valueRegex(change.oldValue) : null;
    let currentHits = [];
    if (typeof line === 'string' && oldRegex instanceof RegExp) {
      oldRegex.lastIndex = 0;
      let match;
      while ((match = oldRegex.exec(line)) !== null) {
        if (!isStructuredNumericOccurrence(line, match.index, match[0])) {
          currentHits.push({ index: match.index, text: match[0] });
        }
        if (match.index === oldRegex.lastIndex) oldRegex.lastIndex++;
      }
    }
    const exactHits = currentHits.length > 0 && Array.isArray(prop.hits) && JSON.stringify(currentHits) === JSON.stringify(prop.hits);
    check(checks, 'exact_old_value_occurrences', exactHits, exactHits ? 'All replacement locations match the engine snapshot.' : 'Old value occurrences are absent or differ from the analyzed locations.');

    let deterministicLine = null;
    if (typeof line === 'string' && oldRegex instanceof RegExp && typeof ctx.renderValue === 'function' && change) {
      oldRegex.lastIndex = 0;
      deterministicLine = line.replace(oldRegex, (match, index) => isStructuredNumericOccurrence(line, index, match)
        ? match : ctx.renderValue(match, change.newValue));
    }
    const exactReplacement = typeof deterministicLine === 'string' && prop.newLine === deterministicLine && deterministicLine !== line;
    check(checks, 'targeted_replacement_only', exactReplacement, exactReplacement ? 'Proposed line equals the deterministic value-only replacement.' : 'Proposed line contains a global, unrelated, missing, or no-op replacement.');

    const aliases = rule && Array.isArray(rule.aliases) ? rule.aliases.filter(alias => typeof alias === 'string' && alias.length && typeof line === 'string' && line.toLowerCase().includes(alias.toLowerCase())) : [];
    const owners = typeof line === 'string' && typeof ctx.ownersOfLine === 'function' ? ctx.ownersOfLine(line) : [];
    const targetAnchored = !!rule && aliases.length > 0 && Array.isArray(owners) && owners.some(owner => owner && owner.id === rule.id);
    check(checks, 'registered_policy_anchor', targetAnchored, targetAnchored ? 'Current clause contains an anchor for the requested registered policy.' : 'Current clause has no validated anchor for the requested policy.');

    let engineProp = null;
    let engineError = false;
    if (typeof ctx.analyze === 'function' && validTop && docKnown) {
      try {
        const rerun = ctx.analyze(change, [document]);
        const candidates = rerun && Array.isArray(rerun.props) ? rerun.props.filter(item => item && item.docId === prop.docId && item.lineIndex === prop.lineIndex) : [];
        if (candidates.length === 1) engineProp = candidates[0];
      } catch (_error) { engineError = true; }
    }
    const engineMatches = !!engineProp && engineProp.outcome === 'AUTO_PATCH' && !engineProp.category &&
      engineProp.line === prop.line && engineProp.newLine === prop.newLine && JSON.stringify(engineProp.hits) === JSON.stringify(prop.hits);
    check(checks, 'deterministic_recheck', engineMatches, engineMatches ? 'The unchanged deterministic engine reproduces this exact AUTO_PATCH.' : (engineError ? 'Deterministic recheck failed.' : 'Deterministic recheck disagrees, escalates, or does not uniquely reproduce this proposal.'));

    const authorityValid = !!engineProp && engineProp.outcome === 'AUTO_PATCH' && !engineProp.category &&
      Number.isInteger(change && change.issuerTier) && change.issuerTier >= 1 && change.issuerTier <= 3 &&
      Number.isInteger(document && document.tier) && document.tier >= 1 && document.tier <= change.issuerTier;
    check(checks, 'authority', authorityValid, authorityValid ? 'Deterministic engine permits this document authority tier.' : 'Authority is invalid or the engine classifies this as U3 or another escalation.');

    const approved = prop.semanticHoldReviewed === true && prop.semanticHoldApproved === true;
    const evidence = evidenceCheck(prop, rule || { id: ruleId }, document || { id: prop.docId }, typeof line === 'string' ? line : '', approved, ctx.validatedEvidence);
    check(checks, 'semantic_evidence', registryValid && docKnown && evidence.valid, registryValid && docKnown && evidence.valid ? evidence.detail : (evidence.detail || 'Semantic evidence has no registered policy or document binding.'));

    const allowed = checks.every(item => item.passed);
    if (!allowed) reasons.push(...checks.filter(item => !item.passed).map(item => item.detail));
    const proofId = stableId([ruleId, prop.docId, prop.lineIndex, prop.line, change && change.oldValue, change && change.newValue, change && change.issuerTier]);
    return {
      schemaVersion: VERSION,
      proofId,
      allowed,
      decision: allowed ? 'AUTO_PATCH' : 'HOLD',
      checks,
      reasons,
      ruleId,
      documentId: prop.docId || null,
      lineIndex: Number.isInteger(prop.lineIndex) ? prop.lineIndex : null,
      engineDecision: engineProp && typeof engineProp.outcome === 'string' ? engineProp.outcome : null,
      engineCategory: engineProp && typeof engineProp.category === 'string' ? engineProp.category : null,
      analyzedLine: typeof prop.line === 'string' ? prop.line : null,
      proposedLine: typeof prop.newLine === 'string' ? prop.newLine : null,
      from: typeof prop.line === 'string' ? prop.line : null,
      to: typeof prop.newLine === 'string' ? prop.newLine : null,
      oldValue: change && typeof change.oldValue === 'string' ? change.oldValue : null,
      newValue: change && typeof change.newValue === 'string' ? change.newValue : null,
      policyBasis: rule ? { id: rule.id, name: rule.name || null, source: rule.source || null } : null,
      authority: { issuerTier: change && Number.isInteger(change.issuerTier) ? change.issuerTier : null, documentTier: document && Number.isInteger(document.tier) ? document.tier : null, permits: authorityValid },
      anchor: { policyId: ruleId, aliases },
      evidenceRefs: evidence.refs,
      reversible: exactLine && exactReplacement && typeof prop.line === 'string' && typeof prop.newLine === 'string'
    };
  }

  return Object.freeze({ VERSION, proveAutomaticPatch });
});
