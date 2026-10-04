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

// ---------- Phản hồi doanh nghiệp: không tự sửa khi chỉ khớp chủ đề; nhận ra giá trị viết khác dạng ----------
{
  const EngineX = require('../js/policy-engine.js');
  const DataX = require('../js/policy-data.js');
  const reg = () => EngineX.cloneRegistry(DataX.SEED_REGISTRY);
  const one = (ruleId, newValue, line, issuerTier = 3, tier = 1) => {
    const registry = reg();
    const rule = registry.find(r => r.id === ruleId);
    const doc = { id: 'T', title: 't', owner: 'o', tier, version: '1.0', lines: [line] };
    return EngineX.analyze({ rule, oldValue: rule.value, newValue, issuerTier }, [doc], registry).props[0];
  };

  test('neo chủ đề không đủ: con số đo đại lượng khác của cùng chủ đề → U1, không tự sửa', () => {
    for (const [ruleId, nv, line] of [
      ['R-PK-01', '5 ngày', 'Kết quả phúc khảo được thông báo cho sinh viên sau 7 ngày.'],
      ['R-PK-01', '5 ngày', 'Bài thi đã phúc khảo được lưu tại khoa thêm 7 ngày.'],
      ['R-TC-01', '15 triệu', 'Tổng dư tạm ứng của một đơn vị không vượt 10 triệu đồng mỗi quý.']
    ]) {
      const p = one(ruleId, nv, line);
      assert.equal(p.outcome, 'ESCALATE', line);
      assert.equal(p.category, 'U1', line);
      assert.match(p.reason, /neo chủ đề/);
    }
  });

  test('neo chủ đề + đại lượng, hoặc neo chi phối trực tiếp con số → vẫn tự sửa', () => {
    assert.equal(one('R-PK-01', '5 ngày', 'Sinh viên nộp đơn phúc khảo trong 7 ngày.').outcome, 'AUTO_PATCH');
    assert.equal(one('R-PK-01', '5 ngày', 'Sinh viên phúc khảo trong 7 ngày.').outcome, 'AUTO_PATCH');
    assert.equal(one('R-TC-01', '15 triệu', 'Khoản tạm ứng đến 10 triệu đồng do Trưởng đơn vị duyệt.').outcome, 'AUTO_PATCH');
    assert.equal(one('R-TC-02', '20 triệu', 'Khoản chi từ 10 triệu đồng phải có hai chữ ký.').outcome, 'AUTO_PATCH', 'measures rỗng = giữ hành vi cũ');
  });

  test('giá trị viết bằng chữ / quy đổi tuần / không dấu → luôn hỏi người, bản sửa đề xuất thay đúng đoạn', () => {
    const w = one('R-KN-01', '10 ngày', 'Đơn tố cáo được giải quyết trong vòng một tuần.');
    assert.equal(w.category, 'U1');
    assert.equal(w.variantOnly, true);
    assert.equal(w.newLine, 'Đơn tố cáo được giải quyết trong vòng 10 ngày.');
    const words = one('R-DK-01', '30 tín chỉ', 'Sinh viên đăng ký học phần không quá hai mươi bốn tín chỉ.');
    assert.equal(words.category, 'U1');
    assert.equal(words.newLine, 'Sinh viên đăng ký học phần không quá 30 tín chỉ.');
    const plain = one('R-KN-01', '5 ngày', 'Don khieu nai se duoc tra loi trong 7 ngay.');
    assert.equal(plain.category, 'U1');
    assert.equal(plain.newLine, 'Don khieu nai se duoc tra loi trong 5 ngay.');
    assert.equal(one('R-PK-01', '5 ngày', 'Kết quả tra cứu sau mười bảy ngày.'), undefined, '"mười bảy" không phải "bảy"');
    assert.equal(one('R-PK-01', '5 ngày', 'Tra cứu sau 17 ngay.'), undefined, '"17 ngay" không phải "7 ngay"');
    assert.equal(one('R-XN-01', '2 ngày', 'Trả giấy xác nhận sau 3 ngày làm việc.').hits[0].form, undefined, 'dạng chuẩn có dấu không bị coi là không dấu');
  });

  test('giá trị khác dạng vẫn theo thứ tự U2 → U3 trước U1', () => {
    assert.equal(one('R-PK-01', '5 ngày', 'Đơn khiếu nại được trả lời trong một tuần.').category, 'U2');
    assert.equal(one('R-PK-01', '5 ngày', 'Sinh viên nộp đơn phúc khảo trong một tuần.', 2, 3).category, 'U3');
  });

  test('numberWords: các cách đọc khẩu ngữ thường gặp', () => {
    assert.ok(EngineX.numberWords(24).includes('hai mươi tư'));
    assert.ok(EngineX.numberWords(24).includes('hai tư'));
    assert.ok(EngineX.numberWords(15).includes('mười lăm'));
    assert.ok(EngineX.numberWords(21).includes('hai mươi mốt'));
    assert.ok(EngineX.numberWords(105).includes('một trăm linh năm'));
    assert.deepEqual(EngineX.numberWords(0), []);
  });
}

