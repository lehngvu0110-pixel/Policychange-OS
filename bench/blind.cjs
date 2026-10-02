'use strict';
// Báo cáo trên TẬP MÙ bench/blind.csv: 40 ca do một tác tử độc lập viết chỉ từ QT-KSTL-01 + tên/giá trị quy định,
// không xem mã nguồn hay cụm từ neo. Tập được đóng băng (SHA-256 trong bench/BLIND-PROVENANCE.md) TRƯỚC khi sửa động cơ.
// Chạy: node bench/blind.cjs [--json] [--csv=đường_dẫn]
const fs = require('node:fs');
const path = require('node:path');
const Evaluation = require('../js/policy-evaluation.js');
const Data = require('../js/policy-data.js');

const arg = process.argv.find(a => a.startsWith('--csv='));
const file = arg ? arg.slice(6) : path.join(__dirname, 'blind.csv');
const { cases, errors } = Evaluation.parseCsv(fs.readFileSync(file, 'utf8'));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const report = Evaluation.evaluate(cases, { registry: Data.SEED_REGISTRY });
if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
const pct = x => x === null ? '—' : (x * 100).toFixed(1) + '%';
console.log(path.basename(file) + ': ' + report.total + ' ca (' + report.expectedEscalate + ' cần người, ' + report.expectedAuto + ' tự sửa được, ' + report.expectedNone + ' bẫy không được đụng)');
console.log('Đúng hoàn toàn:            ' + report.correct + '/' + report.total + ' (' + pct(report.accuracy) + ')');
console.log('Sửa sai (tự sửa nhầm):     ' + report.wrongEdits + '/' + report.autoActions + ' lần tự sửa · độ chính xác tự sửa ' + pct(report.autoPrecision));
console.log('Bỏ sót (cần người, máy không hỏi): ' + report.misses + '/' + report.expectedEscalate + ' (' + pct(report.missRate) + ')');
console.log('Báo lên thừa:              ' + report.overEscalations + '/' + (report.expectedAuto + report.expectedNone) + ' (' + pct(report.overEscalationRate) + ') · chiếm ' + pct(report.unnecessaryEscalationShare) + ' số hồ sơ đẩy lên người');
console.log('Đúng loại U1/U2/U3:        ' + pct(report.categoryAccuracy));
for (const row of report.rows.filter(r => !r.ok)) console.log('  ' + row.id + '  kỳ vọng ' + row.expected + ' → thực tế ' + row.actual + ' (' + row.kind + (row.phenomenon ? ' · ' + row.phenomenon : '') + '): ' + row.line);
