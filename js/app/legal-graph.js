// @ts-check
/**
 * Đồ thị văn bản pháp luật liên quan, dạng SVG xếp theo tầng (tầng 0 = văn bản đầu vào).
 * Thuần chuỗi để kiểm thử được; mọi văn bản đều được thoát HTML. Mỗi nút có data-action="legal-node" để bấm xem chi tiết.
 */
(function attachLegalGraph(/** @type {any} */ root, /** @type {() => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLegalGraph = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLegalGraph() {
  'use strict';

  /** @param {unknown} v */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** @param {string} s @param {number} n */
  const cut = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  /** @type {Record<string, {color:string, soft:string}>} */
  const TONE = {
    good: { color: 'var(--auto)', soft: 'var(--auto-soft)' }, warn: { color: 'var(--u1)', soft: 'var(--u1-soft)' },
    bad: { color: 'var(--u3)', soft: 'var(--u3-soft)' }, neutral: { color: 'var(--muted)', soft: 'var(--sunken)' },
    start: { color: 'var(--brand)', soft: 'var(--brand-soft)' }
  };
  /** @type {Record<string,string>} */
  const SHORT = { CITES: 'dẫn chiếu', AMENDS: 'sửa đổi', SUPPLEMENTS: 'bổ sung', IMPLEMENTS: 'quy định chi tiết', GUIDES: 'hướng dẫn',
    REPLACES: 'thay thế', REPEALS: 'bãi bỏ', CONSOLIDATES: 'hợp nhất', RELATED_TO: 'liên quan' };

  /**
   * @param {{ nodes:any[], edges:any[], startId:string }} result
   * @param {Record<string, any>} assessments id → kết quả legal-status.assess
   * @param {string|null} [selected]
   */
  function render(result, assessments, selected) {
    if (!result || !result.nodes || result.nodes.length < 2) return '';
    const cols = /** @type {any[][]} */ ([]);
    for (const n of result.nodes) { const d = Math.max(0, n.depth || 0); (cols[d] = cols[d] || []).push(n); }
    for (let i = 0; i < cols.length; i++) cols[i] = cols[i] || [];
    const W = 1000, TOP = 24, ROW = 60, NH = 44;
    const colW = W / cols.length;
    const NW = Math.min(210, colW - 34);
    const rows = Math.max(...cols.map(c => c.length));
    const H = TOP * 2 + rows * ROW;
    /** @type {Map<string, {x:number, y:number}>} */ const pos = new Map();
    cols.forEach((c, d) => {
      const offset = (rows - c.length) * ROW / 2;
      c.forEach((n, i) => pos.set(n.id, { x: 12 + d * colW, y: TOP + offset + i * ROW + ROW / 2 }));
    });
    let edges = '', labels = '', nodes = '';
    const showLabels = result.edges.length <= 40;
    for (const e of result.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const forward = b.x > a.x;
      const x1 = forward ? a.x + NW : a.x + NW / 2, y1 = forward ? a.y : a.y + (b.y >= a.y ? NH / 2 : -NH / 2);
      const x2 = forward ? b.x : b.x + NW / 2, y2 = forward ? b.y : b.y + (a.y >= b.y ? NH / 2 : -NH / 2);
      const mx = (x1 + x2) / 2;
      const d = forward ? 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2
        : 'M' + x1 + ',' + y1 + ' C' + (x1 + 60) + ',' + (y1 + (y2 > y1 ? 30 : -30)) + ' ' + (x2 + 60) + ',' + (y2 + (y2 > y1 ? -30 : 30)) + ' ' + x2 + ',' + y2;
      const strong = ['AMENDS', 'REPLACES', 'REPEALS', 'SUPPLEMENTS'].includes(e.type);
      const dash = e.basis === 'official_metadata' ? '' : e.basis === 'text_cue' ? ' stroke-dasharray="6 4"' : ' stroke-dasharray="2 4"';
      edges += '<path class="edge" d="' + d + '"' + dash + ' style="stroke:' + (strong ? 'var(--u3)' : 'var(--line-2)') + ';stroke-opacity:' + (strong ? '.7' : '1') + '"><title>' +
        esc(e.from + ' ' + (SHORT[e.type] || e.type) + ' ' + e.to + (e.quote ? ': ' + cut(e.quote, 160) : '')) + '</title></path>';
      if (showLabels && strong) labels += '<text class="sub" x="' + mx + '" y="' + ((y1 + y2) / 2 - 4) + '" text-anchor="middle" style="fill:var(--u3)">' + esc(SHORT[e.type]) + '</text>';
    }
    for (const n of result.nodes) {
      const p = pos.get(n.id); if (!p) continue;
      const a = assessments && assessments[n.id];
      const tone = n.resolution === 'start' ? TONE.start : TONE[a ? a.tone : 'neutral'] || TONE.neutral;
      const status = n.resolution === 'start' ? 'Văn bản đầu vào' : n.resolution === 'pending' ? 'Chưa tra (giới hạn)' : n.resolution === 'not_found' ? 'Không tìm thấy' : n.resolution === 'error' ? 'Lỗi nguồn' : (a ? a.label : '');
      const title = n.resolution === 'start' ? n.label : (n.doc && n.doc.number) || n.label || n.id;
      const sel = selected === n.id;
      nodes += '<g class="node" data-action="legal-node" data-id="' + esc(n.id) + '" tabindex="0" role="button" aria-label="' + esc(title + ', ' + status) + '" style="cursor:pointer"><title>' +
        esc(title + (n.doc && n.doc.title ? ': ' + n.doc.title : '') + ' · ' + status) + '</title>' +
        '<rect x="' + p.x + '" y="' + (p.y - NH / 2) + '" width="' + NW + '" height="' + NH + '" rx="9" style="fill:' + tone.soft + ';stroke:' + tone.color + ';stroke-width:' + (sel ? 3 : 1.2) + (n.resolution === 'pending' ? ';stroke-dasharray:4 3' : '') + '"/>' +
        '<text x="' + (p.x + 10) + '" y="' + (p.y - 3) + '" font-weight="700">' + esc(cut(title, Math.max(10, Math.floor(NW / 7.6)))) + '</text>' +
        '<text class="sub" x="' + (p.x + 10) + '" y="' + (p.y + 12) + '" style="fill:' + tone.color + '">' + esc(cut(status, Math.max(10, Math.floor(NW / 6.4)))) + '</text></g>';
    }
    const summary = 'Đồ thị văn bản liên quan: ' + (result.nodes.length - 1) + ' văn bản, ' + result.edges.length + ' quan hệ, ' + (cols.length - 1) + ' tầng.';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(summary) + '" xmlns="http://www.w3.org/2000/svg">' + edges + labels + nodes + '</svg>';
  }

  return Object.freeze({ render });
});
