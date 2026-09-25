'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const SemanticDiscovery = require('../js/semantic-discovery.js');
const PolicyProver = require('../js/policy-prover.js');

function requiredMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error('Production adapter could not extract ' + label + ' from index.html.');
  return match[0];
}

function functionSource(source, name) {
  const declaration = new RegExp('function\\s+' + name + '\\s*\\(');
  const match = declaration.exec(source);
  if (!match) throw new Error('Production adapter could not extract function ' + name + ' from index.html.');
  const opening = source.indexOf('{', match.index);
  const lineEnd = source.indexOf('\n', opening);
  const inlineClose = source.lastIndexOf('}', lineEnd);
  if (inlineClose > opening && (lineEnd < 0 || inlineClose < lineEnd)) {
    return source.slice(match.index, inlineClose + 1);
  }
  const tail = source.slice(match.index);
  return requiredMatch(tail, /function[^\n]*\n[\s\S]*?^\}/m, 'function ' + name);
}

function loadProductionEngine(options = {}) {
  const htmlPath = options.htmlPath || require('node:path').join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const proverSource = fs.readFileSync(require('node:path').join(__dirname, '..', 'js', 'policy-prover.js'), 'utf8');
  const shaConstants = requiredMatch(html, /const SHA_K\s*=\s*\[[^\]]*\];/, 'SHA_K audit constants');
  const productionRules = requiredMatch(html, /const RULES\s*=\s*\[[\s\S]*?\n\];/, 'RULES registry');
  const ruleLiteral = Array.isArray(options.registry)
    ? 'const RULES = ' + JSON.stringify(options.registry) + ';'
    : productionRules;
  const tierLabels = requiredMatch(html, /const TIER_LABEL\s*=\s*\{[^;]*;/, 'TIER_LABEL');
  const tierApprovers = requiredMatch(html, /const TIER_APPROVER\s*=\s*\{[^;]*;/, 'TIER_APPROVER');
  const commitHandler = html.match(/^\$\("commitBtn"\)\.addEventListener\("click",\s*(\(\)=>\{[\s\S]*?^\})\);/m);
  if (!commitHandler) throw new Error('Production adapter could not extract the existing commit handler from index.html.');
  const definitions = [
    shaConstants,
    ruleLiteral,
    tierLabels,
    tierApprovers,
    functionSource(html, 'escRe'),
    functionSource(html, 'parseValue'),
    functionSource(html, 'valueRegex'),
    functionSource(html, 'renderValue'),
    functionSource(html, 'isStructuredNumericOccurrence'),
    functionSource(html, 'ownersOfLine'),
    functionSource(html, 'analyze'),
    functionSource(html, 'parseFreeText'),
    functionSource(html, 'proveProposal'),
    functionSource(html, 'sha256Hex'),
    functionSource(html, 'ledgerPayload'),
    functionSource(html, 'verifyLedger'),
    functionSource(html, 'isReverted'),
    functionSource(html, 'appendLedger'),
    functionSource(html, 'bumpVersion'),
    functionSource(html, 'undo'),
    proverSource,
    'let docs = []; let current = null; let ledger = []; let ledgerSeq = 0;',
    'this.__commitPolicyChange = ' + commitHandler[1] + ';',
    'this.__setPolicyBenchmarkState = (state, documents, audit) => { current = JSON.parse(JSON.stringify(state)); docs = JSON.parse(JSON.stringify(documents)); ledger = JSON.parse(JSON.stringify(audit)); ledgerSeq = ledger.length ? ledger[ledger.length - 1].seq : 0; };',
    'this.__getPolicyBenchmarkState = () => ({ current, docs, ledger });',
    'this.__undoPolicyChange = undo; this.__verifyPolicyLedger = verifyLedger;',
    'this.__policyBenchmarkExports = { RULES, parseValue, valueRegex, renderValue, ownersOfLine, analyze, parseFreeText };'
  ].join('\n');
  const commitMessage = { textContent:'' };
  const sandbox = {
    performance:{ now:() => 0 }, console, TextEncoder, Uint8Array, DataView, Uint32Array,
    $:() => commitMessage, renderAll:() => {}, renderLedger:() => {},
    PolicyChangeSemanticDiscovery:SemanticDiscovery
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(definitions, context, { filename:'index.html#policy-engine', timeout:1000 });
  const api = sandbox.__policyBenchmarkExports;
  const clone = value => JSON.parse(JSON.stringify(value));

  const runtime = {
    registry: clone(api.RULES),
    parseValue: value => clone(api.parseValue(value)),
    valueRegex: value => {
      const expression = api.valueRegex(value);
      return new RegExp(expression.source, expression.flags);
    },
    renderValue: (template, value) => api.renderValue(template, value),
    ownersOfLine: line => clone(api.ownersOfLine(line)),
    analyze: (change, docs) => clone(api.analyze(change, docs)),
    parseFreeText: text => clone(api.parseFreeText(text))
  };
  runtime.commit = ({ appState, documents, auditLedger = [] }) => {
    context.__setPolicyBenchmarkState(appState, documents, auditLedger);
    context.__commitPolicyChange();
    const committedState = context.__getPolicyBenchmarkState();
    return {
      documents:clone(committedState.docs),
      appState:clone(committedState.current),
      ledger:clone(committedState.ledger),
      commitMessage:commitMessage.textContent
    };
  };
  runtime.undo = ({ appState, documents, auditLedger, seq }) => {
    commitMessage.textContent = '';
    context.__setPolicyBenchmarkState(appState, documents, auditLedger);
    context.__undoPolicyChange(seq);
    const state = context.__getPolicyBenchmarkState();
    return { documents:clone(state.docs), appState:clone(state.current), ledger:clone(state.ledger),
      message:commitMessage.textContent, chainValid:context.__verifyPolicyLedger() };
  };
  runtime.verifyLedger = auditLedger => {
    context.__setPolicyBenchmarkState({}, [], auditLedger);
    return context.__verifyPolicyLedger();
  };
  return runtime;
}

module.exports = Object.freeze({ loadProductionEngine });