// Các ca do người review tìm ra: khung chi phối không được che một đại lượng khác; neo đại lượng phải cùng mệnh đề.
{
  const EngineY = require('../js/policy-engine.js');
  const DataY = require('../js/policy-data.js');
  const Prover = require('../js/policy-prover.js');
  const lab = (ruleId, nv, line) => {
    const registry = EngineY.cloneRegistry(DataY.SEED_REGISTRY);
    const rule = registry.find(r => r.id === ruleId);
    const p = EngineY.analyze({ rule, oldValue: rule.value, newValue: nv, issuerTier: 3 }, [{ id: 'T', title: 't', owner: 'o', tier: 1, version: '1', lines: [line] }], registry).props[0];
    return !p ? 'NONE' : p.outcome === 'AUTO_PATCH' ? 'AUTO' : p.category;
  };
  test('khung "neo + trong/tối đa" không áp dụng khi mệnh đề nói về đại lượng khác', () => {
    assert.equal(lab('R-PK-01', '5 ngày', 'Kết quả phúc khảo thông báo trong 7 ngày.'), 'U1');
    assert.equal(lab('R-PK-01', '5 ngày', 'Bài thi phúc khảo được lưu trong 7 ngày.'), 'U1');
    assert.equal(lab('R-TC-01', '15 triệu', 'Tổng dư tạm ứng tối đa 10 triệu đồng mỗi quý.'), 'U1');
    assert.equal(lab('R-PK-01', '5 ngày', 'Sinh viên phúc khảo bài thi trong 7 ngày.'), 'AUTO');
  });
  test('neo đại lượng ở mệnh đề khác không tính', () => {
    assert.equal(lab('R-PK-01', '5 ngày', 'Sinh viên nộp đơn phúc khảo; bài thi lưu 7 ngày.'), 'U1');
    assert.equal(lab('R-PK-01', '5 ngày', 'Quá 7 ngày kể từ ngày công bố điểm, đơn phúc khảo không được tiếp nhận.'), 'AUTO');
    assert.equal(lab('R-TC-01', '15 triệu', 'Khoản tạm ứng đến 10.000.000 đồng do Trưởng đơn vị duyệt.'), 'AUTO', 'dấu chấm hàng nghìn không cắt mệnh đề');
  });
  test('không dấu kèm hậu tố có dấu, dòng vừa chuẩn vừa khác dạng, "mười triệu rưỡi"', () => {
    assert.equal(lab('R-KN-01', '5 ngày', 'Don khieu nai tra loi trong 7 ngay làm việc.'), 'U1');
    const registry = EngineY.cloneRegistry(DataY.SEED_REGISTRY);
    const rule = registry.find(r => r.id === 'R-PK-01');
    const p = EngineY.analyze({ rule, oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 3 }, [{ id: 'T', title: 't', owner: 'o', tier: 1, version: '1', lines: ['Nộp đơn phúc khảo trong 7 ngày (một tuần).'] }], registry).props[0];
    assert.equal(p.category, 'U1');
    assert.equal(p.newLine, 'Nộp đơn phúc khảo trong 5 ngày (5 ngày).', 'sửa cả dạng chuẩn lẫn dạng khác');
    assert.equal(lab('R-TC-01', '15 triệu', 'Trưởng đơn vị duyệt tạm ứng mười triệu rưỡi.'), 'NONE', '10,5 triệu không phải 10 triệu');
  });
  test('prover độc lập: dòng bị khung chặn thì registered_measure_cue trượt', () => {
    const registry = EngineY.cloneRegistry(DataY.SEED_REGISTRY);
    const rule = registry.find(r => r.id === 'R-PK-01');
    const line = 'Bài thi phúc khảo được lưu trong 7 ngày.';
    const doc = { id: 'T', title: 't', owner: 'o', tier: 1, version: '1', lines: [line] };
    const change = { rule, oldValue: '7 ngày', newValue: '5 ngày', issuerTier: 3 };
    const forged = { ...EngineY.analyze(change, [doc], registry).props[0], outcome: 'AUTO_PATCH', category: null };
    const proof = Prover.proveAutomaticPatch(change, doc, forged, { registry, docs: [doc], parseValue: EngineY.parseValue, valueRegex: EngineY.valueRegex,
      renderValue: EngineY.renderValue, ownersOfLine: l => EngineY.ownersOfLine(l, registry), analyze: (c, d) => EngineY.analyze(c, d, registry) });
    assert.equal(proof.allowed, false);
    assert.equal(proof.checks.find(c => (c.id || c.name) === 'registered_measure_cue').passed, false);
  });
}

