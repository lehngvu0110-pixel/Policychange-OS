'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Learning = require('../js/policy-learning.js');
const Engine = require('../js/policy-engine.js');
const Workflow = require('../js/policy-workflow.js');
const Data = require('../js/policy-data.js');

const LINE_A = 'Phòng Khảo thí chỉ lưu bài thi trong 7 ngày trước khi chuyển kho.';
const LINE_B = 'Bộ phận lưu trữ giữ nguyên hiện trạng khi lưu bài thi tối đa 7 ngày.';
const fb = (docId, line, answer) => ({ ruleId: 'R-PK-01', category: 'U1', docId, lineIndex: 0, line, answer });

test('hai phản hồi "Có" cùng chứa một cụm từ → đề xuất cụm đó làm neo', () => {
  const registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
  const out = Learning.suggestAnchors([fb('X-1', LINE_A, 'accept'), fb('X-2', LINE_B, 'accept')], registry);
  const hit = out.find(s => s.phrase === 'lưu bài thi');
  assert.ok(hit, 'phải đề xuất "lưu bài thi"; nhận được ' + JSON.stringify(out.map(s => s.phrase)));
  assert.equal(hit.ruleId, 'R-PK-01');
  assert.equal(hit.support, 2);
  // "bài thi" chồng lên neo "chấm lại bài thi" của chính quy định → không đề xuất.
  assert.ok(!out.some(s => s.phrase === 'bài thi'));
});

test('một phản hồi "Không" chứa cùng cụm → không đề xuất', () => {
  const registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
  const out = Learning.suggestAnchors([
    fb('X-1', LINE_A, 'accept'), fb('X-2', LINE_B, 'accept'),
    fb('X-3', 'Thư viện lưu bài thi mẫu trong 7 ngày cho sinh viên tham khảo.', 'reject')
  ], registry);
  assert.ok(!out.some(s => s.phrase === 'lưu bài thi'));
});

test('chỉ một phản hồi, hoặc cụm từ trùng neo quy định khác → không đề xuất', () => {
  const registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
  assert.deepEqual(Learning.suggestAnchors([fb('X-1', LINE_A, 'accept')], registry), []);
  const clash = Learning.suggestAnchors([
    fb('X-1', 'Tiếp nhận đơn khiếu nại lần hai trong 7 ngày.', 'accept'),
    fb('X-2', 'Hồ sơ đơn khiếu nại lần hai xử lý trong 7 ngày.', 'accept')
  ], registry);
  assert.ok(!clash.some(s => s.phrase.includes('khiếu nại')), 'không được đề xuất cụm chồng lên neo R-KN-01');
});

test('sau khi người duyệt thêm neo, vị trí U1 cũ được tự xử lý', () => {
  const state = { registry: Engine.cloneRegistry(Data.SEED_REGISTRY),
    docs: [{ id: 'X-1', title: 'Nội quy phòng thi', owner: 'Phòng Đào tạo', tier: 1, version: '1.0', lines: [LINE_A] }],
    current: null, ledger: [] };
  const built = Workflow.buildChange(state.registry, 'R-PK-01', '5 ngày', 2);
  const before = Engine.analyze(built.change, state.docs, state.registry).props[0];
  assert.equal(before.category, 'U1');

  const [suggestion] = Learning.suggestAnchors([fb('X-1', LINE_A, 'accept'), fb('X-2', LINE_B, 'accept')], state.registry)
    .filter(s => s.phrase === 'lưu bài thi');
  const added = Workflow.addAnchor(state, suggestion.ruleId, suggestion.phrase, { now: () => '2026-10-01T00:00:00.000Z', actor: 'Người · Trưởng phòng Đào tạo' });
  assert.equal(added.ok, true);
  assert.equal(state.ledger.at(-1).action, 'THÊM NEO R-PK-01');

  const after = Engine.analyze(Workflow.buildChange(state.registry, 'R-PK-01', '5 ngày', 2).change, state.docs, state.registry).props[0];
  assert.equal(after.outcome, 'AUTO_PATCH');
  assert.equal(after.newLine, 'Phòng Khảo thí chỉ lưu bài thi trong 5 ngày trước khi chuyển kho.');
});

test('escalationStats đếm theo loại và theo quy định', () => {
  const stats = Learning.escalationStats([
    fb('X-1', LINE_A, 'accept'), fb('X-2', LINE_B, 'reject'),
    { ruleId: 'R-TC-01', category: 'U2', docId: 'Y', lineIndex: 1, line: 'x', answer: 'reject' },
    { ruleId: 'R-TC-01', category: 'U2', docId: 'Y', lineIndex: 2, line: 'x', answer: 'bogus' }
  ]);
  assert.equal(stats.total, 3);
  assert.deepEqual(stats.byCategory.U1, { accept: 1, reject: 1, total: 2, acceptRate: 0.5 });
  assert.equal(stats.byRule['R-TC-01'].reject, 1);
});

test('dòng có neo chủ đề nhưng thiếu đại lượng → đề xuất NEO ĐẠI LƯỢNG; duyệt xong thì tự xử lý', () => {
  const state = { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: [], current: null, ledger: [] };
  const L1 = 'Phiếu đăng ký phúc khảo phải gửi về khoa trong thời gian 7 ngày, tính từ ngày có điểm.';
  const L2 = 'Phúc khảo: phiếu đăng ký gửi về khoa chậm nhất 7 ngày tính từ ngày có điểm.';
  state.docs = [{ id: 'Y-1', title: 't', owner: 'Phòng Đào tạo', tier: 1, version: '1.0', lines: [L1] }];
  const change = () => Workflow.buildChange(state.registry, 'R-PK-01', '5 ngày', 2).change;
  assert.equal(Engine.analyze(change(), state.docs, state.registry).props[0].category, 'U1');
  const out = Learning.suggestAnchors([fb('Y-1', L1, 'accept'), fb('Y-2', L2, 'accept')], state.registry);
  const s = out.find(x => x.phrase === 'phiếu đăng ký');
  assert.ok(s, JSON.stringify(out.map(x => x.phrase)));
  assert.equal(s.field, 'measures');
  const added = Workflow.addAnchor(state, 'R-PK-01', s.phrase, { now: () => 't', actor: 'Người · Trưởng phòng Đào tạo', field: s.field });
  assert.equal(added.ok, true);
  assert.equal(state.ledger.at(-1).action, 'THÊM NEO ĐẠI LƯỢNG R-PK-01');
  assert.ok(state.registry.find(r => r.id === 'R-PK-01').measures.includes('phiếu đăng ký'));
  assert.equal(Engine.analyze(change(), state.docs, state.registry).props[0].outcome, 'AUTO_PATCH');
});

test('missingField: phân biệt thiếu chủ đề, thiếu đại lượng, thiếu cả hai', () => {
  const rule = Engine.cloneRegistry(Data.SEED_REGISTRY).find(r => r.id === 'R-PK-01');
  assert.equal(Learning.missingField(rule, 'Kết quả phúc khảo thông báo sau 7 ngày.'), 'measures');
  assert.equal(Learning.missingField(rule, 'Hạn nộp phiếu xem lại bài là 7 ngày.'), 'aliases');
  assert.equal(Learning.missingField(rule, 'Phiếu xem lại bài gửi khoa sau 7 ngày.'), 'both');
});
