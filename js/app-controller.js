// @ts-check
/**
 * Bộ điều khiển ứng dụng — toàn bộ trạng thái và thao tác nghiệp vụ của giao diện, KHÔNG đụng DOM.
 *
 * Ba nguồn dữ liệu:
 * - 'remote'  : dữ liệu dùng chung trên Supabase; mọi thao tác ghi đi qua policy-api (máy chủ kiểm quyền).
 * - 'local'   : chế độ Ngoại tuyến; dữ liệu lưu trong IndexedDB của trình duyệt, tải lại trang vẫn còn.
 * - 'sandbox' : kịch bản minh hoạ tạm thời; không ghi vào máy chủ hay bộ nhớ máy.
 *
 * Phân quyền (policy-authz.js) được áp dụng giống nhau ở cả ba nguồn; ở 'remote' máy chủ còn kiểm lại.
 */
(function attachAppController(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const api = factory();
  // @ts-ignore
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeApp = api;
})(typeof globalThis === 'object' ? globalThis : this, function createAppControllerModule() {
  'use strict';

  /**
   * @param {{
   *   Engine:any, Data:any, Workflow:any, Ledger:any, Authz:any, Server:any, Semantic:any, AI:any, Learning:any,
   *   localStore:any, remote?:any, aiAdapter?:any, now?:() => string, workspace?:string
   * }} deps
   */
  function createController(deps) {
    const { Engine, Data, Workflow, Ledger, Authz, Server, Semantic, AI, Learning } = deps;
    const now = deps.now || (() => new Date().toISOString());
    /** @type {Set<(state:any) => void>} */
    const listeners = new Set();

    const S = {
      source: /** @type {'remote'|'local'|'sandbox'} */ ('local'),
      workspace: { id: deps.workspace || 'demo', name: 'Trình diễn', mode: 'demo' },
      registry: /** @type {any[]} */ ([]),
      docs: /** @type {any[]} */ ([]),
      ledger: /** @type {any[]} */ ([]),
      feedback: /** @type {any[]} */ ([]),
      openChanges: /** @type {any[]} */ ([]),
      decisions: /** @type {any[]} */ ([]),
      current: /** @type {any} */ (null),
      persona: 'tp-dt',
      liveMember: /** @type {any} */ (null),
      revision: 0,
      stale: false,
      busy: false,
      connection: /** @type {'online'|'offline'|'unconfigured'} */ (deps.remote && deps.remote.configured ? 'offline' : 'unconfigured'),
      notice: /** @type {null|{ tone:string, text:string }} */ (null),
      ai: { status: deps.aiAdapter ? 'checking' : 'off', reason: deps.aiAdapter ? 'Đang kiểm tra máy chủ AI…' : 'Chưa cấu hình máy chủ AI.', model: /** @type {string|null} */ (null) },
      saved: /** @type {any} */ (null)
    };

    function emit() { listeners.forEach(fn => { try { fn(S); } catch (_) { /* một view lỗi không làm hỏng các view khác */ } }); }
    /** @param {string} tone @param {string} text */
    function notify(tone, text) { S.notice = { tone, text }; }
    /** @param {boolean} ok @param {string} message @param {any} [extra] */
    function result(ok, message, extra) { notify(ok ? 'ok' : 'error', message); emit(); return { ok, message, ...(extra || {}) }; }

    // ---------- Người dùng hiện tại ----------
    function member() {
      if (S.source === 'remote' && S.workspace.mode === 'live') return S.liveMember;
      return Server.demoMember(S.persona);
    }
    function actor() { const m = member(); return m ? Server.actorLabel(m) : 'Người dùng'; }

    /** @param {string} personaId */
    function setPersona(personaId) {
      if (!Authz.DEMO_PERSONAS.some((/** @type {any} */ p) => p.id === personaId)) return;
      S.persona = personaId;
      emit();
    }

    // ---------- Nạp / lưu ----------
    function seedLocal() {
      S.registry = Engine.cloneRegistry(Data.SEED_REGISTRY);
      S.docs = Engine.cloneDocs(Data.SEED_DOCUMENTS);
      S.ledger = [];
      S.feedback = [];
    }

    async function persist() {
      if (S.source !== 'local') return;
      const ok = await deps.localStore.save({ registry: S.registry, docs: S.docs, ledger: S.ledger, feedback: S.feedback });
      if (!ok && deps.localStore.lastError) notify('warn', deps.localStore.lastError);
    }

    async function loadLocal() {
      const snapshot = await deps.localStore.load();
      if (snapshot && Ledger.verify(snapshot.ledger)) {
        S.registry = snapshot.registry; S.docs = snapshot.docs; S.ledger = snapshot.ledger; S.feedback = snapshot.feedback || [];
      } else {
        if (snapshot) notify('warn', 'Dữ liệu lưu trên máy có chuỗi kiểm toán không hợp lệ; đã khôi phục dữ liệu mẫu.');
        seedLocal();
      }
      S.source = 'local';
      S.openChanges = []; S.decisions = [];
      S.workspace = { id: 'local', name: 'Trên máy này', mode: 'demo' };
      S.current = null; S.stale = false; S.revision++;
    }

    /** @param {string} [workspaceId] */
    async function loadRemote(workspaceId) {
      const id = workspaceId || S.workspace.id || 'demo';
      const res = await deps.remote.loadWorkspace(id === 'local' ? 'demo' : id);
      if (!res.ok) {
        if (res.reason === 'network') S.connection = 'offline';
        return { ok: false, message: res.message, reason: res.reason };
      }
      if (!Ledger.verify(res.ledger)) return { ok: false, message: 'Sổ kiểm toán trên máy chủ không toàn vẹn; không hiển thị để tránh hiểu nhầm.', reason: 'corrupt' };
      S.connection = 'online';
      S.source = 'remote';
      S.workspace = { id: res.workspace.id, name: res.workspace.name, mode: res.workspace.mode };
      S.registry = res.registry; S.docs = res.docs; S.ledger = res.ledger; S.feedback = res.feedback;
      S.openChanges = res.openChanges || []; S.decisions = res.decisions || [];
      S.stale = false; S.revision++;
      if (S.workspace.mode === 'live') {
        const who = await deps.remote.call({ action: 'whoami', workspace: S.workspace.id });
        S.liveMember = who.ok ? who.data.member : null;
      } else S.liveMember = null;
      return { ok: true };
    }

    /**
     * Khởi động: ưu tiên dữ liệu dùng chung trên máy chủ, lùi về dữ liệu trên máy nếu không kết nối được.
     * @param {{ prefer?:'remote'|'local', workspace?:string }} [options]
     */
    async function init(options = {}) {
      S.busy = true; emit();
      let loaded = false;
      if (options.prefer !== 'local' && deps.remote && deps.remote.configured) {
        const res = await loadRemote(options.workspace || S.workspace.id);
        loaded = res.ok;
        if (!res.ok) notify('warn', res.message + ' Đang dùng chế độ Ngoại tuyến (lưu trên máy).');
      }
      if (!loaded) await loadLocal();
      S.busy = false; emit();
      checkAI();
    }

    async function checkAI() {
      if (!deps.aiAdapter) return;
      const res = await deps.aiAdapter.status();
      S.ai = res.available ? { status: 'ready', reason: 'OpenAI qua máy chủ', model: res.model || null }
        : { status: 'off', reason: res.reason || 'AI không khả dụng.', model: null };
      emit();
    }

    /** @param {'remote'|'local'} source @param {string} [workspaceId] */
    async function switchSource(source, workspaceId) {
      if (S.source === 'sandbox') exitSandbox();
      S.busy = true; emit();
      if (source === 'remote') {
        const res = await loadRemote(workspaceId);
        S.busy = false;
        if (!res.ok) return result(false, res.message);
        return result(true, 'Đã kết nối dữ liệu dùng chung · ' + S.workspace.name + '.');
      }
      await loadLocal();
      S.busy = false;
      return result(true, 'Đang làm việc ngoại tuyến; dữ liệu lưu trên trình duyệt này.');
    }

    async function reload() {
      if (S.source !== 'remote') return { ok: true };
      const keep = S.current;
      const res = await loadRemote(S.workspace.id);
      if (!res.ok) return result(false, res.message);
      S.current = keep;
      emit();
      return { ok: true };
    }

    /** Phát hiện người khác vừa ghi vào workspace. Tự tải lại nếu người dùng chưa có thao tác dở dang. */
    async function poll() {
      if (S.source !== 'remote' || S.busy) return;
      const t = await deps.remote.tail(S.workspace.id);
      if (!t) return;
      const mine = Ledger.tailOf(S.ledger);
      if (t.seq === mine.seq && t.hash === mine.hash) return;
      const dirty = S.current && S.current.props.some((/** @type {any} */ p) => (p.decided && !p.logged && !p.applied) || p.semanticHoldReviewed);
      if (dirty) { S.stale = true; emit(); return; }
      await reload();
      notify('info', 'Đã cập nhật thay đổi mới từ người khác.');
      emit();
    }

    // ---------- Đăng nhập (workspace live) ----------
    /** @param {string} email @param {string} password */
    async function signIn(email, password) {
      const res = await deps.remote.signIn(email, password);
      if (!res.ok) return result(false, res.message);
      return switchSource('remote', 'hcmut-pilot');
    }
    async function signOut() {
      await deps.remote.signOut();
      S.liveMember = null;
      return switchSource('remote', 'demo');
    }

    // ---------- Minh hoạ ----------
    /** @param {{ docs:any[], registry?:any[], label:string }} scenario */
    function enterSandbox(scenario) {
      if (S.source !== 'sandbox') S.saved = { source: S.source, workspace: S.workspace, registry: S.registry, docs: S.docs, ledger: S.ledger, feedback: S.feedback, current: S.current, persona: S.persona };
      S.source = 'sandbox';
      S.workspace = { id: 'sandbox', name: scenario.label, mode: 'demo' };
      S.registry = Engine.cloneRegistry(scenario.registry || Data.SEED_REGISTRY);
      S.docs = Engine.cloneDocs(scenario.docs);
      S.ledger = []; S.feedback = []; S.openChanges = []; S.decisions = []; S.current = null; S.revision++;
      emit();
    }
    function exitSandbox() {
      if (S.source !== 'sandbox' || !S.saved) return;
      Object.assign(S, { source: S.saved.source, workspace: S.saved.workspace, registry: S.saved.registry, docs: S.saved.docs,
        ledger: S.saved.ledger, feedback: S.saved.feedback, current: S.saved.current, persona: S.saved.persona });
      S.saved = null; S.revision++;
      emit();
    }

    // ---------- Hiểu yêu cầu ----------
    /** @param {string} requestText */
    async function resolveRequest(requestText) {
      const adapter = S.ai.status === 'ready' && deps.aiAdapter ? deps.aiAdapter : AI.createUnavailableAdapter();
      return AI.resolveRequest({
        requestText, registry: S.registry, adapter,
        parseDeterministically: (/** @type {string} */ text) => Engine.parseFreeText(text, S.registry),
        normalizeValue: Engine.policyValueKey
      });
    }

    // ---------- Phân tích ----------
    /** @param {{ ruleId:string, newValue:string, issuerTier:number, requestText?:string }} input */
    function analyze(input) {
      const built = Workflow.buildChange(S.registry, input.ruleId, input.newValue, Number(input.issuerTier));
      if ('error' in built) return result(false, built.error);
      Workflow.startAnalysis(S, built.change, input.requestText || '');
      S.current.revision = S.revision;
      S.current.semanticStatus = null;
      const n = S.current.props.length;
      return result(true, n ? 'Đã quét ' + S.docs.length + ' tài liệu, tìm thấy ' + n + ' vị trí mang giá trị “' + built.change.oldValue + '”.'
        : 'Không có vị trí nào mang giá trị “' + built.change.oldValue + '”; không có gì cần sửa.');
    }

    function canIssueCurrent() {
      if (!S.current) return { ok: false, reason: 'Chưa có phân tích.' };
      return Authz.canIssue(member(), S.current.change);
    }

    /** @param {any} [adapter] @param {string} [sourceLabel] */
    async function discoverSemantics(adapter, sourceLabel) {
      if (!S.current) return result(false, 'Chưa có phân tích.');
      const analysis = S.current;
      const useAdapter = adapter || (S.ai.status === 'ready' ? deps.aiAdapter : Semantic.createUnavailableAdapter());
      analysis.semanticStatus = 'pending'; emit();
      const res = await Semantic.discoverSemantics({ requestText: analysis.requestText, change: analysis.change, props: analysis.props,
        docs: S.docs, registry: S.registry, matchesOldValue: Engine.matchesOldValue, adapter: useAdapter });
      if (S.current !== analysis) return { ok: false, message: 'Phân tích đã thay đổi.' };
      analysis.props = res.props;
      analysis.semanticStatus = res.status;
      analysis.semanticSource = sourceLabel || (S.ai.status === 'ready' ? 'openai' : 'none');
      analysis.semanticResult = { status: res.status, valid: res.status === 'complete' ? res.valid : [], rejected: res.rejected };
      const holds = analysis.props.filter((/** @type {any} */ p) => p.semanticHold).length;
      const messages = {
        complete: 'AI đã rà ' + res.candidateSet.candidates.length + ' vị trí; ' + res.valid.length + ' bằng chứng hợp lệ; ' + holds + ' vị trí được giữ lại cho người duyệt.',
        unavailable: 'AI ngữ nghĩa không khả dụng; giữ nguyên kết quả của động cơ tiền định.',
        timeout: 'AI hết thời gian chờ; giữ nguyên kết quả của động cơ tiền định.',
        provider_failure: 'AI gặp lỗi; giữ nguyên kết quả của động cơ tiền định.',
        rejected: 'Bằng chứng AI không qua được bộ kiểm tra; giữ nguyên kết quả của động cơ tiền định.',
        no_candidates: 'Không có vị trí nào để AI rà soát.'
      };
      return result(res.status === 'complete' || res.status === 'no_candidates', /** @type {any} */ (messages)[res.status] || 'Đã kiểm tra.', { status: res.status, holds });
    }

    /** @param {any} p */
    function decisionRight(p) {
      if (!S.current) return { ok: false, reason: 'Chưa có phân tích.', requirement: null };
      const prop = p.outcome === 'AUTO_PATCH' ? { ...p, category: null } : p;
      return Authz.canDecide(member(), prop, S.current.change, S.registry);
    }

    /** @param {string} propId @param {'a'|'b'} act */
    function decide(propId, act) {
      if (!S.current) return result(false, 'Chưa có phân tích.');
      const p = S.current.props.find((/** @type {any} */ x) => x.id === propId);
      if (!p) return result(false, 'Không tìm thấy hồ sơ.');
      const right = decisionRight(p);
      if (!right.ok) return result(false, right.reason || 'Không đủ thẩm quyền.');
      const res = Workflow.decide(S, propId, act);
      if (!res.ok) return result(false, res.message);
      p.act = act;
      p.decidedBy = actor();
      p.deciderPersona = S.persona;
      return result(true, p.docId + ' dòng ' + (p.lineIndex + 1) + ': ' + p.decisionLabel + '. Bấm “Ban hành” để ghi vào sổ.');
    }

    /** @param {string} propId */
    function undoDecision(propId) {
      const p = S.current && S.current.props.find((/** @type {any} */ x) => x.id === propId);
      if (!p || !p.decided || p.applied || p.logged) return result(false, 'Không thể đổi quyết định đã ban hành.');
      p.decided = false; p.accepted = false; p.decisionLabel = null; delete p.act;
      return result(true, 'Đã bỏ quyết định; hồ sơ trở lại hàng đợi.');
    }

    /** @param {string} propId @param {boolean} approve */
    async function reviewSemantic(propId, approve) {
      if (!S.current) return result(false, 'Chưa có phân tích.');
      const p = S.current.props.find((/** @type {any} */ x) => x.id === propId);
      if (!p || !p.semanticHold || p.semanticHoldReviewed) return result(false, 'Không có vị trí đang chờ rà soát.');
      const right = decisionRight(p);
      if (!right.ok) return result(false, right.reason || 'Không đủ thẩm quyền.');
      p.decidedBy = actor();
      p.deciderPersona = S.persona;
      if (S.source === 'remote') { p.semanticHoldReviewed = true; p.semanticHoldApproved = approve === true; }
      else {
        Workflow.reviewSemantic(S, propId, approve === true, { now, humanActor: () => actor() });
        if (!approve) S.feedback.push(feedbackOf('SEMANTIC', p, 'reject'));
        await persist();
      }
      return result(true, approve ? 'Đã duyệt; vị trí sẽ được sửa khi ban hành.' : 'Đã giữ nguyên dòng này.');
    }

    function committableCount() { return S.current ? Workflow.committableCount(S) : 0; }

    /** @param {string} category @param {any} p @param {'accept'|'reject'} answer */
    function feedbackOf(category, p, answer) {
      return { ruleId: S.current.change.rule.id, category, docId: p.docId, lineIndex: p.lineIndex, line: p.line, answer, actor: actor(), ts: now() };
    }

    /** @param {{ ratify?:boolean }} [options] */
    async function commit(options = {}) {
      if (!S.current) return result(false, 'Chưa có phân tích.');
      const issue = canIssueCurrent();
      if (!issue.ok) return result(false, issue.reason || 'Không đủ thẩm quyền ban hành.');
      if (S.source === 'remote') return commitRemote(options);
      const fresh = S.current.props.filter((/** @type {any} */ p) => p.decided && !p.fed);
      const approvedSemantic = S.current.props.filter((/** @type {any} */ p) => p.semanticHoldApproved && !p.fed);
      const committed = Workflow.commit(S, { now, humanActor: (/** @type {any} */ p) => p.decidedBy || actor(),
        basisSuffix: Server.issueSuffix((member() || {}).displayName, S.current.change.issuerTier, null) });
      if (!committed.ok) return result(false, committed.message);
      fresh.forEach((/** @type {any} */ p) => { p.fed = true; S.feedback.push(feedbackOf(p.category, p, p.accepted ? 'accept' : 'reject')); });
      approvedSemantic.forEach((/** @type {any} */ p) => { p.fed = true; S.feedback.push(feedbackOf('SEMANTIC', p, 'accept')); });
      let message = committed.message;
      if (options.ratify) {
        const ratified = Workflow.ratifyRule(S, { now, actor: actor() });
        message += ' ' + ratified.message;
      }
      S.revision++;
      await persist();
      return result(true, message, { applied: committed.applied });
    }

    /** @param {{ ratify?:boolean }} options */
    async function commitRemote(options) {
      const cur = S.current;
      const pick = (/** @type {any} */ p) => ({ docId: p.docId, lineIndex: p.lineIndex, line: p.line });
      const body = {
        action: 'commit', workspace: S.workspace.id, persona: S.persona,
        change: { ruleId: cur.change.rule.id, newValue: cur.change.newValue, issuerTier: cur.change.issuerTier },
        requestText: cur.requestText || '',
        decisions: cur.props.filter((/** @type {any} */ p) => p.outcome === 'ESCALATE' && p.decided && !p.logged && !p.applied)
          .map((/** @type {any} */ p) => ({ ...pick(p), act: p.act, persona: p.deciderPersona || S.persona })),
        holds: cur.props.filter((/** @type {any} */ p) => p.semanticHold && !p.semanticHoldReviewed).map(pick),
        semanticReviews: cur.props.filter((/** @type {any} */ p) => p.semanticHoldReviewed && !p.applied && !p.logged)
          .map((/** @type {any} */ p) => ({ ...pick(p), approve: p.semanticHoldApproved === true, persona: p.deciderPersona || S.persona })),
        ratify: options.ratify === true
      };
      S.busy = true; emit();
      const res = await deps.remote.call(body);
      S.busy = false;
      if (!res.ok) {
        if (res.status === 409) await reload();
        return result(false, res.data.message || 'Máy chủ từ chối ban hành.');
      }
      // Máy chủ đánh số lại đề xuất mỗi lần ban hành, nên đối chiếu theo vị trí + nội dung dòng, không theo propId.
      for (const record of res.data.records || []) {
        const p = cur.props.find((/** @type {any} */ x) => x.docId === record.docId && x.lineIndex === record.lineIndex && x.line === record.from);
        if (!p) continue;
        if (String(record.action).startsWith('PATCH')) p.applied = true;
        else p.logged = true;
      }
      // Vị trí còn chờ đã được chuyển vào hồ sơ dùng chung; bỏ quyết định cục bộ đang dở để khỏi gửi lại.
      if (res.data.openChange) cur.props.forEach((/** @type {any} */ p) => { if (!p.applied && !p.logged && (p.outcome === 'ESCALATE' || p.semanticHold)) p.inCase = res.data.openChange.id; });
      await reload();
      return result(true, res.data.message || 'Đã ban hành.', { applied: res.data.applied });
    }

    /** @param {number} seq */
    async function undo(seq) {
      const entry = S.ledger.find(e => e.seq === seq);
      if (!entry) return result(false, 'Không có bản ghi #' + seq + '.');
      const doc = S.docs.find(d => d.id === entry.docId);
      const right = Authz.canUndo(member(), doc, entry);
      if (!right.ok) return result(false, right.reason || 'Không đủ thẩm quyền hoàn tác.');
      if (S.source === 'remote') {
        S.busy = true; emit();
        const res = await deps.remote.call({ action: 'undo', workspace: S.workspace.id, persona: S.persona, seq });
        S.busy = false;
        if (!res.ok) { if (res.status === 409) await reload(); return result(false, res.data.message || 'Máy chủ từ chối hoàn tác.'); }
        markUnapplied(entry);
        await reload();
        return result(true, res.data.message);
      }
      const res = Workflow.undo(S, seq, { now, humanActor: () => actor() });
      if (!res.ok) return result(false, res.message);
      S.revision++;
      await persist();
      return result(true, res.message);
    }
    /** @param {any} entry */
    function markUnapplied(entry) {
      if (!S.current) return;
      const p = S.current.props.find((/** @type {any} */ x) => x.id === entry.propId && x.docId === entry.docId && x.lineIndex === entry.lineIndex);
      if (p) p.applied = false;
    }

    /** @param {number} seq */
    function canUndo(seq) {
      const entry = S.ledger.find(e => e.seq === seq);
      if (!entry || !String(entry.action).startsWith('PATCH') || Ledger.isReverted(S.ledger, seq)) return { ok: false, reason: '' };
      const doc = S.docs.find(d => d.id === entry.docId);
      if (!doc || doc.lines[entry.lineIndex] !== entry.to) return { ok: false, reason: 'Dòng đã thay đổi sau lần ban hành này.' };
      return Authz.canUndo(member(), doc, entry);
    }

    // ---------- Hồ sơ dùng chung (chế độ trực tuyến) ----------
    /** @type {{ rev:number, items:any[] }} */
    let caseCache = { rev: -1, items: [] };
    /** Mọi vị trí đang chờ trong các hồ sơ mở, phân tích lại trên dữ liệu hiện tại. */
    function caseItems() {
      if (caseCache.rev === S.revision) return caseCache.items;
      /** @type {any[]} */ const items = [];
      for (const oc of S.openChanges.filter(c => c.status === 'open')) {
        const res = Server.analyzeOpenChange(oc, S.registry, S.docs, S.decisions);
        for (const p of res.pending) items.push({ oc, change: res.change, p });
      }
      caseCache = { rev: S.revision, items };
      return items;
    }
    /** @param {any} item */
    function caseRight(item) {
      const prop = item.p.outcome === 'AUTO_PATCH' ? { ...item.p, category: null } : item.p;
      return Authz.canDecide(member(), prop, item.change, S.registry);
    }
    /** @param {any} item @param {string} act 'a' | 'b' | 'approve' | 'reject' */
    async function decideCase(item, act) {
      if (S.source !== 'remote') return result(false, 'Hồ sơ dùng chung chỉ có ở chế độ trực tuyến.');
      const right = caseRight(item);
      if (!right.ok) return result(false, right.reason || 'Không đủ thẩm quyền.');
      S.busy = true; emit();
      const res = await deps.remote.call({ action: 'decide', workspace: S.workspace.id, persona: S.persona, changeId: item.oc.id,
        docId: item.p.docId, lineIndex: item.p.lineIndex, line: item.p.line, act });
      S.busy = false;
      if (!res.ok) { await reload(); return result(false, res.data.message || 'Máy chủ từ chối.'); }
      await reload();
      return result(true, res.data.message);
    }

    // ---------- Sổ đăng ký & học từ phản hồi ----------
    function suggestions() {
      return Learning.suggestAnchors(S.feedback, S.registry);
    }

    /** @param {string} ruleId @param {string} phrase @param {string} [reason] */
    async function addAnchor(ruleId, phrase, reason) {
      const rule = S.registry.find(r => r.id === ruleId);
      const right = Authz.canEditRegistry(member(), rule);
      if (!rule) return result(false, 'Quy định không có trong sổ đăng ký.');
      if (!right.ok) return result(false, right.reason || 'Không đủ thẩm quyền.');
      if (S.source === 'remote') {
        const res = await deps.remote.call({ action: 'add_anchor', workspace: S.workspace.id, persona: S.persona, ruleId, phrase, reason });
        if (!res.ok) { if (res.status === 409) await reload(); return result(false, res.data.message || 'Máy chủ từ chối.'); }
        await reload();
        return result(true, res.data.message);
      }
      const res = Workflow.addAnchor(S, ruleId, phrase, { now, actor: actor(), reason });
      if (!res.ok) return result(false, res.message);
      S.revision++;
      await persist();
      return result(true, res.message);
    }

    /** @param {{ title:string, owner:string, tier:number, lines:string[] }} input */
    async function addDocument(input) {
      const m = member();
      const tier = Number(input.tier);
      const owner = String(input.owner || '').trim() || ((m && m.units.find((/** @type {string} */ u) => u !== '*')) || 'Do người dùng nhập');
      if (!m || Authz.tierOf(m) < tier || !Authz.covers(m, owner)) {
        return result(false, (m ? m.displayName : 'Người dùng') + ' không được nạp tài liệu cấp ' + tier + ' của ' + owner + '.');
      }
      if (S.source === 'remote') {
        const res = await deps.remote.call({ action: 'add_document', workspace: S.workspace.id, persona: S.persona, document: { ...input, owner, tier } });
        if (!res.ok) { if (res.status === 409) await reload(); return result(false, res.data.message || 'Máy chủ từ chối.'); }
        await reload();
        return result(true, res.data.message);
      }
      const res = Workflow.addDocument(S, { ...input, owner, tier }, { now, actor: actor() });
      if (!res.ok) return result(false, res.message);
      S.revision++;
      await persist();
      return result(true, res.message + ' Chạy lại phân tích để quét tài liệu này.');
    }

    async function resetWorkspace() {
      if (S.source === 'remote') {
        if (S.workspace.mode !== 'demo') return result(false, 'Chỉ khôi phục được workspace trình diễn.');
        const res = await deps.remote.call({ action: 'reset_demo', workspace: S.workspace.id, persona: S.persona });
        if (!res.ok) return result(false, res.data.message || 'Không khôi phục được.');
        S.current = null;
        await reload();
        return result(true, res.data.message);
      }
      seedLocal();
      S.current = null; S.revision++;
      await persist();
      return result(true, 'Đã khôi phục kho tài liệu và sổ đăng ký về dữ liệu mẫu.');
    }

    function clearAnalysis() { S.current = null; emit(); }
    function dismissNotice() { S.notice = null; emit(); }

    return {
      state: S,
      subscribe(/** @type {(state:any) => void} */ fn) { listeners.add(fn); return () => listeners.delete(fn); },
      emit, member, actor, setPersona, init, switchSource, reload, poll, signIn, signOut, checkAI,
      enterSandbox, exitSandbox, resolveRequest, analyze, canIssueCurrent, discoverSemantics, decisionRight,
      decide, undoDecision, reviewSemantic, committableCount, commit, undo, canUndo, suggestions, addAnchor,
      caseItems, caseRight, decideCase,
      addDocument, resetWorkspace, clearAnalysis, dismissNotice
    };
  }

  return Object.freeze({ createController });
});
