// @ts-check
/**
 * Gộp câu hỏi trùng: cùng một câu (ví dụ một câu FAQ được chép lên website, chatbot và mẫu email) thường bị chuyển
 * tiếp nhiều lần. Các vị trí có CÙNG loại hồ sơ, CÙNG người có thẩm quyền và CÙNG nội dung dòng được gộp thành một câu
 * hỏi; trả lời một lần áp cho mọi vị trí trong nhóm.
 *
 * An toàn: so CẢ DÒNG (sau chuẩn hoá khoảng trắng / hoa thường), không chỉ mệnh đề chứa con số đầu tiên — vì chấp thuận
 * sẽ thay mọi chỗ khớp trong dòng, người duyệt phải thấy đúng dòng sẽ bị sửa. Khác một chữ vẫn là hai câu hỏi. Mỗi vị
 * trí vẫn được kiểm quyền và ghi sổ riêng.
 */
(function attachGrouping(/** @type {any} */ root, /** @type {() => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeGrouping = api;
})(typeof globalThis === 'object' ? globalThis : this, function createGrouping() {
  'use strict';

  /** @param {string} text */
  function normalizeClause(text) {
    return String(text || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').replace(/^[\s\-–—•*:;,.]+|[\s\-–—•*:;,.!?]+$/g, '').trim();
  }

  /**
   * Khoá gộp của một vị trí cần người quyết; `null` nếu vị trí không thuộc diện gộp.
   * @param {any} p
   * @param {string} [ruleId] quy định đang sửa (các hồ sơ của thay đổi khác nhau không bao giờ gộp chung)
   * @param {any} [decider] yêu cầu thẩm quyền của vị trí (Authz.requirementFor) — với U2 người quyết là chủ quản quy
   *   định kia, không phải đơn vị sở hữu tài liệu, nên phải nằm trong khoá
   */
  function groupKey(p, ruleId, decider) {
    if (!p || p.outcome !== 'ESCALATE' || !p.category) return null;
    const text = normalizeClause(p.line);
    if (!text) return null;
    return JSON.stringify([ruleId || '', p.category, p.docOwner || '', Number(p.docTier) || 0, decider === undefined ? null : decider, text]);
  }

  /**
   * Gộp danh sách mục (mỗi mục có `p` là đề xuất) theo khoá. Giữ nguyên thứ tự xuất hiện; mục đầu tiên là đại diện.
   * @template T
   * @param {T[]} items
   * @param {(item:T) => string|null} keyOf
   * @returns {T[][]}
   */
  function groupItems(items, keyOf) {
    /** @type {Map<string, T[]>} */ const byKey = new Map();
    /** @type {T[][]} */ const out = [];
    for (const item of items) {
      const key = keyOf(item);
      if (key === null) { out.push([item]); continue; }
      const existing = byKey.get(key);
      if (existing) existing.push(item);
      else { const group = [item]; byKey.set(key, group); out.push(group); }
    }
    return out;
  }

  /**
   * Số câu hỏi người phải trả lời, trước và sau khi gộp.
   * @param {any[]} props @param {string} [ruleId] @param {(p:any) => any} [deciderOf]
   */
  function questionCount(props, ruleId, deciderOf) {
    const pending = (props || []).filter(p => p && p.outcome === 'ESCALATE');
    return { positions: pending.length, questions: groupItems(pending, p => groupKey(p, ruleId, deciderOf ? deciderOf(p) : undefined)).length };
  }

  return Object.freeze({ normalizeClause, groupKey, groupItems, questionCount });
});
