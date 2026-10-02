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

  /** Workspace thí điểm mở sau khi đăng nhập. */
  const PILOT_WORKSPACE = 'hcmut-pilot';

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
      saved: /** @type {any} */ (null),
      /** Workspace muốn mở lúc khởi động nhưng không đọc được (đang hiện workspace khác thay thế). */
      fallbackFrom: /** @type {string|null} */ (null)
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
        S.registry = Data.withSeedMeasures(snapshot.registry); S.docs = snapshot.docs; S.ledger = snapshot.ledger; S.feedback = snapshot.feedback || [];
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
      S.registry = Data.withSeedMeasures(res.registry); S.docs = res.docs; S.ledger = res.ledger; S.feedback = res.feedback;
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
        // Workspace đã chọn lần trước; nếu chưa có mà còn phiên đăng nhập thì mở workspace thí điểm.
        const wanted = options.workspace || (deps.remote.session ? PILOT_WORKSPACE : S.workspace.id);
        let res = await loadRemote(wanted);
        if (!res.ok && res.reason === 'forbidden' && wanted !== 'demo') {
          res = await loadRemote('demo');
          if (res.ok) S.fallbackFrom = wanted;
          if (res.ok) notify('info', 'Không mở được workspace “' + wanted + '” (cần đăng nhập đúng tài khoản); đang hiện workspace Trình diễn.');
        }
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
      S.ai = res.available ? { status: 'ready', reason: 'Mô hình AI qua máy chủ', model: res.model || null }
        : { status: 'off', reason: res.reason || 'AI không khả dụng.', model: null };
      emit();
    }

    /** @param {'remote'|'local'} source @param {string} [workspaceId] */
    async function switchSource(source, workspaceId) {
      S.fallbackFrom = null;
      if (S.source === 'sandbox') exitSandbox({ refresh: false });
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
      return switchSource('remote', PILOT_WORKSPACE);
    }
    async function signOut() {
      await deps.remote.signOut();
      S.liveMember = null;
      return switchSource('remote', 'demo');
    }

    // ---------- Minh hoạ ----------
    /** @param {{ docs:any[], registry?:any[], label:string }} scenario */
    function enterSandbox(scenario) {
      if (S.source !== 'sandbox') S.saved = { source: S.source, workspace: S.workspace, registry: S.registry, docs: S.docs, ledger: S.ledger, feedback: S.feedback,
        openChanges: S.openChanges, decisions: S.decisions, liveMember: S.liveMember, stale: S.stale, current: S.current, persona: S.persona };
      if (S.source !== 'sandbox' && S.saved) S.saved.revisionAtEnter = S.revision;
      S.source = 'sandbox';
      S.workspace = { id: 'sandbox', name: scenario.label, mode: 'demo' };
      S.registry = Engine.cloneRegistry(scenario.registry || Data.SEED_REGISTRY);
      S.docs = Engine.cloneDocs(scenario.docs);
      S.ledger = []; S.feedback = []; S.openChanges = []; S.decisions = []; S.current = null; S.revision++;
      emit();
    }
    /** @param {{ refresh?:boolean }} [options] */
    function exitSandbox(options = {}) {
      if (S.source !== 'sandbox' || !S.saved) return;
      const saved = S.saved;
      Object.assign(S, { source: saved.source, workspace: saved.workspace, registry: saved.registry, docs: saved.docs,
        ledger: saved.ledger, feedback: saved.feedback, openChanges: saved.openChanges || [], decisions: saved.decisions || [],
        liveMember: saved.liveMember || null, stale: saved.stale === true, current: saved.current, persona: saved.persona });
      S.saved = null; S.revision++;
      // Phân tích đã lưu vẫn đúng với kho đã lưu: không cảnh báo "kho đã thay đổi" chỉ vì vừa ghé minh hoạ.
      if (S.current && S.current.revision === saved.revisionAtEnter) S.current.revision = S.revision;
      emit();
      // Trong lúc xem minh hoạ, người khác có thể đã ghi vào workspace dùng chung: nạp lại cho chắc.
      if (options.refresh !== false && /** @type {string} */ (S.source) === 'remote') poll();
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
      S.current.input = inputKey(input);
      const n = S.current.props.length;
      return result(true, n ? 'Đã quét ' + S.docs.length + ' tài liệu, tìm thấy ' + n + ' vị trí mang giá trị “' + built.change.oldValue + '”.'
        : 'Không có vị trí nào mang giá trị “' + built.change.oldValue + '”; không có gì cần sửa.');
    }

    /**
     * Dấu vân tay của biểu mẫu đã tạo ra phân tích. Ban hành chỉ được phép khi biểu mẫu hiện tại vẫn khớp, để không
     * ai ban hành một phân tích cũ trong khi màn hình đang hiện câu yêu cầu khác (báo cáo kiểm thử F02).
     * @param {{ ruleId?:string, newValue?:string, issuerTier?:number|string, requestText?:string }} input
     */
    function inputKey(input) {
      const v = String((input && input.newValue) || '').trim();
      return JSON.stringify([String((input && input.ruleId) || ''), Engine.policyValueKey(v) || v, Number(input && input.issuerTier) || 0,
        String((input && input.requestText) || '').trim().replace(/\s+/g, ' ')]);
    }
    /** @param {any} input */
    function matchesInput(input) { return !!S.current && S.current.input === inputKey(input); }

    function canIssueCurrent() {
      if (!S.current) return { ok: false, reason: 'Chưa có phân tích.' };
      return Authz.canIssue(member(), S.current.change);
    }

    /** @param {any} [adapter] @param {string} [sourceLabel] */
    async function discoverSemantics(adapter, sourceLabel) {
      if (!S.current) return result(false, 'Chưa có phân tích.');
      const analysis = S.current;
      const useAdapter = adapter || (S.ai.status === 'ready' ? deps.aiAdapter : Semantic.createUnavailableAdapter());
      // Mã lượt rà: chỉ kết quả của lượt bắt đầu SAU CÙNG được ghi vào phân tích. Lượt cũ về muộn (ví dụ AI thật
      // về sau dữ liệu mẫu của minh hoạ) bị bỏ, không ghi đè.
      const seq = (analysis.semanticSeq || 0) + 1;
      analysis.semanticSeq = seq;
      const previousStatus = analysis.semanticStatus;
      analysis.semanticStatus = 'pending'; emit();
      const res = await Semantic.discoverSemantics({ requestText: analysis.requestText, change: analysis.change, props: analysis.props,
        docs: S.docs, registry: S.registry, matchesOldValue: Engine.matchesOldValue, adapter: useAdapter });
      if (analysis.semanticSeq !== seq) return { ok: false, stale: true, message: 'Đã có lượt rà soát mới hơn; bỏ kết quả của lượt này.' };
      const settled = res.status === 'complete' || res.status === 'no_candidates';
      // Lượt rà không thành không bao giờ xoá cờ giữ lại / bằng chứng của lượt rà hợp lệ trước đó; lượt hợp lệ chỉ
      // thêm cờ giữ lại, không gỡ cờ hay quyết định của người (Semantic.mergeSemanticReview).
      // Ghi vào `analysis` cả khi nó không còn là phân tích hiện tại (ví dụ đang xem minh hoạ), để khi được khôi phục
      // nó không kẹt ở trạng thái "đang rà".
      if (settled) {
        analysis.props = Semantic.mergeSemanticReview(analysis.props, res.props);
        analysis.semanticSettled = true;
        analysis.semanticSource = sourceLabel || (S.ai.status === 'ready' ? 'openai' : 'none');
        // Bằng chứng được giữ lại từ lượt trước vẫn phải có trong danh sách đã kiểm chứng để prover chấp nhận:
        // cộng dồn (bỏ trùng) thay vì thay mới.
        const previousValid = analysis.semanticResult && Array.isArray(analysis.semanticResult.valid) ? analysis.semanticResult.valid : [];
        const seen = new Set();
        const valid = previousValid.concat(res.status === 'complete' ? res.valid : []).filter((/** @type {any} */ item) => {
          const key = JSON.stringify(item); if (seen.has(key)) return false; seen.add(key); return true;
        });
        analysis.semanticResult = { status: res.status, valid, rejected: res.rejected };
      }
      analysis.semanticStatus = res.status;
      analysis.semanticLastAttempt = { status: res.status, previousStatus, at: now() };
      if (S.current !== analysis) return { ok: false, message: 'Phân tích đã thay đổi.' };
      const holds = analysis.props.filter((/** @type {any} */ p) => p.semanticHold).length;
      const kept = analysis.semanticSettled ? 'giữ nguyên kết quả rà soát trước (' + holds + ' vị trí đang giữ lại).' : 'giữ nguyên kết quả của động cơ tiền định.';
      const messages = {
        complete: 'AI đã rà ' + res.candidateSet.candidates.length + ' vị trí; ' + res.valid.length + ' bằng chứng hợp lệ; ' + holds + ' vị trí được giữ lại cho người duyệt.',
        unavailable: 'AI ngữ nghĩa không khả dụng; ' + kept,
        timeout: 'AI hết thời gian chờ; ' + kept,
        provider_failure: 'AI gặp lỗi; ' + kept,
        rejected: 'Bằng chứng AI không qua được bộ kiểm tra; ' + kept,
        no_candidates: 'Không có vị trí nào để AI rà soát.'
      };
      return result(settled, /** @type {any} */ (messages)[res.status] || 'Đã kiểm tra.', { status: res.status, holds });
    }

    /**
     * Phản hồi doanh nghiệp: "nối mô hình thật, giữ bộ chứng minh tất định làm lớp kiểm tra". Khi máy chủ AI sẵn sàng,
     * mọi dòng động cơ muốn tự sửa đều được mô hình rà lại TRƯỚC khi ban hành — không cần ai nhớ bấm nút.
     * AI chỉ có thể giữ lại (chuyển cho người), không bao giờ biến một hồ sơ chuyển tiếp thành tự sửa.
     */
    async function ensureSemanticReview() {
      const analysis = S.current;
      if (!analysis || S.ai.status !== 'ready' || !deps.aiAdapter) return { ok: true, skipped: true, message: 'AI đang tắt; dùng kết quả tiền định.' };
      if (analysis.semanticStatus === 'pending') return { ok: false, pending: true, message: 'AI đang rà soát; đợi xong rồi bấm Ban hành.' };
      // Chỉ bỏ qua khi đã có một lần rà hợp lệ; chưa có (lần trước lỗi / hết giờ) thì thử lại.
      if (analysis.semanticSettled) return { ok: true, skipped: true, message: 'Đã rà soát.' };
      if (!analysis.props.some((/** @type {any} */ p) => p.outcome === 'AUTO_PATCH' && !p.applied)) return { ok: true, skipped: true, message: 'Không có dòng tự sửa để rà.' };
      return discoverSemantics(deps.aiAdapter, 'openai');
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

    /** @param {{ ratify?:boolean, expect?:{ ruleId:string, newValue:string, issuerTier:number|string, requestText?:string } }} [options] */
    async function commit(options = {}) {
      if (!S.current) return result(false, 'Chưa có phân tích.');
      if (options.expect && !matchesInput(options.expect)) return result(false, 'Biểu mẫu đã thay đổi sau lần phân tích này; bấm “Phân tích tác động” lại trước khi ban hành.');
      const issue = canIssueCurrent();
      if (!issue.ok) return result(false, issue.reason || 'Không đủ thẩm quyền ban hành.');
      const analysis = S.current, persona = S.persona;
      const review = await ensureSemanticReview();
      // Trong lúc chờ AI, người dùng có thể đổi vai trò, phân tích lại hoặc bấm Ban hành lần nữa: không ban hành
      // một phân tích khác với cái vừa được kiểm quyền và rà soát.
      if (S.current !== analysis || S.persona !== persona) return result(false, 'Phân tích hoặc vai trò vừa thay đổi trong lúc AI rà soát; hãy kiểm tra lại rồi bấm Ban hành.');
      if (review && (review.pending || review.stale) || analysis.semanticStatus === 'pending') return result(false, (review && review.message) || 'AI đang rà soát; đợi xong rồi bấm Ban hành.');
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
      // Thay đổi vừa rồi là của chính phân tích này: không báo "kho đã thay đổi sau lần phân tích".
      if (!options.ratify) S.current.revision = S.revision;
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
      const expectedLength = S.ledger.length + (res.data.records || []).length;
      await reload();
      // Chỉ coi là "của mình" khi sổ trên máy chủ dài thêm đúng số bản ghi vừa ghi; có người khác ghi xen vào thì vẫn cảnh báo.
      if (S.current === cur && !options.ratify && S.ledger.length === expectedLength) cur.revision = S.revision;
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

    /** @param {string} ruleId @param {string} phrase @param {string} [reason] @param {'aliases'|'measures'|'both'} [field] */
    async function addAnchor(ruleId, phrase, reason, field) {
      const rule = S.registry.find(r => r.id === ruleId);
      const right = Authz.canEditRegistry(member(), rule);
      if (!rule) return result(false, 'Quy định không có trong sổ đăng ký.');
      if (!right.ok) return result(false, right.reason || 'Không đủ thẩm quyền.');
      if (S.source === 'remote') {
        const res = await deps.remote.call({ action: 'add_anchor', workspace: S.workspace.id, persona: S.persona, ruleId, phrase, reason, field });
        if (!res.ok) { if (res.status === 409) await reload(); return result(false, res.data.message || 'Máy chủ từ chối.'); }
        await reload();
        return result(true, res.data.message);
      }
      const res = Workflow.addAnchor(S, ruleId, phrase, { now, actor: actor(), reason, field });
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
      enterSandbox, exitSandbox, resolveRequest, analyze, matchesInput, canIssueCurrent, discoverSemantics, decisionRight,
      decide, undoDecision, reviewSemantic, ensureSemanticReview, committableCount, commit, undo, canUndo, suggestions, addAnchor,
      caseItems, caseRight, decideCase,
      addDocument, resetWorkspace, clearAnalysis, dismissNotice
    };
  }

  return Object.freeze({ createController, PILOT_WORKSPACE });
});
