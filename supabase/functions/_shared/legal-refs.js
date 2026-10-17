// @ts-check
/**
 * Trích dẫn văn bản quy phạm pháp luật trong một đoạn văn bản tiếng Việt, chuẩn hoá về một mã thống nhất,
 * và nhận diện các cụm từ cho biết quan hệ pháp lý (sửa đổi, thay thế, bãi bỏ, hướng dẫn…).
 *
 * Module thuần, chạy được ở trình duyệt, Node (test) và Deno (Edge Function). Không gọi mạng, không dùng AI:
 * mọi trích dẫn phải nằm nguyên văn trong văn bản thì mới được ghi nhận.
 *
 * Kèm theo là bộ lọc đường dẫn (allowlist) dùng cho phía máy chủ khi tải văn bản từ nguồn chính thức.
 */
(function attachLegalRefs(/** @type {any} */ root, /** @type {() => any} */ factory) {
  const api = factory();
  // @ts-ignore -- CommonJS khi chạy trong Node.
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLegalRefs = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLegalRefs() {
  'use strict';

  /** Loại quan hệ được hỗ trợ. Chỉ gán khi có bằng chứng (metadata chính thức hoặc câu chữ trong văn bản). */
  const RELATIONS = Object.freeze(['CITES', 'AMENDS', 'SUPPLEMENTS', 'IMPLEMENTS', 'GUIDES', 'REPLACES', 'REPEALS', 'CONSOLIDATES', 'RELATED_TO']);

  /** Nhãn tiếng Việt cho từng loại quan hệ (chiều: văn bản nguồn → văn bản đích). */
  const RELATION_LABELS = Object.freeze({
    CITES: 'dẫn chiếu', AMENDS: 'sửa đổi', SUPPLEMENTS: 'bổ sung', IMPLEMENTS: 'quy định chi tiết', GUIDES: 'hướng dẫn',
    REPLACES: 'thay thế', REPEALS: 'bãi bỏ', CONSOLIDATES: 'hợp nhất', RELATED_TO: 'liên quan'
  });

  /** Ký hiệu loại văn bản thường gặp trong số ký hiệu. */
  const KIND_BY_CODE = Object.freeze({
    'QH': 'Luật', 'L': 'Luật', 'NĐ': 'Nghị định', 'TT': 'Thông tư', 'TTLT': 'Thông tư liên tịch', 'QĐ': 'Quyết định',
    'NQ': 'Nghị quyết', 'CT': 'Chỉ thị', 'PL': 'Pháp lệnh', 'VBHN': 'Văn bản hợp nhất', 'HD': 'Hướng dẫn', 'CV': 'Công văn'
  });

  /**
   * Nguồn văn bản. Nguồn chính thức (primary) là căn cứ để kết luận; nguồn thứ cấp chỉ để tìm hoặc đối chiếu.
   * Danh sách này cũng là allowlist tải trang của máy chủ: không có trong danh sách thì không tải.
   */
  const SOURCES = Object.freeze([
    { host: 'vbpl.vn', name: 'Cơ sở dữ liệu quốc gia về văn bản pháp luật', tier: 'primary' },
    { host: 'vanban.chinhphu.vn', name: 'Hệ thống văn bản Chính phủ', tier: 'primary' },
    { host: 'congbao.chinhphu.vn', name: 'Công báo điện tử', tier: 'primary' },
    { host: 'chinhphu.vn', name: 'Cổng thông tin điện tử Chính phủ', tier: 'primary' },
    { host: 'moet.gov.vn', name: 'Bộ Giáo dục và Đào tạo', tier: 'primary' },
    { host: 'thuvienphapluat.vn', name: 'Thư viện Pháp luật (thứ cấp)', tier: 'secondary' },
    { host: 'luatvietnam.vn', name: 'LuatVietnam (thứ cấp)', tier: 'secondary' }
  ]);

  /** @param {string} s */
  function stripDiacritics(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  /**
   * Mã chuẩn của một số ký hiệu: bỏ khoảng trắng, viết hoa, bỏ dấu để "NĐ-CP" và "ND-CP" khớp nhau.
   * @param {string} raw
   */
  function canonicalId(raw) {
    return stripDiacritics(String(raw).normalize('NFC')).toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
  }

  /**
   * Số ký hiệu dạng 08/2021/TT-BGDĐT, 04/2021/NĐ-CP, 34/2018/QH14, 1234/QĐ-ĐHBK, 05/VBHN-BGDĐT.
   * Nhóm: số, năm (có thể thiếu), phần ký hiệu.
   */
  const NUMBER_RE = /(?<![\p{L}\d\/])(\d{1,5})\s*\/\s*(?:(\d{4})\s*\/\s*)?((?:[A-ZĐ]{1,8}\d{0,2})(?:\s*-\s*[A-ZĐ0-9]{1,12}){0,3})(?![\p{L}\d])/giu;

  /** Phần nối giữa cụm từ báo quan hệ và số hiệu: tên loại văn bản, vài chữ tên, chữ "số". */
  const KIND_WORDS = '(?:Bộ luật|Luật|Nghị định|Thông tư liên tịch|Thông tư|Quyết định|Nghị quyết|Chỉ thị|Pháp lệnh|Văn bản hợp nhất)';
  const TAIL = '(?:\\s+' + KIND_WORDS + '(?:\\s+[^\\s.;,]+){0,8}?)?(?:\\s+số)?\\s*$';
  const PROV = '(?:(?:điều|khoản|điểm)\\s+[\\dA-Za-zđ]{1,4}(?:(?:\\s*,\\s*|\\s+và\\s+|\\s+)(?:(?:điều|khoản|điểm)\\s+)?\\d{1,4}[a-zđ]?)*)';
  /** @param {string} head */
  const cue = head => new RegExp(head + TAIL, 'iu');
  /** Cụm từ báo quan hệ, xét trong khoảng ngay trước trích dẫn, cùng câu. Thứ tự: cụm dài, cụ thể trước. */
  const CUES = [
    { re: cue('sửa đổi,?\\s*bổ sung(?:\\s+(?:một số điều|' + PROV + '))?(?:\\s+(?:của|tại))?'), type: 'AMENDS' },
    { re: cue('sửa đổi(?:\\s+(?:một số điều|' + PROV + '))?(?:\\s+(?:của|tại|theo))?'), type: 'AMENDS' },
    { re: cue('bổ sung(?:\\s+(?:một số điều|' + PROV + '))?(?:\\s+(?:của|cho|vào))?'), type: 'SUPPLEMENTS' },
    { re: cue('(?:thay thế|thay cho)(?:\\s+(?:toàn bộ|một phần|một số điều|các điều|' + PROV + '))?(?:\\s+(?:của|tại|cho))?'), type: 'REPLACES' },
    { re: cue('(?:bãi bỏ|hết hiệu lực|chấm dứt hiệu lực)(?:\\s+(?:toàn bộ|một phần|một số điều|các điều|' + PROV + '))?(?:\\s+(?:của|tại))?'), type: 'REPEALS' },
    { re: cue('(?:quy định chi tiết và hướng dẫn thi hành|quy định chi tiết|hướng dẫn thi hành|hướng dẫn thực hiện)(?:\\s+(?:một số điều|các điều|' + PROV + '))?(?:\\s+(?:của|tại))?'), type: 'IMPLEMENTS' },
    { re: cue('hướng dẫn(?:\\s+(?:về|việc))?'), type: 'GUIDES' },
    { re: cue('hợp nhất'), type: 'CONSOLIDATES' },
    { re: /căn cứ(?:\s+\S+){0,10}\s*$/iu, type: 'CITES' }
  ];

  /** Phạm vi bãi bỏ: toàn bộ hay một phần, đọc trong cụm từ báo quan hệ. @param {string} cue */
  function scopeOf(cue) {
    if (/một phần|một số điều|các điều|điều\s+\d+|khoản\s+\d+|điểm\s+[a-zđ]/iu.test(cue)) return 'partial';
    return 'whole';
  }

  /** @param {string} cueText */
  function provisionsOf(cueText) {
    const m = cueText.match(new RegExp(PROV, 'iu'));
    return m ? m[0] : null;
  }

  /**
   * Phân tích phần ký hiệu thành loại văn bản và cơ quan ban hành.
   * @param {string} sym ví dụ "TT-BGDĐT", "NĐ-CP", "QH14"
   */
  function parseSymbol(sym) {
    const parts = sym.toUpperCase().replace(/\s+/g, '').split('-');
    const head = parts[0];
    const law = /^QH\d{0,2}$/.test(head);
    const code = law ? 'QH' : head;
    const issuer = law ? 'Quốc hội' + (head.length > 2 ? ' khoá ' + head.slice(2) : '') : (parts.slice(1).join('-') || null);
    const key = stripDiacritics(code);
    const kind = Object.keys(KIND_BY_CODE).find(k => stripDiacritics(k) === key);
    return { code, kind: kind ? /** @type {any} */ (KIND_BY_CODE)[kind] : null, issuer };
  }

  /** Câu chứa vị trí i: cắt theo dấu chấm kết câu, xuống dòng, chấm phẩy. @param {string} text @param {number} i */
  function sentenceStart(text, i) {
    let k = i;
    while (k > 0 && !/[.;!?\n]/.test(text[k - 1])) k--;
    return k;
  }

  /**
   * Trích mọi số ký hiệu văn bản trong text. Trả về theo thứ tự xuất hiện; một văn bản nêu nhiều lần thì có nhiều mục
   * (giữ nguyên vị trí), dùng dedupeReferences() để gộp.
   * @param {string} text
   * @returns {Array<{raw:string, canonicalId:string, number:string, year:string|null, symbol:string, kind:string|null, kindCode:string,
   *   issuer:string|null, index:number, line:number, context:string, relation:string, relationBasis:string|null, cue:string|null,
   *   scope:string|null, provisions:string|null}>}
   */
  function extractReferences(text) {
    const src = String(text || '');
    /** @type {any[]} */ const out = [];
    NUMBER_RE.lastIndex = 0;
    let m;
    while ((m = NUMBER_RE.exec(src))) {
      const [raw, num, year, symbol] = m;
      const sym = parseSymbol(symbol);
      // Bỏ các dạng không phải số hiệu văn bản: ngày tháng (12/05/2024), phân số, mã không có loại văn bản.
      if (!sym.kind) continue;
      if (!year && !/^(QĐ|QD|CT|CV|HD|VBHN|NQ)$/.test(sym.code)) continue;
      const start = sentenceStart(src, m.index);
      const before = src.slice(Math.max(start, m.index - 160), m.index);
      let relation = 'CITES', cue = null, basis = null, scope = null, provisions = null;
      for (const c of CUES) {
        const cm = before.match(c.re);
        if (cm) {
          relation = c.type; cue = cm[0].trim(); basis = 'text_cue';
          if (c.type === 'REPEALS' || c.type === 'REPLACES') { scope = scopeOf(cue); provisions = provisionsOf(cue); }
          if (c.type === 'AMENDS' || c.type === 'SUPPLEMENTS') provisions = provisionsOf(cue);
          break;
        }
      }
      const end = src.indexOf('\n', m.index);
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      out.push({
        raw: raw.trim(), canonicalId: canonicalId((num + '/' + (year ? year + '/' : '') + symbol)), number: num, year: year || null,
        symbol: symbol.replace(/\s+/g, ''), kind: sym.kind, kindCode: sym.code, issuer: sym.issuer, index: m.index,
        line: src.slice(0, m.index).split('\n').length, context: src.slice(lineStart, end < 0 ? src.length : end).trim().slice(0, 400),
        relation, relationBasis: basis, cue, scope, provisions
      });
    }
    return out;
  }

  /**
   * Gộp các trích dẫn cùng một văn bản. Quan hệ mạnh hơn (thay thế, bãi bỏ, sửa đổi…) thắng "dẫn chiếu".
   * @param {ReturnType<typeof extractReferences>} refs
   */
  function dedupeReferences(refs) {
    const rank = { REPEALS: 6, REPLACES: 6, AMENDS: 5, SUPPLEMENTS: 4, IMPLEMENTS: 3, GUIDES: 3, CONSOLIDATES: 2, CITES: 1, RELATED_TO: 0 };
    /** @type {Map<string, any>} */ const by = new Map();
    for (const r of refs) {
      const cur = by.get(r.canonicalId);
      if (!cur) { by.set(r.canonicalId, { ...r, occurrences: [{ index: r.index, line: r.line, raw: r.raw, context: r.context }] }); continue; }
      cur.occurrences.push({ index: r.index, line: r.line, raw: r.raw, context: r.context });
      if (/** @type {any} */ (rank)[r.relation] > /** @type {any} */ (rank)[cur.relation]) {
        Object.assign(cur, { relation: r.relation, relationBasis: r.relationBasis, cue: r.cue, scope: r.scope, provisions: r.provisions, context: r.context });
      }
    }
    return [...by.values()];
  }

  // ---------- Đường dẫn ----------

  /**
   * Chuẩn hoá URL để dùng làm khoá cache và tránh tải lặp: bỏ #, bỏ tham số theo dõi, host chữ thường.
   * @param {string} url
   */
  function normalizeUrl(url) {
    const u = new URL(String(url));
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const keys = /** @type {string[]} */ ([]);
    u.searchParams.forEach((_, k) => { keys.push(k); });
    for (const k of keys) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    let s = u.toString();
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  }

  /**
   * Nguồn tương ứng với một URL, hoặc null nếu URL không được phép tải.
   * Chặn: không phải https, có user:pass, cổng lạ, địa chỉ IP, host ngoài allowlist.
   * @param {string} url
   * @param {ReadonlyArray<{host:string,name:string,tier:string}>} [allow]
   */
  function sourceFor(url, allow) {
    let u;
    try { u = new URL(String(url)); } catch (_) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (u.port && u.port !== '443') return null;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (/^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost') return null;
    const list = allow || SOURCES;
    // Ưu tiên khớp host cụ thể nhất (vanban.chinhphu.vn trước chinhphu.vn).
    const hit = [...list].sort((a, b) => b.host.length - a.host.length).find(s => host === s.host || host.endsWith('.' + s.host));
    return hit || null;
  }

  return {
    RELATIONS, RELATION_LABELS, KIND_BY_CODE, SOURCES,
    stripDiacritics, canonicalId, parseSymbol, extractReferences, dedupeReferences, normalizeUrl, sourceFor
  };
});
