'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Evaluation = require('../js/policy-evaluation.js');
const Data = require('../js/policy-data.js');

const HEADER = 'id,rule_id,new_value,issuer_tier,doc_tier,line,expected';

test('1 bỏ sót + 1 chuyển tiếp thừa trên 4 ca → missRate 1/2, overEscalationRate 1/2', () => {
  const csv = [HEADER,
    'A,R-PK-01,5 ngày,2,2,Tiếp nhận đơn phúc khảo trong 7 ngày.,AUTO',
    'B,R-PK-01,5 ngày,2,2,Phòng thi giữ bài phúc khảo trong 7 ngày rồi chuyển kho.,U1',
    'C,R-PK-01,5 ngày,2,1,Bản nháp tự huỷ sau 7 ngày.,AUTO',
    'D,R-PK-01,5 ngày,2,2,Phản hồi đơn khiếu nại trong 7 ngày.,U2'
  ].join('\n');
  const { cases, errors } = Evaluation.parseCsv(csv);
  assert.deepEqual(errors, []);
  const report = Evaluation.evaluate(cases, { registry: Data.SEED_REGISTRY });
  assert.equal(report.total, 4);
  assert.equal(report.missRate, 0.5);
  assert.equal(report.overEscalationRate, 0.5);
  assert.equal(report.rows.find(r => r.id === 'B').kind, 'miss');
  assert.equal(report.rows.find(r => r.id === 'C').kind, 'over');
  assert.equal(report.categoryAccuracy, 1);
  assert.equal(report.confusion.U1.AUTO, 1);
});

test('CSV có BOM, CRLF, dòng trống và dấu phẩy trong ngoặc kép', () => {
  const csv = '﻿' + HEADER + '\r\n\r\n' +
    'X1,R-TC-01,15 triệu,2,2,"Khoản tạm ứng đến 10 triệu đồng, do Trưởng đơn vị duyệt ""nhanh"".",AUTO\r\n' +
    '   \r\n' +
    'X2,R-TC-01,15 triệu,9,2,sai cấp,AUTO\r\n';
  const { cases, errors } = Evaluation.parseCsv(csv);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].line, 'Khoản tạm ứng đến 10 triệu đồng, do Trưởng đơn vị duyệt "nhanh".');
  assert.equal(errors.length, 1, 'X2 có issuer_tier không hợp lệ');
  const report = Evaluation.evaluate(cases, { registry: Data.SEED_REGISTRY });
  assert.equal(report.rows[0].actual, 'AUTO');
  const back = Evaluation.parseRows(Evaluation.toCsv(report));
  assert.equal(back[1][5], cases[0].line);
});

test('CSV thiếu cột → báo lỗi rõ ràng, không ném ngoại lệ', () => {
  const { cases, errors } = Evaluation.parseCsv('id,line\n1,abc');
  assert.equal(cases.length, 0);
  assert.match(errors[0], /Thiếu cột/);
  assert.deepEqual(Evaluation.parseCsv('').errors, ['Tệp CSV rỗng.']);
});

test('bench/holdout.csv hợp lệ, tách biệt với fixtures và kho mẫu', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'bench', 'holdout.csv'), 'utf8');
  const { cases, errors } = Evaluation.parseCsv(text);
  assert.deepEqual(errors, []);
  assert.ok(cases.length >= 40, 'tập độc lập cần ít nhất 40 ca');
  for (const label of Evaluation.LABELS) assert.ok(cases.some(c => c.expected === label), 'thiếu nhãn ' + label);
  const seedLines = new Set(Data.SEED_DOCUMENTS.flatMap(d => d.lines));
  const fixtureLines = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bench', 'fixtures.json'), 'utf8'))
    .cases.flatMap(c => c.documents.flatMap(d => d.lines)));
  for (const c of cases) {
    assert.ok(!seedLines.has(c.line), c.id + ' trùng dòng trong kho mẫu');
    assert.ok(!fixtureLines.has(c.line), c.id + ' trùng dòng trong fixtures');
  }
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length, 'id phải duy nhất');
});

