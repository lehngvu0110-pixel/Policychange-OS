// @ts-check
/**
 * Xác định tình trạng hiệu lực của một văn bản pháp luật tại một ngày chọn trước ("tính đến ngày"),
 * chỉ từ bằng chứng có trong kết quả khám phá: ngày có hiệu lực, ngày hết hiệu lực, và các quan hệ
 * sửa đổi, thay thế, bãi bỏ có bằng chứng (metadata nguồn chính thức hoặc câu chữ trong văn bản gốc).
 *
 * Nguyên tắc:
 * - Ngày ban hành không phải ngày có hiệu lực. Thiếu ngày có hiệu lực thì "Chưa xác minh được".
 * - Chỉ nguồn chính thức mới đủ để kết luận. Chỉ có nguồn thứ cấp thì "Chưa xác minh được".
 * - Bãi bỏ một phần không bị coi là bãi bỏ toàn bộ.
 * - Văn bản sửa đổi, bãi bỏ chỉ tác động khi chính nó đã có hiệu lực tại ngày chọn.
 * - Kết luận suy ra khác tình trạng nguồn công bố thì "Bằng chứng mâu thuẫn", không tự chọn bên nào.
 * - Mọi kết luận dứt khoát đều kèm bằng chứng có đường dẫn nguồn.
 */
