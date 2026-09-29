// @ts-check
/**
 * Phân quyền theo cấp và theo đơn vị phụ trách — dùng chung cho giao diện (khoá nút, lọc hàng đợi)
 * và cho Edge Function (chặn thật). Máy chủ không bao giờ tin cấp mà client tự khai.
 *
 * Mô hình:
 * - Mỗi người có một cấp (1 chuyên viên · 2 trưởng đơn vị · 3 Hiệu trưởng/Hội đồng) và danh sách
 *   đơn vị mình phụ trách. '*' nghĩa là toàn trường.
 * - Tạo thay đổi: cấp người gửi ≥ cấp ban hành khai trong thay đổi, và phụ trách đơn vị sở hữu quy định.
 * - U1 (chưa rõ dữ kiện): người phụ trách đơn vị sở hữu tài liệu.
 * - U2 (đụng quy định khác): trưởng đơn vị sở hữu quy định bị đụng.
 * - U3 (vượt thẩm quyền) và rà soát ngữ nghĩa: cấp ≥ cấp tài liệu và phụ trách đơn vị sở hữu tài liệu.
 * - Hoàn tác: cấp ≥ cấp tài liệu và phụ trách tài liệu. Thêm neo cho quy định: trưởng đơn vị sở hữu quy định.
 */
