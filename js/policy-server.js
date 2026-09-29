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
      current: null, ledger: ctx.ledger.map(e => ({ ...e })) };
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

  /**
   * Ban hành một thay đổi.
   * request = { change:{ruleId,newValue,issuerTier}, requestText?, decisions?:[{docId,lineIndex,line,act}],
   *             holds?:[{docId,lineIndex,line}], semanticReviews?:[{docId,lineIndex,line,approve}], ratify?:boolean }
   * @param {ServerContext} ctx @param {any} request @returns {Plan}
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
    const key = (/** @type {any} */ x) => x.docId + '\u0000' + x.lineIndex;
    const byKey = new Map(current.props.map((/** @type {any} */ p) => [key(p), p]));
    /** @type {any[]} */ const staleItems = [];
    /** @type {any[]} */ const forbidden = [];
    /** @type {any[]} */ const feedback = [];
    const locate = (/** @type {any} */ item) => {
      const p = byKey.get(key(item));
      if (!p || p.line !== item.line) { staleItems.push({ docId: item.docId, lineIndex: item.lineIndex }); return null; }
      return p;
    };

    for (const hold of Array.isArray(req.holds) ? req.holds : []) {
      const p = locate(hold);
      if (p && p.outcome === 'AUTO_PATCH') p.semanticHold = true; // client chỉ có thể làm cho kết quả THẬN TRỌNG hơn
    }
    for (const review of Array.isArray(req.semanticReviews) ? req.semanticReviews : []) {
      const p = locate(review);
      if (!p || p.outcome !== 'AUTO_PATCH') continue;
      const verdict = Authz.canDecide(ctx.member, { ...p, category: null }, current.change, state.registry);
      if (!verdict.ok) { forbidden.push({ docId: p.docId, lineIndex: p.lineIndex, reason: verdict.reason }); continue; }
      p.semanticHold = true;
      Workflow.reviewSemantic(state, p.id, review.approve === true, { now: ctx.now, humanActor: () => actorLabel(ctx.member) });
      feedback.push({ category: 'SEMANTIC', p, answer: review.approve === true ? 'accept' : 'reject' });
    }
    for (const decision of Array.isArray(req.decisions) ? req.decisions : []) {
      const p = locate(decision);
      if (!p || p.outcome !== 'ESCALATE') continue;
      const verdict = Authz.canDecide(ctx.member, p, current.change, state.registry);
      if (!verdict.ok) { forbidden.push({ docId: p.docId, lineIndex: p.lineIndex, reason: verdict.reason }); continue; }
      if (decision.act !== 'a' && decision.act !== 'b') continue;
      Workflow.decide(state, p.id, decision.act);
      feedback.push({ category: p.category, p, answer: p.accepted ? 'accept' : 'reject' });
    }
    if (staleItems.length) return fail(409, 'stale_analysis', 'Tài liệu đã thay đổi kể từ lúc bạn phân tích. Hãy phân tích lại.', staleItems);
    if (forbidden.length) return fail(403, 'forbidden_decision', 'Một số quyết định vượt thẩm quyền của ' + ctx.member.displayName + '.', forbidden);

    const committed = Workflow.commit(state, { now: ctx.now, humanActor: () => actorLabel(ctx.member), basisSuffix: 'khởi tạo bởi ' + ctx.member.displayName });
    if (!committed.ok) return fail(409, 'commit_refused', committed.message);
    let records = [...state.ledger.slice(ctx.ledger.length)];
    /** @type {any[]} */ const policyUpdates = [];
    let ratifyMessage = null;
    if (req.ratify === true) {
      const before = state.registry.find(r => r.id === current.change.rule.id);
      const expectedValue = before ? before.value : null;
      const ratified = Workflow.ratifyRule(state, { now: ctx.now, actor: actorLabel(ctx.member) });
      ratifyMessage = ratified.message;
      if (ratified.ok && before) {
        policyUpdates.push({ id: before.id, expectedValue, value: before.value, aliases: before.aliases });
        records = [...state.ledger.slice(ctx.ledger.length)];
      }
    }
    if (!records.length) return fail(422, 'nothing_to_commit', 'Không có thay đổi nào đủ điều kiện ban hành.');
    return {
      ok: true, status: 200,
      body: { message: committed.message + (ratifyMessage ? ' ' + ratifyMessage : ''), applied: committed.applied,
        proverHeld: committed.proverHeld, stale: committed.stale, records },
      rpc: {
        p_workspace: ctx.workspace.id, p_expected_seq: ctx.workspace.ledger_seq, p_expected_tail: ctx.workspace.ledger_tail,
        p_doc_updates: docUpdatesFrom(records, state.docs), p_policy_updates: policyUpdates, p_new_documents: [],
        p_records: records.map(r => toRpcRecord(r, ctx.member.userId)),
        p_feedback: feedback.map(f => ({ userId: ctx.member.userId || '', actor: actorLabel(ctx.member), ruleId: current.change.rule.id,
          category: f.category, docId: f.p.docId, lineIndex: f.p.lineIndex, line: f.p.line, answer: f.answer }))
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
    const allowed = Authz.canUndo(ctx.member, doc);
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

  return Object.freeze({ fromDbPolicy, fromDbDocument, fromDbRecord, toRpcRecord, demoMember, actorLabel,
    planCommit, planUndo, planAnchor, planAddDocument });
});