(function attachLegalStatus(/** @type {any} */ root, /** @type {() => any} */ factory) {
  const api = factory();
  // @ts-ignore -- CommonJS khi chạy trong Node.
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeLegalStatus = api;
})(typeof globalThis === 'object' ? globalThis : this, function createLegalStatus() {
  'use strict';

  const STATES = Object.freeze({
    IN_FORCE: { label: 'Còn hiệu lực', tone: 'good' },
    PARTIAL: { label: 'Hết hiệu lực một phần', tone: 'warn' },
    EXPIRED: { label: 'Hết hiệu lực / bị thay thế', tone: 'bad' },
    SUSPENDED: { label: 'Ngưng hiệu lực', tone: 'warn' },
    NOT_YET: { label: 'Chưa có hiệu lực', tone: 'warn' },
    UNVERIFIED: { label: 'Chưa xác minh được', tone: 'neutral' },
    CONFLICT: { label: 'Bằng chứng mâu thuẫn', tone: 'bad' }
  });
  const DEFINITIVE = new Set(['IN_FORCE', 'PARTIAL', 'EXPIRED', 'NOT_YET', 'SUSPENDED']);
  const METHOD = 'Suy ra từ ngày có hiệu lực, ngày hết hiệu lực và các quan hệ sửa đổi, thay thế, bãi bỏ có bằng chứng từ nguồn chính thức; đối chiếu với tình trạng do nguồn công bố tại thời điểm tải.';

  /** @param {string} s */
  const vnDate = s => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '?');

  /** Tình trạng do nguồn công bố, quy về một trong bốn nhóm. @param {string|null|undefined} label */
  function officialBucket(label) {
    const s = String(label || '').toLowerCase();
    if (!s) return null;
    if (/hết hiệu lực một phần/.test(s)) return 'PARTIAL';
    if (/chưa có hiệu lực|chưa hiệu lực/.test(s)) return 'NOT_YET';
    if (/ngưng hiệu lực|tạm ngừng hiệu lực|đình chỉ hiệu lực/.test(s)) return 'SUSPENDED';
    if (/hết hiệu lực|bị thay thế|bị bãi bỏ/.test(s)) return 'EXPIRED';
    if (/còn hiệu lực|đang có hiệu lực|có hiệu lực/.test(s)) return 'IN_FORCE';
    return null;
  }

  /** @param {any} doc */
  function primarySource(doc) {
    const srcs = (doc && doc.sources) || [];
    return srcs.find((/** @type {any} */ s) => s.tier === 'primary') || null;
  }

  /** @param {any} node @param {string} text @param {string} kind @param {any} [src] */
  function ev(node, text, kind, src) {
    const s = src || primarySource(node && node.doc) || ((node && node.doc && node.doc.sources) || [])[0] || null;
    return { kind, text, docId: node ? node.id : null, sourceName: s ? s.name : null, url: s ? s.url : null, tier: s ? s.tier : null,
      retrievedAt: s ? s.retrievedAt : null, synthetic: !!(node && node.doc && node.doc.synthetic) };
  }

  /**
   * @param {string} id mã văn bản trong kết quả khám phá
   * @param {any} graph
   * @param {string} asOf ngày dạng YYYY-MM-DD
   * @param {{ noCrossCheck?: boolean }} [opts]
   */
  function assess(id, graph, asOf, opts = {}) {
    const byId = new Map(graph.nodes.map((/** @type {any} */ n) => [n.id, n]));
    const node = byId.get(id);
    const base = { id, asOf, evidence: /** @type {any[]} */ ([]), causedBy: /** @type {string[]} */ ([]), affectedProvisions: /** @type {string[]} */ ([]),
      amendments: /** @type {any[]} */ ([]), pending: /** @type {any[]} */ ([]), reasons: /** @type {string[]} */ ([]), conflicts: /** @type {string[]} */ ([]),
      limitations: /** @type {string[]} */ ([]), evidenceComplete: false, method: METHOD };
    /** @param {keyof typeof STATES} state */
    const out = state => ({ ...base, state, label: STATES[state].label, tone: STATES[state].tone, definitive: DEFINITIVE.has(state) });

    if (!validDate(asOf)) { base.reasons.push('Ngày đánh giá không hợp lệ; hãy chọn ngày có thực dạng YYYY-MM-DD.'); return out('UNVERIFIED'); }

    if (!node || node.resolution === 'start') { base.reasons.push('Đây là văn bản đầu vào của bạn, không phải văn bản pháp luật đã tra cứu.'); return out('UNVERIFIED'); }
    if (node.resolution !== 'found' || !node.doc) {
      base.reasons.push(node.resolution === 'pending' ? 'Chưa tra cứu tới văn bản này (dừng do giới hạn).' : 'Không lấy được văn bản từ nguồn: ' + (node.reason || 'không rõ lý do') + '.');
      return out('UNVERIFIED');
    }
    const doc = node.doc;
    base.evidenceComplete = graph.state === 'complete' && !(graph.frontier || []).length && !(graph.unresolved || []).length &&
      !(graph.errors || []).length && graph.nodes.every((/** @type {any} */ n) => n.resolution === 'start' || n.resolution === 'found') &&
      doc.coverage?.relationships === 'complete' && !(doc.retrievalFailures || []).length;
    if (!base.evidenceComplete) base.limitations.push('Phạm vi tra cứu chưa đầy đủ hoặc còn tham chiếu chưa giải quyết; chưa chứng minh được không có thay đổi hiệu lực khác.');
    if (doc.coverage?.history !== 'complete' && String(doc.officialStatus?.observedAt || '').slice(0, 10) !== asOf) {
      base.limitations.push('Không có lịch sử hiệu lực đầy đủ tại ngày được chọn; tình trạng tại ngày tải trang không chứng minh tình trạng ở ngày khác.');
    }
    base.limitations.push(...(doc.limitations || []));
    const authoritative = !!primarySource(doc);
    if (doc.issueDate) base.evidence.push(ev(node, 'Ban hành ngày ' + vnDate(doc.issueDate) + ' (ngày ban hành không phải ngày có hiệu lực).', 'issue_date'));
    if (doc.effectiveFrom) base.evidence.push(ev(node, 'Có hiệu lực từ ngày ' + vnDate(doc.effectiveFrom) + '.', 'effective_from'));
    if (doc.expiresOn) base.evidence.push(ev(node, 'Hết hiệu lực từ ngày ' + vnDate(doc.expiresOn) + '.', 'expires_on'));
    if (doc.officialStatus && doc.officialStatus.label) {
      base.evidence.push(ev(node, 'Nguồn công bố tình trạng: "' + doc.officialStatus.label + '" (ghi nhận lúc ' + String(doc.officialStatus.observedAt || '?').slice(0, 10) + ').', 'official_status'));
    }

    // Sự kiện tác động lên văn bản này: cạnh đi vào, có bằng chứng.
    // Cùng một quan hệ có thể vừa có trong metadata vừa có trong câu chữ: giữ một, ưu tiên metadata chính thức.
    /** @type {Map<string, any>} */ const uniq = new Map();
    for (const e of graph.edges) {
      if (e.to !== id || !['AMENDS', 'SUPPLEMENTS', 'REPEALS', 'REPLACES', 'CONSOLIDATES'].includes(e.type)) continue;
      if (e.basis !== 'official_metadata' && e.basis !== 'text_cue') continue;
      const k = [e.from, e.type, e.scope || '', e.provisions || ''].join('|'), cur = uniq.get(k);
      if (!cur || (cur.basis !== 'official_metadata' && e.basis === 'official_metadata')) uniq.set(k, cur && !e.effectiveFrom ? { ...e, effectiveFrom: cur.effectiveFrom } : e);
    }
    const events = [...uniq.values()].map(e => {
      const from = byId.get(e.from);
      const fromFound = from && from.resolution === 'found' && from.doc;
      const auth = e.basis === 'official_metadata' ? !!(e.source && e.source.tier === 'primary') : !!(fromFound && primarySource(from.doc));
      const date = e.effectiveFrom || (fromFound ? from.doc.effectiveFrom : null) || null;
      return { edge: e, from, auth, date, label: (fromFound && from.doc.number) || e.from };
    });

    if (!validDate(doc.effectiveFrom)) {
      base.reasons.push('Nguồn không cho biết ngày có hiệu lực, nên không kết luận được.');
      return finish(out('UNVERIFIED'));
    }
    if (!authoritative) {
      base.reasons.push('Chỉ có nguồn thứ cấp. Cần đối chiếu với nguồn chính thức (vbpl.vn, vanban.chinhphu.vn, Công báo) trước khi kết luận.');
      return finish(out('UNVERIFIED'));
    }
    if (doc.issueDate && (!validDate(doc.issueDate) || doc.issueDate > doc.effectiveFrom)) {
      base.reasons.push('Ngày ban hành và ngày hiệu lực mâu thuẫn hoặc không hợp lệ.'); return finish(out('UNVERIFIED'));
    }
    if (doc.effectiveFrom > asOf) {
      base.reasons.push('Ngày có hiệu lực ' + vnDate(doc.effectiveFrom) + ' sau ngày đang xét ' + vnDate(asOf) + '.');
      return finish(out('NOT_YET'));
    }
    if (validDate(doc.expiresOn) && doc.expiresOn <= asOf) {
      base.reasons.push('Đã hết thời hạn hiệu lực từ ' + vnDate(doc.expiresOn) + '.');
      return finish(out('EXPIRED'));
    }
    const suspension = doc.suspension;
    if (suspension && validDate(suspension.from) && suspension.from <= asOf && (!suspension.until || (validDate(suspension.until) && asOf < suspension.until))) {
      base.evidence.push(ev(node, String(suspension.raw || 'Ngưng hiệu lực') + ' từ ' + vnDate(suspension.from) + (suspension.until ? ' đến trước ' + vnDate(suspension.until) : ' (chưa rõ ngày kết thúc)') + '.', 'suspension'));
      base.reasons.push('Có bằng chứng ngưng hiệu lực; không đồng nghĩa với bãi bỏ hay hết hiệu lực vĩnh viễn.');
      return finish(out(suspension.scope === 'whole' ? 'SUSPENDED' : 'UNVERIFIED'));
    }
    if (suspension && (!validDate(suspension.from) || (suspension.until && (!validDate(suspension.until) || suspension.until <= suspension.from)))) {
      base.reasons.push('Mốc thời gian ngưng hiệu lực chưa xác minh được.'); return finish(out('UNVERIFIED'));
    }

    let terminated = null, partial = false, uncertainTermination = false;
    for (const x of events) {
      const kind = x.edge.type;
      const whole = (kind === 'REPLACES' || kind === 'REPEALS') && x.edge.scope === 'whole' && !x.edge.provisions;
      const desc = (kind === 'REPLACES' ? 'Bị thay thế bởi ' : kind === 'REPEALS' ? (whole ? 'Bị bãi bỏ toàn bộ bởi ' : 'Bị bãi bỏ một phần bởi ') : kind === 'CONSOLIDATES' ? 'Được hợp nhất trong ' : 'Được sửa đổi, bổ sung bởi ') + x.label;
      const srcEv = ev(x.from && x.from.resolution === 'found' ? x.from : node, desc + (x.date ? ', có hiệu lực từ ' + vnDate(x.date) : ', chưa rõ ngày hiệu lực') + '.' + (x.edge.quote ? ' Trích: "' + String(x.edge.quote).slice(0, 220) + '"' : ''),
        x.edge.basis === 'official_metadata' ? 'relation_metadata' : 'relation_text', x.edge.basis === 'official_metadata' ? x.edge.source : null);
      if (kind === 'CONSOLIDATES') { base.evidence.push(srcEv); continue; }
      if (!x.auth) { base.evidence.push(srcEv); if (kind === 'REPEALS' || kind === 'REPLACES') { uncertainTermination = true; base.reasons.push(desc + ' nhưng bằng chứng không đến từ nguồn chính thức.'); } continue; }
      if (!validDate(x.date)) { base.evidence.push(srcEv); if (kind === 'REPEALS' || kind === 'REPLACES') { uncertainTermination = true; base.reasons.push(desc + ' nhưng chưa xác định được ngày hiệu lực của văn bản đó.'); } else base.pending.push({ by: x.label, type: kind, date: null }); continue; }
      if (x.date > asOf) { base.pending.push({ by: x.label, type: kind, date: x.date, provisions: x.edge.provisions || null }); base.evidence.push(srcEv); continue; }
      base.evidence.push(srcEv);
      if (x.edge.provisions) base.affectedProvisions.push(x.edge.provisions);
      if (whole) { if (!terminated || x.date < terminated.date) terminated = x; base.causedBy.push(x.label); }
      else if (kind === 'REPEALS' || kind === 'REPLACES') {
        if (x.edge.scope === 'partial' || x.edge.provisions) { partial = true; base.causedBy.push(x.label); }
        else { uncertainTermination = true; base.reasons.push(desc + ' nhưng chưa rõ phạm vi tác động.'); }
      }
      else base.amendments.push({ by: x.label, date: x.date, provisions: x.edge.provisions || null });
    }

    /** @type {any} */ let result;
    if (terminated) { base.reasons.push((terminated.edge.type === 'REPLACES' ? 'Đã bị thay thế' : 'Đã bị bãi bỏ') + ' từ ' + vnDate(terminated.date) + ' bởi ' + terminated.label + '.'); result = out('EXPIRED'); }
    else if (uncertainTermination) result = out('UNVERIFIED');
    else if (partial) { base.reasons.push('Có bằng chứng bãi bỏ hoặc thay thế một phần; chưa dựng lại lịch sử từng điều để kết luận phần còn lại.'); result = out('PARTIAL'); }
    else {
      base.reasons.push('Đã có hiệu lực từ ' + vnDate(doc.effectiveFrom) + ' và không có văn bản thay thế, bãi bỏ nào có hiệu lực tính đến ' + vnDate(asOf) + ' trong phạm vi đã tra cứu.');
      if (base.amendments.length) base.reasons.push('Đã được sửa đổi, bổ sung: áp dụng kèm ' + base.amendments.map(a => a.by).join(', ') + '.');
      result = out('IN_FORCE');
    }
    return finish(result);

    /** Đối chiếu tình trạng nguồn công bố và cảnh báo phạm vi tra cứu. @param {any} r */
    function finish(r) {
      r.limitations = [...new Set(base.limitations)];
      if (base.pending.length) r.reasons.push('Có thay đổi chưa có hiệu lực tại ngày đang xét: ' + base.pending.map(p => p.by + (p.date ? ' (từ ' + vnDate(p.date) + ')' : ' (chưa rõ ngày)')).join(', ') + '.');
      const off = doc.officialStatus ? officialBucket(doc.officialStatus.label) : null;
      const observed = doc.officialStatus && doc.officialStatus.observedAt ? String(doc.officialStatus.observedAt).slice(0, 10) : null;
      if (off === 'SUSPENDED' && authoritative && !doc.suspension) {
        r.reasons.push('Nguồn công bố ngưng hiệu lực; thiếu mốc bắt đầu/kết thúc hoặc phạm vi, không suy thành hết hiệu lực.');
        return out('UNVERIFIED');
      }
      // Nguồn công bố tình trạng tại một thời điểm. Đối chiếu đúng thời điểm đó: nếu suy luận từ mốc ngày và quan hệ
      // cho kết quả khác nhóm với nguồn công bố, bằng chứng mâu thuẫn và không được tự chọn một bên.
      if (off && observed && authoritative && !opts.noCrossCheck) {
        const atObs = observed === asOf ? r : assess(id, graph, observed, { noCrossCheck: true });
        if (atObs.state !== 'UNVERIFIED' && atObs.state !== off && (atObs.state !== 'IN_FORCE' || base.evidenceComplete)) {
          const msg = 'Ngày ' + vnDate(observed) + ' nguồn công bố "' + doc.officialStatus.label + '", nhưng các mốc ngày và quan hệ đã tra cứu cho kết quả "' + atObs.label + '" tại cùng ngày đó.';
          base.conflicts.push(msg);
          if (asOf >= observed) {
            const c = out('CONFLICT'); c.reasons = r.reasons.concat([msg, 'Cần người có chuyên môn pháp chế kiểm tra trước khi dựa vào văn bản này.']);
            return c;
          }
          r.reasons.push(msg + ' Kết quả cho ngày ' + vnDate(asOf) + ' cần được kiểm tra lại.');
        }
      }
      if (r.definitive && !r.evidence.some((/** @type {any} */ e) => e.url)) {
        const u = out('UNVERIFIED'); u.reasons = r.reasons.concat(['Không có đường dẫn nguồn cho bằng chứng, nên không kết luận.']); return u;
      }
      if (r.definitive && !r.evidence.some((/** @type {any} */ e) => e.tier === 'primary' && e.url && e.sourceName && Number.isFinite(Date.parse(e.retrievedAt)))) {
        const u = out('UNVERIFIED'); u.reasons = r.reasons.concat(['Thiếu tên nguồn hoặc thời điểm thu thập bằng chứng chính thức hợp lệ.']); return u;
      }
      if (r.state === 'IN_FORCE' && (!base.evidenceComplete || (doc.coverage?.history !== 'complete' && observed !== asOf))) {
        const u = out('UNVERIFIED'); u.reasons = base.limitations.concat(r.reasons); return u;
      }
      r.reasons.push(...base.limitations);
      return r;
    }
  }

  /** @param {any} graph @param {string} asOf */
  function assessAll(graph, asOf) {
    /** @type {Record<string, any>} */ const out = {};
    for (const n of graph.nodes) if (n.resolution !== 'start') out[n.id] = assess(n.id, graph, asOf);
    return out;
  }

  /**
   * Cảnh báo hiệu lực để hiện trước khi người dùng dựa vào một đề xuất thay đổi.
   * Không tự kết luận quy định nội bộ hết hiệu lực; chỉ nêu quan hệ đã xác minh và đề nghị người có thẩm quyền xem lại.
   * @param {any} graph @param {string} asOf
   */
  function warnings(graph, asOf) {
    const all = assessAll(graph, asOf);
    const warnings = Object.values(all).filter((/** @type {any} */ a) => a.state !== 'IN_FORCE').map((/** @type {any} */ a) => {
      const n = graph.nodes.find((/** @type {any} */ x) => x.id === a.id);
      return { id: a.id, label: (n && n.doc && n.doc.number) || (n && n.label) || a.id, state: a.state, stateLabel: a.label, tone: a.tone,
        reason: a.reasons[0] || '', depth: n ? n.depth : null, synthetic: !!(n && n.doc && n.doc.synthetic) };
    });
    if (graph.state !== 'complete' || (graph.limitations || []).length) warnings.unshift({ id: 'RESEARCH_SCOPE', label: 'Phạm vi tra cứu', state: 'UNVERIFIED', stateLabel: STATES.UNVERIFIED.label, tone: 'warn', reason: 'Kết quả chưa đầy đủ; xác nhận đã xem không phải chứng nhận hiệu lực pháp lý.', depth: null, synthetic: !graph.live });
    return warnings;
  }

  /** @param {any} value */
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  return { STATES, officialBucket, validDate, assess, assessAll, warnings };
});