test('evaluateWithSemantics: AI chỉ giữ lại AUTO_PATCH, không nâng ca chuyển tiếp', async () => {
  const Semantic = require('../js/semantic-discovery.js');
  const csv = [HEADER,
    'A,R-PK-01,5 ngày,2,2,Tiếp nhận đơn phúc khảo trong 7 ngày.,AUTO',
    'B,R-XN-01,2 ngày,2,2,Giấy xác nhận sinh viên có giá trị sử dụng trong 3 ngày kể từ ngày cấp.,U1',
    'C,R-PK-01,5 ngày,2,1,Bản nháp tự huỷ sau 7 ngày.,U1'].join('\n');
  const { cases } = Evaluation.parseCsv(csv);
  let calls = 0;
  // Adapter giả lập trong test: đánh dấu dòng nói về "giá trị sử dụng" là 'unrelated', còn lại 'supports'.
  // (Ca B là ca động cơ tiền định vẫn bỏ sót — có neo chủ đề và cả từ "cấp" — nên chỉ lớp AI mới bắt được.)
  const adapter = { async discover(payload) {
    calls++;
    return { available: true, output: { schemaVersion: 1, candidates: payload.candidates.map(c => {
      const q = c.line.match(/\d+ ngày/)[0]; const start = c.line.indexOf(q);
      return { ruleId: c.ruleId, documentId: c.documentId, lineIndex: c.lineIndex, quote: q, start, end: start + q.length,
        relation: c.line.includes('giá trị sử dụng') ? 'unrelated' : 'supports', explanation: 'test', evidence: [{ quote: q, start, end: start + q.length }] };
    }) } };
  } };
  const plain = Evaluation.evaluate(cases, { registry: Data.SEED_REGISTRY });
  assert.equal(plain.misses, 1);
  const withAi = await Evaluation.evaluateWithSemantics(cases, { registry: Data.SEED_REGISTRY, semantic: Semantic, adapter });
  assert.equal(calls, 2, 'chỉ gọi AI cho ca động cơ đã AUTO');
  assert.equal(withAi.misses, 0);
  assert.equal(withAi.rows.find(r => r.id === 'B').actual, 'HOLD');
  assert.equal(withAi.rows.find(r => r.id === 'A').actual, 'AUTO');
  assert.equal(withAi.rows.find(r => r.id === 'C').actual, 'U1');
});

// Checkout trên Windows (core.autocrlf) có thể đổi kiểu xuống dòng. So sánh trên nội dung đã chuẩn hoá LF để test
// không đỏ chỉ vì ký tự xuống dòng, mà vẫn bắt được mọi sửa nội dung (báo cáo kiểm thử F08).
const readLf = name => fs.readFileSync(path.join(__dirname, '..', 'bench', name), 'utf8').replace(/\r\n/g, '\n');

test('js/holdout-data.js đồng bộ với bench/holdout.csv', () => {
  const embedded = require('../js/holdout-data.js');
  assert.equal(embedded.replace(/\r\n/g, '\n'), readLf('holdout.csv'), 'chạy npm run build:holdout');
});

test('js/blind-data.js đồng bộ với bench/blind.csv; tập mù đúng mã băm đã đóng băng', () => {
  const crypto = require('node:crypto');
  const text = readLf('blind.csv');
  assert.equal(require('../js/blind-data.js').replace(/\r\n/g, '\n'), text, 'chạy npm run build:holdout');
  // Tệp được đóng băng với xuống dòng CRLF; băm trên dạng CRLF đó dù bản checkout dùng kiểu xuống dòng nào.
  const sha = crypto.createHash('sha256').update(Buffer.from(text.replace(/\n/g, '\r\n'), 'utf8')).digest('hex');
  const provenance = fs.readFileSync(path.join(__dirname, '..', 'bench', 'BLIND-PROVENANCE.md'), 'utf8');
  assert.ok(provenance.includes(sha), 'tập mù đã bị sửa sau khi đóng băng');
  const { cases, errors } = Evaluation.parseCsv(text);
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 40);
});

test('F08: so khớp và mã băm tập mù không phụ thuộc kiểu xuống dòng của bản checkout', () => {
  const crypto = require('node:crypto');
  const provenance = fs.readFileSync(path.join(__dirname, '..', 'bench', 'BLIND-PROVENANCE.md'), 'utf8');
  const lf = readLf('blind.csv');
  for (const checkout of [lf, lf.replace(/\n/g, '\r\n')]) {
    const canonical = checkout.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    assert.ok(provenance.includes(crypto.createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex')));
    assert.deepEqual(Evaluation.parseCsv(checkout).cases.map(c => c.id), Evaluation.parseCsv(lf).cases.map(c => c.id));
  }
  const holdout = readLf('holdout.csv');
  assert.equal(require('../js/holdout-data.js').replace(/\r\n/g, '\n'), holdout.replace(/\n/g, '\r\n').replace(/\r\n/g, '\n'));
});

test('js/blind2-data.js đồng bộ với bench/blind2.csv; tập mù số 2 đúng mã băm đã đóng băng', () => {
  const crypto = require('node:crypto');
  const text = readLf('blind2.csv');
  assert.equal(require('../js/blind2-data.js').replace(/\r\n/g, '\n'), text, 'chạy npm run build:holdout');
  const sha = crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
  const provenance = fs.readFileSync(path.join(__dirname, '..', 'bench', 'BLIND2-PROVENANCE.md'), 'utf8');
  assert.ok(provenance.includes(sha), 'tập mù số 2 đã bị sửa sau khi đóng băng');
  const { cases, errors } = Evaluation.parseCsv(text);
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 36);
});

test('tập mù số 2: không tự sửa sai, không bỏ sót', () => {
  const report = Evaluation.evaluate(Evaluation.parseCsv(readLf('blind2.csv')).cases, { registry: Data.SEED_REGISTRY });
  assert.equal(report.wrongEdits, 0);
  assert.equal(report.misses, 0);
  assert.equal(report.rows.filter(r => r.actual === 'NONE' && r.expected !== 'NONE').length, 0, 'không ca nào bị bỏ qua lặng lẽ');
});
