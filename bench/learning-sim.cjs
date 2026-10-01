'use strict';
// Mô phỏng vòng "học từ phản hồi" (yêu cầu nâng cao #1 của Đề A) và đo nó bằng tập mù:
//   1. Chạy động cơ trên TẬP PHÁT TRIỂN (bench/holdout.csv). Mỗi dòng bị đẩy lên U1 được "người phụ trách" trả lời
//      theo nhãn đúng: nhãn AUTO → "Có, thuộc quy định"; nhãn U1 → "Không".
//   2. Lấy đề xuất neo (Learning.suggestAnchors), giả định trưởng đơn vị duyệt hết, thêm vào sổ đăng ký.
//   3. Chấm lại TẬP MÙ (bench/blind.csv) — tập này không tham gia bước 1–2 — trước và sau khi học.
// Chạy: node bench/learning-sim.cjs [--min-support=N]
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Workflow = require('../js/policy-workflow.js');
const Learning = require('../js/policy-learning.js');
const Evaluation = require('../js/policy-evaluation.js');

const arg = process.argv.find(a => a.startsWith('--min-support='));
const minSupport = arg ? Number(arg.split('=')[1]) : 2;
const load = f => Evaluation.parseCsv(fs.readFileSync(path.join(__dirname, f), 'utf8')).cases;
const dev = load('holdout.csv');
const blind = load('blind.csv');

function run(minS) {
  const registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
  const before = Evaluation.evaluate(blind, { registry });
  const feedback = [];
  for (const c of dev) {
    const r = Evaluation.classify(c, registry);
    if (r.actual !== 'U1') continue;
    if (c.expected !== 'AUTO' && c.expected !== 'U1') continue;
    feedback.push({ ruleId: c.ruleId, category: 'U1', docId: 'DEV-' + c.id, lineIndex: 0, line: c.line, answer: c.expected === 'AUTO' ? 'accept' : 'reject' });
  }
  const suggestions = Learning.suggestAnchors(feedback, registry, { minSupport: minS, limit: 3 });
  const state = { registry, docs: [], current: null, ledger: [] };
  const applied = suggestions.map(s => ({ ...s, ok: Workflow.addAnchor(state, s.ruleId, s.phrase, { now: () => 't', actor: 'Người · trưởng đơn vị (mô phỏng)', field: s.field }).ok }));
  const after = Evaluation.evaluate(blind, { registry: state.registry });
  return { feedback, applied, before, after };
}

const r = run(minSupport);
const pct = x => (x * 100).toFixed(1) + '%';
console.log('Phản hồi từ tập phát triển: ' + r.feedback.length + ' câu trả lời U1 (' + r.feedback.filter(f => f.answer === 'accept').length + ' "Có", ' + r.feedback.filter(f => f.answer === 'reject').length + ' "Không"), minSupport = ' + minSupport);
console.log('Neo được đề xuất và duyệt: ' + (r.applied.filter(a => a.ok).map(a => a.ruleId + ' «' + a.phrase + '» (' + a.field + ')').join(', ') || 'không có'));
for (const [k, v] of [['Trước khi học', r.before], ['Sau khi học ', r.after]]) {
  console.log(k + ' · tập mù: sửa sai ' + v.wrongEdits + ' · bỏ sót ' + v.misses + '/' + v.expectedEscalate + ' · báo lên thừa ' + v.overEscalations + '/' + (v.expectedAuto + v.expectedNone) + ' (' + pct(v.overEscalationRate) + ') · đúng ' + v.correct + '/' + v.total);
}
