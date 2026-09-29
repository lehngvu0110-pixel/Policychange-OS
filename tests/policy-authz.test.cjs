const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/policy-engine.js');
const Data = require('../js/policy-data.js');
const Authz = require('../js/policy-authz.js');
const Workflow = require('../js/policy-workflow.js');

const registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
const persona = id => Authz.DEMO_PERSONAS.find(p => p.id === id);
const rule = id => registry.find(r => r.id === id);
const phucKhao = tier => ({ rule: rule('R-PK-01'), oldValue: '7 ngày', newValue: '5 ngày', issuerTier: tier });
const props = change => Engine.analyze(change, Engine.cloneDocs(Data.SEED_DOCUMENTS), registry).props;
const at = (list, docId, lineIndex) => list.find(p => p.docId === docId && p.lineIndex === lineIndex);

test('máy chủ không tin cấp tự khai: chuyên viên cấp 1 gửi issuerTier 3 bị từ chối', () => {
  const verdict = Authz.canIssue(persona('cv-dt'), phucKhao(3));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /cấp 1/);
  assert.equal(Authz.canIssue(persona('tp-dt'), phucKhao(2)).ok, true);
});

test('không phụ trách đơn vị sở hữu quy định thì không được tạo thay đổi', () => {
  const verdict = Authz.canIssue(persona('tp-tc'), phucKhao(2));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /không phụ trách Phòng Đào tạo/);
});

test('U1 do người phụ trách tài liệu quyết; U2 do trưởng đơn vị sở hữu quy định bị đụng; U3 chỉ cấp đủ', () => {
  const change = phucKhao(2);
  const list = props(change);
  const u1 = at(list, 'HD-04', 3), u2 = at(list, 'QT-07', 1), u3 = at(list, 'QD-01', 1);
  assert.equal(Authz.canDecide(persona('cv-dt'), u1, change, registry).ok, true);
  assert.equal(Authz.canDecide(persona('tp-dt'), u2, change, registry).ok, false);
  assert.equal(Authz.canDecide(persona('tp-tt'), u2, change, registry).ok, true);
  const denied = Authz.canDecide(persona('tp-dt'), u3, change, registry);
  assert.equal(denied.ok, false);
  assert.equal(denied.requirement.tier, 3);
  assert.equal(Authz.canDecide(persona('ht'), u3, change, registry).ok, true);
});

test('hoàn tác và sửa sổ đăng ký cũng theo cấp + đơn vị', () => {
  const qd01 = Data.SEED_DOCUMENTS.find(d => d.id === 'QD-01');
  const qt02 = Data.SEED_DOCUMENTS.find(d => d.id === 'QT-02');
  assert.equal(Authz.canUndo(persona('tp-dt'), qd01).ok, false);
  assert.equal(Authz.canUndo(persona('tp-dt'), qt02).ok, true);
  assert.equal(Authz.canUndo(persona('cv-dt'), qt02).ok, false);
  assert.equal(Authz.canEditRegistry(persona('cv-dt'), rule('R-PK-01')).ok, false);
  assert.equal(Authz.canEditRegistry(persona('tp-dt'), rule('R-PK-01')).ok, true);
});

test('giá trị gốc trong sổ chỉ đổi khi ban hành ở cấp ≥ cấp của quy định', () => {
  const mk = tier => {
    const state = { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), docs: Engine.cloneDocs(Data.SEED_DOCUMENTS), current: null, ledger: [] };
    Workflow.startAnalysis(state, Workflow.buildChange(state.registry, 'R-PK-01', '5 ngày', tier).change);
    Workflow.commit(state, { now: () => 't' });
    return state;
  };
  const byHead = mk(2);
  const refused = Workflow.ratifyRule(byHead, { now: () => 't' });
  assert.equal(refused.ok, false);
  assert.equal(byHead.registry.find(r => r.id === 'R-PK-01').value, '7 ngày');

  const byRector = mk(3);
  const ratified = Workflow.ratifyRule(byRector, { now: () => 't' });
  assert.equal(ratified.ok, true);
  assert.equal(byRector.registry.find(r => r.id === 'R-PK-01').value, '5 ngày');
  assert.equal(byRector.ledger[byRector.ledger.length - 1].action, 'CẬP NHẬT QUY ĐỊNH R-PK-01');
});
