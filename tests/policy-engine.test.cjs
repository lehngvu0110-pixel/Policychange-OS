const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');

const registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
const rule = id => registry.find(r => r.id === id);
const change = (ruleId, newValue, issuerTier) => ({ rule: rule(ruleId), oldValue: rule(ruleId).value, newValue, issuerTier });
const at = (props, docId, lineIndex) => props.find(p => p.docId === docId && p.lineIndex === lineIndex);

test('phúc khảo 7 → 5 ngày ở cấp 2: 9 vị trí, 6 tự động, đúng một U1/U2/U3 ở đúng chỗ', () => {
  const { props } = Engine.analyze(change('R-PK-01', '5 ngày', 2), Engine.cloneDocs(Data.SEED_DOCUMENTS), registry);
  assert.equal(props.length, 9);
  assert.equal(props.filter(p => p.outcome === 'AUTO_PATCH').length, 6);
  assert.equal(at(props, 'HD-04', 3).category, 'U1');
  assert.equal(at(props, 'QT-07', 1).category, 'U2');
  assert.equal(at(props, 'QD-01', 1).category, 'U3');
  assert.equal(at(props, 'QT-02', 0).newLine.includes('5 ngày'), true);
});

test('10 triệu viết theo nhiều kiểu đều được tìm thấy; ngày tháng không bị coi là giá trị', () => {
  const re = Engine.valueRegex('10 triệu');
  for (const text of ['10 triệu đồng', '10.000.000', '10.000.000đ', '10tr', '10 tr.']) { re.lastIndex = 0; assert.ok(re.test(text), text); }
  const doc = { id: 'X', title: 'x', owner: 'x', tier: 1, version: '1.0', lines: ['Nộp trong 7 ngày; hạn mẫu 17/07/2025 và mã 7/2024.'] };
  const { props } = Engine.analyze({ ...change('R-PK-01', '5 ngày', 2) }, [doc], registry);
  assert.equal(props.length, 1);
  assert.equal(props[0].hits.length, 1);
  assert.equal(props[0].newLine.includes('17/07/2025'), true);
});

test('động cơ chỉ dùng sổ đăng ký được truyền vào, không đọc trạng thái toàn cục', () => {
  const narrowed = registry.filter(r => r.id !== 'R-KN-01');
  const docs = Engine.cloneDocs(Data.SEED_DOCUMENTS);
  const { props } = Engine.analyze({ rule: rule('R-PK-01'), oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2 }, docs, narrowed);
  // Khi quy định khiếu nại không còn trong sổ, dòng QT-07 không còn U2 mà thành U1 (không neo được).
  assert.equal(at(props, 'QT-07', 1).category, 'U1');
});

test('parseFreeText từ chối giá trị không có trong sổ và câu lệnh không nêu cấp', () => {
  assert.equal(Engine.parseFreeText('Đổi hạn nộp hồ sơ từ 42 ngày xuống 30 ngày, do Trưởng phòng ban hành.', registry).ok, false);
  assert.equal(Engine.parseFreeText('Rút hạn phúc khảo từ 7 ngày xuống 5 ngày.', registry).ok, false);
  const ok = Engine.parseFreeText('Rút hạn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.', registry);
  assert.deepEqual(ok, { ok: true, ruleId: 'R-PK-01', oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 2 });
});

test('câu hỏi chuyển tiếp: đúng hai lựa chọn, và biết lựa chọn nào dẫn tới việc sửa', () => {
  const c = change('R-PK-01', '5 ngày', 2);
  const { props } = Engine.analyze(c, Engine.cloneDocs(Data.SEED_DOCUMENTS), registry);
  for (const p of props.filter(x => x.outcome === 'ESCALATE')) {
    const q = Engine.escalationQuestion(p, c, registry);
    assert.ok(q.q.length > 20 && q.a && q.b, p.category);
  }
  assert.equal(Engine.actAccepts('U1', 'a'), true);
  assert.equal(Engine.actAccepts('U2', 'a'), false);
  assert.equal(Engine.actAccepts('U3', 'b'), true);
});

test('changeError chặn giá trị trùng, sai định dạng và cấp không hợp lệ', () => {
  assert.match(Engine.changeError(rule('R-PK-01'), '7 ngày', 2), /trùng/);
  assert.match(Engine.changeError(rule('R-PK-01'), 'năm ngày', 2), /định dạng/);
  assert.match(Engine.changeError(rule('R-PK-01'), '5 ngày', 4), /cấp/);
  assert.equal(Engine.changeError(rule('R-PK-01'), '5 ngày', 2), null);
});

test('hồi quy: "10 trang" không bị coi là "10 tr(iệu)" và không bị sửa hỏng thành "15 triệuang"', () => {
  const tc = registry.find(r => r.id === 'R-TC-01');
  const doc = { id: 'X', title: 'x', owner: 'x', tier: 1, version: '1.0', lines: [
    'Hồ sơ tạm ứng tối đa 10 trang A4.',
    'Tạm ứng 10.000.000đ cho CLB.',
    'Tạm ứng 10tr cho CLB.'
  ] };
  const { props } = Engine.analyze({ rule: tc, oldValue: tc.value, newValue: '15 triệu', issuerTier: 2 }, [doc], registry);
  assert.deepEqual(props.map(p => p.lineIndex), [1, 2]);
  assert.equal(props[0].newLine, 'Tạm ứng 15.000.000đ cho CLB.');
  assert.equal(props[1].newLine, 'Tạm ứng 15tr cho CLB.');
});
