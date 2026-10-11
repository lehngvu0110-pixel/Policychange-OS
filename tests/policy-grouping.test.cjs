'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Grouping = require('../js/policy-grouping.js');

const reg = Engine.cloneRegistry(Data.SEED_REGISTRY);
const rule = reg.find(r => r.id === 'R-PK-01');
const analyze = docs => Engine.analyze({ rule, oldValue: rule.value, newValue: '5 ngày', issuerTier: 2 }, docs, reg).props;
const doc = (id, lines, extra) => ({ id, title: id, owner: 'Phòng Đào tạo', tier: 1, version: '1.0', lines, ...extra });
const SAME = 'Kết quả phúc khảo được gửi về email sinh viên sau 7 ngày.';

test('cùng một mệnh đề ở nhiều tài liệu → một câu hỏi; khác một chữ → hai câu hỏi', () => {
  const props = analyze([doc('A', [SAME]), doc('B', ['  ' + SAME.toUpperCase() + '  ']), doc('C', [SAME.replace('email', 'thư điện tử')])]);
  assert.deepEqual(props.map(p => p.category), ['U1', 'U1', 'U1']);
  assert.deepEqual(Grouping.questionCount(props, 'R-PK-01'), { positions: 3, questions: 2 });
});

test('không gộp khi khác loại hồ sơ, khác đơn vị phụ trách hay khác cấp tài liệu', () => {
  const props = analyze([doc('A', [SAME]), doc('B', [SAME], { owner: 'Phòng Công tác Sinh viên' }), doc('C', [SAME], { tier: 3 })]);
  const keys = props.map(p => Grouping.groupKey(p, 'R-PK-01'));
  assert.equal(new Set(keys).size, 3);
  assert.equal(props.find(p => p.docId === 'C').category, 'U3');
});

test('gộp theo mệnh đề chứa con số, không theo cả dòng; dòng tự sửa không bao giờ gộp', () => {
  const props = analyze([doc('A', ['Thông báo của PĐT. ' + SAME + ' Liên hệ PĐT nếu cần.']), doc('B', [SAME]),
    doc('C', ['Sinh viên nộp đơn phúc khảo trong 7 ngày.'])]);
  assert.equal(Grouping.groupKey(props.find(p => p.docId === 'C'), 'R-PK-01'), null);
  assert.equal(Grouping.questionCount(props, 'R-PK-01').questions, 1);
});

test('seed: không có câu trùng nên số câu hỏi bằng số vị trí (không gộp oan)', () => {
  for (const r of reg) {
    const nv = r.value.replace(/^\d+/, m => String(Number(m) + 1));
    const props = Engine.analyze({ rule: r, oldValue: r.value, newValue: nv, issuerTier: 3 }, Engine.cloneDocs(Data.SEED_DOCUMENTS), reg).props;
    const c = Grouping.questionCount(props, r.id);
    assert.equal(c.questions, c.positions, r.id);
  }
});
