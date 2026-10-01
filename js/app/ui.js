/* PolicyChange OS · lớp giao diện. Toàn bộ nghiệp vụ nằm trong js/app-controller.js; tệp này chỉ vẽ và nối sự kiện. */
(function () {
  'use strict';

  const G = window;
  const cfg = G.PolicyChangeConfig || {};
  const Engine = G.PolicyChangeEngine, Workflow = G.PolicyChangeWorkflow, Authz = G.PolicyChangeAuthz;
  const Ledger = G.PolicyChangeLedger, Data = G.PolicyChangeData, Evaluation = G.PolicyChangeEvaluation;
  const esc = G.PolicyChangeSafeHTML.escapeText;
  const $ = (sel, root) => (root || document).querySelector(sel);

  // ---------- Khởi tạo bộ điều khiển ----------
  const remote = cfg.supabaseUrl ? G.PolicyChangeRemote.create({ url: cfg.supabaseUrl, anonKey: cfg.anonKey }) : null;
  const aiAdapter = cfg.supabaseUrl ? G.PolicyChangeRemoteAI.create({ functionsUrl: cfg.supabaseUrl + '/functions/v1', apiKey: cfg.anonKey }) : null;
  const params = new URLSearchParams(location.search);
  const app = G.PolicyChangeApp.createController({
    Engine, Data, Workflow, Ledger, Authz, Server: G.PolicyChangeServer, Semantic: G.PolicyChangeSemanticDiscovery,
    AI: G.PolicyChangeAI, Learning: G.PolicyChangeLearning,
    localStore: G.PolicyChangeStore.createLocalStore({ workspace: 'local' }),
    remote: params.get('offline') === '1' ? null : remote,
    aiAdapter: params.get('offline') === '1' ? null : aiAdapter,
    workspace: cfg.defaultWorkspace || 'demo'
  });
  const S = app.state;
  G.PolicyChangeUI = { app };

  const ui = {
    route: 'tong-quan', query: new URLSearchParams(),
    form: { text: '', ruleId: 'R-PK-01', newValue: '', issuerTier: '' },
    understanding: null, ratify: false, busy: null, lastNotice: null,
    verify: null, evalReport: null, evalSource: null, evalCsv: null, demoStatus: null,
    ledgerQuery: '', docQuery: '', docTier: 'all', anchorDraft: {}, anchorField: {}, newDoc: { title: '', owner: '', tier: '2', body: '' }
  };

  const VI_REASONS = {
    'Global-scope requests must be narrowed to one registered policy.': 'Yêu cầu áp cho “mọi / tất cả” thời hạn. Hệ thống chỉ nhận thay đổi của MỘT quy định đã đăng ký — hãy nêu rõ quy định nào.',
    'Global-scope requests are not accepted.': 'Yêu cầu phạm vi toàn cục không được chấp nhận.',
    'Enter a change request.': 'Hãy nhập nội dung thay đổi.',
    'Select the authority tier before continuing.': 'Hãy nêu cấp ban hành (chuyên viên / trưởng phòng / Hiệu trưởng) trước khi tiếp tục.',
    'AI provider is not configured.': 'Máy chủ AI chưa được cấu hình.',
    'Deterministic parser result failed input validation.': 'Kết quả bóc tách không hợp lệ với sổ đăng ký.',
    'Deterministic parser returned an unknown policy.': 'Quy định không có trong sổ đăng ký.',
    'Candidate policy is not in the registry.': 'AI đề xuất một quy định không có trong sổ đăng ký.',
    'Issuer tier is not supported by request evidence.': 'AI nêu cấp ban hành nhưng không trích được căn cứ trong câu.',
    'AI extraction timed out.': 'AI hết thời gian chờ.'
  };
  const vi = s => VI_REASONS[s] || s || '';

  // ---------- Biểu tượng ----------
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    change: '<path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9m11 0-3-3m3 3-3 3"/>',
    queue: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    ledger: '<path d="M9 12l2 2 4-4"/><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
    docs: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    registry: '<path d="M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5a1.5 1.5 0 0 0 0 3H20"/><path d="M9 7h7M9 11h5"/>',
    eval: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'
  };
  const icon = (name, size) => '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';

  // ---------- Tiện ích ----------
  const nf = new Intl.NumberFormat('vi-VN');
  const pct = x => new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 }).format(x || 0);
  const dtf = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
  const fmtTime = iso => { const d = new Date(iso); return isNaN(d.getTime()) ? esc(iso) : esc(dtf.format(d)); };
  const tierLabel = t => Engine.TIER_LABEL[t] || ('Cấp ' + t);
  const member = () => app.member();

  function stateTag(p) {
    const st = G.PolicyChangeImpactSvg.stateOf(p);
    const cls = { done: 'done', kept: 'neutral', hold: 'hold', auto: 'auto', U1: 'U1', U2: 'U2', U3: 'U3' }[st.key] || 'neutral';
    return '<span class="tag ' + cls + '">' + esc(st.label) + '</span>';
  }

  function diffHtml(p, change) {
    const re = Engine.valueRegex(change.oldValue);
    const fmt = (cls, transform) => {
      let html = '', cursor = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(p.line)) !== null) {
        if (!Engine.isStructuredNumericOccurrence(p.line, m.index, m[0])) {
          html += esc(p.line.slice(cursor, m.index)) + '<span class="' + cls + '">' + esc(transform(m[0])) + '</span>';
          cursor = m.index + m[0].length;
        }
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      return html + esc(p.line.slice(cursor));
    };
    return '<div class="diff" aria-label="So sánh trước và sau"><div><span class="ln">−</span>' + fmt('old', x => x) + '</div>' +
      '<div><span class="ln">+</span>' + fmt('new', x => Engine.renderValue(x, change.newValue)) + '</div></div>';
  }

  function btn(action, label, opts) {
    const o = opts || {};
    const busy = ui.busy === (o.busyKey || action);
    const attrs = Object.entries(o.data || {}).map(([k, v]) => ' data-' + k + '="' + esc(v) + '"').join('');
    return '<button type="button" class="btn ' + (o.cls || '') + '" data-action="' + esc(action) + '"' + attrs +
      (o.disabled || busy ? ' disabled' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + '>' +
      (busy ? '<span class="spin" aria-hidden="true"></span>' : (o.icon ? icon(o.icon, 16) : '')) + '<span>' + esc(label) + '</span></button>';
  }

  function pending() {
    if (!S.current) return [];
    return S.current.props.filter(p => !p.inCase && !p.applied && !p.logged && ((p.outcome === 'ESCALATE' && !p.decided) || (p.semanticHold && !p.semanticHoldReviewed)));
  }
  function mine(list) { return list.filter(p => app.decisionRight(p).ok); }
  /** Mọi việc đang chờ: của phân tích đang mở trên máy này + hồ sơ dùng chung trên máy chủ. */
  function queueEntries() {
    const local = pending().map(p => ({ kind: 'local', p, right: app.decisionRight(p) }));
    const cases = app.caseItems().map((item, idx) => ({ kind: 'case', p: item.p, item, idx, right: app.caseRight(item) }));
    return local.concat(cases);
  }

  // ---------- Định tuyến ----------
  const ROUTES = [
    { id: 'tong-quan', label: 'Tổng quan', icon: 'home', title: 'Tổng quan', view: viewOverview },
    { id: 'thay-doi', label: 'Thay đổi quy định', icon: 'change', title: 'Thay đổi quy định', view: viewChange },
    { id: 'hang-doi', label: 'Hàng đợi duyệt', icon: 'queue', title: 'Hàng đợi duyệt', view: viewQueue, count: () => queueEntries().filter(e => e.right.ok).length, hot: true },
    { id: 'so-kiem-toan', label: 'Sổ kiểm toán', icon: 'ledger', title: 'Sổ kiểm toán', view: viewLedger, count: () => S.ledger.length },
    { id: 'kho-tai-lieu', label: 'Kho tài liệu', icon: 'docs', title: 'Kho tài liệu', view: viewDocs, count: () => S.docs.length },
    { id: 'so-dang-ky', label: 'Sổ đăng ký & học', icon: 'registry', title: 'Sổ đăng ký & học từ phản hồi', view: viewRegistry, count: () => app.suggestions().length || '', hot: true },
    { id: 'danh-gia', label: 'Đánh giá', icon: 'eval', title: 'Đánh giá độ chính xác', view: viewEval }
  ];

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    ui.route = ROUTES.some(r => r.id === path) ? path : 'tong-quan';
    ui.query = new URLSearchParams(qs || '');
  }
  function go(route, query) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const target = '#/' + route + qs;
    if (location.hash === target) render(); else location.hash = target;
  }
  function setQuery(key, value) {
    ui.query.set(key, value);
    history.replaceState(null, '', '#/' + ui.route + '?' + ui.query.toString());
  }

  // ---------- Khung ----------
  function renderShell() {
    const conn = $('#connPill');
    const src = S.source;
    const connCls = src === 'sandbox' ? 'sandbox' : (src === 'remote' ? 'online' : 'offline');
    const connText = src === 'sandbox' ? 'Minh hoạ · ' + S.workspace.name
      : src === 'remote' ? 'Dùng chung · ' + S.workspace.name
      : (S.connection === 'unconfigured' ? 'Ngoại tuyến · trên máy này' : 'Ngoại tuyến · lưu trên máy');
    conn.className = 'pill conn ' + connCls;
    conn.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="t">' + esc(connText) + '</span>';
    conn.title = src === 'remote' ? 'Dữ liệu dùng chung trên máy chủ; mọi người thấy cùng một sổ.' : 'Dữ liệu chỉ nằm trong trình duyệt này.';

    const ai = $('#aiPill');
    ai.className = 'pill ai ' + (S.ai.status === 'ready' ? 'ai-ready' : '');
    ai.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="t">' +
      esc(S.ai.status === 'ready' ? 'AI · ' + (S.ai.model || 'OpenAI') : S.ai.status === 'checking' ? 'AI · đang kiểm tra…' : 'AI · tắt (tiền định)') + '</span>';
    ai.title = S.ai.reason || '';

    const live = src === 'remote' && S.workspace.mode === 'live';
    const sel = $('#personaSel');
    const personaBox = $('#personaBox');
    if (live) {
      personaBox.innerHTML = '<span class="pill" title="Tài khoản đăng nhập"><span class="t">' + esc(S.liveMember ? S.liveMember.displayName + ' · cấp ' + S.liveMember.tier : 'Chưa được cấp quyền') + '</span></span>';
    } else {
      if (!sel || sel.dataset.bound !== '1') {
        personaBox.innerHTML = '<label for="personaSel">Vai trò</label><select id="personaSel" name="persona" data-bound="1" aria-label="Vai trò đang thao tác">' +
          Authz.DEMO_PERSONAS.map(p => '<option value="' + esc(p.id) + '">' + esc(p.displayName + ' · cấp ' + p.tier) + '</option>').join('') + '</select>';
      }
      $('#personaSel').value = S.persona;
    }

    $('#nav').innerHTML = '<div class="nav-label">Điều hành</div>' + ROUTES.map((r, i) => {
      const c = r.count ? r.count() : '';
      return (i === 4 ? '<div class="nav-label">Dữ liệu &amp; chất lượng</div>' : '') +
        '<a href="#/' + r.id + '"' + (ui.route === r.id ? ' aria-current="page"' : '') + '>' + icon(r.icon) + '<span>' + esc(r.label) + '</span>' +
        (c !== '' && c !== 0 ? '<span class="count' + (r.hot ? ' hot' : '') + '">' + esc(c) + '</span>' : '') + '</a>';
    }).join('');

    const side = $('#sideCard');
    const session = remote && remote.session;
    side.innerHTML =
      '<div><b>Nguồn dữ liệu</b><div class="xs muted">' + esc(src === 'remote' ? 'Máy chủ Supabase — nhiều người dùng chung, ghi qua máy chủ kiểm quyền.' : src === 'sandbox' ? 'Bản sao tạm cho kịch bản minh hoạ; không lưu.' : 'IndexedDB trên trình duyệt này; tải lại trang vẫn còn.') + '</div></div>' +
      (src === 'sandbox' ? btn('exit-sandbox', 'Thoát minh hoạ', { cls: 'sm primary' }) :
        '<div class="row">' + (remote && app.state.source !== 'remote' ? btn('go-online', 'Dùng chung', { cls: 'sm' }) : '') +
        (src === 'remote' ? btn('go-offline', 'Làm ngoại tuyến', { cls: 'sm' }) : '') + '</div>') +
      (remote ? (session ? '<div class="xs">Đăng nhập: <b>' + esc(session.email) + '</b></div><div class="row">' +
          (S.workspace.id !== 'hcmut-pilot' ? btn('open-pilot', 'Mở workspace thí điểm', { cls: 'sm' }) : btn('open-demo', 'Về workspace trình diễn', { cls: 'sm' })) +
          btn('sign-out', 'Đăng xuất', { cls: 'sm ghost' }) + '</div>'
        : btn('open-login', 'Đăng nhập (thí điểm)', { cls: 'sm ghost' })) : '') +
      (src !== 'sandbox' && (src === 'local' || S.workspace.mode === 'demo') ? btn('reset', 'Khôi phục dữ liệu mẫu', { cls: 'sm danger' }) : '');

    const themeBtn = $('#themeBtn');
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
    themeBtn.setAttribute('aria-label', dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
    const route = ROUTES.find(r => r.id === ui.route);
    document.title = route.title + ' · PolicyChange OS';
  }

  function render() {
    parseHash();
    renderShell();
    const main = $('#main');
    const active = document.activeElement;
    const focusId = active && main.contains(active) ? active.id : null;
    const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    const route = ROUTES.find(r => r.id === ui.route);
    main.innerHTML = '<div class="page">' + route.view() + '</div>';
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (_) { /* bỏ qua */ } }
    }
    showNotice();
  }

  function showNotice() {
    if (!S.notice || S.notice === ui.lastNotice) return;
    ui.lastNotice = S.notice;
    toast(S.notice.text, S.notice.tone);
  }
  function toast(text, tone) {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (tone === 'error' ? 'error' : '');
    el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    el.innerHTML = '<div>' + esc(text) + '</div><button type="button" aria-label="Đóng thông báo">×</button>';
    el.querySelector('button').addEventListener('click', () => el.remove());
    host.appendChild(el);
    while (host.children.length > 2) host.firstChild.remove();
    setTimeout(() => el.remove(), tone === 'error' ? 9000 : 4500);
  }

  // ---------- Màn hình: Tổng quan ----------
  function viewOverview() {
    const chainOk = Ledger.verify(S.ledger);
    const lines = S.docs.reduce((s, d) => s + d.lines.length, 0);
    const pend = queueEntries();
    const m = member();
    if (!ui.overviewEval) {
      const parsed = Evaluation.parseCsv(G.PolicyChangeBlindCsv || G.PolicyChangeHoldoutCsv || '');
      ui.overviewEval = Evaluation.evaluate(parsed.cases, { registry: Data.SEED_REGISTRY });
    }
    const ev = ui.overviewEval;
    const recent = S.ledger.slice(-6).reverse();
    return '' +
      '<section class="hero" aria-labelledby="heroTitle"><div>' +
        '<div class="eyebrow">MLAI Hackathon 2026 · Đề A · Escalation Referee</div>' +
        '<h1 id="heroTitle">Quy định đổi một chỗ — mọi văn bản nhắc lại nó được cập nhật đúng chỗ, đúng thẩm quyền.</h1>' +
        '<p>PolicyChange OS tự sửa những vị trí chắc chắn, và chỉ hỏi đúng người ở đúng chỗ cần hỏi: con số không rõ thuộc quy định nào (U1), dòng đang nói về quy định khác (U2), hay văn bản do cấp trên ban hành (U3). Mọi thay đổi đều có bằng chứng, có người chịu trách nhiệm và hoàn tác được.</p>' +
        '<div class="row"><a class="btn primary" href="#/thay-doi">' + icon('change', 16) + '<span>Tạo thay đổi</span></a>' +
        btn('demo-safe', 'Xem minh hoạ 3 phút', { icon: 'spark' }) + '<a class="btn ghost" href="#/danh-gia">Đánh giá độ chính xác</a></div>' +
      '</div><div class="stack small">' +
        '<div class="row"><span class="muted">Dữ liệu</span><b>' + esc(S.source === 'remote' ? 'Dùng chung · ' + S.workspace.name : S.source === 'sandbox' ? 'Minh hoạ' : 'Trên máy này') + '</b></div>' +
        '<div class="row"><span class="muted">AI</span><b>' + esc(S.ai.status === 'ready' ? 'Bật · ' + (S.ai.model || 'OpenAI') : 'Tắt — dùng động cơ tiền định') + '</b></div>' +
        '<div class="row"><span class="muted">Vai trò</span><b>' + esc(m ? m.displayName + ' · cấp ' + m.tier : 'Chưa xác định') + '</b></div>' +
        '<div class="row"><span class="muted">Sổ kiểm toán</span>' + (chainOk ? '<span class="tag auto">✓ Chuỗi SHA-256 hợp lệ</span>' : '<span class="tag U3">✗ Chuỗi hỏng</span>') + '</div>' +
      '</div></section>' +
      '<div class="grid g4">' +
        stat('', nf.format(S.docs.length), 'Tài liệu có kiểm soát', nf.format(lines) + ' dòng điều khoản') +
        stat('', nf.format(S.registry.length), 'Quy định trong sổ đăng ký', 'mỗi quy định có cụm từ neo riêng') +
        stat(pend.length ? 'U3' : '', nf.format(pend.filter(e => e.right.ok).length) + ' / ' + nf.format(pend.length), 'Vị trí chờ bạn duyệt', 'trên tổng số vị trí đang chờ người quyết') +
        stat('', nf.format(S.ledger.length), 'Bản ghi kiểm toán', chainOk ? 'toàn vẹn, chỉ ghi thêm' : 'phát hiện chỉnh sửa trái phép') +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>Luồng xử lý một thay đổi</h2><p>Động cơ tiền định là nơi duy nhất quyết định tự sửa hay chuyển người; AI chỉ đưa bằng chứng và chỉ có thể làm kết quả thận trọng hơn.</p></div>' +
        '<div class="card-body"><div class="pipeline">' +
        step('Hiểu yêu cầu', 'AI (OpenAI) hoặc bộ phân tích tiếng Việt bóc tách: quy định nào, giá trị cũ → mới, cấp ban hành.') +
        step('Tìm vị trí', 'Quét toàn bộ kho, nhận mọi cách viết: 10 triệu = 10.000.000 = 10tr.') +
        step('Phân xử', 'AUTO_PATCH, hoặc chuyển U1 / U2 / U3 kèm đúng một câu hỏi, hai lựa chọn.') +
        step('Chứng minh', 'Prover kiểm 13 điều kiện trước khi cho tự sửa; thiếu một là chặn.') +
        step('Người duyệt', 'Chỉ người đúng cấp và đúng đơn vị phụ trách mới bấm được.') +
        step('Ban hành & kiểm toán', 'Ghi sổ băm SHA-256; hoàn tác thêm bản ghi mới, không xoá vết.') +
      '</div></div></section>' +
      '<div class="split">' +
        '<section class="card"><div class="card-head"><h2>Minh hoạ có hướng dẫn</h2><span class="tag neutral">chạy trên bản sao tạm</span></div><div class="card-body stack">' +
          '<p class="small muted">Ba kịch bản ngắn cho buổi trình bày. Kịch bản chạy trong chế độ Minh hoạ — không ghi vào dữ liệu dùng chung.</p>' +
          '<div class="stack">' +
          demoRow('demo-safe', '1 · Tự sửa an toàn', 'Hạn phúc khảo 7 → 5 ngày; ngày “17/07/2025” trong cùng dòng không bị đụng tới. Prover xác nhận rồi ban hành, có thể hoàn tác.') +
          demoRow('demo-review', '2 · AI giữ lại cho người duyệt', 'Động cơ nói tự sửa được, nhưng bằng chứng ngữ nghĩa “có thể liên quan” → giữ lại chờ người. (Dữ liệu AI mẫu, ghi rõ là mock.)') +
          demoRow('demo-refuse', '3 · Từ chối yêu cầu mơ hồ', '“Đổi tất cả các thời hạn 7 ngày thành 5 ngày” → từ chối trước khi phân tích; kho và sổ không đổi.') +
          '</div>' + (ui.demoStatus ? '<div class="notice ' + esc(ui.demoStatus.tone) + '" role="status"><div class="grow small">' + esc(ui.demoStatus.text) + '</div></div>' : '') +
        '</div></section>' +
        '<section class="card"><div class="card-head"><h2>Độ chính xác trên tập mù</h2><a class="btn sm ghost" href="#/danh-gia">Chi tiết</a></div><div class="card-body stack">' +
          '<p class="small muted">' + nf.format(ev.total) + ' ca do một tác tử độc lập viết, không xem mã nguồn; đóng băng trước khi sửa động cơ. Chỉ động cơ tiền định (chưa bật AI).</p>' +
          '<div class="row"><span class="tag ' + (ev.wrongEdits ? 'U3' : 'auto') + '">' + esc(ev.wrongEdits + ' lần tự sửa sai') + '</span><span class="xs muted">trên ' + nf.format(ev.autoActions) + ' lần máy tự sửa</span></div>' +
          '<div class="bars">' +
          bar('Đúng hoàn toàn', ev.accuracy, 'auto') + bar('Bỏ sót', ev.missRate, 'del') + bar('Báo lên thừa', ev.overEscalationRate, 'U1') +
          '</div><p class="xs muted">Sửa sai và bỏ sót là hai lỗi nguy hiểm (máy quyết thay người). Báo lên thừa chỉ tốn thời gian người duyệt — cơ chế học neo và lớp AI kéo nó xuống dần.</p>' +
        '</div></section>' +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>Hoạt động gần đây</h2><a class="btn sm ghost" href="#/so-kiem-toan">Mở sổ kiểm toán</a></div><div class="card-body">' +
        (recent.length ? '<ol class="timeline">' + recent.map(e => '<li><span class="seq">#' + esc(e.seq) + '</span><div><b>' + esc(e.action) + '</b> · <span class="docid">' + esc(e.docId) + '</span><div class="xs muted">' + esc(e.actor) + ' · ' + fmtTime(e.ts) + '</div></div></li>').join('') + '</ol>'
          : '<div class="empty"><b>Chưa có bản ghi nào</b>Ban hành thay đổi đầu tiên ở mục “Thay đổi quy định”.</div>') +
      '</div></section>';
  }
  const stat = (cls, v, l, s) => '<div class="stat ' + cls + '"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div><div class="s">' + esc(s) + '</div></div>';
  const step = (t, d) => '<div class="step"><b>' + esc(t) + '</b><span class="muted">' + esc(d) + '</span></div>';
  const bar = (l, v, cls) => '<div class="bar"><span>' + esc(l) + '</span><span class="track"><span class="fill ' + cls + '" style="width:' + Math.round((v || 0) * 100) + '%"></span></span><b class="num">' + esc(pct(v)) + '</b></div>';
  const demoRow = (action, title, desc) => '<div class="row" style="align-items:flex-start;flex-wrap:nowrap"><div class="grow" style="flex:1"><b class="small">' + esc(title) + '</b><div class="xs muted">' + esc(desc) + '</div></div>' + btn(action, 'Chạy', { cls: 'sm' }) + '</div>';

  // ---------- Màn hình: Thay đổi quy định ----------
  function viewChange() {
    const f = ui.form;
    const rule = S.registry.find(r => r.id === f.ruleId) || S.registry[0];
    if (rule && f.ruleId !== rule.id) f.ruleId = rule.id;
    const m = member();
    const tier = Number(f.issuerTier);
    const issue = rule && tier ? Authz.canIssue(m, { rule, issuerTier: tier }) : { ok: true };
    return sandboxBanner() + staleBanner() +
      '<div class="page-head"><div><div class="eyebrow">Bước 1</div><h1>Thay đổi quy định</h1><p>Mô tả thay đổi bằng một câu tiếng Việt, hoặc chọn trực tiếp. Hệ thống xem trước tác động lên toàn bộ kho — chưa sửa gì cho tới khi bạn bấm Ban hành.</p></div></div>' +
      '<section class="card"><div class="card-body stack">' +
        '<label class="field" for="reqText">Câu mô tả thay đổi <span class="hint">Ví dụ: “Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.” · Ctrl/⌘ + Enter để gửi</span></label>' +
        '<textarea id="reqText" name="requestText" data-bind="form.text" placeholder="Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành…">' + esc(f.text) + '</textarea>' +
        '<div class="row">' + btn('understand', S.ai.status === 'ready' ? 'Hiểu yêu cầu bằng AI' : 'Hiểu yêu cầu', { icon: 'spark' }) +
          '<span class="xs muted">' + esc(S.ai.status === 'ready' ? 'OpenAI chỉ được trả trích dẫn nguyên văn; kết quả được kiểm lại với sổ đăng ký.' : 'AI đang tắt — dùng bộ phân tích tiếng Việt tiền định.') + '</span></div>' +
        understandingBox() +
        '<div class="hr"></div>' +
        '<div class="grid g4">' +
          '<label class="field" for="ruleSel">Quy định<select id="ruleSel" name="ruleId" data-bind="form.ruleId">' +
            S.registry.map(r => '<option value="' + esc(r.id) + '"' + (r.id === f.ruleId ? ' selected' : '') + '>' + esc(r.id + ' — ' + r.name) + '</option>').join('') + '</select></label>' +
          '<label class="field" for="oldVal">Giá trị hiện hành<input id="oldVal" type="text" readonly value="' + esc(rule ? rule.value : '') + '"></label>' +
          '<label class="field" for="newVal">Giá trị mới<input id="newVal" name="newValue" type="text" autocomplete="off" inputmode="text" spellcheck="false" data-bind="form.newValue" placeholder="ví dụ: 5 ngày…" value="' + esc(f.newValue) + '"></label>' +
          '<label class="field" for="tierSel">Cấp ban hành<select id="tierSel" name="issuerTier" data-bind="form.issuerTier"><option value=""' + (f.issuerTier ? '' : ' selected') + ' disabled>Chọn cấp…</option>' +
            [1, 2, 3].map(t => '<option value="' + t + '"' + (String(t) === String(f.issuerTier) ? ' selected' : '') + '>' + esc(t + ' · ' + Engine.TIER_APPROVER[t]) + '</option>').join('') + '</select></label>' +
        '</div>' +
        (rule ? '<p class="xs muted">' + esc(rule.id + ' do ' + rule.owner + ' quản lý · ' + tierLabel(rule.tier) + ' · ' + rule.source) + '</p>' : '') +
        (!issue.ok ? '<div class="notice warn">' + icon('lock', 16) + '<div class="grow small">' + esc(issue.reason) + ' Bạn vẫn xem trước được tác động, nhưng chỉ người đủ thẩm quyền mới ban hành.</div></div>' : '') +
        '<div class="row">' + btn('analyze', 'Phân tích tác động', { cls: 'primary' }) + (S.current ? btn('clear-analysis', 'Xoá kết quả', { cls: 'ghost' }) : '') + '</div>' +
      '</div></section>' + resultsSection();
  }

  function understandingBox() {
    const r = ui.understanding;
    if (!r) return '';
    if (r.status === 'ai_candidate' || r.status === 'deterministic_fallback') {
      const c = r.change;
      const rule = S.registry.find(x => x.id === c.ruleId);
      const how = r.status === 'ai_candidate' ? '<span class="tag done">AI · đã kiểm chứng</span>' : '<span class="tag neutral">Bộ phân tích tiền định</span>';
      const quotes = Array.isArray(r.evidence) && r.evidence.length ? '<div class="xs muted">Trích dẫn: ' + r.evidence.map(e => '“' + esc(e.quote) + '”').join(' · ') + '</div>' : '';
      const why = r.status === 'deterministic_fallback' && r.aiReason ? '<div class="xs muted">Không dùng AI vì: ' + esc(vi(r.aiReason)) + '</div>' : '';
      return '<div class="notice ok"><div class="grow small stack" style="gap:4px"><div class="row">' + how + '<b>' + esc(c.ruleId + (rule ? ' — ' + rule.name : '')) + '</b></div>' +
        '<div>' + esc(c.oldValue) + ' → <b>' + esc(c.newValue) + '</b> · cấp ban hành ' + esc(c.issuerTier) + ' (' + esc(Engine.TIER_APPROVER[c.issuerTier]) + ')</div>' + quotes + why +
        '<div class="xs">Đã điền vào biểu mẫu bên dưới. Kiểm tra lại rồi bấm “Phân tích tác động”.</div></div></div>';
    }
    return '<div class="notice ' + (r.status === 'refusal' ? 'error' : 'warn') + '" role="status"><div class="grow small"><b>' + (r.status === 'refusal' ? 'Từ chối xử lý' : 'Cần làm rõ') + ':</b> ' + esc(vi(r.reason)) + '</div></div>';
  }

  function resultsSection() {
    const cur = S.current;
    if (!cur) return '<div class="empty"><b>Chưa có phân tích</b>Chọn quy định, giá trị mới và cấp ban hành rồi bấm “Phân tích tác động”.</div>';
    const props = cur.props;
    const count = fn => props.filter(fn).length;
    const filter = ui.query.get('loc') || 'all';
    const shown = props.filter(p => filter === 'all' ? true : filter === 'auto' ? p.outcome === 'AUTO_PATCH' && !p.semanticHold : !(p.outcome === 'AUTO_PATCH' && !p.semanticHold));
    const sem = cur.semanticStatus;
    return '<div class="page-head"><div><div class="eyebrow">Bước 2</div><h2>Kết quả phân xử · ' + esc(cur.change.rule.id) + ' ' + esc(cur.change.oldValue) + ' → ' + esc(cur.change.newValue) + '</h2>' +
      '<p>' + esc('Quét ' + S.docs.length + ' tài liệu trong ' + (cur.elapsedMs || 0) + ' ms.') + '</p></div>' +
      '<div class="row">' + btn('semantic', S.ai.status === 'ready' ? 'Rà soát ngữ nghĩa bằng AI' : 'Rà soát ngữ nghĩa (AI đang tắt)', { icon: 'spark', disabled: sem === 'pending' }) + '</div></div>' +
      (sem && sem !== 'pending' ? '<div class="notice ' + (sem === 'complete' ? 'info' : '') + ' small">' + esc(semanticLabel(cur)) + '</div>' : '') +
      '<div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
        stat('', nf.format(props.length), 'Vị trí bị ảnh hưởng', 'mang giá trị “' + cur.change.oldValue + '”') +
        stat('auto', nf.format(count(p => p.outcome === 'AUTO_PATCH' && !p.semanticHold)), 'Tự sửa', 'có neo, đúng thẩm quyền') +
        stat('U1', nf.format(count(p => p.category === 'U1')), 'U1 · chưa rõ', 'hỏi người phụ trách tài liệu') +
        stat('U2', nf.format(count(p => p.category === 'U2')), 'U2 · quy định khác', 'hỏi trưởng đơn vị kia') +
        stat('U3', nf.format(count(p => p.category === 'U3')), 'U3 · vượt cấp', 'hỏi cấp ban hành văn bản') +
        (count(p => p.semanticHold) ? stat('hold', nf.format(count(p => p.semanticHold)), 'AI giữ lại', 'chờ người rà soát') : '') +
      '</div>' +
      (props.length ? '<section class="card"><div class="card-head"><h2>Đồ thị tác động</h2><div class="legend" aria-hidden="true">' +
        [['var(--auto)', 'Tự sửa'], ['var(--u1)', 'U1'], ['var(--u2)', 'U2'], ['var(--u3)', 'U3'], ['var(--hold)', 'AI giữ lại'], ['var(--brand)', 'Đã ban hành'], ['var(--muted)', 'Giữ nguyên']]
          .map(([c, l]) => '<span><i style="background:' + c + '"></i>' + l + '</span>').join('') + '</div></div>' +
        '<div class="card-body graph graph-wrap">' + G.PolicyChangeImpactSvg.render(cur) + '</div></section>' : '') +
      (props.length ? '<div class="row" style="justify-content:space-between"><div class="filters" role="group" aria-label="Lọc vị trí">' +
        [['all', 'Tất cả ' + props.length], ['auto', 'Tự sửa'], ['human', 'Cần người']].map(([k, l]) => '<button type="button" data-action="filter-loc" data-value="' + k + '" aria-pressed="' + (filter === k) + '">' + esc(l) + '</button>').join('') +
        '</div><a class="btn sm ghost" href="#/hang-doi">Mở hàng đợi duyệt →</a></div>' : '') +
      '<div class="stack">' + (shown.map(p => propCard(p, true)).join('') || (props.length ? '<div class="empty">Không có vị trí nào trong bộ lọc này.</div>' : '<div class="empty"><b>Không có vị trí nào cần sửa</b>Giá trị “' + esc(cur.change.oldValue) + '” không xuất hiện trong kho.</div>')) + '</div>' +
      commitBar();
  }

  function semanticLabel(cur) {
    const holds = cur.props.filter(p => p.semanticHold).length;
    const src = cur.semanticSource === 'fixture_mock' ? 'Bằng chứng mẫu (mock, không phải mô hình thật): ' : cur.semanticSource === 'openai' ? 'OpenAI: ' : '';
    const m = { complete: src + 'đã rà ' + cur.props.length + ' vị trí; ' + holds + ' vị trí được giữ lại cho người duyệt.',
      unavailable: 'AI ngữ nghĩa không khả dụng; giữ nguyên kết quả động cơ tiền định.', timeout: 'AI hết thời gian chờ; giữ nguyên kết quả tiền định.',
      provider_failure: 'AI gặp lỗi; giữ nguyên kết quả tiền định.', rejected: 'Bằng chứng AI không qua bộ kiểm tra; giữ nguyên kết quả tiền định.', no_candidates: 'Không có vị trí để rà soát.' };
    return m[cur.semanticStatus] || '';
  }

  function propCard(p, withActions, opts) {
    const o = opts || {};
    const cur = S.current || {};
    const change = o.change || cur.change;
    const caseItem = o.caseIdx !== undefined;
    const st = G.PolicyChangeImpactSvg.stateOf(p);
    const cls = { done: 'auto', kept: '', hold: 'hold', auto: 'auto', U1: 'U1', U2: 'U2', U3: 'U3' }[st.key] || '';
    let proofHtml = '';
    if (!caseItem && p.outcome === 'AUTO_PATCH' && !p.applied) {
      const proof = Workflow.prove(S, p);
      proofHtml = '<div class="why"><b>Prover:</b> ' + (proof.allowed ? '✓ ' + proof.checks.filter(c => c.passed).length + '/' + proof.checks.length + ' điều kiện · <code>' + esc(proof.proofId) + '</code>'
        : 'đang chặn — ' + esc((proof.reasons || []).slice(0, 2).join(' '))) + '</div>';
    }
    const evidence = Array.isArray(p.semanticEvidence) ? p.semanticEvidence.map(e => '<div class="evidence"><b>' + esc(cur.semanticSource === 'fixture_mock' ? 'Bằng chứng mẫu (mock)' : 'AI') + ' · ' +
      esc({ supports: 'đúng quy định này', possibly_related: 'có thể liên quan', unrelated: 'nói về việc khác', uncertain: 'chưa đủ căn cứ' }[e.relation] || e.relation) + ':</b> “' + esc(e.quote) + '” — ' + esc(e.explanation) + '</div>').join('') : '';
    let action = '';
    if (withActions && !p.applied && !p.logged && p.inCase) {
      action = '<div class="small muted">Đã chuyển vào hồ sơ dùng chung <b>' + esc(p.inCase) + '</b> — người có thẩm quyền quyết trong Hàng đợi duyệt.</div>';
    } else if (withActions && !p.applied && !p.logged) {
      const right = o.right || app.decisionRight(p);
      if (p.outcome === 'ESCALATE' && !p.decided) {
        const q = Engine.escalationQuestion(p, change, S.registry);
        const choice = (act, label) => caseItem ? btn('decide-case', label, { data: { idx: o.caseIdx, act }, busyKey: 'case-' + o.caseIdx }) : btn('decide', label, { data: { p: p.id, act } });
        action = '<div class="question"><div class="q-label">Câu hỏi chuyển tiếp · một lượt, quyết dứt điểm</div>' + esc(q.q) + '</div>' +
          (right.ok ? '<div class="choices">' + choice('a', 'A · ' + q.a) + choice('b', 'B · ' + q.b) + '</div>'
            : '<div class="lock">' + icon('lock', 16) + '<span>' + esc(right.reason) + ' Đổi vai trò ở thanh trên để thử.</span></div>') +
          '<div class="xs muted"><b>Giải thích dễ hiểu:</b> ' + esc(p.plain) + '</div>';
      } else if (p.outcome === 'ESCALATE' && p.decided) {
        action = '<div class="row small"><span>✔ ' + esc(p.decisionLabel) + (p.decidedBy ? ' · ' + esc(p.decidedBy) : '') + '</span>' + btn('undo-decision', 'Đổi quyết định', { cls: 'sm ghost', data: { p: p.id } }) + '</div>';
      } else if (p.semanticHold && !p.semanticHoldReviewed) {
        action = right.ok ? '<div class="row">' + (caseItem
            ? btn('decide-case', 'Duyệt sửa dòng này', { cls: 'sm', data: { idx: o.caseIdx, act: 'approve' }, busyKey: 'case-' + o.caseIdx }) + btn('decide-case', 'Giữ nguyên dòng', { cls: 'sm', data: { idx: o.caseIdx, act: 'reject' }, busyKey: 'case-' + o.caseIdx })
            : btn('review', 'Duyệt sửa dòng này', { cls: 'sm', data: { p: p.id, approve: '1' } }) + btn('review', 'Giữ nguyên dòng', { cls: 'sm', data: { p: p.id, approve: '0' } })) + '</div>'
          : '<div class="lock">' + icon('lock', 16) + '<span>' + esc(right.reason) + '</span></div>';
      } else if (p.semanticHoldReviewed) {
        action = '<div class="small">' + (p.semanticHoldApproved ? '✔ Người rà soát đã duyệt; sẽ sửa khi ban hành.' : '✔ Đã chọn giữ nguyên.') + '</div>';
      }
    }
    return '<article class="prop ' + cls + (p.applied || p.logged ? ' is-done' : '') + '" id="' + (caseItem ? 'case-' + esc(o.caseIdx) : 'prop-' + esc(p.id)) + '">' +
      '<div class="prop-head"><span class="docid">' + esc(p.docId) + '</span><span class="title">' + esc(p.docTitle) + ' · dòng ' + (p.lineIndex + 1) + '</span>' +
      (o.caseLabel ? '<span class="tag done" title="Hồ sơ dùng chung">' + esc(o.caseLabel) + '</span>' : '') +
      '<span class="chip">' + esc(tierLabel(p.docTier)) + '</span>' + stateTag(p) + '<span class="meta">' + esc(p.docOwner) + '</span></div>' +
      '<div class="prop-body">' + (o.caseMeta ? '<div class="xs muted">' + esc(o.caseMeta) + '</div>' : '') + diffHtml(p, change) +
      '<div class="why"><b>Căn cứ:</b> ' + esc(p.reason) + '</div><div class="cite">Trích dẫn: ' + esc(p.citation) + '</div>' +
      proofHtml + evidence + action + '</div></article>';
  }

  function commitBar() {
    const cur = S.current;
    if (!cur || !cur.props.length) return '';
    const n = app.committableCount();
    const rejections = cur.props.filter(p => p.decided && !p.accepted && !p.logged).length;
    const open = pending().length;
    const shared = S.source === 'remote';
    const issue = app.canIssueCurrent();
    const rule = S.registry.find(r => r.id === cur.change.rule.id);
    const canRatify = rule && cur.change.issuerTier >= rule.tier && Engine.parseValue(rule.value).num !== Engine.parseValue(cur.change.newValue).num;
    const nothing = n === 0 && rejections === 0 && !(shared && open);
    return '<div class="commitbar" role="region" aria-label="Ban hành">' +
      '<div class="grow"><b>' + nf.format(n) + ' thay đổi sẵn sàng ban hành</b>' + (rejections ? ' · ' + nf.format(rejections) + ' quyết định giữ nguyên sẽ được ghi sổ' : '') +
      '<div class="xs muted">' + esc(open ? open + ' vị trí còn chờ người quyết — ' + (shared ? 'khi ban hành, các vị trí này được chuyển thành hồ sơ dùng chung để đúng người quyết trên máy của họ.' : 'có thể ban hành phần đã sẵn sàng trước.') : 'Không còn vị trí chờ.') +
      (!issue.ok ? ' ' + esc(issue.reason) : '') + '</div></div>' +
      (canRatify ? '<label class="check small"><input type="checkbox" id="ratifyChk" name="ratify" data-bind="ratify"' + (ui.ratify ? ' checked' : '') + '> Cập nhật luôn giá trị gốc ' + esc(rule.id) + ' trong sổ đăng ký</label>'
        : (rule && cur.change.issuerTier < rule.tier ? '<span class="xs muted hide-sm" style="max-width:260px">' + esc(rule.id + ' là quy định cấp ' + rule.tier + '; giá trị gốc chỉ đổi khi cấp ' + rule.tier + ' ban hành.') + '</span>' : '')) +
      btn('commit', 'Ban hành', { cls: 'primary', disabled: nothing || !issue.ok || S.busy }) + '</div>';
  }

  function sandboxBanner() {
    if (S.source !== 'sandbox') return '';
    return '<div class="notice sandbox"><div class="grow small"><b>Chế độ minh hoạ:</b> ' + esc(S.workspace.name) + '. Mọi thao tác chỉ diễn ra trên bản sao tạm.</div>' + btn('exit-sandbox', 'Thoát minh hoạ', { cls: 'sm' }) + '</div>';
  }
  function staleBanner() {
    let html = '';
    if (S.stale) html += '<div class="notice warn"><div class="grow small">Có người vừa cập nhật dữ liệu dùng chung. Tải lại để làm việc trên bản mới nhất (quyết định chưa ban hành của bạn sẽ được giữ nếu dòng không đổi).</div>' + btn('reload', 'Tải lại', { cls: 'sm' }) + '</div>';
    if (S.current && S.current.revision !== S.revision) html += '<div class="notice warn"><div class="grow small">Kho hoặc sổ đăng ký đã thay đổi sau lần phân tích này. Prover sẽ chặn các dòng không còn khớp — nên chạy lại phân tích.</div>' + btn('analyze', 'Phân tích lại', { cls: 'sm' }) + '</div>';
    return html;
  }

  // ---------- Màn hình: Hàng đợi ----------
  function viewQueue() {
    const tab = ui.query.get('tab') || 'mine';
    const cur = S.current;
    const all = queueEntries();
    const decided = cur ? cur.props.filter(p => !p.inCase && ((p.outcome === 'ESCALATE' && p.decided) || p.semanticHoldReviewed)) : [];
    const mineList = all.filter(e => e.right.ok);
    const m = member();
    const card = e => e.kind === 'case'
      ? propCard(e.p, true, { change: e.item.change, caseIdx: e.idx, right: e.right, caseLabel: e.item.oc.id,
          caseMeta: 'Hồ sơ ' + e.item.oc.id + ' · ' + e.item.oc.ruleId + ' ' + e.item.oc.oldValue + ' → ' + e.item.oc.newValue +
            ' · cấp ban hành ' + e.item.oc.issuerTier + ' · khởi tạo bởi ' + e.item.oc.createdBy })
      : propCard(e.p, true, { right: e.right });
    const body = tab === 'done' ? decided.map(p => propCard(p, true)).join('') : (tab === 'all' ? all : mineList).map(card).join('');
    const shared = S.source === 'remote';
    return sandboxBanner() + staleBanner() +
      '<div class="page-head"><div><div class="eyebrow">Bước 3</div><h1>Hàng đợi duyệt</h1><p>Mỗi vị trí là đúng một câu hỏi với hai lựa chọn. Chỉ người đúng cấp và đúng đơn vị phụ trách mới quyết được — “Chuyên viên phòng ban chỉ duyệt văn bản thuộc phạm vi của mình”.' +
        (shared ? ' Ở chế độ dùng chung, vị trí chưa quyết của một thay đổi đã ban hành trở thành hồ sơ mà người có thẩm quyền thấy ngay trên máy của mình; quyết định được áp dụng và ghi sổ ngay.' : '') + '</p></div>' +
      '<span class="pill" style="max-width:100%"><span class="t">' + esc(m ? 'Bạn: ' + m.displayName + ' · cấp ' + m.tier : 'Chưa xác định vai trò') + '</span></span></div>' +
      (!cur && !all.length ? '<div class="empty"><b>Không có việc nào đang chờ</b>Tạo một thay đổi ở mục <a href="#/thay-doi">Thay đổi quy định</a>.</div>' :
      '<div class="filters" role="group" aria-label="Lọc hàng đợi">' +
        [['mine', 'Việc của tôi · ' + mineList.length], ['all', 'Tất cả đang chờ · ' + all.length], ['done', 'Đã quyết (chưa ban hành) · ' + decided.length]]
          .map(([k, l]) => '<button type="button" data-action="queue-tab" data-value="' + k + '" aria-pressed="' + (tab === k) + '">' + esc(l) + '</button>').join('') + '</div>' +
      '<div class="stack">' + (body ||
        '<div class="empty"><b>' + (tab === 'mine' ? 'Không có vị trí nào thuộc thẩm quyền của bạn' : 'Không có vị trí nào') + '</b>' + (tab === 'mine' && all.length ? 'Còn ' + all.length + ' vị trí cần người khác — xem tab “Tất cả” hoặc đổi vai trò.' : '') + '</div>') + '</div>' + commitBar());
  }

  // ---------- Màn hình: Sổ kiểm toán ----------
  function viewLedger() {
    const ok = Ledger.verify(S.ledger);
    const q = ui.ledgerQuery.trim().toLowerCase();
    const rows = S.ledger.filter(e => !q || [e.docId, e.actor, e.action, e.basis].some(x => String(x || '').toLowerCase().includes(q))).slice().reverse();
    const tail = Ledger.tailOf(S.ledger);
    return sandboxBanner() +
      '<div class="page-head"><div><div class="eyebrow">Bước 4</div><h1>Sổ kiểm toán</h1><p>Chỉ ghi thêm. Mỗi bản ghi băm SHA-256 trên nội dung của nó nối với bản ghi trước — sửa lén một dòng là gãy cả chuỗi. Hoàn tác tạo bản ghi mới, không xoá vết.</p></div>' +
      '<div class="row">' + btn('export-json', 'Tải JSON', { cls: 'sm' }) + btn('export-csv', 'Tải CSV', { cls: 'sm' }) + '</div></div>' +
      '<div class="notice ' + (ok ? 'ok' : 'error') + '"><div class="grow small">' + (ok ? '✓ Chuỗi hợp lệ · ' + nf.format(S.ledger.length) + ' bản ghi · đuôi <code>' + esc(tail.hash.slice(0, 16)) + '…</code>' : '✗ Chuỗi không hợp lệ — đã khoá ban hành và hoàn tác.') +
      (S.source === 'remote' ? ' · Máy chủ kiểm lại chuỗi trước mỗi lần ghi.' : '') + '</div></div>' +
      '<label class="field" for="ledgerSearch" style="max-width:420px">Tìm trong sổ<input id="ledgerSearch" type="search" name="ledgerSearch" autocomplete="off" data-bind="ledgerQuery" placeholder="Mã tài liệu, người thực hiện, hành động…" value="' + esc(ui.ledgerQuery) + '"></label>' +
      (rows.length ? '<div class="tablewrap"><table><thead><tr><th scope="col">#</th><th scope="col">Thời điểm</th><th scope="col">Người / hệ thống</th><th scope="col">Tài liệu</th><th scope="col">Hành động</th><th scope="col">Căn cứ &amp; nội dung</th><th scope="col">Băm</th><th scope="col"><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
        rows.map(e => {
          const u = app.canUndo(e.seq);
          const undoable = String(e.action).startsWith('PATCH') && !Ledger.isReverted(S.ledger, e.seq);
          return '<tr><td class="num">' + esc(e.seq) + '</td><td class="num small" style="white-space:nowrap">' + fmtTime(e.ts) + '</td><td class="small">' + esc(e.actor) + '</td><td><span class="docid">' + esc(e.docId) + '</span></td>' +
            '<td class="small">' + esc(e.action) + (Ledger.isReverted(S.ledger, e.seq) ? ' <span class="tag neutral">đã hoàn tác</span>' : '') + '</td>' +
            '<td class="small" style="min-width:260px"><div class="clamp">' + esc(e.basis) + '</div>' + (e.from !== e.to ? '<details><summary class="xs muted" style="cursor:pointer">Trước / sau</summary><div class="diff"><div><span class="ln">−</span>' + esc(e.from) + '</div><div><span class="ln">+</span>' + esc(e.to) + '</div></div></details>' : '') + '</td>' +
            '<td class="hash" title="' + esc(e.hash) + '">' + esc(e.hash.slice(0, 10)) + '…</td><td>' +
            (undoable ? btn('undo', 'Hoàn tác', { cls: 'sm danger', data: { seq: e.seq }, disabled: !u.ok || !ok, title: u.ok ? 'Khôi phục dòng và ghi thêm bản ghi hoàn tác' : (u.reason || '') }) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty"><b>' + (S.ledger.length ? 'Không có bản ghi khớp' : 'Sổ đang trống') + '</b>' + (S.ledger.length ? '' : 'Ban hành một thay đổi để tạo bản ghi đầu tiên.') + '</div>');
  }

  // ---------- Màn hình: Kho tài liệu ----------
  function viewDocs() {
    const q = ui.docQuery.trim().toLowerCase();
    const hits = new Set(S.current ? S.current.props.map(p => p.docId + ':' + p.lineIndex) : []);
    const docs = S.docs.filter(d => (ui.docTier === 'all' || String(d.tier) === ui.docTier) &&
      (!q || (d.id + ' ' + d.title + ' ' + d.owner + ' ' + d.lines.join(' ')).toLowerCase().includes(q)));
    const m = member();
    const units = m ? (m.units.includes('*') ? [...new Set(S.docs.map(d => d.owner))] : m.units) : [];
    const nd = ui.newDoc;
    return sandboxBanner() +
      '<div class="page-head"><div><div class="eyebrow">Dữ liệu</div><h1>Kho tài liệu</h1><p>' + esc(nf.format(S.docs.length) + ' tài liệu có kiểm soát. Dòng được tô màu là vị trí mà phân tích hiện tại đang xét.') + '</p></div></div>' +
      '<div class="row">' +
        '<label class="field" for="docSearch" style="flex:1;min-width:220px">Tìm tài liệu<input id="docSearch" type="search" name="docSearch" autocomplete="off" data-bind="docQuery" placeholder="Mã, tên, đơn vị hoặc nội dung…" value="' + esc(ui.docQuery) + '"></label>' +
        '<label class="field" for="docTier">Cấp<select id="docTier" name="docTier" data-bind="docTier">' + [['all', 'Tất cả'], ['1', 'Cấp 1'], ['2', 'Cấp 2'], ['3', 'Cấp 3']].map(([v, l]) => '<option value="' + v + '"' + (ui.docTier === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<div>' + (docs.map(d => '<details class="doc"' + (q ? ' open' : '') + '><summary><span class="docid">' + esc(d.id) + '</span><span class="title">' + esc(d.title) + '</span><span class="chip">' + esc(tierLabel(d.tier)) + '</span><span class="xs muted">v' + esc(d.version) + ' · ' + esc(d.owner) + '</span></summary>' +
        '<ol class="lines">' + d.lines.map((l, i) => '<li' + (hits.has(d.id + ':' + i) ? ' class="hit"' : '') + '>' + esc(l) + '</li>').join('') + '</ol></details>').join('') ||
        '<div class="empty"><b>Không tìm thấy tài liệu</b>Thử từ khoá khác.</div>') + '</div>' +
      '<section class="card"><div class="card-head"><h2>Nạp tài liệu mới</h2><p>Dán nội dung, mỗi dòng một điều khoản. Chỉ nạp được tài liệu của đơn vị mình phụ trách, ở cấp ≤ cấp của mình.</p></div><div class="card-body stack">' +
        '<div class="grid g3">' +
          '<label class="field" for="ndTitle">Tên tài liệu<input id="ndTitle" type="text" name="title" autocomplete="off" data-bind="newDoc.title" placeholder="Hướng dẫn nội bộ Khoa…" value="' + esc(nd.title) + '"></label>' +
          '<label class="field" for="ndOwner">Đơn vị ban hành<select id="ndOwner" name="owner" data-bind="newDoc.owner">' + units.map(u => '<option' + (u === nd.owner ? ' selected' : '') + '>' + esc(u) + '</option>').join('') + '</select></label>' +
          '<label class="field" for="ndTier">Cấp<select id="ndTier" name="tier" data-bind="newDoc.tier">' + [1, 2, 3].map(t => '<option value="' + t + '"' + (String(t) === nd.tier ? ' selected' : '') + '>' + esc(tierLabel(t)) + '</option>').join('') + '</select></label>' +
        '</div>' +
        '<label class="field" for="ndBody">Nội dung<textarea id="ndBody" name="body" data-bind="newDoc.body" placeholder="Sinh viên nộp đơn phúc khảo trong 7 ngày kể từ ngày công bố điểm…">' + esc(nd.body) + '</textarea></label>' +
        '<div class="row">' + btn('add-doc', 'Nạp vào kho', { cls: 'primary' }) + '</div>' +
      '</div></section>';
  }

  // ---------- Màn hình: Sổ đăng ký & học ----------
  function viewRegistry() {
    const stats = G.PolicyChangeLearning.escalationStats(S.feedback);
    const sugg = app.suggestions();
    return sandboxBanner() +
      '<div class="page-head"><div><div class="eyebrow">Dữ liệu</div><h1>Sổ đăng ký &amp; học từ phản hồi</h1><p>Mỗi quy định có hai loại cụm từ: <b>neo chủ đề</b> (dòng nói về việc gì) và <b>neo đại lượng</b> (con số đo cái gì). Máy chỉ tự sửa khi dòng có đủ cả hai. Khi người phụ trách nhiều lần trả lời “Có” ở hồ sơ U1, hệ thống đề xuất bổ sung đúng loại neo còn thiếu — duyệt xong thì lần sau các dòng tương tự được tự xử lý. Đó là cách ngưỡng chuyển tiếp tự điều chỉnh, có người kiểm soát và có ghi sổ.</p></div></div>' +
      '<div class="split">' +
        '<section class="card"><div class="card-head"><h2>Đề xuất neo mới</h2><span class="tag ' + (sugg.length ? 'U1' : 'neutral') + '">' + nf.format(sugg.length) + ' đề xuất</span></div><div class="card-body stack">' +
          (sugg.length ? sugg.map(s => {
            const rule = S.registry.find(r => r.id === s.ruleId);
            const right = Authz.canEditRegistry(member(), rule);
            const fieldLabel = s.field === 'measures' ? 'neo đại lượng' : s.field === 'both' ? 'neo chủ đề + đại lượng' : 'neo chủ đề';
            return '<div class="prop U1"><div class="prop-body"><div class="row"><b>“' + esc(s.phrase) + '”</b><span class="tag neutral">' + esc(s.ruleId) + '</span><span class="chip">' + esc(fieldLabel) + '</span><span class="xs muted">' + esc(s.support + ' phản hồi “Có” · ' + s.lines.map(l => l.docId + ' dòng ' + (l.lineIndex + 1)).join(', ')) + '</span></div>' +
              (right.ok ? '<div class="row">' + btn('accept-suggestion', 'Duyệt thêm ' + fieldLabel, { cls: 'sm primary', data: { rule: s.ruleId, phrase: s.phrase, support: s.support, field: s.field } }) + '</div>'
                : '<div class="lock">' + icon('lock', 16) + '<span>' + esc(right.reason) + '</span></div>') + '</div></div>';
          }).join('') : '<div class="empty"><b>Chưa có đề xuất</b>Cần ít nhất 2 câu trả lời “Có” ở hồ sơ U1 cùng chứa một cụm từ chưa phải là neo.</div>') +
        '</div></section>' +
        '<section class="card"><div class="card-head"><h2>Phản hồi đã ghi nhận</h2><span class="tag neutral">' + nf.format(stats.total) + ' câu trả lời</span></div><div class="card-body stack">' +
          (stats.total ? '<div class="bars">' + ['U1', 'U2', 'U3', 'SEMANTIC'].filter(k => stats.byCategory[k]).map(k => {
            const c = stats.byCategory[k];
            return bar(k === 'SEMANTIC' ? 'AI giữ lại' : k, c.acceptRate, k === 'SEMANTIC' ? '' : k);
          }).join('') + '</div><p class="xs muted">Tỉ lệ “đồng ý sửa” theo loại hồ sơ. U1 có tỉ lệ đồng ý cao ⇒ nhiều khả năng thiếu neo — xem đề xuất bên trái.</p>'
            : '<div class="empty"><b>Chưa có phản hồi</b>Quyết định các hồ sơ trong hàng đợi rồi ban hành để hệ thống bắt đầu học.</div>') +
        '</div></section>' +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>Quy định trong sổ</h2><p>Chỉ trưởng đơn vị sở hữu quy định (cấp ≥ 2) mới thêm neo; mọi thay đổi được ghi vào sổ kiểm toán.</p></div><div class="card-body"><div class="grid g2">' +
        S.registry.map(r => {
          const right = Authz.canEditRegistry(member(), r);
          const draftKey = 'anchor-' + r.id;
          return '<div class="prop"><div class="prop-head"><span class="docid">' + esc(r.id) + '</span><span class="title">' + esc(r.name) + '</span><span class="chip">' + esc(tierLabel(r.tier)) + '</span></div>' +
            '<div class="prop-body"><div class="row"><span class="stat" style="padding:6px 12px;box-shadow:none"><span class="v" style="font-size:20px">' + esc(r.value) + '</span></span><span class="xs muted">' + esc(r.owner + ' · ' + r.source) + '</span></div>' +
            '<div class="row"><span class="xs muted" style="min-width:76px">Chủ đề</span>' + r.aliases.map(a => '<span class="chip">' + esc(a) + '</span>').join('') + '</div>' +
            '<div class="row"><span class="xs muted" style="min-width:76px">Đại lượng</span>' + ((r.measures || []).length ? (r.measures || []).map(a => '<span class="chip measure">' + esc(a) + '</span>').join('') : '<span class="xs muted">— neo chủ đề đã đủ hẹp</span>') + '</div>' +
            (right.ok ? '<div class="row"><label class="sr-only" for="' + esc(draftKey) + '">Cụm từ neo mới cho ' + esc(r.id) + '</label><input id="' + esc(draftKey) + '" type="text" autocomplete="off" name="' + esc(draftKey) + '" data-bind="anchorDraft.' + esc(r.id) + '" placeholder="Thêm cụm từ neo…" value="' + esc(ui.anchorDraft[r.id] || '') + '" style="flex:1;min-width:160px">' +
              '<label class="sr-only" for="' + esc(draftKey) + '-field">Loại neo</label><select id="' + esc(draftKey) + '-field" data-bind="anchorField.' + esc(r.id) + '"><option value="aliases"' + ((ui.anchorField[r.id] || 'aliases') === 'aliases' ? ' selected' : '') + '>Chủ đề</option><option value="measures"' + (ui.anchorField[r.id] === 'measures' ? ' selected' : '') + '>Đại lượng</option></select>' +
              btn('add-anchor', 'Thêm', { cls: 'sm', data: { rule: r.id } }) + '</div>'
              : '<div class="lock xs">' + icon('lock', 14) + '<span>' + esc(right.reason) + '</span></div>') + '</div></div>';
        }).join('') + '</div></div></section>';
  }

  // ---------- Màn hình: Đánh giá ----------
  function viewEval() {
    const r = ui.evalReport;
    return '<div class="page-head"><div><div class="eyebrow">Chất lượng</div><h1>Đánh giá độ chính xác</h1><p>Ba lớp kiểm chứng: bộ Verify của đề bài (9 ca, chạy trên bản sao sạch), tập phát triển 48 ca (nhóm tự gắn nhãn, đã dùng để thiết kế nên không còn độc lập) và <b>tập mù 40 ca</b> do một tác tử độc lập viết từ văn bản quy trình, đóng băng bằng mã băm trước khi sửa động cơ. Phương pháp chi tiết: <code>docs/PHUONG-PHAP-KIEM-CHUNG.md</code>.</p></div></div>' +
      '<section class="card"><div class="card-head"><h2>Verify · 4 ca bắt buộc + 5 ca Escalation</h2>' + btn('verify', 'Chạy Verify', { cls: 'primary' }) + '</div><div class="card-body">' +
        (ui.verify ? '<div class="notice ' + (ui.verify.every(x => x.ok) ? 'ok' : 'error') + ' small">' + esc(ui.verify.filter(x => x.ok).length + '/' + ui.verify.length + ' ca đạt · tổng ' + ui.verify.reduce((s, x) => s + x.ms, 0).toFixed(2) + ' ms') + '</div>' +
          '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Ca</th><th>Mô tả</th><th>Kỳ vọng</th><th>Thực tế</th><th>Kết quả</th></tr></thead><tbody>' +
          ui.verify.map(x => '<tr><td class="mono">' + esc(x.id) + '</td><td class="small">' + esc(x.desc) + '<div class="xs muted">' + esc(x.detail) + '</div></td><td class="small">' + esc(x.expected) + '</td><td class="small">' + esc(x.actual) + '</td><td>' + (x.ok ? '<span class="tag auto">✓ Đạt</span>' : '<span class="tag U3">✗ Trượt</span>') + '</td></tr>').join('') + '</tbody></table></div>'
          : '<div class="empty">Bấm “Chạy Verify”. Bộ kiểm thử độc lập với dữ liệu bạn đang thao tác.</div>') +
      '</div></section>' +
      '<section class="card"><div class="card-head"><h2>Tập kiểm thử độc lập</h2><div class="row">' +
        btn('eval-blind', 'Chạy tập mù 40 ca', { cls: 'primary' }) + btn('eval-builtin', 'Tập phát triển 48 ca') + btn('eval-ai', 'Chạy kèm AI ngữ nghĩa', { disabled: S.ai.status !== 'ready', title: S.ai.status === 'ready' ? 'Gọi OpenAI cho các ca động cơ muốn tự sửa' : 'AI đang tắt' }) +
        '<label class="btn" for="evalFile">Tải CSV của bạn…</label><input id="evalFile" type="file" accept=".csv,text/csv" class="sr-only" data-action-change="eval-file">' +
      '</div></div><div class="card-body stack">' +
        '<p class="small muted">Định dạng CSV: <code>id,rule_id,new_value,issuer_tier,doc_tier,line,expected[,phenomenon]</code> với expected ∈ AUTO, U1, U2, U3, NONE (ca bẫy: dòng không mang giá trị cũ, không được đụng tới). Cả hai tập đều là dữ liệu tổng hợp; giám khảo có thể tải CSV của mình lên để chấm trực tiếp.</p>' +
        (r ? evalReportHtml(r) : '<div class="empty">Chưa chạy. Kết quả sẽ hiện tỉ lệ bỏ sót, tỉ lệ chuyển tiếp thừa, ma trận nhầm lẫn và từng ca sai.</div>') +
      '</div></section>';
  }

  function evalReportHtml(r) {
    const labels = ['AUTO', 'U1', 'U2', 'U3'].concat(r.expectedNone ? ['NONE'] : []);
    const actuals = ['AUTO', 'U1', 'U2', 'U3', 'HOLD', 'NONE'];
    return '<div class="row"><span class="tag neutral">' + esc(ui.evalSource || '') + '</span>' + (r.aiCalls !== undefined ? '<span class="xs muted">' + esc(r.aiCalls + ' lượt gọi AI' + (r.aiUnavailable ? ', ' + r.aiUnavailable + ' lượt AI không trả lời được' : '')) + '</span>' : '') + btn('eval-download', 'Tải báo cáo CSV', { cls: 'sm' }) + '</div>' +
      '<div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' + stat('auto', pct(r.accuracy), 'Đúng hoàn toàn', r.correct + '/' + r.total + ' ca') +
        stat('U3', nf.format(r.wrongEdits || 0), 'Tự sửa sai', 'trên ' + (r.autoActions || 0) + ' lần máy tự sửa' + (r.autoPrecision === null || r.autoPrecision === undefined ? '' : ' · chính xác ' + pct(r.autoPrecision))) +
        stat('U3', pct(r.missRate), 'Tỉ lệ bỏ sót', r.misses + '/' + r.expectedEscalate + ' ca cần người mà máy không hỏi') +
        stat('U1', pct(r.overEscalationRate), 'Tỉ lệ báo lên thừa', r.overEscalations + '/' + (r.expectedAuto + (r.expectedNone || 0)) + ' ca lẽ ra không cần hỏi') +
        stat('', r.categoryAccuracy === null ? '—' : pct(r.categoryAccuracy), 'Đúng loại U1/U2/U3', 'trong các ca đã chuyển tiếp') + '</div>' +
      '<div class="tablewrap"><table class="matrix"><caption class="sr-only">Ma trận nhầm lẫn: hàng là nhãn kỳ vọng, cột là kết quả hệ thống</caption><thead><tr><th scope="col">Kỳ vọng \\ Thực tế</th>' + actuals.map(a => '<th scope="col">' + a + '</th>').join('') + '</tr></thead><tbody>' +
        labels.map(e => '<tr><th scope="row">' + e + '</th>' + actuals.map(a => { const v = (r.confusion[e] || {})[a] || 0; const good = e === a || (e !== 'AUTO' && e !== 'NONE' && a === 'HOLD'); return '<td class="num ' + (v ? (good ? 'hit' : 'bad') : '') + '">' + v + '</td>'; }).join('') + '</tr>').join('') +
      '</tbody></table></div>' +
      (r.rows.some(x => !x.ok) ? '<h3>Các ca sai</h3><div class="tablewrap"><table><thead><tr><th>Ca</th><th>Dòng</th><th>Kỳ vọng</th><th>Thực tế</th><th>Loại lỗi</th></tr></thead><tbody>' +
        r.rows.filter(x => !x.ok).map(x => '<tr><td class="mono">' + esc(x.id) + '</td><td class="small">' + esc(x.line) + (x.phenomenon ? '<div class="xs muted">' + esc(x.phenomenon) + '</div>' : '') + '</td><td>' + esc(x.expected) + '</td><td>' + esc(x.actual) + '</td><td>' +
          ({ miss: '<span class="tag U3">Bỏ sót</span>', over: '<span class="tag U1">Chuyển thừa</span>', wrong_category: '<span class="tag U2">Sai loại</span>', wrong: '<span class="tag neutral">Không phát hiện</span>' }[x.kind] || '') + '</td></tr>').join('') + '</tbody></table></div>' : '');
  }

  // ---------- Hành động ----------
  async function withBusy(key, fn) {
    if (ui.busy) return;
    ui.busy = key; render();
    try { return await fn(); } finally { ui.busy = null; render(); }
  }

  function syncFormFromChange(c) {
    ui.form.ruleId = c.ruleId; ui.form.newValue = c.newValue; ui.form.issuerTier = String(c.issuerTier);
  }

  async function understand(text) {
    const r = await app.resolveRequest(text);
    ui.understanding = r;
    if (r.status === 'ai_candidate' || r.status === 'deterministic_fallback') syncFormFromChange(r.change);
    return r;
  }

  function analyzeFromForm() {
    const res = app.analyze({ ruleId: ui.form.ruleId, newValue: ui.form.newValue, issuerTier: Number(ui.form.issuerTier), requestText: ui.form.text });
    ui.ratify = false;
    // Có AI thật thì tự rà các dòng tự sửa ngay sau khi phân tích (không chặn giao diện).
    if (res.ok && S.ai.status === 'ready') app.ensureSemanticReview().then(() => render());
    if (!res.ok) { const el = document.getElementById(!ui.form.newValue ? 'newVal' : !ui.form.issuerTier ? 'tierSel' : 'newVal'); if (el) el.focus(); }
    return res;
  }

  async function demoSafe() {
    const sc = G.PolicyChangeDemo.getSafeDateScenario();
    app.enterSandbox({ label: 'Tự sửa an toàn, không đụng ngày tháng', docs: [sc.document] });
    app.setPersona('tp-dt');
    ui.form.text = sc.requestText;
    const r = await understand(sc.requestText);
    if (!(r.status === 'ai_candidate' || r.status === 'deterministic_fallback')) { ui.demoStatus = { tone: 'error', text: 'Minh hoạ dừng: không hiểu được yêu cầu (' + vi(r.reason) + ').' }; return; }
    analyzeFromForm();
    const res = await app.commit();
    const p = S.current && S.current.props[0];
    ui.demoStatus = { tone: res.ok ? 'ok' : 'error', text: res.ok ? 'Đã tự sửa “7 ngày” → “5 ngày” sau khi prover xác nhận đủ điều kiện; ngày 17/07/2025 trong cùng dòng giữ nguyên. Mở “Sổ kiểm toán” để xem bản ghi và thử Hoàn tác.' : res.message };
    if (p) go('thay-doi'); else render();
  }

  async function demoReview() {
    const sc = G.PolicyChangeDemo.getAmbiguityScenario();
    app.enterSandbox({ label: 'AI giữ lại cho người duyệt (dữ liệu AI mẫu)', docs: [{ ...sc.document, title: 'Hướng dẫn phúc khảo (mơ hồ)', owner: 'Phòng Đào tạo', version: '1.0' }] });
    app.setPersona('tp-dt');
    ui.form.text = sc.requestText;
    await understand(sc.requestText);
    analyzeFromForm();
    await app.discoverSemantics(G.PolicyChangeDemo.createAmbiguityFixtureAdapter(), 'fixture_mock');
    ui.demoStatus = { tone: 'info', text: 'Động cơ tiền định vẫn nói AUTO_PATCH, nhưng bằng chứng ngữ nghĩa (mẫu, không phải mô hình thật) là “có thể liên quan” → vị trí bị giữ lại, không ban hành được cho tới khi người duyệt.' };
    go('thay-doi');
  }

  async function demoRefuse() {
    const text = 'Đổi tất cả các thời hạn 7 ngày thành 5 ngày.';
    const before = JSON.stringify([S.docs, S.ledger]);
    ui.form.text = text;
    const r = await understand(text);
    const unchanged = JSON.stringify([S.docs, S.ledger]) === before;
    ui.demoStatus = { tone: r.status === 'refusal' && unchanged ? 'ok' : 'error', text: r.status === 'refusal' && unchanged ? 'Đã từ chối trước khi phân tích: ' + vi(r.reason) + ' Kho tài liệu và sổ kiểm toán không thay đổi.' : 'Kết quả bất thường; không thực hiện thêm thao tác nào.' };
    go('thay-doi');
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function runEval(csv, sourceLabel, withAI) {
    const parsed = Evaluation.parseCsv(csv);
    if (parsed.errors.length && !parsed.cases.length) { toast(parsed.errors[0], 'error'); return; }
    if (parsed.errors.length) toast('Bỏ qua ' + parsed.errors.length + ' dòng không hợp lệ.', 'info');
    const registry = S.registry.length ? S.registry : Data.SEED_REGISTRY;
    ui.evalSource = sourceLabel;
    if (!withAI) { ui.evalReport = Evaluation.evaluate(parsed.cases, { registry }); render(); return; }
    return withBusy('eval-ai', async () => {
      ui.evalReport = await Evaluation.evaluateWithSemantics(parsed.cases, { registry, semantic: G.PolicyChangeSemanticDiscovery, adapter: aiAdapter });
    });
  }

  const actions = {
    'understand': () => withBusy('understand', () => understand(ui.form.text)),
    'analyze': () => { analyzeFromForm(); render(); },
    'clear-analysis': () => app.clearAnalysis(),
    'semantic': () => withBusy('semantic', () => app.discoverSemantics()),
    'decide': el => app.decide(el.dataset.p, el.dataset.act),
    'decide-case': el => {
      const item = app.caseItems()[Number(el.dataset.idx)];
      if (item) withBusy('case-' + el.dataset.idx, () => app.decideCase(item, el.dataset.act));
    },
    'undo-decision': el => app.undoDecision(el.dataset.p),
    'review': el => app.reviewSemantic(el.dataset.p, el.dataset.approve === '1'),
    'commit': () => withBusy('commit', () => app.commit({ ratify: ui.ratify })),
    'undo': el => { if (confirm('Hoàn tác bản ghi #' + el.dataset.seq + '? Dòng sẽ được khôi phục và một bản ghi hoàn tác được thêm vào sổ.')) withBusy('undo', () => app.undo(Number(el.dataset.seq))); },
    'filter-loc': el => { setQuery('loc', el.dataset.value); render(); },
    'queue-tab': el => { setQuery('tab', el.dataset.value); render(); },
    'reload': () => withBusy('reload', () => app.reload()),
    'exit-sandbox': () => { app.exitSandbox(); ui.understanding = null; ui.demoStatus = null; },
    'go-online': () => withBusy('go-online', () => app.switchSource('remote', 'demo')),
    'go-offline': () => withBusy('go-offline', () => app.switchSource('local')),
    'open-pilot': () => withBusy('open-pilot', () => app.switchSource('remote', 'hcmut-pilot')),
    'open-demo': () => withBusy('open-demo', () => app.switchSource('remote', 'demo')),
    'open-login': () => { const d = $('#loginDlg'); d.showModal(); $('#loginEmail').focus(); },
    'sign-out': () => withBusy('sign-out', () => app.signOut()),
    'reset': () => { if (confirm('Khôi phục kho tài liệu, sổ đăng ký và xoá sổ kiểm toán về dữ liệu mẫu?')) withBusy('reset', () => app.resetWorkspace()); },
    'demo-safe': () => withBusy('demo-safe', demoSafe),
    'demo-review': () => withBusy('demo-review', demoReview),
    'demo-refuse': () => withBusy('demo-refuse', demoRefuse),
    'add-doc': () => withBusy('add-doc', async () => {
      const nd = ui.newDoc;
      const res = await app.addDocument({ title: nd.title.trim(), owner: nd.owner || ($('#ndOwner') || {}).value, tier: Number(nd.tier), lines: nd.body.split(/\n+/).map(s => s.trim()).filter(Boolean) });
      if (res.ok) ui.newDoc = { title: '', owner: nd.owner, tier: nd.tier, body: '' };
    }),
    'add-anchor': el => withBusy('add-anchor', async () => {
      const id = el.dataset.rule;
      const res = await app.addAnchor(id, (ui.anchorDraft[id] || '').trim(), 'Bổ sung thủ công bởi trưởng đơn vị', ui.anchorField[id] === 'measures' ? 'measures' : 'aliases');
      if (res.ok) ui.anchorDraft[id] = '';
    }),
    'accept-suggestion': el => withBusy('accept-suggestion', () => app.addAnchor(el.dataset.rule, el.dataset.phrase, 'Học từ ' + el.dataset.support + ' phản hồi “Có” ở hồ sơ U1', /** @type {any} */ (el.dataset.field || 'aliases'))),
    'verify': () => {
      const env = { registry: Engine.cloneRegistry(Data.SEED_REGISTRY), seedDocuments: Data.SEED_DOCUMENTS };
      ui.verify = [...Data.SUITE_REQUIRED, ...Data.SUITE_ESCALATION].map(tc => Workflow.runVerifyCase(tc, env));
      render();
    },
    'eval-blind': () => runEval(G.PolicyChangeBlindCsv, 'Tập mù 40 ca · động cơ tiền định', false),
    'eval-builtin': () => runEval(G.PolicyChangeHoldoutCsv, 'Tập phát triển 48 ca · động cơ tiền định', false),
    'eval-ai': () => runEval(ui.evalCsv || G.PolicyChangeBlindCsv, (ui.evalCsv ? 'CSV của bạn' : 'Tập mù 40 ca') + ' · động cơ + AI ngữ nghĩa', true),
    'eval-download': () => download('bao-cao-danh-gia.csv', '﻿' + Evaluation.toCsv(ui.evalReport), 'text/csv;charset=utf-8'),
    'export-json': () => download('so-kiem-toan-' + S.workspace.id + '.json', JSON.stringify(S.ledger, null, 2), 'application/json'),
    'export-csv': () => {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      download('so-kiem-toan-' + S.workspace.id + '.csv', '﻿' + ['seq,ts,actor,docId,lineIndex,action,from,to,basis,revertsSeq,prevHash,hash']
        .concat(S.ledger.map(e => [e.seq, e.ts, e.actor, e.docId, e.lineIndex, e.action, e.from, e.to, e.basis, e.revertsSeq, e.prevHash, e.hash].map(q).join(','))).join('\n'), 'text/csv;charset=utf-8');
    }
  };

  function bindValue(path, value) {
    const [a, b] = path.split('.');
    if (b === undefined) ui[a] = value; else ui[a][b] = value;
  }

  function wire() {
    document.addEventListener('click', ev => {
      if (ev.target.closest('#sidebar a, #sidebar [data-action]')) { document.body.classList.remove('nav-open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); }
      const el = ev.target.closest('[data-action]');
      if (!el || el.disabled) return;
      const fn = actions[el.dataset.action];
      if (fn) { ev.preventDefault(); fn(el); }
    });
    document.addEventListener('input', ev => {
      const el = ev.target;
      if (!el.dataset || !el.dataset.bind) return;
      bindValue(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
      if (['ledgerQuery', 'docQuery'].includes(el.dataset.bind)) render();
    });
    document.addEventListener('change', ev => {
      const el = ev.target;
      if (el.id === 'personaSel') { app.setPersona(el.value); return; }
      if (el.dataset && el.dataset.bind) {
        bindValue(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
        if (['form.ruleId', 'form.issuerTier', 'docTier', 'ratify'].includes(el.dataset.bind)) render();
      }
      if (el.dataset && el.dataset.actionChange === 'eval-file' && el.files && el.files[0]) {
        el.files[0].text().then(text => { ui.evalCsv = text; runEval(text, 'CSV của bạn · ' + el.files[0].name, false); });
      }
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.id === 'reqText') { ev.preventDefault(); actions.understand(); }
      if (ev.key === 'Enter' && ev.target.id === 'newVal') { ev.preventDefault(); actions.analyze(); }
      if (ev.key === 'Enter' && ev.target.dataset && String(ev.target.dataset.bind || '').startsWith('anchorDraft.')) {
        ev.preventDefault(); actions['add-anchor']({ dataset: { rule: ev.target.dataset.bind.split('.')[1] } });
      }
      if (ev.key === 'Escape') document.body.classList.remove('nav-open');
    });
    $('#menuBtn').addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      $('#menuBtn').setAttribute('aria-expanded', String(open));
    });
    $('#themeBtn').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      root.setAttribute('data-theme', dark ? 'light' : 'dark');
      try { localStorage.setItem('policychange-os:theme', dark ? 'light' : 'dark'); } catch (_) { /* bỏ qua */ }
      $('meta[name="theme-color"]').setAttribute('content', dark ? '#f3f5f9' : '#0b0f17');
      renderShell();
    });
    $('#loginForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      if (ev.submitter && ev.submitter.value === 'cancel') { $('#loginDlg').close(); return; }
      const email = $('#loginEmail').value.trim(), pw = $('#loginPw').value;
      const msg = $('#loginMsg');
      if (!email || !pw) { msg.textContent = 'Nhập email và mật khẩu.'; (!email ? $('#loginEmail') : $('#loginPw')).focus(); return; }
      msg.textContent = 'Đang đăng nhập…';
      const res = await app.signIn(email, pw);
      if (res.ok) { $('#loginDlg').close(); $('#loginPw').value = ''; msg.textContent = ''; }
      else { msg.textContent = res.message; $('#loginPw').focus(); }
    });
    window.addEventListener('hashchange', () => { render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); });
    window.addEventListener('beforeunload', ev => {
      if (S.current && S.current.props.some(p => p.decided && !p.applied && !p.logged) && S.source !== 'sandbox') { ev.preventDefault(); ev.returnValue = ''; }
    });
    app.subscribe(() => render());
    setInterval(() => { if (document.visibilityState === 'visible') app.poll(); }, Math.max(5, Number(cfg.pollSeconds) || 20) * 1000);
  }

  wire();
  render();
  app.init({ prefer: params.get('offline') === '1' ? 'local' : 'remote' });
})();
