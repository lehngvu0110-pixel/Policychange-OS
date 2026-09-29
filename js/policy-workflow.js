// @ts-check
/**
 * Luồng nghiệp vụ thuần của PolicyChange OS: phân tích → người quyết định → ban hành → hoàn tác.
 *
 * Trạng thái là một object thường `{ registry, docs, current, ledger }`. Các hàm ở đây thay đổi
 * trạng thái đó tại chỗ và trả về kết quả mô tả, không đụng DOM. Giao diện, benchmark và
 * Edge Function đều gọi cùng các hàm này, nên "ban hành" trên máy chủ và trên máy khách
 * sinh ra đúng cùng một bản vá và cùng một bản ghi kiểm toán.
 */
(function attachPolicyWorkflow(root, factory) {
  const g = /** @type {any} */ (root || {});
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode ? {
    // @ts-ignore
    Engine: require('./policy-engine.js'), Ledger: require('./policy-ledger.js'),
    // @ts-ignore
    Prover: require('./policy-prover.js'), Semantic: require('./semantic-discovery.js')
  } : {
    Engine: g.PolicyChangeEngine, Ledger: g.PolicyChangeLedger,
    Prover: g.PolicyChangePolicyProver, Semantic: g.PolicyChangeSemanticDiscovery
  };
  const api = factory(deps);
  // @ts-ignore
  if (isNode) module.exports = api;
  if (root) root.PolicyChangeWorkflow = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyWorkflow(deps) {
  'use strict';
  const { Engine, Ledger, Prover, Semantic } = deps;

  /**
   * @typedef {import('./policy-engine.js')} _EngineModule
   * @typedef {{ change:any, props:any[], elapsedMs?:number, requestText?:string, semanticResult?:any, semanticSource?:string, semanticStatus?:string }} Analysis
   * @typedef {{ registry:any[], docs:any[], current:Analysis|null, ledger:any[] }} WorkflowState
   * @typedef {{ now?:() => string, humanActor?:(prop:any) => string }} WorkflowContext
   */

  /** @param {WorkflowContext|undefined} ctx */
  function timestamp(ctx) { return ctx && typeof ctx.now === 'function' ? ctx.now() : new Date().toISOString(); }

  /**
   * @param {any[]} registry @param {string} ruleId @param {string} newValue @param {number} issuerTier
   * @returns {{ change:any } | { error:string }}
   */
  function buildChange(registry, ruleId, newValue, issuerTier) {
    const rule = registry.find(r => r.id === ruleId);
    const error = Engine.changeError(rule, newValue, issuerTier);
    if (error) return { error };
    return { change: { rule, oldValue: rule.value, newValue: String(newValue).trim(), issuerTier } };
  }

  /**
   * @param {WorkflowState} state @param {any} change @param {string} [requestText]
   * @returns {Analysis}
   */
  function startAnalysis(state, change, requestText) {
    const res = Engine.analyze(change, state.docs, state.registry);
    state.current = { change, props: res.props, elapsedMs: res.elapsedMs, requestText: requestText || '', semanticResult: null };
    return state.current;
  }

  /** @param {WorkflowState} state @param {any} p */
  function prove(state, p) {
    if (!state.current || !p) return { allowed: false, reasons: ['Không có phân tích hiện tại.'] };
    const registry = state.registry;
    const doc = state.docs.find(item => item.id === p.docId);
    const semanticResult = state.current.semanticResult;
    const proof = Prover.proveAutomaticPatch(state.current.change, doc, p, {
      registry, docs: state.docs,
      analyze: (/** @type {any} */ change, /** @type {any[]} */ docs) => Engine.analyze(change, docs, registry),
      parseValue: Engine.parseValue, valueRegex: Engine.valueRegex, renderValue: Engine.renderValue,
      ownersOfLine: (/** @type {string} */ line) => Engine.ownersOfLine(line, registry),
      validatedEvidence: semanticResult && semanticResult.status === 'complete' ? semanticResult.valid : []
    });
    p.proof = proof;
    return proof;
  }

  /** @param {WorkflowState} state @param {any} p */
  function isCommittable(state, p) {
    return !p.applied && Semantic.isPatchAllowed(p) && (p.outcome !== 'AUTO_PATCH' || prove(state, p).allowed);
  }

  /** @param {WorkflowState} state */
  function committableCount(state) {
    if (!state.current) return 0;
    return state.current.props.filter(p => isCommittable(state, p)).length;
  }

  /**
   * Người trả lời câu hỏi chuyển tiếp: `act` là 'a' hoặc 'b'.
   * @param {WorkflowState} state @param {string} propId @param {'a'|'b'} act
   */
  function decide(state, propId, act) {
    if (!state.current) return { ok: false, message: 'Không có phân tích hiện tại.' };
    const p = state.current.props.find(x => x.id === propId);
    if (!p || p.outcome !== 'ESCALATE' || p.decided || (act !== 'a' && act !== 'b')) return { ok: false, message: 'Không tìm thấy hồ sơ chờ quyết định.' };
    const q = Engine.escalationQuestion(p, state.current.change, state.registry);
    p.decided = true;
    p.decisionLabel = act === 'a' ? q.a : q.b;
    p.accepted = Engine.actAccepts(p.category, act);
    return { ok: true, prop: p };
  }

  /**
   * Người rà soát bằng chứng ngữ nghĩa của một AUTO_PATCH đang bị giữ.
   * @param {WorkflowState} state @param {string} propId @param {boolean} approve @param {WorkflowContext} [ctx]
   */
  function reviewSemantic(state, propId, approve, ctx) {
    if (!state.current) return { ok: false };
    const p = state.current.props.find(x => x.id === propId);
    if (!p || !p.semanticHold || p.semanticHoldReviewed) return { ok: false };
    p.semanticHoldReviewed = true;
    p.semanticHoldApproved = approve === true;
    if (!p.semanticHoldApproved) {
      Ledger.append(state.ledger, { ts: timestamp(ctx), actor: ctx && ctx.humanActor ? ctx.humanActor(p) : 'Người rà soát', docId: p.docId,
        action: 'GIỮ NGUYÊN dòng ' + (p.lineIndex + 1), from: p.line, to: p.line,
        basis: 'Rà soát bằng chứng ngữ nghĩa; không áp dụng patch tự động', propId: p.id });
    }
    return { ok: true, prop: p };
  }

  /**
   * Ban hành mọi đề xuất đã đủ điều kiện và ghi sổ kiểm toán.
   * @param {WorkflowState} state @param {WorkflowContext} [ctx]
   * @returns {{ ok:boolean, applied:number, proverHeld:number, stale:number, rejectedLogged:number, message:string, ts?:string, records:any[] }}
   */
  function commit(state, ctx) {
    if (!state.current) return { ok: false, applied: 0, proverHeld: 0, stale: 0, rejectedLogged: 0, message: 'Không có phân tích hiện tại.', records: [] };
    if (!Ledger.verify(state.ledger)) {
      return { ok: false, applied: 0, proverHeld: 0, stale: 0, rejectedLogged: 0, message: 'Chuỗi kiểm toán không hợp lệ; đã dừng ban hành.', records: [] };
    }
    const ts = timestamp(ctx);
    const startLength = state.ledger.length;
    let applied = 0, proverHeld = 0, stale = 0, rejectedLogged = 0;
    for (const p of state.current.props) {
      if (p.applied) continue;
      const doc = state.docs.find(d => d.id === p.docId);
      if (!doc) continue;
      const proof = p.outcome === 'AUTO_PATCH' ? prove(state, p) : null;
      const allowedBySemantics = Semantic.isPatchAllowed(p);
      const doApply = allowedBySemantics && (p.outcome !== 'AUTO_PATCH' || (proof && proof.allowed));
      if (!doApply) { if (p.outcome === 'AUTO_PATCH' && allowedBySemantics) proverHeld++; continue; }
      if (doc.lines[p.lineIndex] !== p.line) { stale++; continue; }
      doc.lines[p.lineIndex] = p.newLine;
      doc.version = Engine.bumpVersion(doc.version);
      p.applied = true; applied++;
      const human = p.outcome !== 'AUTO_PATCH' || p.semanticHoldApproved;
      Ledger.append(state.ledger, {
        ts,
        actor: human && ctx && ctx.humanActor ? ctx.humanActor(p)
          : (p.semanticHoldApproved ? 'Người rà soát ngữ nghĩa' : (p.outcome === 'AUTO_PATCH' ? 'AI · động cơ tiền định' : 'Người · ' + Engine.TIER_APPROVER[p.docTier])),
        docId: p.docId, lineIndex: p.lineIndex, action: 'PATCH dòng ' + (p.lineIndex + 1),
        from: p.line, to: p.newLine,
        basis: p.citation + ' · ' + (p.semanticHoldApproved
          ? 'AUTO_PATCH được con người duyệt sau bằng chứng ngữ nghĩa'
          : (p.category ? p.category + ' — ' + p.decisionLabel : 'tự động, trong thẩm quyền')) +
          (proof && proof.allowed ? ' · deterministic proof ' + proof.proofId + ' · checks ' + proof.checks.filter((/** @type {any} */ check) => check.passed).map((/** @type {any} */ check) => check.id).join(',') : ''),
        propId: p.id
      });
    }
    for (const p of state.current.props.filter(item => item.decided && !item.accepted && !item.logged)) {
      p.logged = true;
      rejectedLogged++;
      Ledger.append(state.ledger, { ts, actor: ctx && ctx.humanActor ? ctx.humanActor(p) : 'Người · ' + Engine.TIER_APPROVER[p.docTier], docId: p.docId,
        action: 'TỪ CHỐI SỬA dòng ' + (p.lineIndex + 1), from: p.line, to: p.line,
        basis: p.category + ' — ' + p.decisionLabel, propId: p.id });
    }
    const message = 'Đã ban hành ' + applied + ' thay đổi' + (proverHeld ? '; prover chặn ' + proverHeld + ' đề xuất' : '') +
      (stale ? '; bỏ qua ' + stale + ' dòng đã bị sửa sau khi phân tích' : '') + ' lúc ' + ts + '.';
    return { ok: true, applied, proverHeld, stale, rejectedLogged, message, ts, records: state.ledger.slice(startLength) };
  }

  /**
   * Hoàn tác một bản ghi PATCH: khôi phục dòng và ghi thêm một bản ghi mới, không xoá vết.
   * @param {WorkflowState} state @param {number} seq @param {WorkflowContext} [ctx]
   */
  function undo(state, seq, ctx) {
    const e = state.ledger.find(x => x.seq === seq);
    if (!e || !String(e.action).startsWith('PATCH') || Ledger.isReverted(state.ledger, seq) || !Ledger.verify(state.ledger)) {
      return { ok: false, message: 'Không thể hoàn tác bản ghi #' + seq + '.', records: [] };
    }
    const doc = state.docs.find(d => d.id === e.docId);
    if (!doc || doc.lines[e.lineIndex] !== e.to) {
      return { ok: false, message: 'Không thể hoàn tác bản ghi #' + seq + ': nội dung hiện tại đã khác bản được ban hành.', records: [] };
    }
    doc.lines[e.lineIndex] = e.from;
    doc.version = Engine.bumpVersion(doc.version);
    if (state.current) {
      const p = state.current.props.find(x => x.id === e.propId && x.docId === e.docId && x.lineIndex === e.lineIndex);
      if (p) p.applied = false;
    }
    const record = Ledger.append(state.ledger, { ts: timestamp(ctx),
      actor: ctx && ctx.humanActor ? ctx.humanActor({ docTier: doc.tier }) : 'Người · ' + Engine.TIER_APPROVER[doc ? doc.tier : 1],
      docId: e.docId, lineIndex: e.lineIndex, action: 'HOÀN TÁC bản ghi #' + seq, from: e.to, to: e.from,
      basis: 'Thu hồi thay đổi đã ban hành; bản ghi gốc giữ nguyên trong sổ', propId: e.propId, revertsSeq: seq });
    return { ok: true, message: 'Đã hoàn tác bản ghi #' + seq + ' và ghi thêm sự kiện vào sổ.', records: [record] };
  }

  /**
   * Chạy một ca Verify trên bản sao sạch của kho mẫu (độc lập với trạng thái đang thao tác).
   * @param {any} tc @param {{ registry:any[], seedDocuments:any[], clock?:() => number }} env
   */
  function runVerifyCase(tc, env) {
    const clock = env.clock || (() => (typeof performance === 'object' ? performance.now() : Date.now()));
    const t0 = clock();
    const ms = () => Math.round((clock() - t0) * 100) / 100;
    if (tc.freeText) {
      const r = Engine.parseFreeText(tc.freeText, env.registry);
      const ok = tc.expect.refuse ? !r.ok : r.ok;
      return { id: tc.id, desc: tc.desc, expected: 'REFUSE', actual: r.ok ? 'Đã tạo đề xuất' : 'REFUSE', category: '—',
        ms: ms(), ok, detail: r.ok ? '' : 'Lý do từ chối: ' + /** @type {any} */ (r).msg };
    }
    const rule = env.registry.find(r => r.id === tc.change.ruleId);
    const change = { rule, oldValue: rule.value, newValue: tc.change.newValue, issuerTier: tc.change.issuerTier };
    const { props } = Engine.analyze(change, Engine.cloneDocs(env.seedDocuments), env.registry);
    const p = props.find((/** @type {any} */ x) => x.docId === tc.at.docId && x.lineIndex === tc.at.lineIndex);
    const expected = tc.expect.outcome + (tc.expect.category ? ' / ' + tc.expect.category : '');
    const detail = 'Vị trí: ' + tc.at.docId + ' dòng ' + (tc.at.lineIndex + 1);
    if (!p) return { id: tc.id, desc: tc.desc, expected, actual: 'không tìm thấy', category: '—', ms: ms(), ok: false, detail };
    const ok = p.outcome === tc.expect.outcome && (p.category || null) === (tc.expect.category || null);
    return { id: tc.id, desc: tc.desc, expected, actual: p.outcome + (p.category ? ' / ' + p.category : ''),
      category: p.category || '—', ms: ms(), ok, detail };
  }

  return Object.freeze({
    buildChange, startAnalysis, prove, isCommittable, committableCount,
    decide, reviewSemantic, commit, undo, runVerifyCase
  });
});
