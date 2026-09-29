// @ts-check
/**
 * Động cơ phân xử tiền định của PolicyChange OS.
 *
 * Đây là nơi DUY NHẤT quyết định một vị trí là AUTO_PATCH hay ESCALATE (U1/U2/U3).
 * Module thuần: không đụng DOM, không đọc trạng thái toàn cục, nhận sổ đăng ký qua tham số.
 * Cùng một mã nguồn chạy trong trình duyệt, Node (test, benchmark) và Deno (Edge Function),
 * nên máy chủ tái lập được đúng quyết định mà giao diện đã hiển thị.
 */
(function attachPolicyEngine(root, factory) {
  const api = factory();
  // @ts-ignore -- CommonJS export khi chạy trong Node.
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyEngine() {
  'use strict';

  /**
   * @typedef {{ id:string, name:string, value:string, tier:number, source:string, owner:string, aliases:string[] }} Rule
   * @typedef {{ id:string, title:string, owner:string, tier:number, version:string, lines:string[] }} PolicyDocument
   * @typedef {{ rule:Rule, oldValue:string, newValue:string, issuerTier:number }} Change
   * @typedef {{ index:number, text:string }} Hit
   * @typedef {{
   *   id:string, docId:string, docTitle:string, docOwner:string, docTier:number,
   *   lineIndex:number, line:string, newLine:string, hits:Hit[],
   *   outcome:'AUTO_PATCH'|'ESCALATE', category:null|'U1'|'U2'|'U3',
   *   reason:string, plain:string, citation:string,
   *   decided:boolean, accepted:boolean, decisionLabel:null|string,
   *   [key:string]: any
   * }} Proposal
   */

  /** @type {Readonly<Record<number,string>>} */
  const TIER_LABEL = Object.freeze({1:'Cấp 1 · tài liệu tác nghiệp', 2:'Cấp 2 · quy trình cấp Phòng/Ban', 3:'Cấp 3 · quy định cấp Trường'});
  /** @type {Readonly<Record<number,string>>} */
  const TIER_APPROVER = Object.freeze({1:'Chuyên viên phụ trách', 2:'Trưởng đơn vị chủ quản', 3:'Hiệu trưởng / Hội đồng Trường'});

  const now = () => (typeof performance === 'object' && performance && typeof performance.now === 'function')
    ? performance.now() : Date.now();

  /** @param {string} s */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /**
   * Chuẩn hoá một giá trị viết theo quy ước Việt Nam: dấu chấm hàng nghìn, dấu phẩy thập phân.
   * @param {unknown} v
   * @returns {{ raw:string, num:number|null, unit:string }}
   */
  function parseValue(v) {
    const raw = String(v || '').trim();
    const m = raw.match(/^((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)(?![\d.,])\s*(triệu|tr|tỉ|tỷ|nghìn|ngàn)?\s*(.*)$/i);
    if (!m) return { raw, num: null, unit: '' };
    /** @type {number|null} */
    let num = parseFloat(m[1].replace(/\./g, '').replace(/,/g, '.'));
    /** @type {Record<string, number>} */
    const scales = { 'triệu':1e6, 'tr':1e6, 'tỉ':1e9, 'tỷ':1e9, 'nghìn':1e3, 'ngàn':1e3 };
    const scale = scales[(m[2] || '').toLowerCase()];
    if (scale) num *= scale;
    if (!isFinite(num)) num = null;
    let unit = (m[3] || '').trim().toLowerCase();
    if (/^(đồng|vnđ|vnd)$/.test(unit)) unit = '';
    return { raw, num, unit };
  }

  /**
   * Biểu thức tìm mọi cách viết của một giá trị trong văn bản (10 triệu = 10.000.000 = 10tr).
   * @param {string} v
   * @returns {RegExp}
   */
  function valueRegex(v) {
    const p = parseValue(v);
    if (p.num === null) return new RegExp(escRe(p.raw), 'gi');
    const alts = new Set();
    const n = p.num;
    alts.add(String(n));
    if (n >= 1000) alts.add(n.toLocaleString('de-DE'));
    if (n < 10) alts.add('0' + n);
    if (n >= 1e6 && n % 1e6 === 0) { const m = n / 1e6; alts.add(m + ' triệu'); alts.add(m + 'triệu'); alts.add(m + ' tr'); alts.add(m + 'tr'); }
    if (n >= 1e3 && n < 1e6 && n % 1e3 === 0) { alts.add((n / 1e3) + ' nghìn'); }
    const numPart = '(?:' + [...alts].sort((a, b) => b.length - a.length).map(escRe).join('|') + ')';
    const unitPart = p.unit
      ? '\\s*' + p.unit.split(/\s+/).map(escRe).join('\\s+') + '(?:\\s+làm\\s+việc)?'
      : '(?:\\s*(?:đồng|VNĐ|VND|đ))?';
    try {
      // Biên phải: không được dính liền chữ hay số phía sau, để "10 tr" không khớp vào "10 trang"
      // và "7 ngày" không khớp một phần của một từ khác.
      return new RegExp('(?<![\\d.,])' + numPart + unitPart + '(?![\\p{L}\\p{N}])', 'giu');
    } catch (_) {
      // Trình duyệt cũ không hỗ trợ lookbehind — lùi về biến thể không có ràng buộc trái.
      return new RegExp('\\b' + numPart + unitPart, 'gi');
    }
  }

  /**
   * Con số nằm trong ngày tháng, khoảng số hay số thập phân thì không phải giá trị quy định.
   * @param {string} line @param {number} index @param {string} text
   */
  function isStructuredNumericOccurrence(line, index, text) {
    const numeric = String(text || '').match(/^[\d.,]+/);
    if (!numeric) return false;
    const before = index > 0 ? line[index - 1] : '';
    const after = line[index + numeric[0].length] || '';
    if (/[\d/]/.test(before) || /[\d/]/.test(after)) return true;
    const beforePrevious = index > 1 ? line[index - 2] : '';
    const afterNext = line[index + numeric[0].length + 1] || '';
    const prefix = line.slice(0, index);
    const suffix = line.slice(index + numeric[0].length);
    if (/\d\s*[-–—]\s*$/.test(prefix) || /^\s*[-–—]\s*\d/.test(suffix)) return true;
    return (/[.,]/.test(before) && /\d/.test(beforePrevious)) || (/[.,]/.test(after) && /\d/.test(afterNext));
  }

  /**
   * Giữ nguyên hậu tố đơn vị mà văn bản đang dùng (đồng / làm việc) nếu giá trị mới không nêu.
   * @param {string} templateMatch @param {string} newValue
   */
  function renderValue(templateMatch, newValue) {
    const p = parseValue(newValue);
    const template = String(templateMatch);
    // Văn bản viết kiểu 10.000.000 / 10.000.000đ thì giữ nguyên kiểu viết và hậu tố đó.
    const dotted = template.match(/^(\d{1,3}(?:\.\d{3})+)(.*)$/);
    if (dotted && p.num !== null && !p.unit && Number.isInteger(p.num) && p.num >= 1000) {
      return p.num.toLocaleString('de-DE') + dotted[2];
    }
    // Văn bản viết tắt kiểu 10tr / 10 tr thì giữ kiểu viết tắt.
    const short = template.match(/^[\d.,]+(\s*)tr$/i);
    if (short && p.num !== null && !p.unit && p.num >= 1e6) {
      return String(p.num / 1e6).replace('.', ',') + short[1] + 'tr';
    }
    let out = p.raw;
    if (/(?:đồng|VNĐ|VND)\s*$/i.test(template) && !/(?:đồng|VNĐ|VND)/i.test(out)) out += ' đồng';
    if (/làm\s+việc/i.test(template) && !/làm\s+việc/i.test(out)) out += ' làm việc';
    return out;
  }

  /**
   * Các quy định có cụm từ neo xuất hiện trong dòng.
   * @param {string} line @param {ReadonlyArray<Rule>} registry
   * @returns {Rule[]}
   */
  function ownersOfLine(line, registry) {
    const low = String(line).toLowerCase();
    return (registry || []).filter(r => Array.isArray(r.aliases) && r.aliases.some(a => low.includes(String(a).toLowerCase())));
  }

  /**
   * @param {string} line @param {string} oldValue
   * @returns {boolean}
   */
  function matchesOldValue(line, oldValue) {
    const re = valueRegex(oldValue);
    re.lastIndex = 0;
    return re.test(line);
  }

  /**
   * Phân xử một thay đổi trên toàn bộ kho tài liệu.
   * Thứ tự kiểm tra: U2 (thuộc quy định khác) → U3 (vượt thẩm quyền) → U1 (không neo) → tự động.
   * @param {Change} change
   * @param {ReadonlyArray<PolicyDocument>} docs
   * @param {ReadonlyArray<Rule>} registry
   * @returns {{ props:Proposal[], elapsedMs:number }}
   */
  function analyze(change, docs, registry) {
    const t0 = now();
    const rule = change.rule;
    const re = valueRegex(change.oldValue);
    /** @type {Proposal[]} */
    const props = [];
    let seq = 0;

    for (const doc of docs) {
      doc.lines.forEach((line, li) => {
        re.lastIndex = 0;
        /** @type {RegExpExecArray|null} */
        let m;
        /** @type {Hit[]} */
        const hits = [];
        while ((m = re.exec(line)) !== null) {
          if (!isStructuredNumericOccurrence(line, m.index, m[0])) hits.push({ index: m.index, text: m[0] });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
        if (!hits.length) return;

        const owners = ownersOfLine(line, registry);
        const ownerIds = owners.map(o => o.id);
        const foreign = owners.filter(o => o.id !== (rule ? rule.id : null) && parseValue(o.value).num === parseValue(change.oldValue).num);
        const isTarget = rule ? ownerIds.includes(rule.id) : false;

        /** @type {'AUTO_PATCH'|'ESCALATE'} */ let outcome;
        /** @type {null|'U1'|'U2'|'U3'} */ let cat;
        let reason, plain;
        if (foreign.length) {
          outcome = 'ESCALATE'; cat = 'U2';
          reason = 'Dòng này cũng được neo vào ' + foreign[0].id + ' — ' + foreign[0].name + ' (' + foreign[0].source + '). Giá trị cũ trùng nhau; cần người rà soát để tránh đổi quy định ngoài phạm vi.';
          plain = 'Dòng này còn nhắc tới một quy định khác đang dùng cùng giá trị. Hệ thống giữ nguyên phân loại U2 và yêu cầu rà soát trước khi sửa.';
        } else if (doc.tier > change.issuerTier) {
          outcome = 'ESCALATE'; cat = 'U3';
          reason = 'Tài liệu thuộc ' + TIER_LABEL[doc.tier] + ', do ' + doc.owner + ' ban hành — cao hơn cấp ban hành thay đổi (' + TIER_APPROVER[change.issuerTier] + ').';
          plain = 'Văn bản này do cấp trên ký ban hành. Người ra thay đổi lần này không có quyền sửa, phải trình đúng cấp.';
        } else if (owners.length === 0 || !isTarget || owners.length > 1) {
          outcome = 'ESCALATE'; cat = 'U1';
          reason = owners.length
            ? 'Dòng không có một neo độc quyền vào ' + (rule ? rule.id : 'quy định được sửa') + '; cần xác nhận quy định nào sở hữu giá trị này trước khi sửa.'
            : 'Không có cụm từ nào trong dòng neo con số này vào một quy định đã đăng ký, nên chưa xác định được nó có thuộc ' + (rule ? rule.id : 'quy định được sửa') + ' hay không.';
          plain = owners.length
            ? 'Dòng này có thể nhắc nhiều quy định hoặc chỉ nhắc quy định khác. Người phụ trách cần xác nhận trước khi sửa.'
            : 'Ở dòng này con số đứng trơ một mình, không có chữ nào cho biết nó là hạn mức nào. Đoán bừa thì rủi ro nên hỏi lại người phụ trách.';
        } else {
          outcome = 'AUTO_PATCH'; cat = null;
          reason = 'Dòng có cụm từ neo vào ' + rule.id + ' và tài liệu ở ' + TIER_LABEL[doc.tier] + ', nằm trong thẩm quyền của ' + TIER_APPROVER[change.issuerTier] + '.';
          plain = 'Đây là chỗ nhắc lại đúng quy định vừa đổi, sửa máy móc được nên hệ thống tự sửa.';
        }

        const newLine = line.replace(re, (mm, index) => isStructuredNumericOccurrence(line, index, mm) ? mm : renderValue(mm, change.newValue));
        props.push({
          id: 'P' + (++seq),
          docId: doc.id, docTitle: doc.title, docOwner: doc.owner, docTier: doc.tier,
          lineIndex: li, line, newLine, hits, outcome, category: cat, reason, plain,
          citation: rule ? (rule.id + ' — ' + rule.source) : '—',
          decided: false, accepted: false, decisionLabel: null
        });
      });
    }

    const elapsed = now() - t0;
    return { props, elapsedMs: Math.round(elapsed * 100) / 100 };
  }

  /**
   * Câu hỏi chuyển tiếp đơn lượt: đúng một câu, đúng hai lựa chọn.
   * @param {Proposal} p @param {Change} change @param {ReadonlyArray<Rule>} registry
   * @returns {{ q:string, a:string, b:string }}
   */
  function escalationQuestion(p, change, registry) {
    const rule = change.rule;
    const who = TIER_APPROVER[p.docTier];
    if (p.category === 'U1') {
      return {
        q: 'Tài liệu ' + p.docId + ' — ' + p.docTitle + ', dòng ' + (p.lineIndex + 1) + ': “' + p.line.trim() + '”. Giá trị “' + change.oldValue + '” ở đây không gắn với quy định nào trong sổ đăng ký. ' +
           'Chuyên viên phụ trách tài liệu quyết định: giá trị này có thuộc ' + (rule ? rule.name.toLowerCase() : 'quy định vừa sửa') + ' không?',
        a: 'Có — sửa thành “' + change.newValue + '”',
        b: 'Không — giữ nguyên “' + change.oldValue + '”'
      };
    }
    if (p.category === 'U2') {
      const low = p.line.toLowerCase();
      const other = (registry || []).find(r => r.id !== (rule ? rule.id : null) && r.aliases.some(a => low.includes(a.toLowerCase())));
      return {
        q: 'Dòng ' + (p.lineIndex + 1) + ' của ' + p.docId + ' đang diễn đạt ' + (other ? other.id + ' — ' + other.name : 'một quy định khác') + ', hiện vẫn giữ giá trị ' + (other ? other.value : change.oldValue) + '. ' +
           'Sửa ở đây sẽ thay đổi cả quy định đó. ' + (other ? other.owner : who) + ' quyết định: có sửa kèm không?',
        a: 'Không — chỉ sửa ' + (rule ? rule.id : 'quy định đích') + ', giữ nguyên dòng này',
        b: 'Có — sửa cả ' + (other ? other.id : 'quy định kia') + ' và ghi nhận là sửa đổi có chủ đích'
      };
    }
    return {
      q: p.docId + ' — ' + p.docTitle + ' do ' + p.docOwner + ' ban hành ở ' + TIER_LABEL[p.docTier] + ', cao hơn cấp ra thay đổi lần này (' + TIER_APPROVER[change.issuerTier] + '). ' +
         'Hệ thống đã khoá quyền sửa. ' + TIER_APPROVER[p.docTier] + ' quyết định: xử lý thế nào?',
      a: 'Từ chối — giữ nguyên, yêu cầu ban hành quyết định sửa đổi đúng cấp',
      b: 'Chấp thuận sửa ngay và ghi nhận ngoại lệ có phê duyệt'
    };
  }

  /**
   * Lựa chọn nào của câu hỏi dẫn tới việc sửa dòng: nút A với U1, nút B với U2/U3.
   * @param {null|'U1'|'U2'|'U3'} category @param {'a'|'b'} act
   */
  function actAccepts(category, act) {
    return category === 'U1' ? act === 'a' : act === 'b';
  }

  /**
   * Bộ phân tích câu lệnh tiếng Việt (tiền định). Dùng làm đường dự phòng khi LLM không khả dụng.
   * @param {string} text @param {ReadonlyArray<Rule>} registry
   * @returns {{ ok:true, ruleId:string, oldValue:string, newValue:string, issuerTier:number } | { ok:false, msg:string }}
   */
  function parseFreeText(text, registry) {
    const t = String(text || '').trim();
    if (!t) return { ok: false, msg: 'Chưa nhập nội dung.' };

    /** @type {string|null} */ let oldV = null;
    /** @type {string|null} */ let newV = null;
    let m = t.match(/từ\s+(.+?)\s+(?:thành|lên|xuống|còn|sang)\s+([\d.,]+\s*(?:triệu|tr|tỉ|tỷ|nghìn|ngàn)?\s*(?:ngày(?:\s+làm\s+việc)?|tín\s+chỉ|đồng|vnđ|vnd)?)/i);
    if (m) { oldV = m[1].trim(); newV = m[2].trim().replace(/[,.;]+$/, ''); }
    if (!oldV) {
      m = t.match(/([\d.,]+\s*(?:triệu|tr|nghìn)?\s*[\p{L}]*)\s*(?:->|→|=>)\s*([\d.,]+\s*(?:triệu|tr|nghìn)?\s*[\p{L}]*)/u);
      if (m) { oldV = m[1].trim(); newV = m[2].trim(); }
    }
    if (!oldV || !newV) return { ok: false, msg: 'Không nhận ra cặp giá trị cũ → mới. Hãy viết dạng “từ 7 ngày xuống 5 ngày” hoặc “7 ngày → 5 ngày”.' };
    if (parseValue(oldV).num === null || parseValue(newV).num === null)
      return { ok: false, msg: 'Giá trị không đúng định dạng số Việt Nam. Dùng dấu chấm cho hàng nghìn và dấu phẩy cho phần thập phân.' };

    /** @type {number|null} */
    let issuerTier = null;
    if (/hiệu trưởng|hội đồng trường|phó hiệu trưởng/i.test(t)) issuerTier = 3;
    else if (/chuyên viên|tổ\s|bộ phận|văn phòng/i.test(t)) issuerTier = 1;
    else if (/trưởng phòng|trưởng đơn vị|ban giám hiệu/i.test(t)) issuerTier = 2;
    if (issuerTier === null) return { ok: false, msg: 'Chưa rõ cấp ban hành. Hãy nêu rõ cấp có thẩm quyền trước khi phân tích.' };

    const low = t.toLowerCase();
    const oldNum = parseValue(oldV).num;
    const candidates = (registry || [])
      .map(r => ({ r, score: r.aliases.filter(a => low.includes(a.toLowerCase())).length, valueMatch: parseValue(r.value).num === oldNum }))
      .filter(c => c.valueMatch && c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) {
      const anyValue = (registry || []).some(r => parseValue(r.value).num === oldNum);
      return { ok: false, msg: anyValue
        ? 'Có nhiều quy định đang mang giá trị “' + oldV + '”. Câu lệnh chưa nêu rõ quy định nào — hãy chọn ở ô bên trái.'
        : 'Không có quy định nào trong sổ đăng ký đang mang giá trị “' + oldV + '”. Hệ thống từ chối xử lý để tránh sửa nhầm.' };
    }
    if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
      return { ok: false, msg: 'Câu lệnh có thể khớp với nhiều quy định. Chưa rõ policy đích — hãy chọn một quy định cụ thể.' };
    }
    return { ok: true, ruleId: candidates[0].r.id, oldValue: oldV, newValue: newV, issuerTier };
  }

  /**
   * Khoá so sánh giá trị (số + đơn vị) dùng cho validator AI.
   * @param {string} value @returns {string|null}
   */
  function policyValueKey(value) {
    const parsed = parseValue(value);
    if (parsed.num === null) return null;
    return JSON.stringify([parsed.num, parsed.unit]);
  }

  /**
   * Kiểm tra một thay đổi trước khi phân tích. Trả thông báo lỗi tiếng Việt hoặc `null`.
   * @param {Rule|undefined} rule @param {string} newValue @param {number} issuerTier
   */
  function changeError(rule, newValue, issuerTier) {
    if (!rule) return 'Quy định không có trong sổ đăng ký.';
    const value = String(newValue || '').trim();
    if (!value) return 'Chưa nhập giá trị mới.';
    if (parseValue(value).num === null) return 'Giá trị mới không đúng định dạng số Việt Nam (ví dụ: 10,5 triệu hoặc 10.500.000 đồng).';
    if (!Number.isInteger(issuerTier) || issuerTier < 1 || issuerTier > 3) return 'Hãy chọn cấp ban hành thay đổi.';
    if (parseValue(value).num === parseValue(rule.value).num) return 'Giá trị mới trùng với giá trị hiện hành.';
    return null;
  }

  /** @param {string} v */
  function bumpVersion(v) {
    const m = String(v).match(/^(\d+)\.(\d+)$/);
    return m ? m[1] + '.' + (Number(m[2]) + 1) : v;
  }

  /**
   * @param {ReadonlyArray<PolicyDocument>} src
   * @returns {PolicyDocument[]}
   */
  function cloneDocs(src) { return src.map(d => ({ ...d, lines: [...d.lines] })); }

  /**
   * @param {ReadonlyArray<Rule>} src
   * @returns {Rule[]}
   */
  function cloneRegistry(src) { return src.map(r => ({ ...r, aliases: [...r.aliases] })); }

  return Object.freeze({
    TIER_LABEL, TIER_APPROVER,
    escRe, parseValue, valueRegex, isStructuredNumericOccurrence, renderValue,
    ownersOfLine, matchesOldValue, analyze, escalationQuestion, actAccepts,
    parseFreeText, policyValueKey, changeError, bumpVersion, cloneDocs, cloneRegistry
  });
});
