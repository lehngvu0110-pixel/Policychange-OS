// @ts-check
/**
 * Lõi phía máy chủ của `policy-api` — thuần, không I/O, chạy được trong Node để test.
 * Edge Function chỉ làm ba việc: xác định người gọi, nạp dữ liệu từ Postgres, gọi các hàm `plan*`
 * ở đây rồi chuyển kết quả cho hàm SQL `apply_change` ghi trong một giao dịch.
 *
 * Nguyên tắc: không tin bất cứ thứ gì client gửi ngoài "ý định" (quy định nào, giá trị mới, cấp khai,
 * người đã chọn A hay B ở dòng nào). Máy chủ tự chạy lại động cơ + prover trên dữ liệu trong CSDL.
 */
(function attachPolicyServer(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const g = /** @type {any} */ (root || {});
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode ? {
    // @ts-ignore
    Engine: require('./policy-engine.js'), Ledger: require('./policy-ledger.js'), Workflow: require('./policy-workflow.js'),
    // @ts-ignore
    Authz: require('./policy-authz.js')
  } : { Engine: g.PolicyChangeEngine, Ledger: g.PolicyChangeLedger, Workflow: g.PolicyChangeWorkflow, Authz: g.PolicyChangeAuthz };
  const api = factory(deps);
  // @ts-ignore
  if (isNode) module.exports = api;
  if (root) root.PolicyChangeServer = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyServer(/** @type {any} */ deps) {
  'use strict';
  const { Engine, Ledger, Workflow, Authz } = deps;

  /**
   * @typedef {{ id:string, displayName:string, tier:number, units:string[], userId?:string|null }} Member
   * @typedef {{ id:string, mode:'demo'|'live', ledger_seq:number, ledger_tail:string }} WorkspaceRow
   * @typedef {{ workspace:WorkspaceRow, member:Member, registry:any[], docs:any[], ledger:any[], now?:() => string }} ServerContext
   * @typedef {{ ok:true, status:200, body:any, rpc:any } | { ok:false, status:number, error:string, message:string, details?:any }} Plan
   */

  /** @param {number} status @param {string} error @param {string} message @param {any} [details] @returns {Plan} */
  function fail(status, error, message, details) { return { ok: false, status, error, message, details }; }

  /** @param {any} row */
  function fromDbPolicy(row) {
    return { id: row.id, name: row.name, value: row.value, tier: row.tier, source: row.source, owner: row.owner, aliases: [...row.aliases] };
  }
  /** @param {any} row */
  function fromDbDocument(row) {
    return { id: row.id, title: row.title, owner: row.owner, tier: row.tier, version: row.version, lines: [...row.lines] };
  }
  /** @param {any} row */
  function fromDbRecord(row) {
    /** @type {any} */
    const record = { seq: row.seq, ts: row.ts, actor: row.actor, docId: row.doc_id, lineIndex: row.line_index,
      action: row.action, from: row.from_text, to: row.to_text, basis: row.basis, propId: row.prop_id,
      prevHash: row.prev_hash, hash: row.hash };
    if (row.reverts_seq !== null && row.reverts_seq !== undefined) record.revertsSeq = row.reverts_seq;
    return record;
  }
  /** @param {any} record @param {string|null|undefined} userId */
  function toRpcRecord(record, userId) {
    return { ...record, actorUser: userId || '' };
  }

  /** @param {Member} member */
  function actorLabel(member) {
    return 'Người · ' + member.displayName;
  }

  /**
   * Người gọi ở workspace demo: vai trò trình diễn do client chọn (được ghi rõ "(demo)" trong sổ).
   * @param {string} personaId
   * @returns {Member|null}
   */
  function demoMember(personaId) {
    const persona = Authz.DEMO_PERSONAS.find((/** @type {any} */ p) => p.id === personaId);
    return persona ? { id: persona.id, displayName: persona.displayName + ' (demo)', tier: persona.tier, units: [...persona.units], userId: null } : null;
  }

  /** @param {ServerContext} ctx */
  function stateOf(ctx) {
    return { registry: ctx.registry.map(r => ({ ...r, aliases: [...r.aliases] })), docs: Engine.cloneDocs(ctx.docs),
      current: /** @type {any} */ (null), ledger: ctx.ledger.map(e => ({ ...e })) };
  }

  /** @param {ServerContext} ctx */
  function chainProblem(ctx) {
    if (!Ledger.verify(ctx.ledger)) return fail(500, 'ledger_corrupt', 'Sổ kiểm toán trên máy chủ không còn toàn vẹn; đã khoá mọi thao tác ghi.');
    const tail = Ledger.tailOf(ctx.ledger);
    if (tail.seq !== ctx.workspace.ledger_seq || tail.hash !== ctx.workspace.ledger_tail) {
      return fail(409, 'ledger_conflict', 'Có người vừa cập nhật workspace. Hãy tải lại và thử lại.');
    }
    return null;
  }

  /**
   * Gom các cập nhật dòng từ những bản ghi PATCH / HOÀN TÁC mới, kèm phiên bản cuối của tài liệu.
   * @param {any[]} records @param {any[]} docsAfter
   */
  function docUpdatesFrom(records, docsAfter) {
    return records
      .filter(r => Number.isInteger(r.lineIndex) && r.from !== r.to && (String(r.action).startsWith('PATCH') || String(r.action).startsWith('HOÀN TÁC')))
      .map(r => {
        const doc = docsAfter.find(d => d.id === r.docId);
        return { id: r.docId, lineIndex: r.lineIndex, from: r.from, to: r.to, version: doc ? doc.version : '1.0' };
      });
  }

  // ---------- Hồ sơ chuyển tiếp dùng chung ----------
  // Khi một thay đổi còn vị trí chờ người quyết, máy chủ mở một "hồ sơ" (open change). Người có thẩm quyền mở ứng
  // dụng trên máy của mình sẽ thấy hồ sơ trong hàng đợi và quyết từng vị trí; mỗi quyết định được áp dụng ngay,
  // ghi sổ với đúng tên người quyết.

  /** @param {any} x */
  const lineKey = x => x.docId + '\u0000' + x.lineIndex + '\u0000' + x.line;

  /**
   * Chuỗi căn cứ gắn vào mọi bản ghi của một lần ban hành: hồ sơ nào, cấp ban hành, ai khởi tạo.
   * `cấp ban hành N` được policy-authz đọc lại khi xét quyền hoàn tác.
   * @param {string} creator @param {number} issuerTier @param {string|null} [changeId]
   */
  function issueSuffix(creator, issuerTier, changeId) {
    return (changeId ? 'hồ sơ ' + changeId + ' · ' : '') + 'cấp ban hành ' + issuerTier + ' · khởi tạo bởi ' + creator;
  }

  /** @param {any} row */
  function fromDbOpenChange(row) {
    return { id: row.id, ruleId: row.rule_id, oldValue: row.old_value, newValue: row.new_value, issuerTier: row.issuer_tier,
      requestText: row.request_text || '', createdBy: row.created_by, status: row.status, createdAt: row.created_at || null,
      held: Array.isArray(row.held) ? row.held : [] };
  }
  /** @param {any} row */
  function fromDbDecision(row) {
    return { changeId: row.change_id, docId: row.doc_id, lineIndex: row.line_index, line: row.line, act: row.act,
      accepted: row.accepted, decidedBy: row.decided_by };
  }

  /**
   * Phân tích lại một hồ sơ trên dữ liệu hiện tại. Dùng chung cho máy chủ (khi quyết) và trình duyệt (hàng đợi).
   * Giá trị cũ lấy từ hồ sơ, nên vẫn đúng kể cả khi quy định gốc đã được cập nhật sau đó.
   * @param {any} oc @param {any[]} registry @param {any[]} docs @param {any[]} decisions
   */
  function analyzeOpenChange(oc, registry, docs, decisions) {
    const rule = registry.find(r => r.id === oc.ruleId);
    if (!rule) return { change: null, props: [], pending: [] };
    const change = { rule: { ...rule, aliases: [...rule.aliases], value: oc.oldValue }, oldValue: oc.oldValue, newValue: oc.newValue, issuerTier: oc.issuerTier };
    const props = Engine.analyze(change, docs, registry).props;
    const held = new Set((oc.held || []).map(lineKey));
    const done = new Set((decisions || []).filter(d => d.changeId === oc.id).map(lineKey));
    props.forEach((/** @type {any} */ p) => { if (p.outcome === 'AUTO_PATCH' && held.has(lineKey(p))) p.semanticHold = true; });
    const pending = props.filter((/** @type {any} */ p) => (p.outcome === 'ESCALATE' || p.semanticHold) && !done.has(lineKey(p)));
    return { change, props, pending };
  }

  /** @param {ServerContext & { openChanges?:any[] }} ctx */
  function nextChangeId(ctx) {
    const max = (ctx.openChanges || []).reduce((m, c) => { const n = Number(String(c.id).replace(/^CR-/, '')); return Number.isFinite(n) && n > m ? n : m; }, 0);
    return 'CR-' + (max + 1);
  }

  /**
   * Người đưa ra một quyết định. Ở workspace trình diễn, cùng một trình duyệt có thể đổi vai trò giữa các quyết
   * định, nên mỗi quyết định mang theo vai trò của người bấm; ở workspace thật, người quyết là người đăng nhập.
   * @param {ServerContext} ctx @param {any} item
   */
  function deciderOf(ctx, item) {
    if (ctx.workspace.mode === 'demo' && item && typeof item.persona === 'string' && item.persona) return demoMember(item.persona);
    return ctx.member;
  }

  /**
   * Ban hành một thay đổi.
   * request = { change:{ruleId,newValue,issuerTier}, requestText?, decisions?:[{docId,lineIndex,line,act,persona?}],
   *             holds?:[{docId,lineIndex,line}], semanticReviews?:[{docId,lineIndex,line,approve,persona?}], ratify?:boolean }
   * @param {ServerContext & { openChanges?:any[], decisions?:any[] }} ctx @param {any} request @returns {Plan}
   */
  function planCommit(ctx, request) {
    const problem = chainProblem(ctx);
    if (problem) return problem;
    const req = request || {};
    const input = req.change || {};
    const state = stateOf(ctx);
    const built = Workflow.buildChange(state.registry, String(input.ruleId || ''), String(input.newValue || ''), Number(input.issuerTier));
    if ('error' in built) return fail(400, 'invalid_change', built.error);
    const issue = Authz.canIssue(ctx.member, built.change);
    if (!issue.ok) return fail(403, 'forbidden_issue', issue.reason || 'Không đủ thẩm quyền.');
    Workflow.startAnalysis(state, built.change, typeof req.requestText === 'string' ? req.requestText.slice(0, 2000) : '');
    const current = /** @type {any} */ (state.current);
    const change = current.change;
    const key = (/** @type {any} */ x) => x.docId + '\u0000' + x.lineIndex;
    const byKey = new Map(current.props.map((/** @type {any} */ p) => [key(p), p]));

    // Hồ sơ đang mở của đúng thay đổi này (nếu người khởi tạo ban hành tiếp phần còn lại).
    const reuse = (ctx.openChanges || []).find(c => c.status === 'open' && c.ruleId === change.rule.id &&
      c.oldValue === change.oldValue && c.newValue === change.newValue && c.issuerTier === change.issuerTier) || null;
    const done = new Set((ctx.decisions || []).filter(d => reuse && d.changeId === reuse.id).map(lineKey));
    const heldBefore = new Set(reuse ? reuse.held.map(lineKey) : []);

    /** @type {any[]} */ const staleItems = [];
    /** @type {any[]} */ const forbidden = [];
    /** @type {any[]} */ const decided = [];
    const locate = (/** @type {any} */ item) => {
      const p = byKey.get(key(item));
      if (!p || p.line !== item.line) { staleItems.push({ docId: item.docId, lineIndex: item.lineIndex }); return null; }
      return p;
    };

    for (const p of current.props) if (p.outcome === 'AUTO_PATCH' && heldBefore.has(lineKey(p)) && !done.has(lineKey(p))) p.semanticHold = true;
    for (const hold of Array.isArray(req.holds) ? req.holds : []) {
      const p = locate(hold);
      if (p && p.outcome === 'AUTO_PATCH') p.semanticHold = true; // client chỉ có thể làm cho kết quả THẬN TRỌNG hơn
    }
    for (const review of Array.isArray(req.semanticReviews) ? req.semanticReviews : []) {
      const p = locate(review);
      if (!p || p.outcome !== 'AUTO_PATCH' || done.has(lineKey(p))) continue;
      const decider = deciderOf(ctx, review);
      const verdict = decider ? Authz.canDecide(decider, { ...p, category: null }, change, state.registry) : { ok: false, reason: 'Vai trò không hợp lệ.' };
      if (!verdict.ok || !decider) { forbidden.push({ docId: p.docId, lineIndex: p.lineIndex, reason: verdict.reason }); continue; }
      p.semanticHold = true;
      p.deciderLabel = actorLabel(decider); p.deciderUser = decider.userId || '';
      Workflow.reviewSemantic(state, p.id, review.approve === true, { now: ctx.now, humanActor: () => p.deciderLabel });
      decided.push({ p, category: 'SEMANTIC', act: review.approve === true ? 'approve' : 'reject', accepted: review.approve === true });
    }
    for (const decision of Array.isArray(req.decisions) ? req.decisions : []) {
      const p = locate(decision);
      if (!p || p.outcome !== 'ESCALATE' || done.has(lineKey(p))) continue;
      const decider = deciderOf(ctx, decision);
      const verdict = decider ? Authz.canDecide(decider, p, change, state.registry) : { ok: false, reason: 'Vai trò không hợp lệ.' };
      if (!verdict.ok || !decider) { forbidden.push({ docId: p.docId, lineIndex: p.lineIndex, reason: verdict.reason }); continue; }
      if (decision.act !== 'a' && decision.act !== 'b') continue;
      Workflow.decide(state, p.id, decision.act);
      p.deciderLabel = actorLabel(decider); p.deciderUser = decider.userId || '';
      decided.push({ p, category: p.category, act: decision.act, accepted: p.accepted });
    }
    if (staleItems.length) return fail(409, 'stale_analysis', 'Tài liệu đã thay đổi kể từ lúc bạn phân tích. Hãy phân tích lại.', staleItems);
    if (forbidden.length) return fail(403, 'forbidden_decision', 'Một số quyết định vượt thẩm quyền của người quyết.', forbidden);

    // Các vị trí đã được quyết trong hồ sơ trước đó thì bỏ qua lần này.
    for (const p of current.props) if (done.has(lineKey(p))) p.applied = true;
    const needsCase = current.props.some((/** @type {any} */ p) => !done.has(lineKey(p)) && (p.outcome === 'ESCALATE' || p.semanticHold));
    const changeId = needsCase ? (reuse ? reuse.id : nextChangeId(ctx)) : null;
    const committed = Workflow.commit(state, { now: ctx.now, humanActor: (/** @type {any} */ p) => p.deciderLabel || actorLabel(ctx.member),
      basisSuffix: issueSuffix(ctx.member.displayName, change.issuerTier, changeId) });
    if (!committed.ok) return fail(409, 'commit_refused', committed.message);
    let records = [...state.ledger.slice(ctx.ledger.length)];
    /** @type {any[]} */ const policyUpdates = [];
    let ratifyMessage = null;
    if (req.ratify === true) {
      const before = state.registry.find(r => r.id === change.rule.id);
      const expectedValue = before ? before.value : null;
      const ratified = Workflow.ratifyRule(state, { now: ctx.now, actor: actorLabel(ctx.member) });
      ratifyMessage = ratified.message;
      if (ratified.ok && before) {
        policyUpdates.push({ id: before.id, expectedValue, value: before.value, aliases: before.aliases });
        records = [...state.ledger.slice(ctx.ledger.length)];
      }
    }
    const pendingAfter = current.props.filter((/** @type {any} */ p) => !done.has(lineKey(p)) &&
      ((p.outcome === 'ESCALATE' && !p.decided) || (p.semanticHold && !p.semanticHoldReviewed)));
    const newHolds = current.props.filter((/** @type {any} */ p) => p.semanticHold && !p.semanticHoldReviewed && !heldBefore.has(lineKey(p)));
    if (!records.length && (!needsCase || (reuse && !decided.length && !newHolds.length))) {
      return fail(422, 'nothing_to_commit', 'Không có thay đổi nào đủ điều kiện ban hành.');
    }
    const held = [...(reuse ? reuse.held : []), ...newHolds.map((/** @type {any} */ p) => ({ docId: p.docId, lineIndex: p.lineIndex, line: p.line }))];
    const openChange = needsCase ? {
      id: changeId, reuse: !!reuse, ruleId: change.rule.id, oldValue: change.oldValue, newValue: change.newValue, issuerTier: change.issuerTier,
      requestText: current.requestText || '', createdBy: ctx.member.displayName, createdUser: ctx.member.userId || '',
      held, status: pendingAfter.length ? 'open' : 'closed'
    } : null;
    const caseMessage = openChange && openChange.status === 'open'
      ? ' Hồ sơ ' + openChange.id + ' còn ' + pendingAfter.length + ' vị trí chờ người có thẩm quyền quyết trong Hàng đợi duyệt.' : '';
    return {
      ok: true, status: 200,
      body: { message: committed.message + (ratifyMessage ? ' ' + ratifyMessage : '') + caseMessage, applied: committed.applied,
        proverHeld: committed.proverHeld, stale: committed.stale, records,
        openChange: openChange ? { id: openChange.id, status: openChange.status, pending: pendingAfter.length } : null },
      rpc: {
        p_workspace: ctx.workspace.id, p_expected_seq: ctx.workspace.ledger_seq, p_expected_tail: ctx.workspace.ledger_tail,
        p_doc_updates: docUpdatesFrom(records, state.docs), p_policy_updates: policyUpdates, p_new_documents: [],
        p_records: records.map(r => toRpcRecord(r, ctx.member.userId)),
        p_feedback: decided.map(d => ({ userId: d.p.deciderUser, actor: d.p.deciderLabel, ruleId: change.rule.id,
          category: d.category, docId: d.p.docId, lineIndex: d.p.lineIndex, line: d.p.line, answer: d.accepted ? 'accept' : 'reject' })),
        p_open_change: openChange,
        p_decisions: changeId ? decided.map(d => ({ changeId, docId: d.p.docId, lineIndex: d.p.lineIndex, line: d.p.line, act: d.act,
          accepted: d.accepted, decidedBy: d.p.deciderLabel, decidedUser: d.p.deciderUser })) : [],
        p_close_change: null
      }
    };
  }

  /**
   * Người có thẩm quyền quyết MỘT vị trí trong hồ sơ đang mở; áp dụng ngay.
   * request = { changeId, docId, lineIndex, line, act: 'a'|'b' (U1/U2/U3) hoặc 'approve'|'reject' (AI giữ lại) }
   * @param {ServerContext & { openChanges?:any[], decisions?:any[] }} ctx @param {any} request @returns {Plan}
   */
  function planDecide(ctx, request) {
    const problem = chainProblem(ctx);
    if (problem) return problem;
    const req = request || {};
    const oc = (ctx.openChanges || []).find(c => c.id === req.changeId);
    if (!oc) return fail(404, 'not_found', 'Không có hồ sơ ' + String(req.changeId || '') + '.');
    if (oc.status !== 'open') return fail(409, 'change_closed', 'Hồ sơ ' + oc.id + ' đã đóng.');
    const state = stateOf(ctx);
    const { change, props, pending } = analyzeOpenChange(oc, state.registry, state.docs, ctx.decisions || []);
    if (!change) return fail(409, 'change_closed', 'Quy định của hồ sơ không còn trong sổ đăng ký.');
    const p = pending.find((/** @type {any} */ x) => x.docId === req.docId && x.lineIndex === Number(req.lineIndex) && x.line === req.line);
    if (!p) return fail(409, 'stale_analysis', 'Vị trí này đã được quyết hoặc nội dung đã thay đổi. Hãy tải lại.');
    const label = actorLabel(ctx.member);
    state.current = { change, props, requestText: oc.requestText, semanticResult: null };
    const semantic = p.outcome === 'AUTO_PATCH';
    const verdict = Authz.canDecide(ctx.member, semantic ? { ...p, category: null } : p, change, state.registry);
    if (!verdict.ok) return fail(403, 'forbidden_decision', verdict.reason || 'Không đủ thẩm quyền.');
    let accepted;
    if (semantic) {
      if (req.act !== 'approve' && req.act !== 'reject') return fail(400, 'invalid_decision', 'Lựa chọn không hợp lệ.');
      accepted = req.act === 'approve';
      Workflow.reviewSemantic(state, p.id, accepted, { now: ctx.now, humanActor: () => label });
    } else {
      if (req.act !== 'a' && req.act !== 'b') return fail(400, 'invalid_decision', 'Lựa chọn không hợp lệ.');
      Workflow.decide(state, p.id, req.act);
      accepted = p.accepted;
    }
    props.forEach((/** @type {any} */ x) => { if (x !== p) x.applied = true; });
    const committed = Workflow.commit(state, { now: ctx.now, humanActor: () => label, basisSuffix: issueSuffix(oc.createdBy, oc.issuerTier, oc.id) });
    if (!committed.ok) return fail(409, 'commit_refused', committed.message);
    const records = state.ledger.slice(ctx.ledger.length);
    if (accepted && !records.some(r => String(r.action).startsWith('PATCH'))) {
      return fail(409, 'commit_refused', 'Không áp dụng được: prover chặn hoặc dòng đã thay đổi. Hãy tải lại.');
    }
    const remaining = pending.length - 1;
    const where = p.docId + ' dòng ' + (p.lineIndex + 1);
    return {
      ok: true, status: 200,
      body: { message: (accepted ? 'Đã sửa ' : 'Đã giữ nguyên ') + where + '. ' +
        (remaining ? 'Hồ sơ ' + oc.id + ' còn ' + remaining + ' vị trí.' : 'Hồ sơ ' + oc.id + ' đã xử lý xong và được đóng.'), records, remaining },
      rpc: {
        p_workspace: ctx.workspace.id, p_expected_seq: ctx.workspace.ledger_seq, p_expected_tail: ctx.workspace.ledger_tail,
        p_doc_updates: docUpdatesFrom(records, state.docs), p_policy_updates: [], p_new_documents: [],
        p_records: records.map(r => toRpcRecord(r, ctx.member.userId)),
        p_feedback: [{ userId: ctx.member.userId || '', actor: label, ruleId: oc.ruleId, category: semantic ? 'SEMANTIC' : p.category,
          docId: p.docId, lineIndex: p.lineIndex, line: p.line, answer: accepted ? 'accept' : 'reject' }],
        p_open_change: null,
        p_decisions: [{ changeId: oc.id, docId: p.docId, lineIndex: p.lineIndex, line: p.line, act: req.act, accepted,
          decidedBy: label, decidedUser: ctx.member.userId || '' }],
        p_close_change: remaining ? null : oc.id
      }
    };
  }

  /** @param {ServerContext} ctx @param {any} request @returns {Plan} */
  function planUndo(ctx, request) {
    const problem = chainProblem(ctx);
    if (problem) return problem;
    const seq = Number(request && request.seq);
    const entry = ctx.ledger.find(e => e.seq === seq);
    if (!entry) return fail(404, 'not_found', 'Không có bản ghi #' + seq + '.');
    const doc = ctx.docs.find(d => d.id === entry.docId);
    const allowed = Authz.canUndo(ctx.member, doc, entry);
    if (!allowed.ok) return fail(403, 'forbidden_undo', allowed.reason || 'Không đủ thẩm quyền.');
    const state = stateOf(ctx);
    const result = Workflow.undo(state, seq, { now: ctx.now, humanActor: () => actorLabel(ctx.member) });
    if (!result.ok) return fail(409, 'undo_refused', result.message);
    const records = state.ledger.slice(ctx.ledger.length);
    return { ok: true, status: 200, body: { message: result.message, records },
      rpc: { p_workspace: ctx.workspace.id, p_expected_seq: ctx.workspace.ledger_seq, p_expected_tail: ctx.workspace.ledger_tail,
        p_doc_updates: docUpdatesFrom(records, state.docs), p_policy_updates: [], p_new_documents: [],
        p_records: records.map(r => toRpcRecord(r, ctx.member.userId)), p_feedback: [] } };
  }

  /** @param {ServerContext} ctx @param {any} request @returns {Plan} */
  function planAnchor(ctx, request) {
    const problem = chainProblem(ctx);
    if (problem) return problem;
    const rule = ctx.registry.find(r => r.id === (request && request.ruleId));
    const allowed = Authz.canEditRegistry(ctx.member, rule);
    if (!rule) return fail(404, 'not_found', 'Quy định không có trong sổ đăng ký.');
    if (!allowed.ok) return fail(403, 'forbidden_registry', allowed.reason || 'Không đủ thẩm quyền.');
    const state = stateOf(ctx);
    const reason = typeof request.reason === 'string' ? request.reason.slice(0, 300) : undefined;
    const result = Workflow.addAnchor(state, rule.id, request.phrase, { now: ctx.now, actor: actorLabel(ctx.member), reason });
    if (!result.ok) return fail(422, 'anchor_rejected', result.message);
    const updated = state.registry.find(r => r.id === rule.id);
    return { ok: true, status: 200, body: { message: result.message, records: result.records },
      rpc: { p_workspace: ctx.workspace.id, p_expected_seq: ctx.workspace.ledger_seq, p_expected_tail: ctx.workspace.ledger_tail,
        p_doc_updates: [], p_policy_updates: [{ id: rule.id, expectedValue: rule.value, value: updated.value, aliases: updated.aliases }],
        p_new_documents: [], p_records: (result.records || []).map((/** @type {any} */ r) => toRpcRecord(r, ctx.member.userId)), p_feedback: [] } };
  }

  /** @param {ServerContext} ctx @param {any} request @returns {Plan} */
  function planAddDocument(ctx, request) {
    const problem = chainProblem(ctx);
    if (problem) return problem;
    const input = request && request.document || {};
    const tier = Number(input.tier);
    const owner = String(input.owner || '').trim() || (ctx.member.units.find(u => u !== '*') || 'Do người dùng nhập');
    if (Authz.tierOf(ctx.member) < tier || !Authz.covers(ctx.member, owner)) {
      return fail(403, 'forbidden_document', ctx.member.displayName + ' không được nạp tài liệu cấp ' + tier + ' của ' + owner + '.');
    }
    const state = stateOf(ctx);
    const result = Workflow.addDocument(state, { title: input.title, owner, tier, lines: input.lines }, { now: ctx.now, actor: actorLabel(ctx.member) });
    if (!result.ok) return fail(422, 'document_rejected', result.message);
    return { ok: true, status: 200, body: { message: result.message, records: result.records, document: result.doc },
      rpc: { p_workspace: ctx.workspace.id, p_expected_seq: ctx.workspace.ledger_seq, p_expected_tail: ctx.workspace.ledger_tail,
        p_doc_updates: [], p_policy_updates: [], p_new_documents: [result.doc],
        p_records: (result.records || []).map((/** @type {any} */ r) => toRpcRecord(r, ctx.member.userId)), p_feedback: [] } };
  }

  return Object.freeze({ fromDbPolicy, fromDbDocument, fromDbRecord, fromDbOpenChange, fromDbDecision, toRpcRecord, demoMember, actorLabel,
    issueSuffix, analyzeOpenChange, planCommit, planDecide, planUndo, planAnchor, planAddDocument });
});
