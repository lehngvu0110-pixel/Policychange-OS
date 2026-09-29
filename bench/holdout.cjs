'use strict';
// Báo cáo độ chính xác của động cơ tiền định trên tập độc lập bench/holdout.csv (dữ liệu tổng hợp, do nhóm gắn nhãn tay).
// Chạy: node bench/holdout.cjs [--json]
const fs = require('node:fs');
const path = require('node:path');
const Evaluation = require('../js/policy-evaluation.js');
const Data = require('../js/policy-data.js');

const { cases, errors } = Evaluation.parseCsv(fs.readFileSync(path.join(__dirname, 'holdout.csv'), 'utf8'));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const report = Evaluation.evaluate(cases, { registry: Data.SEED_REGISTRY });
if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
const pct = x => (x * 100).toFixed(1) + '%';
console.log('Tập độc lập: ' + report.total + ' ca (' + report.expectedEscalate + ' cần chuyển tiếp, ' + report.expectedAuto + ' tự xử lý được)');
console.log('Đúng hoàn toàn:        ' + report.correct + '/' + report.total + ' (' + pct(report.accuracy) + ')');
console.log('Tỉ lệ bỏ sót:          ' + report.misses + '/' + report.expectedEscalate + ' (' + pct(report.missRate) + ')');
console.log('Tỉ lệ chuyển tiếp thừa: ' + report.overEscalations + '/' + report.expectedAuto + ' (' + pct(report.overEscalationRate) + ')');
console.log('Đúng loại U1/U2/U3:    ' + (report.categoryAccuracy === null ? '—' : pct(report.categoryAccuracy)));
for (const row of report.rows.filter(r => !r.ok)) console.log('  ' + row.id + '  kỳ vọng ' + row.expected + ' → thực tế ' + row.actual + ' (' + row.kind + '): ' + row.line);
