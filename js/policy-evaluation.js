// @ts-check
/**
 * Báo cáo độ chính xác trên tập kiểm thử độc lập — yêu cầu nâng cao #2 của Đề A.
 *
 * Định nghĩa (theo góc nhìn rủi ro vận hành):
 * - Bỏ sót (miss): ca đáng lẽ phải chuyển tiếp cho người (U1/U2/U3) nhưng hệ thống tự sửa hoặc không phát hiện.
 *   Đây là lỗi nguy hiểm — văn bản bị sửa sai mà không ai duyệt.
 * - Chuyển tiếp thừa (over-escalation): ca đáng lẽ tự sửa được nhưng hệ thống lại hỏi người.
 *   Lỗi này tốn thời gian nhưng an toàn.
 *
 * Định dạng CSV: id,rule_id,new_value,issuer_tier,doc_tier,line,expected — expected ∈ {AUTO,U1,U2,U3}.
 * Mỗi dòng được đặt vào một tài liệu tổng hợp riêng rồi chạy qua ĐÚNG động cơ đang dùng trong sản phẩm.
 */
(function attachPolicyEvaluation(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const g = /** @type {any} */ (root || {});
  // @ts-ignore
  const Engine = typeof module === 'object' && module.exports ? require('./policy-engine.js') : g.PolicyChangeEngine;
  const api = factory(Engine);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeEvaluation = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyEvaluation(/** @type {any} */ Engine) {
  'use strict';

  const LABELS = Object.freeze(['AUTO', 'U1', 'U2', 'U3']);
  const ACTUAL_LABELS = Object.freeze(['AUTO', 'U1', 'U2', 'U3', 'NONE']);
  const COLUMNS = Object.freeze(['id', 'rule_id', 'new_value', 'issuer_tier', 'doc_tier', 'line', 'expected']);

  /**
   * @typedef {{ id:string, ruleId:string, newValue:string, issuerTier:number, docTier:number, line:string, expected:'AUTO'|'U1'|'U2'|'U3' }} EvalCase
   * @typedef {{ id:string, expected:string, actual:string, ok:boolean, kind:'correct'|'miss'|'over'|'wrong_category'|'wrong', line:string, reason:string }} EvalRow
   */

  /**
   * Bộ đọc CSV nhỏ theo RFC 4180: ngoặc kép, dấu phẩy trong ngoặc, "" thoát, BOM, CRLF, dòng trống.
   * @param {string} text @returns {string[][]}
   */
  function parseRows(text) {
    const src = String(text || '').replace(/^﻿/, '');
    /** @type {string[][]} */ const rows = [];
    /** @type {string[]} */ let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"' && field === '') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(cell => cell.trim() !== '')) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some(cell => cell.trim() !== '')) rows.push(row);
    return rows;
  }

  /**
   * @param {string} text
   * @returns {{ cases:EvalCase[], errors:string[] }}
   */
  function parseCsv(text) {
    const rows = parseRows(text);
    /** @type {string[]} */ const errors = [];
    /** @type {EvalCase[]} */ const cases = [];
    if (!rows.length) return { cases, errors: ['Tệp CSV rỗng.'] };
    const header = rows[0].map(h => h.trim().toLowerCase());
    const index = Object.fromEntries(COLUMNS.map(c => [c, header.indexOf(c)]));
    const missing = COLUMNS.filter(c => index[c] < 0);
    if (missing.length) return { cases, errors: ['Thiếu cột: ' + missing.join(', ') + '.'] };
    rows.slice(1).forEach((cells, n) => {
      const get = (/** @type {string} */ c) => String(cells[index[c]] ?? '').trim();
      const item = { id: get('id') || 'row-' + (n + 2), ruleId: get('rule_id'), newValue: get('new_value'),
        issuerTier: Number(get('issuer_tier')), docTier: Number(get('doc_tier')), line: get('line'),
        expected: /** @type {any} */ (get('expected').toUpperCase()) };
      if (!item.ruleId || !item.newValue || !item.line || ![1, 2, 3].includes(item.issuerTier) || ![1, 2, 3].includes(item.docTier) ||
          !LABELS.includes(item.expected)) {
        errors.push('Dòng ' + (n + 2) + ' (' + item.id + ') không hợp lệ.');
        return;
      }
      cases.push(item);
    });
    return { cases, errors };
  }

  /**
   * Chạy một ca qua động cơ tiền định.
   * @param {EvalCase} c @param {ReadonlyArray<any>} registry
   */
  function classify(c, registry) {
    const rule = registry.find(r => r.id === c.ruleId);
    if (!rule) return { actual: 'NONE', reason: 'Quy định không có trong sổ đăng ký.', change: null, doc: null, props: [] };
    const change = { rule, oldValue: rule.value, newValue: c.newValue, issuerTier: c.issuerTier };
    const doc = { id: 'EVAL-' + c.id, title: 'Ca đánh giá ' + c.id, owner: 'Tập đánh giá', tier: c.docTier, version: '1.0', lines: [c.line] };
    const { props } = Engine.analyze(change, [doc], registry);
    if (!props.length) return { actual: 'NONE', reason: 'Động cơ không tìm thấy giá trị cũ “' + rule.value + '” trong dòng.', change, doc, props };
    return { actual: props[0].outcome === 'AUTO_PATCH' ? 'AUTO' : props[0].category, reason: props[0].reason, change, doc, props };
  }

  /**
   * Gom kết quả thành báo cáo. `actual` có thể là 'HOLD' khi lớp AI ngữ nghĩa giữ một AUTO_PATCH lại cho người
   * duyệt — tính là chuyển tiếp (không bỏ sót) nhưng không tính vào độ đúng của nhãn U1/U2/U3.
   * @param {ReadonlyArray<EvalCase>} cases @param {{ actual:string, reason:string }[]} results
   */
  function summarize(cases, results) {
    /** @type {Record<string, Record<string, number>>} */
    const confusion = Object.fromEntries(LABELS.map(e => [e, Object.fromEntries([...ACTUAL_LABELS, 'HOLD'].map(a => [a, 0]))]));
    /** @type {EvalRow[]} */ const rows = [];
    let misses = 0, over = 0, expectedEscalate = 0, expectedAuto = 0, catRight = 0, catTotal = 0;
    cases.forEach((c, i) => {
      const { actual, reason } = results[i];
      confusion[c.expected][actual] = (confusion[c.expected][actual] || 0) + 1;
      const expectEsc = c.expected !== 'AUTO';
      const actualEsc = actual === 'U1' || actual === 'U2' || actual === 'U3' || actual === 'HOLD';
      /** @type {EvalRow['kind']} */ let kind = 'correct';
      if (expectEsc) {
        expectedEscalate++;
        if (!actualEsc) { misses++; kind = 'miss'; }
        else if (actual !== 'HOLD') { catTotal++; if (actual === c.expected) catRight++; else kind = 'wrong_category'; }
      } else {
        expectedAuto++;
        if (actualEsc) { over++; kind = 'over'; }
        else if (actual !== 'AUTO') kind = 'wrong';
      }
      rows.push({ id: c.id, expected: c.expected, actual, ok: kind === 'correct', kind, line: c.line, reason });
    });
    const correct = rows.filter(r => r.ok).length;
    const rate = (/** @type {number} */ a, /** @type {number} */ b) => b ? a / b : 0;
    return {
      total: rows.length, correct, accuracy: rate(correct, rows.length),
      expectedEscalate, expectedAuto, misses, overEscalations: over,
      missRate: rate(misses, expectedEscalate), overEscalationRate: rate(over, expectedAuto),
      categoryAccuracy: catTotal ? catRight / catTotal : null,
      confusion, rows
    };
  }

  /**
   * Đánh giá chỉ với động cơ tiền định (đồng bộ, tái lập được, dùng trong CI).
   * @param {ReadonlyArray<EvalCase>} cases
   * @param {{ registry:ReadonlyArray<any> }} env
   */
  function evaluate(cases, env) {
    return summarize(cases, cases.map(c => classify(c, env.registry)));
  }

  /**
   * Đánh giá động cơ + lớp AI ngữ nghĩa thật (qua adapter). AI chỉ có thể giữ lại một AUTO_PATCH, không bao giờ
   * nâng một ca chuyển tiếp thành tự sửa — đúng như luồng sản phẩm.
   * @param {ReadonlyArray<EvalCase>} cases
   * @param {{ registry:ReadonlyArray<any>, semantic:any, adapter:any, onProgress?:(done:number, total:number) => void }} env
   */
  async function evaluateWithSemantics(cases, env) {
    const results = [];
    let aiCalls = 0, aiUnavailable = 0;
    for (let i = 0; i < cases.length; i++) {
      const base = classify(cases[i], env.registry);
      if (base.actual === 'AUTO' && base.change && env.adapter) {
        aiCalls++;
        const res = await env.semantic.discoverSemantics({ requestText: '', change: base.change, props: base.props,
          docs: [base.doc], registry: env.registry, matchesOldValue: Engine.matchesOldValue, adapter: env.adapter });
        if (res.status !== 'complete') aiUnavailable++;
        const held = res.status === 'complete' && res.props[0] && res.props[0].semanticHold;
        results.push(held ? { actual: 'HOLD', reason: 'AI ngữ nghĩa giữ lại: ' + (res.props[0].semanticEvidence || []).map((/** @type {any} */ e) => e.explanation).join(' ') } : base);
      } else results.push(base);
      if (env.onProgress) env.onProgress(i + 1, cases.length);
    }
    return { ...summarize(cases, results), aiCalls, aiUnavailable };
  }

  /** @param {ReturnType<typeof evaluate>} report @returns {string} */
  function toCsv(report) {
    const esc = (/** @type {unknown} */ v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return ['id,expected,actual,kind,line,reason', ...report.rows.map(r => [r.id, r.expected, r.actual, r.kind, r.line, r.reason].map(esc).join(','))].join('\n');
  }

  return Object.freeze({ LABELS, COLUMNS, parseRows, parseCsv, classify, evaluate, evaluateWithSemantics, toCsv });
});