(function attachPolicyAuthz(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const g = /** @type {any} */ (root || {});
  // @ts-ignore
  const Engine = typeof module === 'object' && module.exports ? require('./policy-engine.js') : g.PolicyChangeEngine;
  const api = factory(Engine);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeAuthz = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyAuthz(/** @type {any} */ Engine) {
  'use strict';

  /**
   * @typedef {{ id:string, displayName:string, tier:number, units:string[] }} Member
   * @typedef {{ tier:number, unit:string, label:string }} Requirement
   */

  /** Vai trò dùng cho chế độ trình diễn. Dữ liệu tổng hợp, không phải người thật. */
  const DEMO_PERSONAS = Object.freeze([
    Object.freeze({ id: 'cv-dt', displayName: 'Chuyên viên Phòng Đào tạo', tier: 1, units: Object.freeze(['Phòng Đào tạo', 'Cổng thông tin sinh viên']) }),
    Object.freeze({ id: 'tp-dt', displayName: 'Trưởng phòng Đào tạo', tier: 2, units: Object.freeze(['Phòng Đào tạo', 'Cổng thông tin sinh viên']) }),
    Object.freeze({ id: 'tp-tt', displayName: 'Trưởng phòng Thanh tra – Pháp chế', tier: 2, units: Object.freeze(['Phòng Thanh tra – Pháp chế']) }),
    Object.freeze({ id: 'tp-tc', displayName: 'Trưởng phòng Kế hoạch – Tài chính', tier: 2, units: Object.freeze(['Phòng Kế hoạch – Tài chính', 'Văn phòng Đoàn – Hội']) }),
    Object.freeze({ id: 'ht', displayName: 'Hiệu trưởng', tier: 3, units: Object.freeze(['*']) })
  ]);

  /** @param {Member|null|undefined} member @param {string} unit */
  function covers(member, unit) {
    return !!member && Array.isArray(member.units) && (member.units.includes('*') || member.units.includes(unit));
  }

  /** @param {Member|null|undefined} member */
  function tierOf(member) {
    return member && Number.isInteger(member.tier) ? member.tier : 0;
  }

  /**
   * Quy định "bị đụng" của một vị trí U2 — cùng cách chọn với động cơ (foreign[0]).
   * @param {any} prop @param {any} change @param {any[]} registry
   */
  function foreignRuleOf(prop, change, registry) {
    const oldNum = Engine.parseValue(change.oldValue).num;
    return Engine.ownersOfLine(prop.line, registry)
      .find((/** @type {any} */ r) => r.id !== (change.rule && change.rule.id) && Engine.parseValue(r.value).num === oldNum) || null;
  }

  /**
   * Ai được quyết một hồ sơ chuyển tiếp (hoặc một AUTO_PATCH đang bị giữ vì bằng chứng ngữ nghĩa).
   * @param {any} prop @param {any} change @param {any[]} registry
   * @returns {Requirement}
   */
  function requirementFor(prop, change, registry) {
    if (prop.category === 'U2') {
      const other = foreignRuleOf(prop, change, registry);
      const unit = other ? other.owner : prop.docOwner;
      return { tier: 2, unit, label: Engine.TIER_APPROVER[2] + ' · ' + unit };
    }
    if (prop.category === 'U1') {
      return { tier: 1, unit: prop.docOwner, label: 'Người phụ trách tài liệu · ' + prop.docOwner };
    }
    const tier = Math.max(1, Number(prop.docTier) || 1);
    return { tier, unit: prop.docOwner, label: Engine.TIER_APPROVER[tier] + ' · ' + prop.docOwner };
  }

  /** @param {Member|null|undefined} member @param {Requirement} requirement */
  function meets(member, requirement) {
    return tierOf(member) >= requirement.tier && covers(member, requirement.unit);
  }

  /**
   * @param {Member|null|undefined} member @param {any} change
   * @returns {{ ok:boolean, reason?:string }}
   */
  function canIssue(member, change) {
    if (!member) return { ok: false, reason: 'Chưa xác định người gửi yêu cầu.' };
    if (!change || !change.rule) return { ok: false, reason: 'Thay đổi không hợp lệ.' };
    if (tierOf(member) < change.issuerTier) {
      return { ok: false, reason: member.displayName + ' là cấp ' + tierOf(member) + ', không được ban hành thay đổi ở cấp ' + change.issuerTier + '.' };
    }
    if (!covers(member, change.rule.owner)) {
      return { ok: false, reason: member.displayName + ' không phụ trách ' + change.rule.owner + ', đơn vị sở hữu ' + change.rule.id + '.' };
    }
    return { ok: true };
  }

  /**
   * @param {Member|null|undefined} member @param {any} prop @param {any} change @param {any[]} registry
   * @returns {{ ok:boolean, requirement:Requirement, reason?:string }}
   */
  function canDecide(member, prop, change, registry) {
    const requirement = requirementFor(prop, change, registry);
    if (meets(member, requirement)) return { ok: true, requirement };
    return { ok: false, requirement, reason: 'Cần ' + requirement.label + ' (cấp ≥ ' + requirement.tier + ').' };
  }

  /** @param {Member|null|undefined} member @param {any} doc */
  function canUndo(member, doc) {
    const requirement = { tier: Number(doc && doc.tier) || 1, unit: doc ? doc.owner : '', label: '' };
    requirement.label = Engine.TIER_APPROVER[requirement.tier] + ' · ' + requirement.unit;
    return meets(member, requirement)
      ? { ok: true, requirement }
      : { ok: false, requirement, reason: 'Hoàn tác cần ' + requirement.label + '.' };
  }

  /** @param {Member|null|undefined} member @param {any} rule */
  function canEditRegistry(member, rule) {
    const requirement = { tier: 2, unit: rule ? rule.owner : '', label: Engine.TIER_APPROVER[2] + ' · ' + (rule ? rule.owner : '') };
    return meets(member, requirement)
      ? { ok: true, requirement }
      : { ok: false, requirement, reason: 'Sửa sổ đăng ký cần ' + requirement.label + '.' };
  }

  /**
   * Có được cập nhật giá trị gốc của quy định trong sổ đăng ký hay không: chỉ khi thay đổi được ban hành
   * ở cấp ≥ cấp của chính quy định đó. Nếu không, các tài liệu cấp dưới đã được đồng bộ nhưng quy định gốc
   * vẫn chờ cấp có thẩm quyền.
   * @param {any} change
   */
  function ratifiesRule(change) {
    return !!change && !!change.rule && change.issuerTier >= change.rule.tier;
  }

  return Object.freeze({
    DEMO_PERSONAS, covers, tierOf, foreignRuleOf, requirementFor, meets,
    canIssue, canDecide, canUndo, canEditRegistry, ratifiesRule
  });
});
