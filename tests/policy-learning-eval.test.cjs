'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const deps = {
  Engine: require('../js/policy-engine.js'), Learning: require('../js/policy-learning.js'),
  Workflow: require('../js/policy-workflow.js'), Evaluation: require('../js/policy-evaluation.js')
};
const Data = require('../js/policy-data.js');
const LearningEval = require('../js/policy-learning-eval.js');

const ca = (id, line, expected) => ({ id, ruleId: 'R-PK-01', newValue: '5 ngày', issuerTier: 2, docTier: 1, line, expected });

test('hai câu “Có” cùng nói “phúc tra” → học neo; dòng mới ở tập đo được tự sửa, không sửa sai', () => {
  const train = [ca('T1', 'Hạn nộp đơn phúc tra bài thi là 7 ngày kể từ khi có điểm.', 'AUTO'),
    ca('T2', 'Em nộp đơn phúc tra trong vòng 7 ngày sau khi điểm được công bố nhé.', 'AUTO')];
  const testSet = [ca('X1', 'Sinh viên nộp đơn phúc tra trong 7 ngày kể từ ngày công bố điểm.', 'AUTO'),
    ca('X2', 'Phòng thi chỉ lưu bài trong 7 ngày trước khi chuyển kho.', 'U1')];
  const r = LearningEval.run({ train, test: testSet, registry: Data.SEED_REGISTRY, ...deps });
  assert.deepEqual(r.feedback, { total: 2, accept: 2, reject: 0 });
  assert.equal(r.anchors.length, 1);
  assert.match(r.anchors[0].phrase, /phúc tra/);
  assert.equal(r.before.overEscalations, 1);
  assert.equal(r.after.overEscalations, 0);
  assert.equal(r.after.wrongEdits, 0);
  assert.equal(r.after.misses, 0);
});

test('một câu “Có” không đủ để học; câu “Không” không bao giờ thành neo', () => {
  const train = [ca('T1', 'Hạn nộp đơn phúc tra bài thi là 7 ngày.', 'AUTO'), ca('T2', 'Nộp đơn phúc tra xong chờ 7 ngày.', 'U1')];
  const r = LearningEval.run({ train, test: [ca('X1', 'Nộp đơn phúc tra trong 7 ngày.', 'AUTO')], registry: Data.SEED_REGISTRY, ...deps });
  assert.equal(r.anchors.length, 0);
  assert.equal(r.after.overEscalations, r.before.overEscalations);
});

test('không làm bẩn sổ đăng ký gốc', () => {
  const reg = deps.Engine.cloneRegistry(Data.SEED_REGISTRY);
  const snapshot = JSON.stringify(reg);
  LearningEval.run({ train: [ca('T1', 'Nộp đơn phúc tra trong 7 ngày.', 'AUTO'), ca('T2', 'Hạn nộp đơn phúc tra là 7 ngày.', 'AUTO')], test: [], registry: reg, ...deps });
  assert.equal(JSON.stringify(reg), snapshot);
});

test('số đo trên các tập thật: tập đo không bao giờ nằm trong tập học; học không gây sửa sai hay bỏ sót', () => {
  const load = f => deps.Evaluation.parseCsv(fs.readFileSync(path.join(__dirname, '..', 'bench', f), 'utf8')).cases;
  const sets = { dev: load('holdout.csv'), blind1: load('blind.csv'), blind2: load('blind2.csv') };
  const rows = LearningEval.splits(sets).map(s => ({ s, r: LearningEval.run({ train: s.trainCases, test: s.testCases, registry: Data.SEED_REGISTRY, ...deps }) }));
  for (const { s, r } of rows) {
    assert.ok(!s.trainCases.some(c => s.testCases.includes(c)), s.train + ' → ' + s.test);
    assert.equal(r.after.wrongEdits, 0); assert.equal(r.after.misses, 0);
    assert.ok(r.after.overEscalations <= r.before.overEscalations);
  }
  // Ghi lại số đã công bố trong tài liệu: học từ tập phát triển + tập mù số 2, đo trên tập mù số 1 → 9 → 6.
  assert.deepEqual([rows[2].r.before.overEscalations, rows[2].r.after.overEscalations], [9, 6]);
});
