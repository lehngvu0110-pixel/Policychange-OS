// @ts-check
/**
 * Đồ thị tác động dạng SVG: Quy định → Tài liệu → Dòng, tô màu theo kết quả phân xử.
 * Thuần chuỗi (không đụng DOM) để kiểm thử được; mọi văn bản đều được thoát HTML.
 */
(function attachImpactSvg(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeImpactSvg = api;
})(typeof globalThis === 'object' ? globalThis : this, function createImpactSvg() {
  'use strict';

  /** @param {unknown} v */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** @param {string} s @param {number} n */
  const cut = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  /** Trạng thái hiển thị của một vị trí. @param {any} p */
  function stateOf(p) {
    if (p.applied) return { key: 'done', label: 'Đã ban hành', color: 'var(--brand)', soft: 'var(--brand-soft)' };
    if (p.logged || (p.decided && !p.accepted) || (p.semanticHoldReviewed && !p.semanticHoldApproved)) return { key: 'kept', label: 'Giữ nguyên', color: 'var(--muted)', soft: 'var(--sunken)' };
    if (p.semanticHold && !p.semanticHoldApproved) return { key: 'hold', label: 'AI giữ lại', color: 'var(--hold)', soft: 'var(--hold-soft)' };
    if (p.outcome === 'AUTO_PATCH') return { key: 'auto', label: 'Tự sửa', color: 'var(--auto)', soft: 'var(--auto-soft)' };
    const map = /** @type {any} */ ({ U1: ['var(--u1)', 'var(--u1-soft)', 'U1 · chưa rõ'], U2: ['var(--u2)', 'var(--u2-soft)', 'U2 · quy định khác'], U3: ['var(--u3)', 'var(--u3-soft)', 'U3 · vượt cấp'] })[p.category];
    return { key: p.category, label: (p.decided ? 'Đã quyết · ' : '') + map[2], color: map[0], soft: map[1] };
  }

  /**
   * @param {{ change:any, props:any[] }} analysis
   * @returns {string} SVG hoặc chuỗi rỗng khi không có vị trí nào
   */
  function render(analysis) {
    const props = analysis && Array.isArray(analysis.props) ? analysis.props : [];
    if (!props.length) return '';
    const ROW = 46, TOP = 20, W = 1000;
    /** @type {any[]} */ const docs = [];
    /** @type {Map<string, any>} */ const byDoc = new Map();
    props.forEach((p, i) => {
      if (!byDoc.has(p.docId)) { const d = { id: p.docId, title: p.docTitle, tier: p.docTier, rows: [] }; byDoc.set(p.docId, d); docs.push(d); }
      byDoc.get(p.docId).rows.push(i);
    });
    const H = TOP * 2 + props.length * ROW;
    const yOf = (/** @type {number} */ i) => TOP + i * ROW + ROW / 2;
    const policyY = H / 2;
    const P = { x: 16, w: 214, h: 64 }, D = { x: 300, w: 250, h: 40 }, L = { x: 612, w: 372, h: 36 };
    const curve = (/** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ x2, /** @type {number} */ y2) => {
      const mx = (x1 + x2) / 2;
      return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
    };
    const rule = analysis.change && analysis.change.rule;
    let edges = '', nodes = '';
    for (const d of docs) {
      const dy = d.rows.reduce((/** @type {number} */ s, /** @type {number} */ i) => s + yOf(i), 0) / d.rows.length;
      edges += '<path class="edge" d="' + curve(P.x + P.w, policyY, D.x, dy) + '"/>';
      for (const i of d.rows) {
        const st = stateOf(props[i]);
        edges += '<path class="edge" style="stroke:' + st.color + ';stroke-opacity:.55" d="' + curve(D.x + D.w, dy, L.x, yOf(i)) + '"/>';
      }
      nodes += '<g class="node"><title>' + esc(d.id + ' — ' + d.title) + '</title>' +
        '<rect x="' + D.x + '" y="' + (dy - D.h / 2) + '" width="' + D.w + '" height="' + D.h + '" rx="9" style="fill:var(--panel);stroke:var(--line-2)"/>' +
        '<text x="' + (D.x + 12) + '" y="' + (dy - 3) + '" font-weight="700">' + esc(d.id) + '</text>' +
        '<text class="sub" x="' + (D.x + 12) + '" y="' + (dy + 12) + '">' + esc(cut(d.title, 27)) + ' · cấp ' + esc(d.tier) + '</text></g>';
    }
    props.forEach((p, i) => {
      const st = stateOf(p);
      const y = yOf(i);
      nodes += '<g class="node" data-prop="' + esc(p.id) + '"><title>' + esc(p.docId + ' dòng ' + (p.lineIndex + 1) + ': ' + p.line) + '</title>' +
        '<rect x="' + L.x + '" y="' + (y - L.h / 2) + '" width="' + L.w + '" height="' + L.h + '" rx="8" style="fill:' + st.soft + ';stroke:' + st.color + '"/>' +
        '<circle cx="' + (L.x + 14) + '" cy="' + y + '" r="5" style="fill:' + st.color + '"/>' +
        '<text x="' + (L.x + 26) + '" y="' + (y - 2) + '" font-weight="600">' + esc('Dòng ' + (p.lineIndex + 1) + ' · ' + st.label) + '</text>' +
        '<text class="sub" x="' + (L.x + 26) + '" y="' + (y + 12) + '">' + esc(cut(p.line, 52)) + '</text></g>';
    });
    nodes += '<g class="node"><title>' + esc(rule ? rule.id + ' — ' + rule.name : '') + '</title>' +
      '<rect x="' + P.x + '" y="' + (policyY - P.h / 2) + '" width="' + P.w + '" height="' + P.h + '" rx="12" style="fill:var(--brand-soft);stroke:var(--brand)"/>' +
      '<text x="' + (P.x + 14) + '" y="' + (policyY - 12) + '" font-weight="700" style="fill:var(--brand)">' + esc(rule ? rule.id : 'Quy định') + '</text>' +
      '<text x="' + (P.x + 14) + '" y="' + (policyY + 5) + '">' + esc(cut(analysis.change.oldValue + ' → ' + analysis.change.newValue, 28)) + '</text>' +
      '<text class="sub" x="' + (P.x + 14) + '" y="' + (policyY + 21) + '">' + esc('Ban hành ở cấp ' + analysis.change.issuerTier) + '</text></g>';
    const counts = props.reduce((/** @type {any} */ acc, p) => { const k = stateOf(p).key; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const summary = 'Đồ thị tác động: ' + (rule ? rule.id : '') + ' ảnh hưởng ' + props.length + ' dòng trong ' + docs.length + ' tài liệu. ' +
      Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ') + '.';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(summary) + '" xmlns="http://www.w3.org/2000/svg">' + edges + nodes + '</svg>';
  }

  return Object.freeze({ render, stateOf });
});
