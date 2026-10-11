// @ts-check
/**
 * Gộp câu hỏi trùng: cùng một mệnh đề (ví dụ một câu FAQ được chép lên website, chatbot và mẫu email) thường bị chuyển
 * tiếp nhiều lần. Các vị trí có CÙNG loại hồ sơ, CÙNG người có thẩm quyền và CÙNG mệnh đề chứa con số được gộp thành
 * một câu hỏi; trả lời một lần áp cho mọi vị trí trong nhóm.
 *
 * An toàn: chỉ gộp khi mệnh đề giống hệt sau chuẩn hoá khoảng trắng / hoa thường. Hai mệnh đề khác nhau dù chỉ một chữ
 * vẫn là hai câu hỏi. Mỗi vị trí vẫn được kiểm quyền và ghi sổ riêng.
 */
(function attachGrouping(/** @type {any} */ root, /** @type {(engine:any) => any} */ factory) {
  // @ts-ignore
  const engine = typeof module === 'object' && module.exports ? require('./policy-engine.js') : root && root.PolicyChangeEngine;
  const api = factory(engine);
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeGrouping = api;
})(typeof globalThis === 'object' ? globalThis : this, function createGrouping(/** @type {any} */ Engine) {
  'use strict';

  /** @param {string} text */
  function normalizeClause(text) {
    return String(text || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').replace(/^[\s\-–—•*:;,.]+|[\s\-–—•*:;,.!?]+$/g, '').trim();
  }

  /**
   * Khoá gộp của một vị trí cần người quyết; `null` nếu vị trí không thuộc diện gộp.
   * @param {any} p
   * @param {string} [ruleId] quy định đang sửa (các hồ sơ của thay đổi khác nhau không bao giờ gộp chung)
   */
  function groupKey(p, ruleId) {
    if (!p || p.outcome !== 'ESCALATE' || !p.category) return null;
    const hit = (Array.isArray(p.hits) && p.hits[0]) || (Array.isArray(p.variants) && p.variants[0]) || null;
    const clause = hit && Engine && typeof Engine.clauseAt === 'function' ? Engine.clauseAt(p.line, hit.index) : p.line;
    const text = normalizeClause(clause);
    if (!text) return null;
    return JSON.stringify([ruleId || '', p.category, p.docOwner || '', Number(p.docTier) || 0, text]);
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
   * @param {any[]} props @param {string} [ruleId]
   */
  function questionCount(props, ruleId) {
    const pending = (props || []).filter(p => p && p.outcome === 'ESCALATE');
    return { positions: pending.length, questions: groupItems(pending, p => groupKey(p, ruleId)).length };
  }

  return Object.freeze({ normalizeClause, groupKey, groupItems, questionCount });
});