test('F06: parseFreeText mượn đơn vị của giá trị mới chỉ khi khớp một giá trị trong sổ', () => {
  const E = require('../js/policy-engine.js');
  const D = require('../js/policy-data.js');
  const ok = E.parseFreeText('Rút thời hạn nộp đơn phúc khảo từ 7 xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.', D.SEED_REGISTRY);
  assert.equal(ok.ok, true, ok.msg);
  assert.equal(ok.oldValue, '7 ngày');
  assert.equal(ok.unitBorrowed, true);
  const money = E.parseFreeText('Nâng hạn mức tạm ứng từ 10 lên 12 triệu đồng, do Hiệu trưởng ban hành.', D.SEED_REGISTRY);
  assert.equal(money.oldValue, '10 triệu đồng');
  assert.equal(E.parseFreeText('Đổi hạn nộp đơn phúc khảo từ 70 xuống 5 ngày, Trưởng phòng Đào tạo.', D.SEED_REGISTRY).ok, false);
  assert.equal(E.shareUnit('10.000.000', '12 triệu'), '10.000.000', 'không ghép “triệu” vào số đã đủ hàng nghìn');
  assert.equal(E.shareUnit('7 ngày', '5 ngày'), '7 ngày');
});

test('đơn vị viết tắt “24TC” được nhận ra và luôn hỏi người (tập mù số 2, ca C15)', () => {
  const E = require('../js/policy-engine.js');
  const D = require('../js/policy-data.js');
  const reg = E.cloneRegistry(D.SEED_REGISTRY);
  const rule = reg.find(r => r.id === 'R-DK-01');
  const docs = [{ id: 'X', title: 't', owner: 'Phòng Đào tạo', tier: 1, version: '1.0',
    lines: ['Kỳ này SV đk tối đa 24TC thôi em.', 'Tối đa 24 tc/học kỳ.', 'Mã học phần CO24TC.', 'Tổng tích luỹ 124TC.'] }];
  const { props } = E.analyze({ rule, oldValue: rule.value, newValue: '30 tín chỉ', issuerTier: 3 }, docs, reg);
  assert.deepEqual(props.map(p => [p.lineIndex, p.outcome, p.category]), [[0, 'ESCALATE', 'U1'], [1, 'ESCALATE', 'U1']]);
  assert.equal(props[0].newLine, 'Kỳ này SV đk tối đa 30TC thôi em.');
  assert.match(props[0].reason, /đơn vị viết tắt/);
});
