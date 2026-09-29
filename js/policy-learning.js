// @ts-check
/**
 * Học từ phản hồi của người duyệt — yêu cầu nâng cao #1 của Đề A ("tự điều chỉnh ngưỡng chuyển tiếp").
 *
 * Cách PolicyChange OS dịch ngưỡng: không đổi một con số xác suất mờ, mà đề xuất CỤM TỪ NEO mới cho
 * một quy định khi người phụ trách liên tục trả lời "Có, dòng này thuộc quy định X" cho các dòng U1.
 * Neo được thêm vào sổ đăng ký thì những dòng tương tự lần sau được tự xử lý (AUTO_PATCH) thay vì hỏi lại.
 *
 * An toàn:
 * - Chỉ ĐỀ XUẤT; người cấp ≥ 2 của đơn vị sở hữu quy định phải duyệt (addAnchor ghi sổ kiểm toán).
 * - Cụm từ bị loại nếu đã là neo, chồng lên neo quy định khác (sẽ sinh U2), xuất hiện ở dòng từng bị
 *   trả lời "Không", chứa chữ số, hoặc chỉ gồm từ chức năng.
 */
(function attachPolicyLearning(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLearning = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyLearning() {
  'use strict';

  /**
   * @typedef {{ ruleId:string, category:string, docId:string, lineIndex:number, line:string, answer:'accept'|'reject', ts?:string, actor?:string }} Feedback
   * @typedef {{ ruleId:string, phrase:string, support:number, lines:{docId:string, lineIndex:number}[] }} Suggestion
   */

  /** Từ chức năng / từ quá chung — cụm từ bắt đầu hoặc kết thúc bằng chúng bị bỏ. */
  const STOPWORDS = new Set(('và của là có được cho các những một khi thì tại từ kể sau trước với theo đến về này đó ' +
    'không phải để ở hoặc lên xuống chỉ đã sẽ em bạn vòng hạn thời trong ngày như nếu bị do nào cũng còn mà ' +
    'nhất chậm quá hết mỗi lần đơn vị người').split(/\s+/));

  /** @param {string} line */
  function tokens(line) {
    return String(line || '').toLowerCase().normalize('NFC')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  }

  /**
   * Mọi cụm 2–4 tiếng liên tiếp hợp lệ của một dòng.
   * @param {string} line @returns {Set<string>}
   */
  function phrasesOf(line) {
    const words = tokens(line);
    /** @type {Set<string>} */ const out = new Set();
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const slice = words.slice(i, i + n);
        if (slice.some(w => /\d/.test(w))) continue;
        if (STOPWORDS.has(slice[0]) || STOPWORDS.has(slice[slice.length - 1])) continue;
        const phrase = slice.join(' ');
        if (phrase.length >= 3 && phrase.length <= 60) out.add(phrase);
      }
    }
    return out;
  }

  /** @param {string} a @param {string} b */
  function overlaps(a, b) {
    const x = a.toLowerCase(); const y = b.toLowerCase();
    return x === y || x.includes(y) || y.includes(x);
  }

  /**
   * @param {ReadonlyArray<Feedback>} feedback
   * @param {ReadonlyArray<any>} registry
   * @param {{ minSupport?:number, limit?:number }} [options]
   * @returns {Suggestion[]}
   */
  function suggestAnchors(feedback, registry, options = {}) {
    const minSupport = Math.max(2, Number(options.minSupport) || 2);
    const limit = Math.max(1, Number(options.limit) || 5);
    const list = Array.isArray(feedback) ? feedback : [];
    /** @type {Suggestion[]} */ const result = [];

    for (const rule of registry || []) {
      const about = list.filter(f => f && f.ruleId === rule.id && f.category === 'U1' && typeof f.line === 'string');
      const lineKey = (/** @type {Feedback} */ f) => f.docId + '\u0000' + f.lineIndex;
      /** @type {Map<string, Feedback>} */ const accepted = new Map();
      /** @type {Set<string>} */ const rejectedPhrases = new Set();
      for (const f of about) {
        if (f.answer === 'accept') accepted.set(lineKey(f), f);
        else if (f.answer === 'reject') phrasesOf(f.line).forEach(p => rejectedPhrases.add(p));
      }
      // Dòng vừa được trả lời "Có" rồi sau đó "Không" (hoặc ngược lại) — lấy câu trả lời mới nhất theo thứ tự nhập.
      for (const f of about) if (f.answer === 'reject') accepted.delete(lineKey(f));

      /** @type {Map<string, {docId:string, lineIndex:number}[]>} */ const support = new Map();
      for (const f of accepted.values()) {
        for (const phrase of phrasesOf(f.line)) {
          if (!support.has(phrase)) support.set(phrase, []);
          /** @type {any} */ (support.get(phrase)).push({ docId: f.docId, lineIndex: f.lineIndex });
        }
      }
      const others = (registry || []).filter(r => r.id !== rule.id).flatMap(r => r.aliases || []);
      /** @type {Suggestion[]} */
      let candidates = [...support.entries()]
        .filter(([phrase, lines]) => lines.length >= minSupport &&
          !rule.aliases.some((/** @type {string} */ a) => overlaps(a, phrase)) &&
          !others.some((/** @type {string} */ a) => overlaps(a, phrase)) &&
          !rejectedPhrases.has(phrase))
        .map(([phrase, lines]) => ({ ruleId: rule.id, phrase, support: lines.length, lines }));
      // Giữ cụm dài nhất trong các cụm lồng nhau có cùng độ ủng hộ ("lưu bài thi" thay vì "lưu bài").
      candidates = candidates.filter(c => !candidates.some(o => o !== c && o.support === c.support &&
        o.phrase.length > c.phrase.length && (' ' + o.phrase + ' ').includes(' ' + c.phrase + ' ')));
      candidates.sort((a, b) => b.support - a.support || b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase));
      result.push(...candidates.slice(0, limit));
    }
    return result;
  }

  /**
   * Thống kê phản hồi theo loại chuyển tiếp — hiển thị trên màn hình "Học từ phản hồi".
   * @param {ReadonlyArray<Feedback>} feedback
   */
  function escalationStats(feedback) {
    /** @type {Record<string, { accept:number, reject:number, total:number, acceptRate:number|null }>} */
    const byCategory = {};
    /** @type {Record<string, { accept:number, reject:number, total:number }>} */
    const byRule = {};
    for (const f of Array.isArray(feedback) ? feedback : []) {
      if (!f || (f.answer !== 'accept' && f.answer !== 'reject')) continue;
      const c = byCategory[f.category] || (byCategory[f.category] = { accept: 0, reject: 0, total: 0, acceptRate: null });
      c[f.answer]++; c.total++;
      const r = byRule[f.ruleId] || (byRule[f.ruleId] = { accept: 0, reject: 0, total: 0 });
      r[f.answer]++; r.total++;
    }
    Object.values(byCategory).forEach(c => { c.acceptRate = c.total ? c.accept / c.total : null; });
    const total = Object.values(byCategory).reduce((s, c) => s + c.total, 0);
    return { total, byCategory, byRule };
  }

  return Object.freeze({ STOPWORDS, phrasesOf, suggestAnchors, escalationStats });
});
