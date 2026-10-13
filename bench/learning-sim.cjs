'use strict';
// Thí nghiệm vòng "học từ phản hồi" (yêu cầu nâng cao #1 của Đề A), đo trung thực:
// học trên một tập, đo trên một tập KHÁC không tham gia bước học. Câu trả lời của người ở tập học là MÔ PHỎNG
// (trả lời đúng theo nhãn), không phải phản hồi của người thật. Logic: js/policy-learning-eval.js.
// Chạy: npm run eval:learning   (hoặc node bench/learning-sim.cjs --min-support=N)
const fs = require('node:fs');
const path = require('node:path');
const deps = {
  Engine: require('../js/policy-engine.js'), Learning: require('../js/policy-learning.js'),
  Workflow: require('../js/policy-workflow.js'), Evaluation: require('../js/policy-evaluation.js')
};
const Data = require('../js/policy-data.js');
const LearningEval = require('../js/policy-learning-eval.js');

const arg = process.argv.find(a => a.startsWith('--min-support='));
const minSupport = arg ? Number(arg.split('=')[1]) : 2;
const load = f => deps.Evaluation.parseCsv(fs.readFileSync(path.join(__dirname, f), 'utf8')).cases;
const sets = { dev: load('holdout.csv'), blind1: load('blind.csv'), blind2: load('blind2.csv') };
const pct = x => (x * 100).toFixed(1).replace('.', ',') + ' %';

console.log('Học trên → đo trên | câu trả lời mô phỏng (Có/Không) | neo được duyệt | báo lên thừa trước → sau | sửa sai | bỏ sót');
for (const s of LearningEval.splits(sets)) {
  const r = LearningEval.run({ train: s.trainCases, test: s.testCases, registry: Data.SEED_REGISTRY, minSupport, ...deps });
  console.log([
    s.train + ' → ' + s.test,
    r.feedback.total + ' (' + r.feedback.accept + '/' + r.feedback.reject + ')',
    r.anchors.map(a => a.ruleId + ' «' + a.phrase + '»').join(', ') || 'không có',
    r.before.overEscalations + '/' + r.before.notEscalatable + ' (' + pct(r.before.overEscalationRate) + ') → ' +
      r.after.overEscalations + '/' + r.after.notEscalatable + ' (' + pct(r.after.overEscalationRate) + ')',
    r.before.wrongEdits + ' → ' + r.after.wrongEdits,
    r.before.misses + ' → ' + r.after.misses
  ].join(' | '));
}
