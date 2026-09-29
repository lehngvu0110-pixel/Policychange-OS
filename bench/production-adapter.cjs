'use strict';

// Nạp động cơ thật của ứng dụng cho benchmark. Từ Sprint 2 động cơ nằm trong các module
// js/*.js dùng chung với trình duyệt và Edge Function, nên adapter chỉ cần require — không
// còn trích mã bằng biểu thức chính quy từ index.html.

const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Ledger = require('../js/policy-ledger.js');
const Workflow = require('../js/policy-workflow.js');

const clone = value => JSON.parse(JSON.stringify(value));

function loadProductionEngine(options = {}) {
  const registry = Array.isArray(options.registry) ? clone(options.registry) : Engine.cloneRegistry(Data.SEED_REGISTRY);
  const fixedNow = () => new Date().toISOString();

  const runtime = {
    registry: clone(registry),
    parseValue: value => clone(Engine.parseValue(value)),
    valueRegex: value => {
      const expression = Engine.valueRegex(value);
      return new RegExp(expression.source, expression.flags);
    },
    renderValue: (template, value) => Engine.renderValue(template, value),
    ownersOfLine: line => clone(Engine.ownersOfLine(line, registry)),
    analyze: (change, docs) => {
      const result = Engine.analyze(change, docs, registry);
      // Benchmark không đo độ trễ; giữ 0 để kết quả tái lập được giữa các lần chạy.
      return clone({ ...result, elapsedMs: 0 });
    },
    parseFreeText: text => clone(Engine.parseFreeText(text, registry))
  };

  runtime.commit = ({ appState, documents, auditLedger = [] }) => {
    const state = { registry, docs: clone(documents), current: clone(appState), ledger: clone(auditLedger) };
    const result = Workflow.commit(state, { now: fixedNow });
    return {
      documents: clone(state.docs),
      appState: clone(state.current),
      ledger: clone(state.ledger),
      commitMessage: result.message
    };
  };

  runtime.undo = ({ appState, documents, auditLedger, seq }) => {
    const state = { registry, docs: clone(documents), current: clone(appState), ledger: clone(auditLedger) };
    const result = Workflow.undo(state, seq, { now: fixedNow });
    return {
      documents: clone(state.docs), appState: clone(state.current), ledger: clone(state.ledger),
      message: result.ok ? result.message : result.message, chainValid: Ledger.verify(state.ledger)
    };
  };

  runtime.verifyLedger = auditLedger => Ledger.verify(auditLedger);
  return runtime;
}

module.exports = Object.freeze({ loadProductionEngine });
