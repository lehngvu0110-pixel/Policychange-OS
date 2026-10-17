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
    workspace: cfg.defaultWorkspace || 'demo',
    Grouping: G.PolicyChangeGrouping,
    // Số đo thời gian quyết định chỉ lưu trên trình duyệt này (try/catch: chế độ riêng tư có thể chặn bộ nhớ).
    timingStore: {
      load() { try { return JSON.parse(localStorage.getItem('policychange-os:timings') || '[]'); } catch (_) { return []; } },
      save(rows) { try { localStorage.setItem('policychange-os:timings', JSON.stringify(rows)); } catch (_) { /* bỏ qua */ } }
    }
  });
  const S = app.state;
  G.PolicyChangeUI = { app };

  // Căn cứ pháp lý và lịch sử phiên bản (yêu cầu bổ sung của BTC, 17/10/2026).
  const Legal = { Refs: G.PolicyChangeLegalRefs, Discovery: G.PolicyChangeLegalDiscovery, Status: G.PolicyChangeLegalStatus,
    Fixtures: G.PolicyChangeLegalFixtures, Graph: G.PolicyChangeLegalGraph, History: G.PolicyChangeDocHistory };
  const legalRemote = cfg.supabaseUrl && params.get('offline') !== '1' && G.PolicyChangeLegalRemote
    ? G.PolicyChangeLegalRemote.create({ functionsUrl: cfg.supabaseUrl + '/functions/v1', apiKey: cfg.anonKey,
      token: () => (remote && remote.session ? remote.accessToken() : null) }) : null;
  function todayIso() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // Workspace đã chọn được nhớ trên trình duyệt này để tải lại trang không quay về Trình diễn (báo cáo kiểm thử F05).
  const WORKSPACE_KEY = 'policychange-os:workspace';
  const readWorkspace = () => { try { return localStorage.getItem(WORKSPACE_KEY) || ''; } catch (_) { return ''; } };
  const writeWorkspace = id => { try { if (readWorkspace() !== id) localStorage.setItem(WORKSPACE_KEY, id); } catch (_) { /* bỏ qua */ } };

  const ui = {
    route: 'tong-quan', query: new URLSearchParams(),
    form: { text: '', ruleId: 'R-PK-01', newValue: '', issuerTier: '' },
    understanding: null, ratify: false, busy: null, lastNotice: null, shownAt: {},
    verify: null, evalReport: null, evalSource: null, evalCsv: null, demoStatus: null,
    ledgerQuery: '', docQuery: '', docTier: 'all', anchorDraft: {}, anchorField: {}, newDoc: { title: '', owner: '', tier: '2', body: '' },
    legal: { source: 'sample', docId: '', text: '', mode: 'fixture', asOf: todayIso(), maxDepth: '3', maxDocs: '25', progress: null, result: null, assess: null, assessKey: '', selected: null, live: null, saveMsg: '' },
    legalAck: false, history: { docId: null, view: null, a: '', b: '' }
  };

  const VI_REASONS = {
    'Global-scope requests must be narrowed to one registered policy.': 'Yêu cầu áp cho “mọi / tất cả” thời hạn. Hệ thống chỉ nhận thay đổi của MỘT quy định đã đăng ký, hãy nêu rõ quy định nào.',
    'Global-scope requests are not accepted.': 'Yêu cầu phạm vi toàn cục không được chấp nhận.',
    'Enter a change request.': 'Hãy nhập nội dung thay đổi.',
    'Select the authority tier before continuing.': 'Hãy nêu cấp ban hành (chuyên viên / trưởng phòng / Hiệu trưởng) trước khi tiếp tục.',
    'AI provider is not configured.': 'Máy chủ AI chưa được cấu hình.',
    'Deterministic parser result failed input validation.': 'Kết quả bóc tách không hợp lệ với sổ đăng ký.',
    'Deterministic parser returned an unknown policy.': 'Quy định không có trong sổ đăng ký.',
    'Candidate policy is not in the registry.': 'AI đề xuất một quy định không có trong sổ đăng ký.',
    'Issuer tier is not supported by request evidence.': 'AI nêu cấp ban hành nhưng không trích được căn cứ trong câu.',
    'AI extraction timed out.': 'AI hết thời gian chờ. Bạn có thể tiếp tục bằng kết quả phân tích tiếng Việt.',
    'Old-value evidence does not match the registered current value.': 'AI chưa xác nhận đúng giá trị hiện hành trong sổ đăng ký.'
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
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01"/>',
    law: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
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
    const kept = G.PolicyChangeImpactSvg.stateOf(p).key === 'kept';
    const re = Engine.valueRegex(change.oldValue);
    const fmt = (cls, transform) => {
      let html = '', cursor = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(p.line)) !== null) {
        if (!kept && !Engine.isStructuredNumericOccurrence(p.line, m.index, m[0])) {
          html += esc(p.line.slice(cursor, m.index)) + '<span class="' + cls + '">' + esc(transform(m[0])) + '</span>';
          cursor = m.index + m[0].length;
        }
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      return html + esc(p.line.slice(cursor));
    };
    return '<div class="diff" aria-label="So sánh trước và sau"><div><span class="ln">Trước</span><span>' + fmt('old', x => x) + '</span></div>' +
      '<div><span class="ln">Sau</span><span>' + fmt('new', x => Engine.renderValue(x, change.newValue)) + '</span></div>' +
      (kept ? '<p class="diff-note">Giữ nguyên nội dung theo quyết định của người duyệt.</p>' : '') + '</div>';
  }

  // ---------- Giải thích bằng lời thường ----------
  /** Bốn nhánh phân xử, viết cho người không đọc mã: máy làm gì, khi nào, ai quyết. */
  const KINDS = [
    { k: 'auto', badge: '✓', title: 'Tự sửa', who: 'Máy tự làm, sau khi prover đạt đủ 14 điều kiện',
      when: 'Dòng nói rõ đúng quy định này (có cụm từ chủ đề và cụm từ cho biết con số đo cái gì).',
      ex: '“Nộp đơn phúc khảo trong 7 ngày” → “trong 5 ngày”.' },
    { k: 'U1', badge: 'U1', title: 'Chưa rõ', who: 'Hỏi người phụ trách tài liệu',
      when: 'Có con số cũ nhưng không chắc nó thuộc quy định này, hoặc viết khác dạng (“một tuần”, gõ không dấu, “24TC”).',
      ex: '“Phòng thi lưu bài trong 7 ngày”: có phải hạn phúc khảo không?' },
    { k: 'U2', badge: 'U2', title: 'Quy định khác', who: 'Hỏi trưởng đơn vị sở hữu quy định kia',
      when: 'Dòng đang nói về một quy định khác, tình cờ có cùng giá trị.',
      ex: '“Đơn vị phải trả lời trong 7 ngày” thuộc quy trình tiếp nhận, không phải phúc khảo.' },
    { k: 'U3', badge: 'U3', title: 'Vượt cấp', who: 'Hỏi người đủ cấp của đơn vị ban hành',
      when: 'Văn bản do cấp cao hơn người ra thay đổi ban hành nên bị khoá, không tự sửa.',
      ex: 'Quy định cấp Trường chỉ Hiệu trưởng / Hội đồng Trường được sửa.' }
  ];
  function kindsGuide() {
    return '<div class="kinds">' + KINDS.map(x => '<div class="kind ' + x.k + '"><div class="kind-head"><span class="kind-badge" aria-hidden="true">' + esc(x.badge) + '</span>' +
      '<b>' + esc(x.k === 'auto' ? x.title : x.k + ' · ' + x.title) + '</b></div><div class="kind-who">' + esc(x.who) + '</div>' +
      '<div class="small">' + esc(x.when) + '</div><div class="xs muted">Ví dụ: ' + esc(x.ex) + '</div></div>').join('') + '</div>';
  }
  const GLOSSARY = [
    ['Neo chủ đề', 'Cụm từ cho biết dòng đang nói về việc gì (“phúc khảo”, “tạm ứng”).'],
    ['Neo đại lượng', 'Cụm từ cho biết con số đo cái gì (“nộp đơn”, “thời hạn”). Máy chỉ tự sửa khi dòng có đủ cả hai loại neo.'],
    ['Prover', 'Bộ kiểm độc lập 14 điều kiện trước mỗi lần máy tự sửa; thiếu một điều kiện là chặn.'],
    ['AI giữ lại', 'AI đọc lại các dòng máy định tự sửa. AI chỉ được giữ lại một dòng cho người xem, không bao giờ tự sửa thay người.'],
    ['Hồ sơ CR-n', 'Khi ban hành, phần chắc chắn được áp ngay; các câu hỏi còn lại thành một hồ sơ để đúng người trả lời trên máy của họ.'],
    ['Câu hỏi gộp', 'Cùng một câu chép ở nhiều nơi (website, chatbot, mẫu email) chỉ hỏi một lần; sổ vẫn ghi từng dòng.'],
    ['Sổ kiểm toán', 'Chỉ ghi thêm. Mỗi bản ghi băm SHA-256 nối với bản ghi trước; hoàn tác là một bản ghi mới.'],
    ['Tập mù', 'Bộ ca kiểm thử do người không xem mã viết, khoá bằng mã băm trước khi chạy, để số đo không bị “học tủ”.']
  ];
  function helpHtml() {
    return '<div class="help-head"><h2 id="helpTitle">Cách dùng PolicyChange OS</h2><button type="button" class="iconbtn" data-action="close-help" aria-label="Đóng hướng dẫn">×</button></div>' +
      '<ol class="howto">' +
        '<li><b>Mô tả thay đổi.</b> Gõ một câu như “Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.”</li>' +
        '<li><b>Xem tác động.</b> Máy tìm mọi dòng mang giá trị cũ và xếp mỗi dòng vào một trong bốn nhóm bên dưới.</li>' +
        '<li><b>Trả lời câu hỏi.</b> Mỗi chỗ không chắc là đúng một câu hỏi, hai lựa chọn A / B, cho đúng người có thẩm quyền. Đổi <b>Vai trò</b> ở thanh trên để thử với người khác.</li>' +
        '<li><b>Ban hành.</b> Phần chắc chắn được áp ngay và ghi sổ; mọi bản ghi hoàn tác được.</li>' +
      '</ol>' + kindsGuide() +
      '<h3>Thuật ngữ</h3><dl class="glossary">' + GLOSSARY.map(([t, d]) => '<div><dt>' + esc(t) + '</dt><dd>' + esc(d) + '</dd></div>').join('') + '</dl>' +
      '<p><a class="btn" href="#/huong-dan" data-action="close-help">Mở hướng dẫn đầy đủ, chữ lớn</a></p>';
  }

  // ---------- Màn hình: Hướng dẫn ----------
  // Phản hồi thử nghiệm P1 (14/10): giao diện nhiều chữ, một trưởng phòng lớn tuổi sẽ khó dùng. Màn hình này nói
  // bằng lời thường, mỗi bước một nút đưa tới đúng chỗ; kèm nút chữ lớn.
  const SAMPLE_REQUEST = 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.';
  const GUIDE_STEPS = [
    { title: 'Cho máy biết bạn là ai', you: 'Ở ô “Vai trò” trên cùng, chọn đúng chức vụ của bạn.',
      machine: 'Máy chỉ mở những nút thuộc thẩm quyền của bạn. Việc của người khác, máy chuyển cho họ.',
      act: () => btn('guide-persona', 'Chỉ cho tôi ô Vai trò', { cls: 'lg' }) },
    { title: 'Báo một thay đổi', you: 'Gõ một câu như khi nhắn tin: quy định nào đổi, đổi thành bao nhiêu, ai ban hành. Rồi bấm “Phân tích tác động”.',
      machine: 'Máy tìm mọi văn bản đang ghi giá trị cũ và cho bạn xem trước. Lúc này chưa sửa gì cả.',
      act: () => btn('guide-sample', 'Thử với câu mẫu', { cls: 'lg primary', busyKey: 'understand' }) },
    { title: 'Trả lời câu hỏi của máy', you: 'Chỗ nào máy không chắc, máy hỏi một câu với hai nút A và B. Bạn chỉ cần chọn một.',
      machine: 'Câu hỏi được gửi đúng người có thẩm quyền. Câu giống nhau ở nhiều nơi chỉ hỏi một lần.',
      act: () => '<a class="btn lg" href="#/hang-doi">Mở Hàng đợi duyệt</a>' },
    { title: 'Ban hành và xem lại', you: 'Bấm “Ban hành”. Muốn biết ai đã sửa gì, mở Sổ kiểm toán.',
      machine: 'Mọi lần sửa được ghi lại và không xoá được. Bấm nhầm thì bấm “Hoàn tác”.',
      act: () => '<a class="btn lg" href="#/so-kiem-toan">Mở Sổ kiểm toán</a>' }
  ];
  const GUIDE_TERMS = [
    ['Vai trò', 'Bạn đang thao tác với tư cách ai (chuyên viên, trưởng phòng, Hiệu trưởng).'],
    ['Cấp ban hành', 'Cấp 1 là chuyên viên, cấp 2 là trưởng phòng, cấp 3 là Hiệu trưởng. Cấp thấp không sửa được văn bản của cấp cao.'],
    ['Ban hành', 'Bấm để áp thay đổi thật vào văn bản. Trước khi bấm, mọi thứ chỉ là xem trước.'],
    ['Hàng đợi duyệt', 'Danh sách câu hỏi đang chờ người trả lời, xếp theo người cần trả lời.'],
    ['Sổ kiểm toán', 'Nhật ký ghi ai sửa gì, lúc nào. Chỉ ghi thêm, không xoá được.'],
    ['Hoàn tác', 'Trả một dòng về như cũ. Việc hoàn tác cũng được ghi vào sổ.'],
    ['Neo', 'Cụm từ giúp máy nhận ra dòng đang nói về quy định nào (ví dụ “phúc khảo”). Máy chỉ tự sửa khi thấy đủ neo.'],
    ['AI giữ lại', 'AI đọc lại các dòng máy định tự sửa. AI chỉ được giữ lại để người xem, không bao giờ tự sửa.'],
    ['Minh hoạ', 'Chạy thử trên bản sao tạm. Không ảnh hưởng dữ liệu thật.']
  ];
  const GUIDE_FAQ = [
    ['Máy có tự ý sửa sai không?', 'Máy chỉ tự sửa khi chắc chắn và đúng thẩm quyền. Chỗ nào không chắc, máy dừng lại hỏi người. Trên các bộ ca thử của nhóm (dữ liệu tự soạn), máy chưa tự sửa sai lần nào.'],
    ['Tôi bấm nhầm thì sao?', 'Vào Sổ kiểm toán, tìm dòng đó và bấm “Hoàn tác”. Người có đủ cấp mới hoàn tác được.'],
    ['Vì sao nút “Ban hành” bị mờ?', 'Vai trò đang chọn chưa đủ cấp cho thay đổi này. Lý do luôn được ghi ngay cạnh nút.'],
    ['Chữ nhỏ quá?', 'Bấm nút “Chữ lớn” ở đầu trang này hoặc nút Aa trên thanh trên cùng.']
  ];
  function viewGuide() {
    const big = largeText();
    return '<div class="page-head"><div><div class="eyebrow">Dành cho người mới</div><h1>Hướng dẫn từng bước</h1>' +
      '<p class="lead">Bốn bước, mỗi bước một nút đưa bạn tới đúng chỗ. Không cần đọc hết các màn hình khác.</p></div>' +
      '<div class="row">' + btn('toggle-size', big ? 'Chữ lớn: đang bật' : 'Bật chữ lớn', { cls: 'lg' + (big ? ' on' : ''), pressed: big }) + '</div></div>' +
      '<ol class="guide-steps">' + GUIDE_STEPS.map((g, i) => '<li class="gstep"><span class="gnum" aria-hidden="true">' + (i + 1) + '</span><div class="gbody">' +
        '<h2>' + esc(g.title) + '</h2><p><b>Bạn làm:</b> ' + esc(g.you) + '</p><p class="muted"><b>Máy làm:</b> ' + esc(g.machine) + '</p>' +
        '<div class="row">' + g.act() + '</div></div></li>').join('') + '</ol>' +
      '<section class="card"><div class="card-head"><h2>Bốn kết quả máy có thể đưa ra</h2><p>Mỗi dòng văn bản rơi vào đúng một nhóm.</p></div><div class="card-body">' + kindsGuide() + '</div></section>' +
      '<section class="card"><div class="card-head"><h2>Giải thích các khái niệm</h2></div><div class="card-body"><dl class="glossary big">' +
        GUIDE_TERMS.map(([t, d]) => '<div><dt>' + esc(t) + '</dt><dd>' + esc(d) + '</dd></div>').join('') + '</dl></div></section>' +
      '<section class="card"><div class="card-head"><h2>Câu hỏi thường gặp</h2></div><div class="card-body stack faq">' +
        GUIDE_FAQ.map(([q, a]) => '<details><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>').join('') + '</div></section>';
  }
  const SIZE_KEY = 'policychange-os:size';
  const largeText = () => document.documentElement.getAttribute('data-size') === 'lg';
  function setLargeText(on) {
    if (on) document.documentElement.setAttribute('data-size', 'lg'); else document.documentElement.removeAttribute('data-size');
    try { localStorage.setItem(SIZE_KEY, on ? 'lg' : ''); } catch (_) { /* bỏ qua */ }
  }
  /** Tiến trình một thay đổi trên màn hình Thay đổi quy định: 1 mô tả · 2 xem · 3 trả lời · 4 ban hành. */
  function stepper() {
    const cur = S.current;
    const at = !cur ? 1 : !cur.props.length ? 2 : pending().length ? 3 : unissuedCount() ? 4 : 5;
    const steps = ['Mô tả thay đổi', 'Xem tác động', 'Trả lời câu hỏi', 'Ban hành'];
    return '<ol class="stepper" aria-label="Tiến trình">' + steps.map((s, i) => {
      const n = i + 1, st = n < at ? 'done' : n === at ? 'current' : '';
      return '<li class="' + st + '"' + (st === 'current' ? ' aria-current="step"' : '') + '><span class="dot" aria-hidden="true">' + (st === 'done' ? '✓' : n) + '</span><span>' + esc(s) + '</span></li>';
    }).join('') + '</ol>';
  }
  /** Số thay đổi còn chờ bấm Ban hành: dòng áp được + quyết định “giữ nguyên” chưa ghi sổ. */
  function unissuedCount() {
    const cur = S.current;
    return cur ? app.committableCount() + cur.props.filter(p => p.decided && !p.accepted && !p.logged).length : 0;
  }
  /** Tóm tắt kết quả bằng một câu và danh sách “ai cần trả lời gì”. */
  function verdictHtml(cur) {
    const props = cur.props;
    if (!props.length) return '';
    const auto = props.filter(p => p.outcome === 'AUTO_PATCH' && !p.semanticHold && Workflow.isCommittable(S, p)).length;
    const toIssue = unissuedCount();
    const applied = props.filter(p => p.applied).length;
    const entries = queueEntries().filter(e => e.kind === 'local');
    /** @type {Map<string, {label:string, ok:boolean, cats:Set<string>, n:number}>} */ const who = new Map();
    for (const e of entries) {
      const req = e.right.requirement || (e.p.semanticHold ? null : Authz.requirementFor(e.p, cur.change, S.registry));
      const label = req ? req.label : 'Người rà soát bằng chứng AI';
      const w = who.get(label) || { label, ok: e.right.ok, cats: new Set(), n: 0 };
      w.n++; w.cats.add(e.p.semanticHold ? 'hold' : e.p.category); who.set(label, w);
    }
    const q = entries.length;
    const head = q ? (auto ? 'Máy tự sửa ' + nf.format(auto) + ' chỗ chắc chắn. ' : '') + 'Còn ' + nf.format(q) + ' câu hỏi cần người trả lời.'
      : toIssue ? 'Không cần hỏi ai thêm. ' + nf.format(toIssue) + ' thay đổi sẵn sàng ban hành.'
      : applied ? 'Đã ban hành ' + nf.format(applied) + ' thay đổi.' : 'Không còn việc nào cần làm ở phân tích này.';
    const sub = q ? 'Mỗi câu hỏi có hai lựa chọn A / B và chỉ người đúng thẩm quyền mới trả lời được.'
      : toIssue ? 'Bấm Ban hành ở cuối trang để áp dụng và ghi sổ.' : applied ? 'Xem bản ghi trong Sổ kiểm toán; mọi bản ghi đều hoàn tác được.' : '';
    return '<section class="verdict" aria-label="Tóm tắt kết quả"><div class="verdict-main"><span class="verdict-icon ' + (q ? 'ask' : 'ok') + '" aria-hidden="true">' + (q ? '?' : '✓') + '</span>' +
      '<div><b>' + esc(head) + '</b>' + (sub ? '<div class="small muted">' + esc(sub) + '</div>' : '') + '</div></div>' +
      (who.size ? '<ul class="who">' + [...who.values()].map(w => '<li><span class="row" style="gap:4px">' + [...w.cats].map(c => '<span class="tag ' + esc(c) + '">' + esc(c === 'hold' ? 'AI giữ lại' : c) + '</span>').join('') + '</span>' +
        '<span><b>' + esc(nf.format(w.n) + ' câu') + '</b> cho ' + esc(w.label) + '</span>' + (w.ok ? '<span class="you">bạn trả lời được</span>' : nudgeButtons(w.n, w.label, changeLabel(cur.change), true)) + '</li>').join('') + '</ul>' +
        ([...who.values()].some(w => !w.ok) ? nudgeNote() : '') : '') +
      '<div class="row">' + (entries.some(e => e.right.ok) ? '<a class="btn primary sm" href="#/hang-doi?tab=mine">Trả lời việc của tôi</a>' : '') +
      (applied ? '<a class="btn sm" href="#/so-kiem-toan">Xem sổ kiểm toán</a>' : '') + '</div></section>';
  }
  // ---------- Báo cho người cần trả lời (không tự gửi: người dùng tự dán hoặc tự bấm gửi email) ----------
  function queueLink() {
    const ws = S.source === 'remote' ? '?workspace=' + encodeURIComponent(S.workspace.id) : '';
    return location.origin + location.pathname + ws + '#/hang-doi';
  }
  /** @param {number} n @param {string} label @param {string} what */
  function nudgeText(n, label, what) {
    return 'Chào anh/chị, PolicyChange OS đang có ' + n + ' câu hỏi cần ' + label + ' trả lời về thay đổi ' + what +
      '. Mỗi câu chỉ cần chọn A hoặc B, khoảng một phút: ' + queueLink() + ' (vào mục Hàng đợi duyệt → Việc của tôi).';
  }
  /** @param {number} n @param {string} label @param {string} what @param {boolean} [local] câu hỏi của phân tích chưa ban hành */
  function nudgeButtons(n, label, what, local) {
    // Dùng chung: câu hỏi của phân tích chưa ban hành chỉ nằm trên máy này; người nhận chưa thấy gì cho tới khi Ban hành.
    if (local && S.source === 'remote') return '<span class="nudge xs muted">Bấm Ban hành trước để câu hỏi thành hồ sơ dùng chung, rồi mới báo.</span>';
    const text = nudgeText(n, label, what);
    return '<span class="nudge">' + btn('copy-nudge', 'Sao chép lời nhắn', { cls: 'sm', data: { text } }) +
      '<a class="btn sm ghost" href="mailto:?subject=' + encodeURIComponent('[PolicyChange OS] ' + n + ' câu hỏi chờ ' + label) + '&amp;body=' + encodeURIComponent(text) + '">Soạn email</a></span>';
  }
  function nudgeNote() {
    return S.source === 'remote' ? '' : '<div class="xs muted">' + esc(S.source === 'sandbox' ? 'Đang ở chế độ minh hoạ: lời nhắn chỉ để xem thử.'
      : 'Đang ngoại tuyến: câu hỏi chỉ nằm trên máy này. Chuyển sang Dùng chung để người nhận mở được câu hỏi trên máy của họ.') + '</div>';
  }
  const changeLabel = (/** @type {any} */ c) => c.rule.id + ' “' + c.oldValue + '” → “' + c.newValue + '”';
  async function copyText(/** @type {string} */ text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* thử cách cũ */ }
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (_) { return false; }
  }

  /** Thứ tự hiển thị: việc cần người trước, rồi dòng tự sửa, rồi dòng đã xong. */
  function propRank(p) {
    if (p.applied || p.logged) return 4;
    if ((p.outcome === 'ESCALATE' && !p.decided && !p.inCase) || (p.semanticHold && !p.semanticHoldReviewed)) return 0;
    if (p.outcome === 'ESCALATE' || p.semanticHold) return 1;
    return 2;
  }

  function btn(action, label, opts) {
    const o = opts || {};
    const busy = ui.busy === (o.busyKey || action);
    const attrs = Object.entries(o.data || {}).map(([k, v]) => ' data-' + k + '="' + esc(v) + '"').join('');
    return '<button type="button" class="btn ' + (o.cls || '') + '" data-action="' + esc(action) + '"' + attrs +
      (o.disabled || busy ? ' disabled' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + (o.pressed !== undefined ? ' aria-pressed="' + (o.pressed ? 'true' : 'false') + '"' : '') + '>' +
      (busy ? '<span class="spin" aria-hidden="true"></span>' : (o.icon ? icon(o.icon, 16) : '')) + '<span>' + esc(busy && o.busyLabel ? o.busyLabel : label) + '</span></button>';
  }

  function pending() {
    if (!S.current) return [];
    return S.current.props.filter(p => !p.inCase && !p.applied && !p.logged && ((p.outcome === 'ESCALATE' && !p.decided) || (p.semanticHold && !p.semanticHoldReviewed)));
  }
  function hasUnissuedHumanWork() {
    return !!S.current && S.current.props.some(p => !p.applied && !p.logged && (p.decided || p.semanticHoldReviewed));
  }
  /** Minh hoạ ghi đè biểu mẫu; lưu lại để khi thoát minh hoạ biểu mẫu khớp lại với phân tích được khôi phục. */
  function enterDemo(scenario) {
    if (S.source !== 'sandbox') ui.savedForm = { form: { ...ui.form }, understanding: ui.understanding, ratify: ui.ratify };
    ui.shownAt = {};
    app.enterSandbox(scenario);
  }
  /** Biểu mẫu khớp phân tích VÀ câu yêu cầu gần nhất không bị từ chối / cần làm rõ. */
  function formStillMatches() {
    const u = ui.understanding;
    return app.matchesInput(formInput()) && !(u && (u.status === 'refusal' || u.status === 'clarification'));
  }
  function liveWorkspace() { return S.source === 'remote' && S.workspace.mode === 'live'; }
  function formInput() { return { ruleId: ui.form.ruleId, newValue: ui.form.newValue, issuerTier: ui.form.issuerTier, requestText: ui.form.text }; }
  function mine(list) { return list.filter(p => app.decisionRight(p).ok); }
  /** Mọi việc đang chờ: của phân tích đang mở trên máy này + hồ sơ dùng chung trên máy chủ. */
  function queueEntries() {
    const Grouping = G.PolicyChangeGrouping;
    const local = Grouping.groupItems(pending(), p => p.semanticHold ? null : app.groupKeyOf(p))
      .map(members => ({ kind: 'local', p: members[0], right: app.decisionRight(members[0]), members }));
    const cases = Grouping.groupItems(app.caseItems().map((item, idx) => ({ item, idx })), e => app.caseGroupKeyOf(e.item))
      .map(members => ({ kind: 'case', p: members[0].item.p, item: members[0].item, idx: members[0].idx, right: app.caseRight(members[0].item), members }));
    return local.concat(cases);
  }
  /** Nhóm câu hỏi trùng của phân tích đang mở: id đề xuất → danh sách đề xuất cùng câu hỏi. */
  function localGroups() {
    /** @type {Map<string, any[]>} */ const map = new Map();
    for (const e of queueEntries()) if (e.kind === 'local' && e.members.length > 1) for (const m of e.members) map.set(m.id, e.members);
    return map;
  }
  const questionKey = (p, o) => o && o.caseIdx !== undefined ? 'case:' + (o.caseId || '') + ':' + p.docId + ':' + p.lineIndex + ':' + p.line
    : 'local:' + (S.current ? S.current.analysisId : 0) + ':' + p.id;
  /** Số câu hỏi sau khi gộp, cho một danh sách đề xuất của phân tích hiện tại. */
  const questionsOf = list => G.PolicyChangeGrouping.groupItems(list, p => p.semanticHold ? null : app.groupKeyOf(p)).length;
  const caseRef = item => JSON.stringify({ changeId: item.oc.id, docId: item.p.docId, lineIndex: item.p.lineIndex, line: item.p.line });
  /** Lần đầu câu hỏi có nút trả lời hiện trên màn hình (để đo thời gian quyết định). */
  function markShown(key) { if (!ui.shownAt[key]) ui.shownAt[key] = Date.now(); }
  function timeDecision(key, category, positions, docId) {
    const t0 = ui.shownAt[key];
    if (t0) app.recordTiming({ category, ms: Date.now() - t0, positions, docId });
    delete ui.shownAt[key];
  }

  // ---------- Định tuyến ----------
  const ROUTES = [
    { id: 'huong-dan', label: 'Hướng dẫn', icon: 'help', title: 'Hướng dẫn từng bước', view: viewGuide },
    { id: 'tong-quan', label: 'Tổng quan', icon: 'home', title: 'Tổng quan', view: viewOverview },
    { id: 'thay-doi', label: 'Thay đổi quy định', icon: 'change', title: 'Thay đổi quy định', view: viewChange },
    { id: 'hang-doi', label: 'Hàng đợi duyệt', icon: 'queue', title: 'Hàng đợi duyệt', view: viewQueue, count: () => queueEntries().filter(e => e.right.ok).length, hot: true },
    { id: 'so-kiem-toan', label: 'Sổ kiểm toán', icon: 'ledger', title: 'Sổ kiểm toán', view: viewLedger, count: () => S.ledger.length },
    { id: 'kho-tai-lieu', label: 'Kho tài liệu', icon: 'docs', title: 'Kho tài liệu', view: viewDocs, count: () => S.docs.length },
    { id: 'phap-ly', label: 'Căn cứ pháp lý', icon: 'law', title: 'Căn cứ pháp lý và hiệu lực', view: viewLegal },
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
      esc(S.ai.status === 'ready' ? 'AI · ' + (S.ai.model || 'Gemini') : S.ai.status === 'checking' ? 'AI · đang kiểm tra…' : 'AI · tắt (tiền định)') + '</span>';
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
      return (i === 5 ? '<div class="nav-label">Dữ liệu &amp; chất lượng</div>' : '') +
        '<a href="#/' + r.id + '"' + (ui.route === r.id ? ' aria-current="page"' : '') + '>' + icon(r.icon) + '<span>' + esc(r.label) + '</span>' +
        (c !== '' && c !== 0 ? '<span class="count' + (r.hot ? ' hot' : '') + '">' + esc(c) + '</span>' : '') + '</a>';
    }).join('');

    const side = $('#sideCard');
    const session = remote && remote.session;
    side.innerHTML =
      '<div><b>Nguồn dữ liệu</b><div class="xs muted">' + esc(src === 'remote' ? 'Máy chủ Supabase: nhiều người dùng chung, ghi qua máy chủ kiểm quyền.' : src === 'sandbox' ? 'Bản sao tạm cho kịch bản minh hoạ; không lưu.' : 'IndexedDB trên trình duyệt này; tải lại trang vẫn còn.') + '</div></div>' +
      (src === 'sandbox' ? btn('exit-sandbox', 'Thoát minh hoạ', { cls: 'sm primary' }) :
        '<div class="row">' + (remote && app.state.source !== 'remote' ? btn('go-online', 'Dùng chung', { cls: 'sm' }) : '') +
        (src === 'remote' ? btn('go-offline', 'Làm ngoại tuyến', { cls: 'sm' }) : '') + '</div>') +
      (remote ? (session ? '<div class="xs">Đăng nhập: <b class="account-email" title="' + esc(session.email) + '">' + esc(session.email) + '</b></div><div class="row">' +
          (S.workspace.id !== 'hcmut-pilot' ? btn('open-pilot', 'Mở workspace thí điểm', { cls: 'sm' }) : btn('open-demo', 'Về workspace trình diễn', { cls: 'sm' })) +
          btn('sign-out', 'Đăng xuất', { cls: 'sm ghost' }) + '</div>'
        : btn('open-login', 'Đăng nhập (thí điểm)', { cls: 'sm ghost' })) : '') +
      (src !== 'sandbox' && (src === 'local' || S.workspace.mode === 'demo') ? btn('reset', 'Khôi phục dữ liệu mẫu', { cls: 'sm danger' }) : '') +
      btn('open-help', 'Hướng dẫn & thuật ngữ', { cls: 'sm ghost', icon: 'help' }) +
      '<a class="btn sm ghost" href="./thu-nghiem.html" target="_blank" rel="noopener">Phiếu góp ý dùng thử</a>';

    const sizeBtn = $('#sizeBtn');
    if (sizeBtn) { sizeBtn.setAttribute('aria-pressed', String(largeText())); sizeBtn.title = largeText() ? 'Tắt chữ lớn' : 'Bật chữ lớn'; }
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
    const expandedMap = main.querySelector('#impactMap[open]');
    main.innerHTML = '<div class="page">' + route.view() + '</div>';
    if (expandedMap) { const map = main.querySelector('#impactMap'); if (map) map.setAttribute('open', ''); }
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
      // Hai tập mù, đo lại ngay trên trình duyệt bằng đúng động cơ đang chạy (không phải số chép tay).
      ui.overviewEval = [['Tập mù số 1', G.PolicyChangeBlindCsv], ['Tập mù số 2', G.PolicyChangeBlind2Csv]].filter(([, csv]) => csv)
        .map(([name, csv]) => ({ name, r: Evaluation.evaluate(Evaluation.parseCsv(csv).cases, { registry: Data.SEED_REGISTRY }) }));
    }
    const evs = ui.overviewEval;
    const recent = S.ledger.slice(-6).reverse();
    return '' +
      '<div class="guide-cta"><div class="grow"><b>Lần đầu dùng?</b> Xem 4 bước hướng dẫn bằng lời thường, có nút bật chữ lớn.</div><a class="btn primary lg" href="#/huong-dan">' + icon('help', 18) + '<span>Xem hướng dẫn</span></a></div>' +
      '<section class="hero" aria-labelledby="heroTitle"><div>' +
        '<div class="eyebrow">MLAI Hackathon 2026 · Đề A · Escalation Referee</div>' +
        '<h1 id="heroTitle">Quy định đổi một chỗ, mọi văn bản nhắc lại nó được cập nhật đúng chỗ, đúng thẩm quyền.</h1>' +
        '<p>Khi một quy định đổi, PolicyChange OS tìm mọi văn bản đang nhắc lại nó (quy trình, biểu mẫu, hỏi đáp, chatbot, mẫu email), <b>tự sửa chỗ chắc chắn</b> và <b>hỏi đúng người ở chỗ không chắc</b>. Mọi thay đổi có bằng chứng, có tên người chịu trách nhiệm và hoàn tác được.</p>' +
        '<div class="row"><a class="btn primary" href="#/thay-doi">' + icon('change', 16) + '<span>Tạo thay đổi</span></a>' +
        btn('demo-safe', 'Xem minh hoạ 3 phút', { icon: 'spark' }) + '<a class="btn ghost" href="#/huong-dan">' + icon('help', 16) + '<span>Hướng dẫn từng bước</span></a>' + '</div>' +
      '</div><div class="hero-status small" aria-label="Trạng thái">' +
        '<div class="row"><span class="muted">Dữ liệu</span><b>' + esc(S.source === 'remote' ? 'Dùng chung · ' + S.workspace.name : S.source === 'sandbox' ? 'Minh hoạ' : 'Trên máy này') + '</b></div>' +
        '<div class="row"><span class="muted">AI</span><b>' + esc(S.ai.status === 'ready' ? 'Bật · ' + (S.ai.model || 'Gemini') : 'Tắt, dùng động cơ tiền định') + '</b></div>' +
        '<div class="row"><span class="muted">Vai trò</span><b>' + esc(m ? m.displayName + ' · cấp ' + m.tier : 'Chưa xác định') + '</b></div>' +
        '<div class="row"><span class="muted">Sổ kiểm toán</span>' + (chainOk ? '<span class="tag auto">✓ Chuỗi SHA-256 hợp lệ</span>' : '<span class="tag U3">✗ Chuỗi hỏng</span>') + '</div>' +
      '</div></section>' +
      '<div class="grid g4">' +
        stat('', nf.format(S.docs.length), 'Tài liệu có kiểm soát', nf.format(lines) + ' dòng điều khoản') +
        stat('', nf.format(S.registry.length), 'Quy định trong sổ đăng ký', 'mỗi quy định có cụm từ neo riêng') +
        stat(pend.length ? 'U3' : '', nf.format(pend.filter(e => e.right.ok).length) + ' / ' + nf.format(pend.length), 'Câu hỏi chờ bạn trả lời', 'trên tổng số câu hỏi đang chờ (câu trùng đã gộp)') +
        stat('', nf.format(S.ledger.length), 'Bản ghi kiểm toán', chainOk ? 'toàn vẹn, chỉ ghi thêm' : 'phát hiện chỉnh sửa trái phép') +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>Máy làm gì, khi nào thì hỏi người?</h2><p>Mỗi dòng mang giá trị cũ rơi vào đúng một trong bốn nhóm.</p></div><div class="card-body">' + kindsGuide() + '</div></section>' +
      '<section class="card"><div class="card-head"><h2>Luồng xử lý một thay đổi</h2><p>Động cơ tiền định là nơi duy nhất quyết định tự sửa hay chuyển người; AI chỉ đưa bằng chứng và chỉ có thể làm kết quả thận trọng hơn.</p></div>' +
        '<div class="card-body"><div class="pipeline">' +
        step('Hiểu yêu cầu', 'AI (Gemini) hoặc bộ phân tích tiếng Việt bóc tách: quy định nào, giá trị cũ → mới, cấp ban hành.') +
        step('Tìm vị trí', 'Quét toàn bộ kho, nhận mọi cách viết: 10 triệu = 10.000.000 = 10tr; “một tuần”, không dấu.') +
        step('Phân xử', 'Xếp mỗi dòng vào Tự sửa hoặc U1 / U2 / U3; mỗi chỗ cần người là đúng một câu hỏi, hai lựa chọn.') +
        step('Chứng minh', 'Prover kiểm 14 điều kiện trước khi cho tự sửa (có neo chủ đề + neo đại lượng); thiếu một là chặn.') +
        step('Người duyệt', 'Chỉ người đúng cấp và đúng đơn vị phụ trách mới bấm được.') +
        step('Ban hành & kiểm toán', 'Ghi sổ băm SHA-256; hoàn tác thêm bản ghi mới, không xoá vết.') +
      '</div></div></section>' +
      '<div class="split">' +
        '<section class="card"><div class="card-head"><h2>Minh hoạ có hướng dẫn</h2><span class="tag neutral">chạy trên bản sao tạm</span></div><div class="card-body stack">' +
          '<p class="small muted">Năm kịch bản ngắn cho buổi trình bày. Kịch bản chạy trong chế độ Minh hoạ, không ghi vào dữ liệu dùng chung.</p>' +
          '<div class="stack">' +
          demoRow('demo-safe', '1 · Tự sửa an toàn', 'Hạn phúc khảo 7 → 5 ngày; ngày “17/07/2025” trong cùng dòng không bị đụng tới. Prover xác nhận rồi ban hành, có thể hoàn tác.') +
          demoRow('demo-review', '2 · AI giữ lại cho người duyệt', 'Động cơ nói tự sửa được, nhưng bằng chứng ngữ nghĩa “có thể liên quan” → giữ lại chờ người. (Dữ liệu AI mẫu, ghi rõ là mock.)') +
          demoRow('demo-refuse', '3 · Từ chối yêu cầu mơ hồ', '“Đổi tất cả các thời hạn 7 ngày thành 5 ngày” → từ chối trước khi phân tích; kho và sổ không đổi.') +
          demoRow('demo-group', '4 · Một câu, nhiều nơi', 'Cùng một câu FAQ chép lên website, chatbot và mẫu email → 3 vị trí cần hỏi nhưng chỉ 1 câu hỏi; trả lời một lần áp cho cả ba.') +
          demoRow('demo-learn', '5 · Máy học từ câu trả lời', 'Hai dòng viết “phúc tra” (máy chưa biết là phúc khảo) → hỏi người, trả lời “Có” → hệ thống đề xuất neo, trưởng phòng duyệt → email mới viết “phúc tra” được tự sửa, không hỏi lại.') +
          '</div>' + (ui.demoStatus ? '<div class="notice ' + esc(ui.demoStatus.tone) + '" role="status"><div class="grow small">' + esc(ui.demoStatus.text) + '</div></div>' : '') +
        '</div></section>' +
        '<section class="card"><div class="card-head"><h2>Độ chính xác trên tập mù</h2><a class="btn sm ghost" href="#/danh-gia">Chi tiết</a></div><div class="card-body stack">' +
          '<p class="small muted">Ca kiểm thử do người không xem mã viết, khoá bằng mã băm trước khi chạy. Số dưới đây được tính lại ngay trên trình duyệt này, chỉ bằng động cơ tiền định (chưa bật AI).</p>' +
          '<div class="tablewrap"><table class="mini"><thead><tr><th scope="col">Tập</th><th scope="col" class="r">Tự sửa sai</th><th scope="col" class="r">Bỏ sót</th><th scope="col" class="r">Báo lên thừa</th></tr></thead><tbody>' +
          evs.map(({ name, r }) => '<tr><th scope="row">' + esc(name) + '<div class="xs muted">' + esc(nf.format(r.total) + ' ca') + '</div></th>' +
            '<td class="r num"><b class="' + (r.wrongEdits ? 'bad' : 'good') + '">' + esc(nf.format(r.wrongEdits || 0)) + '</b> / ' + esc(nf.format(r.autoActions || 0)) + '</td>' +
            '<td class="r num"><b class="' + (r.misses ? 'bad' : 'good') + '">' + esc(nf.format(r.misses || 0)) + '</b> / ' + esc(nf.format(r.expectedEscalate || 0)) + '</td>' +
            '<td class="r num">' + esc(pct(r.overEscalationRate)) + '</td></tr>').join('') +
          '</tbody></table></div>' +
          '<p class="xs muted"><b>Tự sửa sai</b> và <b>bỏ sót</b> là hai lỗi nguy hiểm (máy quyết thay người)' + (evs.every(({ r }) => !r.wrongEdits && !r.misses) ? '; cả hai đều bằng 0 trên mọi tập' : '') + '. <b>Báo lên thừa</b> chỉ tốn thời gian người duyệt; học neo từ câu trả lời và lớp AI kéo con số này xuống dần.</p>' +
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
      '<div class="page-head"><div><div class="eyebrow">Bước 1</div><h1>Thay đổi quy định</h1><p>Mô tả thay đổi bằng một câu tiếng Việt, hoặc chọn trực tiếp. Hệ thống xem trước tác động lên toàn bộ kho, chưa sửa gì cho tới khi bạn bấm Ban hành.</p></div></div>' +
      stepper() +
      '<section class="card request-card"><div class="card-head"><h2>Nội dung thay đổi</h2><span class="xs muted">Chỉ xem trước, chưa sửa tài liệu</span></div><div class="card-body stack">' +
        '<label class="field" for="reqText">Câu mô tả thay đổi <span class="hint">Gõ một câu như khi nhắn tin, rồi bấm “Phân tích tác động”. Máy tự đọc câu và điền các ô bên dưới.</span></label>' +
        '<textarea id="reqText" name="requestText" data-bind="form.text" placeholder="Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành…">' + esc(f.text) + '</textarea>' +
        '<div class="row">' + btn('understand', S.ai.status === 'ready' ? 'Hiểu yêu cầu bằng AI' : 'Hiểu yêu cầu', { icon: 'spark' }) +
          '<span class="xs muted">' + esc(S.ai.status === 'ready' ? 'Mô hình AI chỉ được trả trích dẫn nguyên văn; kết quả được kiểm lại với sổ đăng ký.' : 'AI đang tắt, dùng bộ phân tích tiếng Việt tiền định.') + '</span></div>' +
        understandingBox() +
        '<div class="hr"></div>' +
        '<div class="grid request-fields">' +
          '<label class="field" for="ruleSel">Quy định<select id="ruleSel" name="ruleId" data-bind="form.ruleId">' +
            S.registry.map(r => '<option value="' + esc(r.id) + '"' + (r.id === f.ruleId ? ' selected' : '') + '>' + esc(r.id + ': ' + r.name) + '</option>').join('') + '</select></label>' +
          '<label class="field" for="oldVal">Giá trị hiện hành<input id="oldVal" type="text" readonly value="' + esc(rule ? rule.value : '') + '"></label>' +
          '<label class="field" for="newVal">Giá trị mới<input id="newVal" name="newValue" type="text" autocomplete="off" inputmode="text" spellcheck="false" data-bind="form.newValue" placeholder="ví dụ: 5 ngày…" value="' + esc(f.newValue) + '"></label>' +
          '<label class="field" for="tierSel">Cấp ban hành<select id="tierSel" name="issuerTier" data-bind="form.issuerTier"><option value=""' + (f.issuerTier ? '' : ' selected') + ' disabled>Chọn cấp…</option>' +
            [1, 2, 3].map(t => '<option value="' + t + '"' + (String(t) === String(f.issuerTier) ? ' selected' : '') + '>' + esc(t + ' · ' + Engine.TIER_APPROVER[t]) + '</option>').join('') + '</select></label>' +
        '</div>' +
        (rule ? '<p class="xs muted">' + esc(rule.id + ' do ' + rule.owner + ' quản lý · ' + tierLabel(rule.tier) + ' · ' + rule.source) + '</p>' : '') +
        (!issue.ok ? '<div class="notice warn">' + icon('lock', 16) + '<div class="grow small">' + esc(issue.reason) + ' Bạn vẫn xem trước được tác động, nhưng chỉ người đủ thẩm quyền mới ban hành.</div></div>' : '') +
        '<div class="row">' + btn('analyze', 'Phân tích tác động', { cls: 'primary', busyKey: 'understand', busyLabel: 'Đang đọc yêu cầu…' }) + (S.current ? btn('clear-analysis', 'Xoá kết quả', { cls: 'ghost', disabled: !!ui.busy }) : '') + '</div>' +
        (ui.busy === 'understand' ? '<p class="small muted" role="status">Đang đọc câu mô tả và đối chiếu quy định. Kết quả sẽ hiện ngay bên dưới.</p>' : '') +
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
      const unit = r.unitBorrowed ? '<div class="xs"><b>Lưu ý:</b> câu chỉ ghi đơn vị một lần, hệ thống hiểu giá trị cũ là “' + esc(c.oldValue) + '”. Kiểm tra lại trước khi phân tích.</div>' : '';
      return '<div class="notice ok"><div class="grow small stack" style="gap:4px"><div class="row">' + how + '<b>' + esc(c.ruleId + (rule ? ': ' + rule.name : '')) + '</b></div>' +
        '<div>' + esc(c.oldValue) + ' → <b>' + esc(c.newValue) + '</b> · cấp ban hành ' + esc(c.issuerTier) + ' (' + esc(Engine.TIER_APPROVER[c.issuerTier]) + ')</div>' + quotes + why + unit +
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
    const needsAnswer = new Set(pending().map(p => p.id));
    const shown = props.filter(p => filter === 'all' ? true : filter === 'auto' ? p.outcome === 'AUTO_PATCH' && !p.semanticHold : needsAnswer.has(p.id))
      .map((p, i) => ({ p, i })).sort((x, y) => propRank(x.p) - propRank(y.p) || x.i - y.i).map(x => x.p);
    const sem = cur.semanticStatus;
    const groups = localGroups();
    const openEsc = props.filter(p => p.outcome === 'ESCALATE' && !p.decided && !p.applied && !p.logged && !p.inCase);
    const qc = { positions: openEsc.length, questions: questionsOf(openEsc) };
    return '<div class="page-head"><div><div class="eyebrow">Bước 2</div><h2>Kết quả phân xử · ' + esc(cur.change.rule.id) + ' ' + esc(cur.change.oldValue) + ' → ' + esc(cur.change.newValue) + '</h2>' +
      '<p>' + esc('Quét ' + S.docs.length + ' tài liệu trong ' + (cur.elapsedMs || 0) + ' ms.' + (qc.questions < qc.positions ? ' ' + qc.positions + ' vị trí cần người được gộp còn ' + qc.questions + ' câu hỏi (cùng một câu ở nhiều nơi).' : '')) + '</p></div>' +
      '<div class="row">' + btn('semantic', S.ai.status === 'ready' ? 'Rà soát ngữ nghĩa bằng AI' : 'Rà soát ngữ nghĩa (AI đang tắt)', { icon: 'spark', disabled: sem === 'pending' }) + '</div></div>' +
      verdictHtml(cur) +
      '<details class="kinds-help"><summary>U1 / U2 / U3 nghĩa là gì?</summary>' + kindsGuide() + '</details>' +
      (sem ? '<div class="notice ' + (sem === 'complete' ? 'info' : '') + ' small" role="status">' + esc(semanticLabel(cur)) + '</div>' : '') +
      '<div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
        stat('', nf.format(props.length), 'Vị trí bị ảnh hưởng', 'mang giá trị “' + cur.change.oldValue + '”') +
        stat('auto', nf.format(count(p => p.outcome === 'AUTO_PATCH' && !p.semanticHold)), 'Tự sửa', 'có neo, đúng thẩm quyền') +
        stat('U1', nf.format(count(p => p.category === 'U1')), 'U1 · chưa rõ', 'hỏi người phụ trách tài liệu') +
        stat('U2', nf.format(count(p => p.category === 'U2')), 'U2 · quy định khác', 'hỏi trưởng đơn vị kia') +
        stat('U3', nf.format(count(p => p.category === 'U3')), 'U3 · vượt cấp', 'hỏi cấp ban hành văn bản') +
        (count(p => p.semanticHold) ? stat('hold', nf.format(count(p => p.semanticHold)), 'AI giữ lại', 'chờ người rà soát') : '') +
      '</div>' +
      (props.length ? '<details class="card impact-map" id="impactMap"><summary>Đồ thị tác động <span class="xs muted">' + props.length + ' vị trí trong ' + new Set(props.map(p => p.docId)).size + ' tài liệu</span></summary><div class="card-body"><div class="legend" aria-hidden="true">' +
        [['var(--auto)', 'Tự sửa'], ['var(--u1)', 'U1'], ['var(--u2)', 'U2'], ['var(--u3)', 'U3'], ['var(--hold)', 'AI giữ lại'], ['var(--brand)', 'Đã ban hành'], ['var(--muted)', 'Giữ nguyên']]
          .map(([c, l]) => '<span><i style="background:' + c + '"></i>' + l + '</span>').join('') + '</div>' +
        '<div class="graph graph-wrap">' + G.PolicyChangeImpactSvg.render(cur) + '</div></div></details>' : '') +
      (props.length ? '<div class="row" style="justify-content:space-between"><div class="filters" role="group" aria-label="Lọc vị trí">' +
        [['all', 'Tất cả ' + props.length], ['human', 'Cần người · ' + needsAnswer.size], ['auto', 'Tự sửa · ' + count(p => p.outcome === 'AUTO_PATCH' && !p.semanticHold)]].map(([k, l]) => '<button type="button" data-action="filter-loc" data-value="' + k + '" aria-pressed="' + (filter === k) + '">' + esc(l) + '</button>').join('') +
        '</div><a class="btn sm ghost" href="#/hang-doi">Mở hàng đợi duyệt →</a></div>' : '') +
      '<div class="stack">' + (shown.map(p => { const g = groups.get(p.id); return propCard(p, true, g ? (g[0].id === p.id ? { members: g } : { follower: g[0] }) : {}); }).join('') || (props.length ? '<div class="empty">Không có vị trí nào trong bộ lọc này.</div>' : '<div class="empty"><b>Không có vị trí nào cần sửa</b>Giá trị “' + esc(cur.change.oldValue) + '” không xuất hiện trong kho.</div>')) + '</div>' +
      commitBar();
  }

  function semanticLabel(cur) {
    const holds = cur.props.filter(p => p.semanticHold).length;
    const src = cur.semanticSource === 'fixture_mock' ? 'Bằng chứng mẫu (mock, không phải mô hình thật): ' : cur.semanticSource === 'openai' ? 'AI · ' + (S.ai.model || 'mô hình') + ': ' : '';
    const m = { pending: 'AI đang rà soát các đề xuất. Bạn có thể đọc tài liệu và trả lời câu hỏi trong lúc chờ; ban hành sẽ mở sau khi rà soát kết thúc.',
      complete: src + 'đã rà ' + cur.props.length + ' vị trí; ' + holds + ' vị trí được giữ lại cho người duyệt.',
      unavailable: 'AI ngữ nghĩa không khả dụng; giữ nguyên kết quả động cơ tiền định.', timeout: 'AI hết thời gian chờ; giữ nguyên kết quả tiền định.',
      provider_failure: 'AI gặp lỗi; giữ nguyên kết quả tiền định.', rejected: 'Bằng chứng AI không qua bộ kiểm tra; giữ nguyên kết quả tiền định.', no_candidates: 'Không có vị trí để rà soát.' };
    return m[cur.semanticStatus] || '';
  }

  const tdata = t => ({ tkey: t.key, tcat: t.cat, tn: t.n, tdoc: t.doc });
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
        : 'đang chặn: ' + esc((proof.reasons || []).slice(0, 2).join(' '))) + '</div>';
    }
    const evidence = Array.isArray(p.semanticEvidence) ? p.semanticEvidence.map(e => '<div class="evidence"><b>' + esc(cur.semanticSource === 'fixture_mock' ? 'Bằng chứng mẫu (mock)' : 'AI') + ' · ' +
      esc({ supports: 'đúng quy định này', possibly_related: 'có thể liên quan', unrelated: 'nói về việc khác', uncertain: 'chưa đủ căn cứ' }[e.relation] || e.relation) + ':</b> “' + esc(e.quote) + '”. ' + esc(e.explanation) + '</div>').join('') : '';
    let action = '';
    if (withActions && !p.applied && !p.logged && p.inCase) {
      action = '<div class="small muted">Đã chuyển vào hồ sơ dùng chung <b>' + esc(p.inCase) + '</b>; người có thẩm quyền quyết trong Hàng đợi duyệt.</div>';
    } else if (withActions && !p.applied && !p.logged) {
      const right = o.right || app.decisionRight(p);
      if (p.outcome === 'ESCALATE' && !p.decided && o.follower) {
        action = '<div class="small muted">Cùng một câu hỏi với ' + btn('scroll-prop', o.follower.docId + ' dòng ' + (o.follower.lineIndex + 1), { cls: 'sm ghost', data: { target: 'prop-' + o.follower.id } }) + '. Trả lời ở đó một lần là áp cho cả vị trí này.</div>';
      } else if (p.outcome === 'ESCALATE' && !p.decided) {
        const q = Engine.escalationQuestion(p, change, S.registry);
        const members = o.members && o.members.length > 1 ? o.members : null;
        const key = questionKey(p, o);
        const timing = { key, cat: p.category, n: members ? members.length : 1, doc: p.docId };
        const choice = (act, label) => caseItem
          ? (members ? btn('decide-case-group', label, { data: { refs: '[' + members.map(m => caseRef(m.item)).join(',') + ']', idx: o.caseIdx, act, ...tdata(timing) }, busyKey: 'case-' + o.caseIdx })
            : btn('decide-case', label, { data: { ref: caseRef(o.caseItem), idx: o.caseIdx, act, ...tdata(timing) }, busyKey: 'case-' + o.caseIdx }))
          : (members ? btn('decide-group', label, { data: { ids: members.map(m => m.id).join(','), act, ...tdata(timing) } })
            : btn('decide', label, { data: { p: p.id, act, ...tdata(timing) } }));
        if (right.ok) markShown(key);
        const where = members ? '<div class="group-note"><b>Câu này xuất hiện ở ' + members.length + ' vị trí</b>. Trả lời một lần là áp cho tất cả: ' +
          members.map(m => { const mp = m.item ? m.item.p : m; return esc(mp.docId + ' dòng ' + (mp.lineIndex + 1)); }).join(' · ') + '</div>' : '';
        const req = right.requirement;
        action = '<div class="plain"><b>Vì sao phải hỏi:</b> ' + esc(p.plain) + '</div>' +
          '<div class="question"><div class="q-label">Câu hỏi · chọn A hoặc B</div>' + esc(q.q) + '</div>' + where +
          (req && right.ok ? '<div class="decider ok">✓ Bạn có quyền trả lời câu này (' + esc(req.label) + ')</div>' : '') +
          (right.ok ? '<div class="choices">' + choice('a', 'A · ' + q.a) + choice('b', 'B · ' + q.b) + '</div>'
            : '<div class="lock">' + icon('lock', 16) + '<span>' + esc(right.reason) + (!liveWorkspace() ? ' Đổi vai trò ở thanh trên để thử.' : caseItem ? ' Người có thẩm quyền quyết hồ sơ này trên máy của họ.' : ' Khi ban hành, vị trí này được chuyển thành hồ sơ dùng chung cho người có thẩm quyền.') + '</span></div>');
      } else if (p.outcome === 'ESCALATE' && p.decided) {
        action = '<div class="row small"><span>✔ ' + esc(p.decisionLabel) + (p.decidedBy ? ' · ' + esc(p.decidedBy) : '') + (p.groupSize > 1 ? ' · quyết chung ' + p.groupSize + ' vị trí' : '') + '</span>' + btn('undo-decision', 'Đổi quyết định', { cls: 'sm ghost', data: { p: p.id } }) + '</div>';
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
      evidence + action +
      '<details class="more"><summary>' + esc(p.outcome === 'AUTO_PATCH' && !p.semanticHold ? 'Vì sao máy tự sửa được?' : 'Căn cứ kỹ thuật') + '</summary>' +
        '<div class="why"><b>Căn cứ:</b> ' + esc(p.reason) + '</div><div class="cite">Trích dẫn: ' + esc(p.citation) + '</div>' + proofHtml + '</details>' +
      '</div></article>';
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
    const formMatches = formStillMatches();
    const cases = shared ? app.caseItems().length : 0;
    const qAsked = questionsOf(pending());
    const reviewing = cur.semanticStatus === 'pending';
    const applied = cur.props.filter(p => p.applied).length;
    const partial = rule && cur.change.issuerTier < rule.tier && n > 0;
    const asked = qAsked < open ? ' (gộp còn ' + qAsked + ' câu hỏi)' : '';
    const waiting = open ? open + ' vị trí' + asked + ' còn chờ người quyết.' + (shared ? ' Ban hành sẽ chuyển các vị trí này vào hồ sơ dùng chung.' : '')
      : 'Phân tích này không còn vị trí chờ.';
    return '<div class="notice warn" role="status" data-form-guard' + (formMatches ? ' hidden' : '') + '><div class="grow small">Biểu mẫu ở trên đã khác với phân tích đang hiện (' + esc(cur.change.rule.id + ' ' + cur.change.oldValue + ' → ' + cur.change.newValue + ', cấp ' + cur.change.issuerTier) + '). Bấm “Phân tích tác động” lại trước khi ban hành.</div>' + btn('analyze', 'Phân tích lại', { cls: 'sm' }) + '</div>' +
      legalNotice() +
      (partial ? '<div class="notice warn partial-notice" role="status"><div class="grow small"><b>Ban hành một phần: quy định gốc chưa đổi</b><p>' + esc(rule.id + ' vẫn có giá trị ' + rule.value + ' và cần cấp ' + rule.tier + ' quyết định. Lần ban hành này chỉ áp dụng các dòng đã sẵn sàng; hãy kiểm tra sự thống nhất trước khi sử dụng tài liệu.') + '</p></div></div>' : '') +
      '<div class="commitbar" role="region" aria-label="Ban hành" aria-busy="' + (ui.busy === 'commit') + '">' +
      '<div class="grow"><b>' + nf.format(n) + ' thay đổi sẵn sàng ban hành</b>' + (rejections ? ' · ' + nf.format(rejections) + ' quyết định giữ nguyên' : '') +
      '<div class="xs muted">' + esc(waiting) + (cases ? ' ' + esc('Hàng đợi dùng chung còn ' + cases + ' vị trí ở các hồ sơ đã ban hành trước.') : '') +
      (!issue.ok ? ' ' + esc(issue.reason) : '') + '</div></div>' +
      (canRatify ? '<label class="check small"><input type="checkbox" id="ratifyChk" name="ratify" data-bind="ratify"' + (ui.ratify ? ' checked' : '') + '> Cập nhật luôn giá trị gốc ' + esc(rule.id) + ' trong sổ đăng ký</label>'
        : (rule && cur.change.issuerTier < rule.tier ? '<span class="commit-scope small">' + esc('Quy định gốc vẫn ' + rule.value + '; cần cấp ' + rule.tier + ' duyệt.') + '</span>' : '')) +
      (reviewing || ui.busy === 'commit' ? '<p class="commit-status small" role="status">' + (ui.busy === 'commit' ? 'Đang kiểm tra và ghi sổ. Vui lòng chờ xác nhận hoàn tất.' : 'Đang chờ AI rà soát xong trước khi ban hành.') + '</p>' : '') +
      (applied ? '<a class="btn sm" href="#/so-kiem-toan">Xem sổ kiểm toán</a>' : '') +
      btn('commit', 'Ban hành', { cls: 'primary', busyLabel: 'Đang ban hành…', disabled: nothing || !issue.ok || S.busy || reviewing || !formMatches || legalBlocks(), data: { base: nothing || !issue.ok || S.busy || reviewing || legalBlocks() ? 'off' : 'on' } }) + '</div>';
  }

  function refreshFormGuard() {
    if (!S.current) return;
    const ok = formStillMatches();
    document.querySelectorAll('[data-form-guard]').forEach(el => { el.hidden = ok; });
    document.querySelectorAll('button[data-action="commit"]').forEach(b => { b.disabled = !ok || b.dataset.base !== 'on' || !!ui.busy; });
  }

  function sandboxBanner() {
    if (S.source !== 'sandbox') return '';
    const d = ui.demoStatus;
    return '<div class="notice sandbox"><div class="grow small"><b>Chế độ minh hoạ:</b> ' + esc(S.workspace.name) + '. Mọi thao tác chỉ diễn ra trên bản sao tạm.' +
      (d && d.steps ? '<ol class="demo-steps">' + d.steps.map((/** @type {string} */ x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '') + '</div>' + btn('exit-sandbox', 'Thoát minh hoạ', { cls: 'sm' }) + '</div>';
  }
  function staleBanner() {
    let html = '';
    if (S.stale) html += '<div class="notice warn"><div class="grow small">Có người vừa cập nhật dữ liệu dùng chung. Tải lại để làm việc trên bản mới nhất (quyết định chưa ban hành của bạn sẽ được giữ nếu dòng không đổi).</div>' + btn('reload', 'Tải lại', { cls: 'sm' }) + '</div>';
    if (S.current && S.current.revision !== S.revision) html += '<div class="notice warn"><div class="grow small">Kho hoặc sổ đăng ký đã thay đổi sau lần phân tích này. Prover sẽ chặn các dòng không còn khớp, nên chạy lại phân tích.</div>' + btn('analyze', 'Phân tích lại', { cls: 'sm' }) + '</div>';
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
      ? propCard(e.p, true, { change: e.item.change, caseIdx: e.idx, caseId: e.item.oc.id, caseItem: e.item, right: e.right, caseLabel: e.item.oc.id, members: e.members.length > 1 ? e.members : null,
          caseMeta: 'Hồ sơ ' + e.item.oc.id + ' · ' + e.item.oc.ruleId + ' ' + e.item.oc.oldValue + ' → ' + e.item.oc.newValue +
            ' · cấp ban hành ' + e.item.oc.issuerTier + ' · khởi tạo bởi ' + e.item.oc.createdBy })
      : propCard(e.p, true, { right: e.right, members: e.members.length > 1 ? e.members : null });
    const body = tab === 'done' ? decided.map(p => propCard(p, true)).join('') : (tab === 'all' ? all : mineList).map(card).join('');
    const shared = S.source === 'remote';
    return sandboxBanner() + staleBanner() +
      '<div class="page-head"><div><div class="eyebrow">Bước 3</div><h1>Hàng đợi duyệt</h1><p>Mỗi vị trí là đúng một câu hỏi với hai lựa chọn. Chỉ người đúng cấp và đúng đơn vị phụ trách mới quyết được: “Chuyên viên phòng ban chỉ duyệt văn bản thuộc phạm vi của mình”.' +
        (shared ? ' Ở chế độ dùng chung, vị trí chưa quyết của một thay đổi đã ban hành trở thành hồ sơ mà người có thẩm quyền thấy ngay trên máy của mình; quyết định được áp dụng và ghi sổ ngay.' : '') + '</p></div>' +
      '<span class="pill" style="max-width:100%"><span class="t">' + esc(m ? 'Bạn: ' + m.displayName + ' · cấp ' + m.tier : 'Chưa xác định vai trò') + '</span></span></div>' +
      timingBox() + othersBox(all) +
      (!cur && !all.length ? '<div class="empty"><b>Không có việc nào đang chờ</b>Tạo một thay đổi ở mục <a href="#/thay-doi">Thay đổi quy định</a>.</div>' :
      '<div class="filters" role="group" aria-label="Lọc hàng đợi">' +
        [['mine', 'Việc của tôi · ' + mineList.length], ['all', 'Tất cả đang chờ · ' + all.length], ['done', 'Đã quyết (chưa ban hành) · ' + decided.length]]
          .map(([k, l]) => '<button type="button" data-action="queue-tab" data-value="' + k + '" aria-pressed="' + (tab === k) + '">' + esc(l) + '</button>').join('') + '</div>' +
      '<div class="stack">' + (body ||
        '<div class="empty"><b>' + (tab === 'mine' ? 'Không có vị trí nào thuộc thẩm quyền của bạn' : 'Không có vị trí nào') + '</b>' + (tab === 'mine' && all.length ? 'Còn ' + all.length + ' vị trí cần người khác, xem tab “Tất cả”' + (liveWorkspace() ? '.' : ' hoặc đổi vai trò.') : '') + '</div>') + '</div>' + commitBar());
  }

  /** Câu hỏi đang chờ người khác: gom theo người cần trả lời và thay đổi, kèm lời nhắn sao chép được. */
  function othersBox(/** @type {any[]} */ all) {
    /** @type {Map<string, {label:string, what:string, n:number, local:boolean}>} */ const groups = new Map();
    for (const e of all) {
      if (e.right.ok || !e.right.requirement) continue;
      const what = e.kind === 'case' ? e.item.oc.ruleId + ' “' + e.item.oc.oldValue + '” → “' + e.item.oc.newValue + '”' : changeLabel(S.current.change);
      const key = e.kind + '\u0000' + e.right.requirement.label + '\u0000' + what;
      const g = groups.get(key) || { label: e.right.requirement.label, what, n: 0, local: e.kind === 'local' };
      g.n++; groups.set(key, g);
    }
    if (!groups.size) return '';
    const total = [...groups.values()].reduce((s, g) => s + g.n, 0);
    return '<details class="kinds-help others"><summary>' + esc(nf.format(total) + ' câu hỏi đang chờ người khác: báo cho họ') + '</summary><ul class="who">' +
      [...groups.values()].map(g => '<li><span><b>' + esc(nf.format(g.n) + ' câu') + '</b> cho ' + esc(g.label) + ' · <span class="muted">' + esc(g.what) + '</span></span>' + nudgeButtons(g.n, g.label, g.what, g.local) + '</li>').join('') +
      '</ul>' + nudgeNote() + '</details>';
  }

  function timingBox() {
    const t = app.timingStats();
    if (!t.n && !t.excluded) return '';
    const sec = ms => (ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' giây';
    return '<div class="notice info small"><div class="grow"><b>Thời gian trả lời câu hỏi</b> (đo trên trình duyệt này): trung vị ' + esc(t.medianMs === null ? '—' : sec(t.medianMs)) +
      ', 90 % dưới ' + esc(t.p90Ms === null ? '—' : sec(t.p90Ms)) + ' · ' + t.n + ' câu trả lời cho ' + t.positions + ' vị trí' +
      (t.excluded ? ' · bỏ ' + t.excluded + ' lần quá 10 phút (có thể đã rời máy)' : '') + '.</div>' +
      btn('export-timings', 'Tải CSV', { cls: 'sm' }) + btn('clear-timings', 'Xoá số đo', { cls: 'sm ghost' }) + '</div>';
  }

  // ---------- Màn hình: Sổ kiểm toán ----------
  function viewLedger() {
    const ok = Ledger.verify(S.ledger);
    const q = ui.ledgerQuery.trim().toLowerCase();
    const rows = S.ledger.filter(e => !q || [e.docId, e.actor, e.action, e.basis].some(x => String(x || '').toLowerCase().includes(q))).slice().reverse();
    const tail = Ledger.tailOf(S.ledger);
    return sandboxBanner() +
      '<div class="page-head"><div><div class="eyebrow">Bước 4</div><h1>Sổ kiểm toán</h1><p>Xem ai đã sửa gì và vì sao. Hoàn tác khôi phục nội dung cũ và ghi thêm một bản ghi mới để giữ lịch sử.</p></div>' +
      '<div class="row">' + btn('export-json', 'Tải JSON', { cls: 'sm' }) + btn('export-csv', 'Tải CSV', { cls: 'sm' }) + '</div></div>' +
      '<div class="notice ' + (ok ? 'ok' : 'error') + '"><div class="grow small">' + (ok ? '✓ Chuỗi hợp lệ · ' + nf.format(S.ledger.length) + ' bản ghi · đuôi <code>' + esc(tail.hash.slice(0, 16)) + '…</code>' : '✗ Chuỗi không hợp lệ. Đã khoá ban hành và hoàn tác.') +
      (S.source === 'remote' ? ' · Máy chủ kiểm lại chuỗi trước mỗi lần ghi.' : '') + '</div></div>' +
      '<label class="field" for="ledgerSearch" style="max-width:420px">Tìm trong sổ<input id="ledgerSearch" type="search" name="ledgerSearch" autocomplete="off" data-bind="ledgerQuery" placeholder="Mã tài liệu, người thực hiện, hành động…" value="' + esc(ui.ledgerQuery) + '"></label>' +
      (rows.length ? '<div class="tablewrap"><table><thead><tr><th scope="col">#</th><th scope="col">Thời điểm</th><th scope="col">Người / hệ thống</th><th scope="col">Tài liệu</th><th scope="col">Hành động</th><th scope="col">Căn cứ &amp; nội dung</th><th scope="col">Băm</th><th scope="col"><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
        rows.map(e => {
          const u = app.canUndo(e.seq);
          const undoable = String(e.action).startsWith('PATCH') && !Ledger.isReverted(S.ledger, e.seq);
          const basisParts = e.basis.split(' · ');
          const technicalParts = basisParts.filter(part => /^(deterministic proof |checks )/.test(part));
          const readableBasis = basisParts.filter(part => !/^(deterministic proof |checks )/.test(part)).map((part, index) => {
            const tier = part.match(/^cấp ban hành (\d)$/);
            if (tier) return '<p><b>Cấp ban hành:</b> ' + esc(Engine.TIER_APPROVER[Number(tier[1])] || tier[1]) + '</p>';
            if (part.startsWith('khởi tạo bởi ')) return '<p><b>Người khởi tạo:</b> ' + esc(part.slice('khởi tạo bởi '.length)) + '</p>';
            return '<p><b>' + (index === 0 ? 'Căn cứ' : 'Thông tin xử lý') + ':</b> ' + esc(part === 'tự động, trong thẩm quyền' ? 'Hệ thống tự động cập nhật trong phạm vi thẩm quyền.' : part) + '</p>';
          }).join('');
          return '<tr><td class="num">' + esc(e.seq) + '</td><td class="num small" style="white-space:nowrap">' + fmtTime(e.ts) + '</td><td class="small">' + esc(e.actor) + '</td><td><span class="docid">' + esc(e.docId) + '</span></td>' +
            '<td class="small">' + esc(e.action) + (Ledger.isReverted(S.ledger, e.seq) ? ' <span class="tag neutral">đã hoàn tác</span>' : '') + '</td>' +
            '<td class="small ledger-basis">' + readableBasis + (e.from !== e.to ? '<details open><summary class="xs muted">Nội dung thay đổi</summary><div class="diff"><div><span class="ln">Trước</span><span>' + esc(e.from) + '</span></div><div><span class="ln">Sau</span><span>' + esc(e.to) + '</span></div></div></details>' : '') + (technicalParts.length ? '<details class="more ledger-technical"><summary>Chi tiết kỹ thuật</summary><p class="xs muted">Dữ liệu kiểm tra tự động dùng để đối chiếu khi kiểm toán.</p><p class="xs muted">' + esc(technicalParts.join(' · ')) + '</p></details>' : '') + '</td>' +
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
      '</div>' + historyPanel() +
      '<div>' + (docs.map(d => '<details class="doc"' + (q ? ' open' : '') + '><summary><span class="docid">' + esc(d.id) + '</span><span class="title">' + esc(d.title) + '</span><span class="chip">' + esc(tierLabel(d.tier)) + '</span><span class="xs muted">v' + esc(d.version) + ' · ' + esc(d.owner) + '</span></summary>' +
        '<div class="row" style="padding:6px 14px">' + btn('doc-history', 'Lịch sử phiên bản', { cls: 'sm ghost', data: { doc: d.id } }) + '</div>' +
        '<ol class="lines">' + d.lines.map((l, i) => '<li' + (hits.has(d.id + ':' + i) ? ' class="hit"' : '') + '>' + esc(l) + '</li>').join('') + '</ol></details>').join('') ||
        '<div class="empty"><b>Không tìm thấy tài liệu</b>Thử từ khoá khác.</div>') + '</div>' +
      '<section class="card"><div class="card-head"><h2>Nạp tài liệu mới</h2><p>Chọn tệp .docx, .txt hoặc .md (đọc ngay trên máy, không gửi tệp đi đâu), hoặc dán nội dung, mỗi dòng một điều khoản. Chỉ nạp được tài liệu của đơn vị mình phụ trách, ở cấp ≤ cấp của mình.</p></div><div class="card-body stack">' +
        '<div class="grid g3">' +
          '<label class="field" for="ndTitle">Tên tài liệu<input id="ndTitle" type="text" name="title" autocomplete="off" data-bind="newDoc.title" placeholder="Hướng dẫn nội bộ Khoa…" value="' + esc(nd.title) + '"></label>' +
          '<label class="field" for="ndOwner">Đơn vị ban hành<select id="ndOwner" name="owner" data-bind="newDoc.owner">' + units.map(u => '<option' + (u === nd.owner ? ' selected' : '') + '>' + esc(u) + '</option>').join('') + '</select></label>' +
          '<label class="field" for="ndTier">Cấp<select id="ndTier" name="tier" data-bind="newDoc.tier">' + [1, 2, 3].map(t => '<option value="' + t + '"' + (String(t) === nd.tier ? ' selected' : '') + '>' + esc(tierLabel(t)) + '</option>').join('') + '</select></label>' +
        '</div>' +
        '<div class="row"><label class="btn sm" for="ndFile">Chọn tệp .docx / .txt / .md…</label><input id="ndFile" type="file" accept=".docx,.txt,.md,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="sr-only" data-action-change="doc-file">' +
          (ui.docFileNote ? '<span class="xs muted">' + esc(ui.docFileNote) + '</span>' : '') + '</div>' +
        '<label class="field" for="ndBody">Nội dung<textarea id="ndBody" name="body" data-bind="newDoc.body" placeholder="Sinh viên nộp đơn phúc khảo trong 7 ngày kể từ ngày công bố điểm…">' + esc(nd.body) + '</textarea></label>' +
        '<div class="row">' + btn('add-doc', 'Nạp vào kho', { cls: 'primary' }) + '</div>' +
      '</div></section>';
  }

  // ---------- Màn hình: Căn cứ pháp lý (khám phá văn bản liên quan + hiệu lực) ----------
  const LEGAL_TAG = { good: 'auto', warn: 'warn', bad: 'U3', neutral: 'neutral' };
  const BASIS_LABEL = { official_metadata: 'metadata của nguồn', text_cue: 'câu chữ có cụm báo quan hệ', text_citation: 'trích dẫn trong câu chữ' };
  function legalTag(a) { return a ? '<span class="tag ' + (LEGAL_TAG[a.tone] || 'neutral') + '">' + esc(a.label) + '</span>' : ''; }
  const vnDate = s => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '');
  function legalAssess() {
    const L = ui.legal;
    if (!L.result) return null;
    const key = L.asOf + '|' + L.result.finishedAt + '|' + L.result.nodes.length;
    if (!L.assess || L.assessKey !== key) { L.assess = Legal.Status.assessAll(L.result, L.asOf); L.assessKey = key; }
    return L.assess;
  }
  function legalStartInput() {
    const L = ui.legal;
    if (L.source === 'sample') return { id: 'MAU', title: 'Văn bản mẫu (mô phỏng)', text: Legal.Fixtures.START_TEXT };
    if (L.source === 'doc') { const d = S.docs.find(x => x.id === L.docId) || S.docs[0]; return d ? { id: d.id, title: d.id + ' · ' + d.title, text: d.lines.join('\n') } : null; }
    return { id: 'DAN', title: 'Nội dung dán vào', text: String(L.text || '').slice(0, 300000) };
  }
  function legalAdapter() {
    const L = ui.legal;
    if (L.mode === 'live' && L.source !== 'sample') return legalRemote;
    return Legal.Fixtures.createFixtureAdapter({ delayMs: 60 });
  }
  function legalSourceLink(e) {
    if (e.url && /^https:\/\//.test(e.url)) return '<a href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">' + esc(e.sourceName || e.url) + '</a>';
    return esc(e.sourceName || 'Không rõ nguồn') + (e.synthetic ? ' <span class="xs muted">(mô phỏng, không có đường dẫn thật)</span>' : '');
  }
  function legalDetail(id) {
    const r = ui.legal.result, all = legalAssess();
    const n = r && r.nodes.find(x => x.id === id);
    if (!n) return '';
    const a = all[id];
    const d = n.doc || {};
    const out = r.edges.filter(e => e.from === id), inn = r.edges.filter(e => e.to === id);
    const rel = (e, dir) => {
      const other = dir === 'out' ? e.to : e.from;
      const lbl = (Legal.Refs.RELATION_LABELS[e.type] || e.type);
      const name = other === r.startId ? 'Văn bản đầu vào' : other;
      return '<li class="small">' + (dir === 'out' ? 'Văn bản này <b>' + esc(lbl) + '</b> ' : '<b>' + esc(name) + '</b> ' + esc(lbl) + ' văn bản này') +
        (dir === 'out' ? btn('legal-node', name, { cls: 'sm ghost', data: { id: other } }) : (other === r.startId ? '' : ' ' + btn('legal-node', 'Xem', { cls: 'sm ghost', data: { id: other } }))) +
        (e.provisions ? ' <span class="chip">' + esc(e.provisions) + '</span>' : '') +
        '<div class="xs muted">Căn cứ: ' + esc(BASIS_LABEL[e.basis] || e.basis) + (e.effectiveFrom ? ' · hiệu lực ' + esc(vnDate(e.effectiveFrom)) : '') + (e.quote ? ' · “' + esc(String(e.quote).slice(0, 220)) + '”' : '') + '</div></li>';
    };
    const head = n.resolution === 'start' ? esc(n.label) : esc(d.number || n.label || id);
    return '<section class="card" id="legalDetail" tabindex="-1"><div class="card-head"><h2>' + head + '</h2>' +
      (n.resolution === 'start' ? '<span class="tag done">Văn bản đầu vào</span>' : legalTag(a)) + (n.synthetic ? ' <span class="tag neutral">Dữ liệu mô phỏng</span>' : '') + '</div><div class="card-body stack">' +
      (d.title && n.resolution !== 'start' ? '<p><b>' + esc(d.title) + '</b>' + (d.kind || d.issuer ? '<br><span class="small muted">' + esc([d.kind, d.issuer].filter(Boolean).join(' · ')) + '</span>' : '') + '</p>' : '') +
      (n.resolution !== 'start' ? '<p class="small">Tầng ' + esc(n.depth) + ' · ' + (n.direct ? 'được văn bản đầu vào nhắc trực tiếp' : 'tìm thấy qua văn bản khác (đệ quy)') +
        (n.via && n.via.length ? ' · đi tới từ ' + n.via.slice(0, 4).map(v => esc(v.from === r.startId ? 'văn bản đầu vào' : v.from)).join(', ') : '') + '</p>' : '') +
      (n.resolution === 'found' ? '<div class="grid g3 small"><div><span class="muted">Ban hành</span><br>' + esc(vnDate(d.issueDate) || 'không rõ') + '</div><div><span class="muted">Có hiệu lực từ</span><br>' + esc(vnDate(d.effectiveFrom) || 'không rõ') + '</div><div><span class="muted">Hết hiệu lực</span><br>' + esc(vnDate(d.expiresOn) || 'không ghi') + '</div></div>' : '') +
      (n.reason ? '<div class="notice warn"><div class="grow small">' + esc(n.reason) + '</div></div>' : '') +
      ((d.retrievalFailures || n.failures || []).length ? '<div><b class="small">Trang ứng viên chưa xác minh</b><ul class="small">' + (d.retrievalFailures || n.failures).map(f => '<li>' + legalSourceLink({ url: f.url, sourceName: f.code || 'Trang ứng viên' }) + ': ' + esc(f.reason) + '</li>').join('') + '</ul></div>' : '') +
      (a && n.resolution !== 'start' ? '<div><b class="small">Vì sao kết luận như vậy (tính đến ' + esc(vnDate(a.asOf)) + ')</b><ul class="small">' + a.reasons.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') +
      (a && (a.amendments.length || a.pending.length || a.causedBy.length) ? '<div><b class="small">Chuỗi sửa đổi, thay thế</b><ul class="small">' +
        a.causedBy.map(x => '<li>Chịu tác động của ' + esc(x) + '</li>').join('') +
        a.amendments.map(x => '<li>Sửa đổi bởi ' + esc(x.by) + (x.date ? ' từ ' + esc(vnDate(x.date)) : '') + (x.provisions ? ' (' + esc(x.provisions) + ')' : '') + '</li>').join('') +
        a.pending.map(x => '<li>Sắp có thay đổi: ' + esc(x.by) + (x.date ? ' từ ' + esc(vnDate(x.date)) : ' (chưa rõ ngày)') + '</li>').join('') + '</ul></div>' : '') +
      (a && a.evidence.length ? '<div><b class="small">Bằng chứng</b><ul class="small">' + a.evidence.map(e => '<li>' + esc(e.text) + '<div class="xs muted">Nguồn: ' + legalSourceLink(e) + (e.tier ? ' · ' + (e.tier === 'primary' ? 'nguồn chính thức' : 'nguồn thứ cấp') : '') + (e.retrievedAt ? ' · tải lúc ' + fmtTime(e.retrievedAt) : '') + '</div></li>').join('') + '</ul></div>' : '') +
      (out.length ? '<div><b class="small">Văn bản này nhắc tới</b><ul class="stack" style="gap:6px;padding-left:18px">' + out.map(e => rel(e, 'out')).join('') + '</ul></div>' : '') +
      (inn.length && n.resolution !== 'start' ? '<div><b class="small">Văn bản tác động tới văn bản này</b><ul class="stack" style="gap:6px;padding-left:18px">' + inn.map(e => rel(e, 'in')).join('') + '</ul></div>' : '') +
      (a ? '<p class="xs muted">' + esc(a.method) + '</p>' : '') +
    '</div></section>';
  }
  function viewLegal() {
    const L = ui.legal;
    const r = L.result;
    const all = legalAssess();
    const running = ui.busy === 'legal-run' || ui.busy === 'legal-continue';
    const liveOk = !!legalRemote;
    const sample = L.source === 'sample';
    const doc = S.docs.find(x => x.id === L.docId) || S.docs[0];
    const counts = all ? Object.values(all).reduce((acc, a) => { acc[a.state] = (acc[a.state] || 0) + 1; return acc; }, {}) : {};
    const rows = r ? r.nodes.filter(n => n.resolution !== 'start').sort((x, y) => x.depth - y.depth || String(x.id).localeCompare(String(y.id))) : [];
    const viaText = n => [...new Set((n.via || []).map(v => (v.type.startsWith('REVERSE_') ? 'bị ' : '') + (Legal.Refs.RELATION_LABELS[v.type.replace('REVERSE_', '')] || v.type)))].join(', ');
    return sandboxBanner() +
      '<div class="page-head"><div><div class="eyebrow">Dữ liệu</div><h1>Căn cứ pháp lý</h1><p>Tìm các văn bản pháp luật mà một tài liệu dựa vào, kể cả văn bản chưa tải lên, rồi lần tiếp các văn bản sửa đổi, thay thế, hướng dẫn chúng. Mỗi văn bản được đánh giá còn hiệu lực hay không tại một ngày, kèm bằng chứng và nguồn.</p></div></div>' +
      '<div class="notice info"><div class="grow small">Quan hệ chỉ được ghi khi có bằng chứng (metadata của nguồn hoặc câu chữ có trích dẫn). Không dùng AI để gán “sửa đổi” hay “bãi bỏ”. Kết quả hiệu lực là thông tin để người có chuyên môn pháp chế xem lại, không tự thay đổi tài liệu hay kết quả phân xử.</div></div>' +
      '<section class="card"><div class="card-head"><h2>Bắt đầu từ</h2></div><div class="card-body stack">' +
        '<div class="grid g3">' +
          '<label class="field" for="lgSource">Văn bản đầu vào<select id="lgSource" name="lgSource" data-bind="legal.source">' + [['sample', 'Văn bản mẫu (dữ liệu mô phỏng)'], ['doc', 'Một tài liệu trong kho'], ['paste', 'Dán nội dung']].map(([v, l]) => '<option value="' + v + '"' + (L.source === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
          '<label class="field" for="lgMode">Nguồn tra cứu<select id="lgMode" name="lgMode" data-bind="legal.mode"' + (sample ? ' disabled' : '') + '>' +
            '<option value="fixture"' + (L.mode !== 'live' || sample ? ' selected' : '') + '>Kho mô phỏng (không cần mạng)</option>' +
            '<option value="live"' + (L.mode === 'live' && !sample ? ' selected' : '') + (liveOk ? '' : ' disabled') + '>Tra cứu trực tuyến' + (liveOk ? '' : ' (ngoại tuyến: không dùng được)') + '</option></select></label>' +
          '<label class="field" for="lgAsOf">Xét hiệu lực tại ngày<input id="lgAsOf" type="date" name="lgAsOf" data-bind="legal.asOf" value="' + esc(L.asOf) + '"></label>' +
        '</div>' +
        (L.source === 'doc' ? '<label class="field" for="lgDoc">Tài liệu<select id="lgDoc" name="lgDoc" data-bind="legal.docId">' + S.docs.map(d => '<option value="' + esc(d.id) + '"' + (doc && d.id === doc.id ? ' selected' : '') + '>' + esc(d.id + ' · ' + d.title) + '</option>').join('') + '</select></label>' : '') +
        (L.source === 'paste' ? '<label class="field" for="lgText">Nội dung có “Căn cứ …”<textarea id="lgText" name="lgText" data-bind="legal.text" placeholder="Căn cứ Thông tư 08/2021/TT-BGDĐT ngày 18/3/2021 …">' + esc(L.text) + '</textarea></label>' : '') +
        (sample ? '<p class="xs muted">Văn bản mẫu và kho mô phỏng là dữ liệu bịa ra để thử thuật toán (ký hiệu có hậu tố MP, QH99), có đủ các tình huống: sửa đổi, thay thế, bãi bỏ một phần, văn bản chưa có hiệu lực, nguồn mâu thuẫn, chỉ có nguồn thứ cấp, câu chèn lệnh.</p>' : '') +
        (L.mode === 'live' && !sample ? '<div class="notice ' + (L.live && L.live.configured ? 'ok' : 'warn') + '"><div class="grow small">' + esc(L.live ? (L.live.configured ? 'Máy chủ đã cấu hình nhà cung cấp tìm kiếm (' + (L.live.provider || '') + '). Chỉ tải từ vbpl.vn, vanban.chinhphu.vn, congbao.chinhphu.vn, chinhphu.vn, moet.gov.vn; trang thứ cấp chỉ để đối chiếu.' : (L.live.reason || 'Máy chủ chưa cấu hình tra cứu trực tuyến.')) : 'Chưa kiểm tra máy chủ tra cứu.') + '</div>' + btn('legal-check', 'Kiểm tra máy chủ', { cls: 'sm' }) + '</div>' : '') +
        '<div class="grid g3">' +
          '<label class="field" for="lgDepth">Độ sâu tối đa<input id="lgDepth" type="number" min="1" max="8" name="lgDepth" data-bind="legal.maxDepth" value="' + esc(L.maxDepth) + '"></label>' +
          '<label class="field" for="lgMax">Số lượt tra cứu tối đa<input id="lgMax" type="number" min="1" max="200" name="lgMax" data-bind="legal.maxDocs" value="' + esc(L.maxDocs) + '"></label>' +
          '<div class="field"><span>&nbsp;</span><div class="row">' + btn('legal-run', 'Khám phá văn bản liên quan', { cls: 'primary', busyLabel: 'Đang tra cứu…', disabled: running }) + '</div></div>' +
        '</div>' +
        (running && L.progress ? '<p class="small muted" role="status">Đang tra ' + esc(L.progress.id) + ' (tầng ' + esc(L.progress.depth) + ') · đã xử lý ' + esc(L.progress.done) + ' · còn chờ ' + esc(L.progress.queued) + '</p>' : '') +
      '</div></section>' +
      (r ? (r.adapterSynthetic ? '<div class="notice sandbox"><div class="grow small"><b>Dữ liệu mô phỏng.</b> Các văn bản dưới đây là bịa ra để thử thuật toán, không phải văn bản pháp luật thật. Không dùng làm căn cứ.</div></div>' : '') +
        (r.unavailable ? '<div class="notice warn"><div class="grow small"><b>Không tra cứu trực tuyến được:</b> ' + esc(r.unavailable) + ' Các văn bản dưới đây được đánh dấu lỗi nguồn, không phải “không tồn tại”.</div></div>' : '') +
        (r.state === 'partial'
          ? '<div class="notice warn" role="status"><div class="grow small"><b>Kết quả chưa đầy đủ.</b> ' + esc(r.stopReasons.map(Legal.Discovery.stopReasonLabel).join('; ')) + '. ' + (r.frontier.length ? 'Còn ' + nf.format(r.frontier.length) + ' văn bản chưa tra.' : 'Đã xử lý hết hàng đợi, nhưng chưa đủ nguồn để xác minh mọi tham chiếu.') + (r.errors.length ? ' Có ' + nf.format(r.errors.length) + ' văn bản lỗi nguồn.' : '') + (!r.frontier.length && !r.errors.some(e => e.retryable) ? ' Xem “Tham chiếu chưa giải quyết” bên dưới; bạn có thể kiểm tra số hiệu hoặc bấm “Khám phá văn bản liên quan” để tìm lại.' : '') + '</div>' +
            (r.frontier.length || r.errors.some(e => e.retryable) ? btn('legal-continue', 'Tiếp tục khám phá', { cls: 'sm', busyLabel: 'Đang tra tiếp…', disabled: running, title: 'Thêm 1 tầng và 10 lượt tra cứu, thử lại các nguồn lỗi tạm thời' }) : '') + '</div>'
          : '<div class="notice ok" role="status"><div class="grow small">Đã duyệt hết các quan hệ tìm được trong phạm vi tra cứu (độ sâu ' + esc(r.limits.maxDepth) + ', tối đa ' + esc(r.limits.maxDocs) + ' văn bản).</div></div>') +
        '<div class="grid g4">' +
          '<div class="stat accent"><span class="v">' + nf.format(r.stats.found) + '</span><span class="l">Văn bản tìm được</span><span class="s">sâu nhất tầng ' + esc(r.stats.maxDepthReached) + '</span></div>' +
          '<div class="stat auto"><span class="v">' + nf.format(counts.IN_FORCE || 0) + '</span><span class="l">Còn hiệu lực</span><span class="s">tại ' + esc(vnDate(L.asOf)) + '</span></div>' +
          '<div class="stat U3"><span class="v">' + nf.format((counts.EXPIRED || 0) + (counts.CONFLICT || 0)) + '</span><span class="l">Hết hiệu lực / mâu thuẫn</span><span class="s">' + nf.format(counts.PARTIAL || 0) + ' hết hiệu lực một phần · ' + nf.format(counts.NOT_YET || 0) + ' chưa có hiệu lực · ' + nf.format(counts.SUSPENDED || 0) + ' ngưng hiệu lực</span></div>' +
          '<div class="stat"><span class="v">' + nf.format(counts.UNVERIFIED || 0) + '</span><span class="l">Chưa xác minh được</span><span class="s">' + nf.format(r.stats.notFound) + ' không tìm thấy · ' + nf.format(r.stats.pending) + ' chưa tra</span></div>' +
        '</div>' +
        '<section class="card"><div class="card-head"><h2>Đồ thị quan hệ</h2><span class="xs muted">Bấm một văn bản để xem chi tiết</span></div><div class="card-body"><div class="legend" aria-hidden="true">' +
          [['var(--auto)', 'Còn hiệu lực'], ['var(--u1)', 'Một phần / chưa có hiệu lực'], ['var(--u3)', 'Hết hiệu lực / mâu thuẫn'], ['var(--muted)', 'Chưa xác minh'], ['var(--brand)', 'Văn bản đầu vào']].map(([c, l]) => '<span><i style="background:' + c + '"></i>' + l + '</span>').join('') +
          '<span>— metadata nguồn</span><span>- - câu chữ báo quan hệ</span><span>··· trích dẫn</span></div>' +
          '<div class="graph graph-wrap" id="legalGraph">' + Legal.Graph.render(r, all, L.selected) + '</div></div></section>' +
        (L.selected ? legalDetail(L.selected) : '') +
        '<section class="card"><div class="card-head"><h2>Danh sách văn bản</h2><span class="xs muted">' + nf.format(rows.length) + ' mục</span></div><div class="tablewrap"><table><thead><tr><th scope="col">Văn bản</th><th scope="col">Tầng</th><th scope="col">Quan hệ</th><th scope="col">Hiệu lực tại ' + esc(vnDate(L.asOf)) + '</th><th scope="col">Nguồn</th><th scope="col"><span class="sr-only">Chi tiết</span></th></tr></thead><tbody>' +
          rows.map(n => {
            const a = all[n.id], d = n.doc || {};
            const src = (d.sources || [])[0];
            const status = n.resolution === 'found' ? legalTag(a) : n.resolution === 'pending' ? '<span class="tag neutral">Chưa tra (giới hạn)</span>' : n.resolution === 'error' ? '<span class="tag warn">Lỗi nguồn</span>' : '<span class="tag neutral">Không tìm thấy</span>';
            return '<tr><td><b>' + esc(d.number || n.label || n.id) + '</b>' + (d.title ? '<div class="xs muted">' + esc(String(d.title).slice(0, 120)) + '</div>' : '') + '</td>' +
              '<td class="num">' + esc(n.depth) + '<div class="xs muted">' + (n.direct ? 'trực tiếp' : 'đệ quy') + '</div></td><td class="small">' + esc(viaText(n)) + '</td><td>' + status + '</td>' +
              '<td class="small">' + (src ? (n.synthetic ? 'Mô phỏng' : legalSourceLink({ url: src.url, sourceName: src.name })) + '<div class="xs muted">' + (src.tier === 'primary' ? 'nguồn chính thức' : 'nguồn thứ cấp') + '</div>' : '<span class="muted">' + esc(n.reason || '') + '</span>') + '</td>' +
              '<td>' + btn('legal-node', 'Chi tiết', { cls: 'sm ghost', data: { id: n.id } }) + '</td></tr>';
          }).join('') + '</tbody></table></div></section>' +
        (r.unresolved.length ? '<section class="card"><div class="card-head"><h2>Tham chiếu chưa giải quyết</h2></div><div class="card-body"><ul class="small">' + r.unresolved.map(u => '<li><b>' + esc(u.label || u.id) + '</b>: ' + esc(u.reason || '') + '</li>').join('') + '</ul></div></section>' : '') +
        (r.live && S.source === 'remote' ? '<div class="row">' + btn('legal-save', 'Lưu kết quả vào workspace', { cls: 'sm' }) + (L.saveMsg ? '<span class="xs muted">' + esc(L.saveMsg) + '</span>' : '') + '</div>' : '')
        : '<div class="empty"><b>Chưa có kết quả</b>Chọn văn bản đầu vào rồi bấm “Khám phá văn bản liên quan”. Văn bản mẫu chạy ngay, không cần mạng.</div>');
  }

  /** Cảnh báo hiệu lực gắn vào màn Thay đổi quy định: chỉ chuyển người xem lại, không đổi kết quả của động cơ. */
  function legalWarnings() {
    const r = ui.legal.result;
    if (!r) return null;
    return Legal.Status.warnings(r, ui.legal.asOf);
  }
  function legalNotice() {
    const r = ui.legal.result;
    if (!r) return '<p class="xs muted">Chưa kiểm tra hiệu lực văn bản căn cứ. <a href="#/phap-ly">Mở Căn cứ pháp lý</a> để tra trước khi ban hành.</p>';
    const ws = legalWarnings();
    if (!ws.length) return '<div class="notice ok"><div class="grow small">Không phát hiện cảnh báo hiệu lực trong phạm vi bằng chứng đã xác minh cho “' + esc(r.startLabel) + '” tại ' + esc(vnDate(ui.legal.asOf)) + '. Kết quả này không phải chứng nhận pháp lý.</div></div>';
    return '<div class="notice warn" role="status"><div class="grow small"><b>Cảnh báo hiệu lực văn bản căn cứ</b> (' + esc(r.startLabel) + ', tại ' + esc(vnDate(ui.legal.asOf)) + (r.adapterSynthetic ? ', dữ liệu mô phỏng' : '') + ')<ul>' +
      ws.slice(0, 6).map(w => '<li>' + esc(w.label) + ': ' + esc(w.stateLabel) + (w.reason ? '. ' + esc(w.reason) : '') + '</li>').join('') + (ws.length > 6 ? '<li>… và ' + (ws.length - 6) + ' văn bản khác</li>' : '') + '</ul>' +
      '<p>Hệ thống không tự kết luận tài liệu nội bộ hết hiệu lực và không đổi kết quả phân xử. Xác nhận đã xem không chứng minh căn cứ hợp lệ. Người ban hành cần xem lại căn cứ trước khi bấm Ban hành.</p>' +
      '<label class="check small"><input type="checkbox" id="legalAck" name="legalAck" data-bind="legalAck"' + (ui.legalAck ? ' checked' : '') + '> Tôi đã xem các cảnh báo hiệu lực này</label></div><a class="btn sm" href="#/phap-ly">Xem chi tiết</a></div>';
  }
  function legalBlocks() { const ws = legalWarnings(); return !!(ws && ws.length && !ui.legalAck); }

  // ---------- Lịch sử phiên bản tài liệu (dựng từ sổ kiểm toán) ----------
  function historyOf(docId) {
    const d = S.docs.find(x => x.id === docId);
    return d ? Legal.History.build(d, S.ledger, { chainOk: Ledger.verify(S.ledger) }) : null;
  }
  function wordsHtml(words) {
    return words.map(w => w.type === 'same' ? esc(w.text) : '<span class="' + (w.type === 'add' ? 'new' : 'old') + '">' + esc(w.text) + '</span>').join('');
  }
  function diffBlock(a, b) {
    const d = Legal.History.diffLines(a, b);
    const ops = d.ops.filter(o => o.type !== 'same');
    if (!ops.length) return '<p class="small muted">Hai phiên bản giống hệt nhau.</p>';
    return '<p class="xs muted">' + esc(d.stats.changed + ' dòng sửa · ' + d.stats.added + ' dòng thêm · ' + d.stats.removed + ' dòng bớt') + '</p><div class="diff">' + ops.map(o =>
      o.type === 'change' ? '<div><span class="ln">Dòng ' + (o.bi + 1) + '</span><span>' + wordsHtml(o.words) + '</span></div>'
      : o.type === 'add' ? '<div><span class="ln">+ ' + (o.bi + 1) + '</span><span class="new">' + esc(o.b) + '</span></div>'
      : '<div><span class="ln">− ' + (o.ai + 1) + '</span><span class="old">' + esc(o.a) + '</span></div>').join('') + '</div>';
  }
  function historyPanel() {
    const H = ui.history;
    if (!H.docId) return '';
    const h = historyOf(H.docId);
    if (!h) return '';
    const doc = S.docs.find(x => x.id === H.docId);
    const revs = h.revisions;
    const cur = revs[revs.length - 1];
    const view = H.view != null && revs[H.view] ? revs[H.view] : null;
    const a = revs[Number(H.a)] || null, b = revs[Number(H.b)] || null;
    const props = Legal.History.proposals(H.docId, S.current);
    const kindLabel = r => r.kind === 'base' ? 'Bản gốc' : r.kind === 'created' ? 'Tạo tài liệu' : r.kind === 'revert' ? 'Hoàn tác #' + r.revertsSeq : 'Sửa dòng ' + (r.lineIndex + 1);
    const restoreBtn = r => {
      if (r.current) return '<span class="tag done">Hiện tại</span>';
      const plan = Legal.History.restorePlan(h, r.n);
      const rights = plan.ok ? plan.undoSeqs.map(s => Authz.canUndo(app.member(), S.docs.find(d => d.id === h.docId), S.ledger.find(e => e.seq === s))) : [];
      const denied = rights.find(x => !x.ok);
      return btn('history-restore', 'Khôi phục', { cls: 'sm danger', data: { n: r.n }, disabled: !plan.ok || !!denied || !!S.busy,
        title: !plan.ok ? plan.reason : denied ? (denied.reason || 'Không đủ thẩm quyền hoàn tác') : 'Khôi phục toàn bộ trong một giao dịch và ghi thêm lịch sử' });
    };
    return '<section class="card" id="historyPanel" tabindex="-1"><div class="card-head"><h2>Lịch sử phiên bản · ' + esc(H.docId) + '</h2>' + btn('history-close', 'Đóng', { cls: 'sm ghost' }) + '</div><div class="card-body stack">' +
      '<p class="small muted">' + esc(doc ? doc.title : '') + '. Dựng lại từ sổ kiểm toán, đối chiếu nội dung và chuỗi băm trước khi khôi phục. Toàn bộ hoàn tác được ghi trong một giao dịch; lịch sử cũ được giữ nguyên.</p>' +
      (h.integrity.ok ? '<div class="notice ok"><div class="grow small">✓ Lịch sử khớp với nội dung hiện tại và chuỗi băm hợp lệ.</div></div>'
        : '<div class="notice error"><div class="grow small"><b>Lịch sử không khớp.</b> ' + esc((h.integrity.chainOk ? [] : ['Chuỗi băm của sổ không hợp lệ.']).concat(h.integrity.problems).join(' ')) + ' Đã khoá khôi phục.</div></div>') +
      '<div class="tablewrap"><table><thead><tr><th scope="col">Bản</th><th scope="col">Thời điểm</th><th scope="col">Thay đổi</th><th scope="col">Người / hệ thống</th><th scope="col">Phê duyệt</th><th scope="col">Sổ</th><th scope="col"><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
        revs.slice().reverse().map(r => '<tr' + (view && view.n === r.n ? ' aria-current="true"' : '') + '><td class="num">' + esc(r.n) + (r.version ? '<div class="xs muted">v' + esc(r.version) + '</div>' : '') + '</td>' +
          '<td class="small nowrap">' + (r.ts ? fmtTime(r.ts) : '<span class="muted">trước sổ</span>') + '</td>' +
          '<td class="small">' + esc(kindLabel(r)) + (r.revertedBy ? ' <span class="tag neutral">đã thu hồi ở #' + esc(r.revertedBy) + '</span>' : '') + (r.changeId ? ' <span class="chip">' + esc(r.changeId) + '</span>' : '') + '</td>' +
          '<td class="small">' + (r.actor ? esc(r.actor) + ' <span class="tag ' + (r.actorKind === 'ai' ? 'auto' : 'neutral') + '">' + (r.actorKind === 'ai' ? 'AI' : 'Người') + '</span>' : '<span class="muted">Dữ liệu ban đầu</span>') + '</td>' +
          '<td class="small">' + esc(r.approval) + '</td>' +
          '<td class="hash">' + (r.seq != null ? '#' + esc(r.seq) + ' <span title="' + esc(r.hash || '') + '">' + esc(String(r.hash || '').slice(0, 8)) + '…</span>' : '—') + '</td>' +
          '<td><div class="row" style="gap:6px;flex-wrap:nowrap">' + btn('history-view', 'Xem', { cls: 'sm ghost', data: { n: r.n } }) + restoreBtn(r) + '</div></td></tr>').join('') +
      '</tbody></table></div>' +
      (h.events.length ? '<details><summary class="small">Quyết định không đổi nội dung (' + h.events.length + ')</summary><ul class="small">' + h.events.map(e => '<li>#' + esc(e.seq) + ' · ' + esc(e.label) + (e.lineIndex != null ? ' dòng ' + (e.lineIndex + 1) : '') + ' · ' + esc(e.actor) + ' · ' + fmtTime(e.ts) + '</li>').join('') + '</ul></details>' : '') +
      (props.length ? '<div><b class="small">Đề xuất chưa áp dụng (không phải phiên bản)</b><ul class="stack" style="gap:6px;padding-left:18px">' + props.map(p => '<li class="small">Dòng ' + (p.lineIndex + 1) + ' · <span class="tag ' + (p.outcome === 'AUTO_PATCH' ? 'auto' : (p.category || 'neutral')) + '">' + esc(p.status) + '</span><div class="diff"><div><span class="ln">Đề xuất</span><span>' + wordsHtml(p.words) + '</span></div></div></li>').join('') + '</ul></div>' : '') +
      '<div class="grid g3">' +
        '<label class="field" for="hA">So sánh bản<select id="hA" name="hA" data-bind="history.a">' + revs.map(r => '<option value="' + r.n + '"' + (String(r.n) === String(H.a) ? ' selected' : '') + '>Bản ' + r.n + (r.current ? ' (hiện tại)' : '') + '</option>').join('') + '</select></label>' +
        '<label class="field" for="hB">với bản<select id="hB" name="hB" data-bind="history.b">' + revs.map(r => '<option value="' + r.n + '"' + (String(r.n) === String(H.b) ? ' selected' : '') + '>Bản ' + r.n + (r.current ? ' (hiện tại)' : '') + '</option>').join('') + '</select></label>' +
      '</div>' + (a && b ? diffBlock(a.lines, b.lines) : '') +
      (view ? '<div><b class="small">Nội dung bản ' + esc(view.n) + (view.current ? ' (hiện tại)' : '') + '</b>' + (view.current ? '' : ' · ' + '<span class="xs muted">so với hiện tại:</span>' + diffBlock(view.lines, cur.lines)) +
        '<ol class="lines">' + view.lines.map((l, i) => '<li' + (view.lineIndex === i ? ' class="hit"' : '') + '>' + esc(l) + '</li>').join('') + '</ol></div>' : '') +
    '</div></section>';
  }

  // ---------- Màn hình: Sổ đăng ký & học ----------
  function viewRegistry() {
    const stats = G.PolicyChangeLearning.escalationStats(S.feedback);
    const sugg = app.suggestions();
    return sandboxBanner() +
      '<div class="page-head"><div><div class="eyebrow">Dữ liệu</div><h1>Sổ đăng ký &amp; học từ phản hồi</h1><p>Mỗi quy định có hai loại cụm từ: <b>neo chủ đề</b> (dòng nói về việc gì) và <b>neo đại lượng</b> (con số đo cái gì). Máy chỉ tự sửa khi dòng có đủ cả hai. Khi người phụ trách nhiều lần trả lời “Có” ở hồ sơ U1, hệ thống đề xuất bổ sung đúng loại neo còn thiếu. Duyệt xong thì lần sau các dòng tương tự được tự xử lý. Đó là cách ngưỡng chuyển tiếp tự điều chỉnh, có người kiểm soát và có ghi sổ.</p></div></div>' +
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
          }).join('') + '</div><p class="xs muted">Tỉ lệ “đồng ý sửa” theo loại hồ sơ. U1 có tỉ lệ đồng ý cao ⇒ nhiều khả năng thiếu neo, xem đề xuất bên trái.</p>'
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
            '<div class="row"><span class="xs muted" style="min-width:76px">Đại lượng</span>' + ((r.measures || []).length ? (r.measures || []).map(a => '<span class="chip measure">' + esc(a) + '</span>').join('') : '<span class="xs muted">Không cần, neo chủ đề đã đủ hẹp</span>') + '</div>' +
            (right.ok ? '<div class="row"><label class="sr-only" for="' + esc(draftKey) + '">Cụm từ neo mới cho ' + esc(r.id) + '</label><input id="' + esc(draftKey) + '" type="text" autocomplete="off" name="' + esc(draftKey) + '" data-bind="anchorDraft.' + esc(r.id) + '" placeholder="Thêm cụm từ neo…" value="' + esc(ui.anchorDraft[r.id] || '') + '" style="flex:1 1 140px;width:auto;min-width:0">' +
              '<label class="sr-only" for="' + esc(draftKey) + '-field">Loại neo</label><select id="' + esc(draftKey) + '-field" data-bind="anchorField.' + esc(r.id) + '" style="width:auto;flex:0 0 auto"><option value="aliases"' + ((ui.anchorField[r.id] || 'aliases') === 'aliases' ? ' selected' : '') + '>Chủ đề</option><option value="measures"' + (ui.anchorField[r.id] === 'measures' ? ' selected' : '') + '>Đại lượng</option></select>' +
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
        btn('eval-blind', 'Chạy tập mù 40 ca', { cls: 'primary' }) + btn('eval-blind2', 'Tập mù số 2 · 36 ca') + btn('eval-builtin', 'Tập phát triển 48 ca') + btn('eval-ai', 'Chạy kèm AI ngữ nghĩa', { disabled: S.ai.status !== 'ready', title: S.ai.status === 'ready' ? 'Gọi mô hình AI cho các ca động cơ muốn tự sửa' : 'AI đang tắt' }) +
        '<label class="btn" for="evalFile">Tải CSV của bạn…</label><input id="evalFile" type="file" accept=".csv,text/csv" class="sr-only" data-action-change="eval-file">' +
      '</div></div><div class="card-body stack">' +
        '<p class="small muted">Định dạng CSV: <code>id,rule_id,new_value,issuer_tier,doc_tier,line,expected[,phenomenon]</code> với expected ∈ AUTO, U1, U2, U3, NONE (ca bẫy: dòng không mang giá trị cũ, không được đụng tới). Cả hai tập đều là dữ liệu tổng hợp; giám khảo có thể tải CSV của mình lên để chấm trực tiếp.</p>' +
        '<div class="metric-help">' +
          '<div><b>Tự sửa sai</b><span>Máy sửa một dòng lẽ ra phải hỏi người. Lỗi nguy hiểm nhất, mục tiêu là 0.</span></div>' +
          '<div><b>Bỏ sót</b><span>Ca cần người nhưng máy không hỏi. Cũng là máy quyết thay người, mục tiêu là 0.</span></div>' +
          '<div><b>Báo lên thừa</b><span>Máy hỏi dù tự sửa được. Chỉ tốn thời gian người duyệt; được công bố, không giấu.</span></div>' +
        '</div>' +
        (r ? evalReportHtml(r) : '<div class="empty">Chưa chạy. Kết quả sẽ hiện tỉ lệ bỏ sót, tỉ lệ chuyển tiếp thừa, ma trận nhầm lẫn và từng ca sai.</div>') +
      '</div></section>' + learningCard();
  }

  /** Thí nghiệm học neo: học trên một tập, đo trên tập khác (js/policy-learning-eval.js). */
  function learningCard() {
    const rows = ui.learnRows;
    const frac = (n, d, rate) => esc(nf.format(n) + '/' + nf.format(d) + ' (' + pct(rate) + ')');
    return '<section class="card" id="learning"><div class="card-head"><h2>Học từ câu trả lời có giảm báo lên thừa không?</h2>' + btn('eval-learning', 'Chạy thí nghiệm học neo', { cls: 'primary' }) + '</div><div class="card-body stack">' +
      '<p class="small muted">Máy hỏi các dòng U1 của <b>tập học</b>; một người phụ trách <b>mô phỏng</b> trả lời đúng theo nhãn (“Có” nếu dòng lẽ ra tự sửa được, “Không” nếu không). Hệ thống chỉ đề xuất neo khi một cụm từ lặp lại ở ít nhất 2 câu “Có”; giả định trưởng đơn vị duyệt hết. Sau đó chấm <b>tập đo</b>; tập này không tham gia bước học. Lệnh tương đương: <code>npm run eval:learning</code>.</p>' +
      (rows ? '<div class="tablewrap"><table class="mini"><thead><tr><th scope="col">Học trên → đo trên</th><th scope="col" class="r">Câu trả lời (Có / Không)</th><th scope="col">Neo được duyệt</th><th scope="col" class="r">Báo lên thừa: trước → sau</th><th scope="col" class="r">Sửa sai · bỏ sót sau khi học</th></tr></thead><tbody>' +
        rows.map(({ s, r }) => '<tr><th scope="row">' + esc(s.train) + ' → ' + esc(s.test) + '</th>' +
          '<td class="r num">' + esc(nf.format(r.feedback.accept) + ' / ' + nf.format(r.feedback.reject)) + '</td>' +
          '<td class="small">' + (r.anchors.length ? r.anchors.map(a => '<span class="chip">' + esc(a.ruleId + ' · ' + a.phrase) + '</span>').join(' ') : '<span class="muted">không có</span>') + '</td>' +
          '<td class="r num nowrap">' + frac(r.before.overEscalations, r.before.notEscalatable, r.before.overEscalationRate) + ' → <b class="' + (r.after.overEscalations < r.before.overEscalations ? 'good' : '') + '">' + frac(r.after.overEscalations, r.after.notEscalatable, r.after.overEscalationRate).replace(' (', '<br>(') + '</b></td>' +
          '<td class="r num"><b class="' + (r.after.wrongEdits || r.after.misses ? 'bad' : 'good') + '">' + esc(nf.format(r.after.wrongEdits) + ' · ' + nf.format(r.after.misses)) + '</b></td></tr>').join('') +
        '</tbody></table></div>' +
        '<p class="xs muted"><b>Đọc kết quả:</b> ' + (rows.every(({ r }) => !r.after.wrongEdits && !r.after.misses) ? 'ở mọi cách chia, học neo không làm phát sinh sửa sai hay bỏ sót. ' : 'có cách chia làm phát sinh sửa sai hoặc bỏ sót (xem cột cuối). ') + 'Nhưng nó chỉ giúp khi một từ đồng nghĩa lặp lại ở nhiều câu trả lời; ở những cách chia ghi “không có”, chưa cụm từ nào lặp lại đủ 2 câu “Có” nên máy chưa đề xuất neo. Đây là giới hạn đang công bố, không phải kết quả đã chứng minh trên dữ liệu thật.</p>'
        : '<div class="empty">Chưa chạy. Bấm “Chạy thí nghiệm học neo”. Thí nghiệm chạy ngay trên trình duyệt, không gọi AI.</div>') +
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
        r.rows.filter(x => !x.ok).map(x => '<tr><td class="mono nowrap">' + esc(x.id) + '</td><td class="small">' + esc(x.line) + (x.phenomenon ? '<div class="xs muted">' + esc(x.phenomenon) + '</div>' : '') + '</td><td>' + esc(x.expected) + '</td><td>' + esc(x.actual) + '</td><td>' +
          ({ miss: '<span class="tag U3">Bỏ sót</span>', over: '<span class="tag U1">Báo lên thừa</span>', wrong_category: '<span class="tag U2">Sai loại</span>', wrong: '<span class="tag neutral">Không phát hiện</span>' }[x.kind] || '') + '</td></tr>').join('') + '</tbody></table></div>' : '');
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
    ui.understanding = Object.assign({}, r, { text });
    if (r.status === 'ai_candidate' || r.status === 'deterministic_fallback') syncFormFromChange(r.change);
    else if (!hasUnissuedHumanWork()) {
      // Câu mới bị từ chối / cần làm rõ: không để lại phân tích và giá trị của câu trước, kẻo người dùng tưởng
      // nút Ban hành áp cho câu vừa nhập (báo cáo kiểm thử F02). Nếu phân tích cũ đang có quyết định của người chưa
      // ban hành thì giữ lại (không âm thầm xoá việc của người); nút Ban hành vẫn bị khoá vì biểu mẫu đã khác.
      ui.form.newValue = ''; ui.form.issuerTier = '';
      app.clearAnalysis();
    }
    return r;
  }

  /** @param {{ autoReview?:boolean }} [opts] */
  function analyzeFromForm(opts) {
    ui.shownAt = {};
    const res = app.analyze({ ruleId: ui.form.ruleId, newValue: ui.form.newValue, issuerTier: Number(ui.form.issuerTier), requestText: ui.form.text });
    ui.ratify = false;
    // Người dùng tự điền biểu mẫu rồi phân tích: lời từ chối của câu trước không còn áp cho phân tích mới.
    if (res.ok && ui.understanding && (ui.understanding.status === 'refusal' || ui.understanding.status === 'clarification')) ui.understanding = null;
    // Có AI thật thì tự rà các dòng tự sửa ngay sau khi phân tích (không chặn giao diện). Minh hoạ tự chọn nguồn rà
    // soát của mình (dữ liệu mẫu hoặc rà ngay lúc Ban hành), nên không chạy song song hai nguồn (báo cáo kiểm thử F03).
    if (res.ok && S.ai.status === 'ready' && !(opts && opts.autoReview === false)) app.ensureSemanticReview().then(() => render());
    if (!res.ok) { const el = document.getElementById(!ui.form.newValue ? 'newVal' : !ui.form.issuerTier ? 'tierSel' : 'newVal'); if (el) el.focus(); }
    return res;
  }

  async function demoSafe() {
    const sc = G.PolicyChangeDemo.getSafeDateScenario();
    enterDemo({ label: 'Tự sửa an toàn, không đụng ngày tháng', docs: [sc.document] });
    app.setPersona('tp-dt');
    ui.form.text = sc.requestText;
    const r = await understand(sc.requestText);
    if (!(r.status === 'ai_candidate' || r.status === 'deterministic_fallback')) { ui.demoStatus = { tone: 'error', text: 'Minh hoạ dừng: không hiểu được yêu cầu (' + vi(r.reason) + ').' }; return; }
    analyzeFromForm({ autoReview: false });
    const res = await app.commit({ expect: formInput() });
    const p = S.current && S.current.props[0];
    const patched = res.ok && (res.applied || 0) > 0;
    ui.demoStatus = { tone: patched ? 'ok' : res.ok ? 'info' : 'error', text: !patched && res.ok ? 'Mô hình AI giữ lại dòng này cho người duyệt nên chưa tự sửa; xem lý do ở thẻ vị trí.' : res.ok ? 'Đã tự sửa “7 ngày” → “5 ngày” sau khi prover xác nhận đủ điều kiện; ngày 17/07/2025 trong cùng dòng giữ nguyên. Mở “Sổ kiểm toán” để xem bản ghi và thử Hoàn tác.' : res.message };
    if (p) go('thay-doi'); else render();
  }

  async function demoReview() {
    const sc = G.PolicyChangeDemo.getAmbiguityScenario();
    enterDemo({ label: 'AI giữ lại cho người duyệt (dữ liệu AI mẫu)', docs: [{ ...sc.document, title: 'Hướng dẫn phúc khảo (mơ hồ)', owner: 'Phòng Đào tạo', version: '1.0' }] });
    app.setPersona('tp-dt');
    ui.form.text = sc.requestText;
    await understand(sc.requestText);
    analyzeFromForm({ autoReview: false });
    await app.discoverSemantics(G.PolicyChangeDemo.createAmbiguityFixtureAdapter(), 'fixture_mock');
    ui.demoStatus = { tone: 'info', text: 'Động cơ tiền định vẫn nói AUTO_PATCH, nhưng bằng chứng ngữ nghĩa (mẫu, không phải mô hình thật) là “có thể liên quan” → vị trí bị giữ lại, không ban hành được cho tới khi người duyệt.' };
    go('thay-doi');
  }

  async function demoGroup() {
    const line = 'Kết quả phúc khảo được gửi về email sinh viên sau 7 ngày.';
    const mk = (id, title, extra) => ({ id, title, owner: 'Phòng Đào tạo', tier: 1, version: '1.0', lines: [line, ...extra] });
    enterDemo({ label: 'Một câu, nhiều nơi (gộp câu hỏi trùng)', docs: [
      mk('WEB-FAQ', 'Website · Hỏi đáp phúc khảo', ['Sinh viên nộp đơn phúc khảo trong 7 ngày kể từ ngày công bố điểm.']),
      mk('BOT-01', 'Chatbot tư vấn · kịch bản phúc khảo', []),
      mk('MAIL-07', 'Mẫu email trả lời sinh viên', [])
    ] });
    app.setPersona('cv-dt');
    ui.form.text = 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.';
    const r = await understand(ui.form.text);
    if (!(r.status === 'ai_candidate' || r.status === 'deterministic_fallback')) { ui.demoStatus = { tone: 'error', text: 'Minh hoạ dừng: không hiểu được yêu cầu.' }; return; }
    analyzeFromForm({ autoReview: false });
    const escs = S.current ? S.current.props.filter(p => p.outcome === 'ESCALATE') : [];
    const qc = { positions: escs.length, questions: questionsOf(escs) };
    ui.demoStatus = { tone: 'info', text: qc.positions + ' vị trí cần người quyết nhưng chỉ ' + qc.questions + ' câu hỏi: cùng một câu (thời gian GỬI KẾT QUẢ, không phải hạn nộp đơn) được chép ở 3 nơi. Vai trò đang là Chuyên viên Phòng Đào tạo: mở Hàng đợi duyệt và trả lời một lần.' };
    go('hang-doi');
  }

  async function demoLearn() {
    const fail = (/** @type {string} */ why) => { ui.demoStatus = { tone: 'error', text: 'Minh hoạ dừng: ' + why }; render(); };
    const mk = (/** @type {string} */ id, /** @type {string} */ title, /** @type {string} */ line) => ({ id, title, owner: 'Phòng Đào tạo', tier: 1, version: '1.0', lines: [line] });
    enterDemo({ label: 'Máy học từ câu trả lời', docs: [
      mk('WEB-PT', 'Website · Hỏi đáp phúc tra', 'Hỏi: Hạn nộp đơn phúc tra bài thi là bao lâu? Đáp: 7 ngày kể từ khi có điểm.'),
      mk('BOT-PT', 'Chatbot · kịch bản phúc tra', 'Bot: Em nộp đơn phúc tra trong vòng 7 ngày sau khi điểm được công bố nhé.')
    ] });
    app.setPersona('tp-dt');
    ui.form.text = 'Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.';
    const r = await understand(ui.form.text);
    if (!(r.status === 'ai_candidate' || r.status === 'deterministic_fallback')) return fail('không hiểu được yêu cầu.');
    analyzeFromForm({ autoReview: false });
    const asked = S.current ? S.current.props.filter(p => p.outcome === 'ESCALATE' && p.category === 'U1') : [];
    if (asked.length !== 2) return fail('kỳ vọng 2 câu hỏi U1, thấy ' + asked.length + '.');
    for (const p of asked) { const d = app.decide(p.id, 'a'); if (!d.ok) return fail(d.message || 'không quyết được.'); }
    const issued = await app.commit({ expect: formInput() });
    if (!issued.ok) return fail(issued.message || 'không ban hành được.');
    const sug = app.suggestions().find(s => s.ruleId === 'R-PK-01');
    if (!sug) return fail('chưa có đề xuất neo.');
    const added = await app.addAnchor(sug.ruleId, sug.phrase, 'Học từ ' + sug.support + ' phản hồi “Có” ở hồ sơ U1', sug.field);
    if (!added.ok) return fail(added.message || 'không thêm được neo.');
    const doc = await app.addDocument({ title: 'Mẫu email · nhắc hạn phúc tra', owner: 'Phòng Đào tạo', tier: 1,
      lines: ['Thông báo: sinh viên nộp đơn phúc tra trong 7 ngày kể từ ngày công bố điểm.'] });
    if (!doc.ok) return fail(doc.message || 'không nạp được tài liệu.');
    analyzeFromForm({ autoReview: false });
    const props = S.current ? S.current.props : [];
    const newDocId = (S.docs.find(d => d.title === 'Mẫu email · nhắc hạn phúc tra') || {}).id;
    const emailLine = props.find(p => p.docId === newDocId);
    const auto = !!emailLine && emailLine.outcome === 'AUTO_PATCH' && !emailLine.semanticHold && !props.some(p => p.outcome === 'ESCALATE');
    ui.demoStatus = { tone: auto ? 'ok' : 'error', text: auto ? 'Máy đã học: dòng trong email mới được xếp tự sửa, không phải hỏi lại.' : 'Sau khi học, dòng mới vẫn chưa được xếp tự sửa.',
      steps: [
        'Lần 1: máy hỏi 2 câu U1 vì hai dòng viết “phúc tra”, từ máy chưa biết là phúc khảo.',
        'Trưởng phòng Đào tạo trả lời “A · Có” cả hai rồi ban hành; hai câu trả lời được ghi làm phản hồi.',
        'Hệ thống đề xuất neo chủ đề «' + sug.phrase + '» (' + sug.support + ' câu “Có”); trưởng phòng duyệt, bản ghi THÊM NEO nằm trong Sổ kiểm toán.',
        'Lần 2: một mẫu email mới cũng viết “phúc tra”. ' + (auto ? 'Máy xếp dòng này vào Tự sửa, không hỏi lại. Bấm Ban hành để áp dụng.' : 'Máy vẫn hỏi, cần kiểm tra lại sổ đăng ký.')
      ] };
    go('thay-doi');
  }

  async function demoRefuse() {
    const text = 'Đổi tất cả các thời hạn 7 ngày thành 5 ngày.';
    // Chạy trên bản sao tạm như các minh hoạ khác: không đụng phân tích đang dở của người dùng.
    enterDemo({ label: 'Từ chối yêu cầu phạm vi toàn cục', docs: Data.SEED_DOCUMENTS });
    const before = JSON.stringify([S.docs, S.ledger]);
    ui.form.text = text;
    const r = await understand(text);
    const unchanged = JSON.stringify([S.docs, S.ledger]) === before;
    const good = r.status === 'refusal' && unchanged && !S.current;
    ui.demoStatus = { tone: good ? 'ok' : 'error', text: good ? 'Đã từ chối trước khi phân tích: ' + vi(r.reason) + ' Kho tài liệu và sổ kiểm toán không thay đổi; không còn kết quả phân tích nào để ban hành.' : 'Kết quả bất thường; không thực hiện thêm thao tác nào.' };
    go('thay-doi');
  }

  function timed(el) { const d = el.dataset; if (d.tkey) timeDecision(d.tkey, d.tcat, Number(d.tn) || 1, d.tdoc); }

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

  function legalFinish(res, label, adapter) {
    res.startLabel = label; res.adapterSynthetic = !!adapter.synthetic; res.unavailable = adapter.unavailable || null;
    ui.legal.result = res; ui.legal.assess = null; ui.legal.progress = null;
    ui.legalAck = false;
  }

  const actions = {
    'legal-run': () => {
      const start = legalStartInput();
      if (!start || !start.text.trim()) { toast('Chưa có nội dung văn bản đầu vào.', 'error'); return; }
      if (!Legal.Refs.extractReferences(start.text).length) { toast('Không tìm thấy số hiệu văn bản pháp luật nào trong văn bản đầu vào (dạng 08/2021/TT-BGDĐT).', 'error'); return; }
      const adapter = legalAdapter();
      if (!adapter) { toast('Không tra cứu trực tuyến được ở chế độ Ngoại tuyến.', 'error'); return; }
      if (adapter.live) adapter.unavailable = null;
      return withBusy('legal-run', async () => {
        ui.legal.selected = null; ui.legal.saveMsg = ''; ui.legalAck = false;
        const res = await Legal.Discovery.discover({ start, adapter, maxDepth: Number(ui.legal.maxDepth) || 3, maxDocs: Number(ui.legal.maxDocs) || 25,
          onProgress: p => { ui.legal.progress = p; render(); } });
        legalFinish(res, start.title, adapter);
      });
    },
    'legal-continue': () => {
      const prev = ui.legal.result;
      if (!prev) return;
      const adapter = prev.live ? legalRemote : Legal.Fixtures.createFixtureAdapter({ delayMs: 60 });
      if (!adapter) return;
      if (adapter.live) adapter.unavailable = null;
      return withBusy('legal-continue', async () => {
        const res = await Legal.Discovery.continueDiscovery(prev, { adapter, onProgress: p => { ui.legal.progress = p; render(); } });
        ui.legal.maxDepth = String(res.limits.maxDepth); ui.legal.maxDocs = String(res.limits.maxDocs);
        legalFinish(res, prev.startLabel, adapter);
      });
    },
    'legal-node': el => {
      ui.legal.selected = el.dataset.id; render();
      const t = document.getElementById('legalDetail'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.focus({ preventScroll: true }); }
    },
    'legal-check': () => withBusy('legal-check', async () => { ui.legal.live = legalRemote ? await legalRemote.status() : { configured: false, reason: 'Chế độ Ngoại tuyến.' }; }),
    'legal-save': () => withBusy('legal-save', async () => {
      const r = ui.legal.result;
      if (!r || !r.live || !legalRemote) return;
      const start = r.nodes.find(n => n.id === r.startId);
      const res = await legalRemote.saveRun({ workspace: S.workspace.id, persona: S.persona, run: { asOf: ui.legal.asOf, startLabel: r.startLabel,
        startText: start?.doc?.text || '', maxDepth: r.limits.maxDepth, maxDocs: r.limits.maxDocs } });
      ui.legal.saveMsg = res.data.message || (res.ok ? 'Đã lưu kết quả máy chủ xác minh.' : 'Không lưu được.');
    }),
    'doc-history': el => {
      const h = historyOf(el.dataset.doc);
      ui.history = { docId: el.dataset.doc, view: null, a: '0', b: h ? String(h.revisions.length - 1) : '0' };
      render();
      const t = document.getElementById('historyPanel'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.focus({ preventScroll: true }); }
    },
    'history-close': () => { ui.history = { docId: null, view: null, a: '', b: '' }; render(); },
    'history-view': el => { ui.history.view = Number(el.dataset.n); render(); },
    'history-restore': el => {
      const h = historyOf(ui.history.docId);
      if (!h) return;
      const n = Number(el.dataset.n);
      const plan = Legal.History.restorePlan(h, n);
      if (!plan.ok) { toast(plan.reason, 'error'); return; }
      if (!confirm('Khôi phục ' + ui.history.docId + ' về bản ' + n + '? Toàn bộ ' + plan.undoSeqs.length + ' hoàn tác được lưu trong một giao dịch. Lịch sử cũ được giữ nguyên.')) return;
      return withBusy('history-restore', async () => {
        const restored = await app.restore(ui.history.docId, n);
        if (!restored.ok) { toast(restored.message, 'error'); return; }
        toast(restored.message);
        ui.history.view = null; ui.history.b = String((historyOf(ui.history.docId) || { revisions: [] }).revisions.length - 1);
      });
    },
    'understand': () => withBusy('understand', () => understand(ui.form.text)),
    'analyze': () => {
      // Phản hồi thử nghiệm P1 (14/10): gõ câu rồi bấm thẳng "Phân tích tác động" thì không thấy giá trị mới (5 ngày),
      // vì phải bấm "Hiểu yêu cầu" trước. Nay câu chưa được đọc thì máy tự đọc rồi phân tích luôn, một nút là đủ.
      if (ui.form.text.trim() && (!ui.understanding || ui.understanding.text !== ui.form.text)) {
        return withBusy('understand', async () => {
          const r = await understand(ui.form.text);
          if (r.status === 'ai_candidate' || r.status === 'deterministic_fallback') analyzeFromForm();
        });
      }
      analyzeFromForm(); render();
    },
    'clear-analysis': () => app.clearAnalysis(),
    'semantic': () => withBusy('semantic', () => app.discoverSemantics()),
    'decide': el => { const r = app.decide(el.dataset.p, el.dataset.act); if (r.ok) timed(el); },
    'decide-group': el => { const r = app.decideGroup(el.dataset.ids.split(','), el.dataset.act); if (r.ok) timed(el); },
    'decide-case-group': el => {
      const refs = JSON.parse(el.dataset.refs);
      withBusy('case-' + el.dataset.idx, async () => { const r = await app.decideCaseGroup(refs, el.dataset.act); if (r.ok) timed(el); });
    },
    'scroll-prop': el => { const t = document.getElementById(el.dataset.target); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus && t.focus({ preventScroll: true }); } },
    'export-timings': () => {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      download('thoi-gian-quyet-dinh.csv', '\uFEFF' + ['at,workspace,source,actor,category,docId,positions,ms']
        .concat(S.timings.map(t => [t.at, t.workspace, t.source, t.actor, t.category, t.docId, t.positions, t.ms].map(q).join(','))).join('\n'), 'text/csv;charset=utf-8');
    },
    'clear-timings': () => { if (confirm('Xoá toàn bộ số đo thời gian trên trình duyệt này?')) app.clearTimings(); },
    'decide-case': el => {
      // Tìm lại theo danh tính hồ sơ (danh sách có thể vừa đổi sau một lần nạp lại); nút duyệt AI cũ vẫn dùng chỉ số.
      const item = el.dataset.ref ? app.findCase(JSON.parse(el.dataset.ref)) : app.caseItems()[Number(el.dataset.idx)];
      if (!item && el.dataset.ref) { toast('Hồ sơ vừa thay đổi trên máy chủ; hãy xem lại rồi quyết.', 'error'); app.reload(); return; }
      if (item) withBusy('case-' + el.dataset.idx, async () => { const r = await app.decideCase(item, el.dataset.act); if (r.ok) timed(el); });
    },
    'undo-decision': el => app.undoDecision(el.dataset.p),
    'review': el => app.reviewSemantic(el.dataset.p, el.dataset.approve === '1'),
    'commit': () => legalBlocks() ? toast('Hãy xem và đánh dấu đã xem các cảnh báo hiệu lực văn bản căn cứ trước khi ban hành.', 'error') : withBusy('commit', () => app.commit({ ratify: ui.ratify, expect: formInput() })),
    'undo': el => { if (confirm('Hoàn tác bản ghi #' + el.dataset.seq + '? Dòng sẽ được khôi phục và một bản ghi hoàn tác được thêm vào sổ.')) withBusy('undo', () => app.undo(Number(el.dataset.seq))); },
    'filter-loc': el => { setQuery('loc', el.dataset.value); render(); },
    'queue-tab': el => { setQuery('tab', el.dataset.value); render(); },
    'reload': () => withBusy('reload', () => app.reload()),
    'open-help': () => { const d = $('#helpDlg'); $('#helpBody').innerHTML = helpHtml(); if (!d.open) d.showModal(); const c = d.querySelector('[data-action="close-help"]'); if (c) c.focus(); },
    'close-help': el => { const d = $('#helpDlg'); if (d.open) d.close(); if (el && el.getAttribute && el.getAttribute('href')) location.hash = el.getAttribute('href'); },
    'toggle-size': () => { setLargeText(!largeText()); render(); },
    'guide-sample': () => { ui.form.text = SAMPLE_REQUEST; go('thay-doi'); actions.analyze(); },
    'guide-persona': () => {
      const sel = $('#personaSel');
      if (!sel) { toast('Bạn đang đăng nhập; vai trò lấy theo tài khoản được cấp.', 'info'); return; }
      sel.focus(); sel.classList.add('flash'); setTimeout(() => sel.classList.remove('flash'), 2400);
    },
    'exit-sandbox': () => { app.exitSandbox(); ui.demoStatus = null; },
    'go-online': () => withBusy('go-online', () => app.switchSource('remote', 'demo')),
    'go-offline': () => withBusy('go-offline', async () => { const res = await app.switchSource('local'); writeWorkspace('local'); return res; }),
    'open-pilot': () => withBusy('open-pilot', () => app.switchSource('remote', 'hcmut-pilot')),
    'open-demo': () => withBusy('open-demo', () => app.switchSource('remote', 'demo')),
    'open-login': () => { const d = $('#loginDlg'); d.showModal(); $('#loginEmail').focus(); },
    'sign-out': () => withBusy('sign-out', () => app.signOut()),
    'reset': () => { if (confirm('Khôi phục kho tài liệu, sổ đăng ký và xoá sổ kiểm toán về dữ liệu mẫu?')) withBusy('reset', () => app.resetWorkspace()); },
    'demo-safe': () => withBusy('demo-safe', demoSafe),
    'demo-review': () => withBusy('demo-review', demoReview),
    'demo-refuse': () => withBusy('demo-refuse', demoRefuse),
    'demo-group': () => withBusy('demo-group', demoGroup),
    'demo-learn': () => withBusy('demo-learn', demoLearn),
    'add-doc': () => withBusy('add-doc', async () => {
      const nd = ui.newDoc;
      const res = await app.addDocument({ title: nd.title.trim(), owner: nd.owner || ($('#ndOwner') || {}).value, tier: Number(nd.tier), lines: nd.body.split(/\n+/).map(s => s.trim()).filter(Boolean) });
      if (res.ok) { ui.newDoc = { title: '', owner: nd.owner, tier: nd.tier, body: '' }; ui.docFileNote = null; }
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
    'eval-blind2': () => runEval(G.PolicyChangeBlind2Csv, 'Tập mù số 2 · 36 ca · động cơ tiền định', false),
    'eval-builtin': () => runEval(G.PolicyChangeHoldoutCsv, 'Tập phát triển 48 ca · động cơ tiền định', false),
    'eval-ai': () => runEval(ui.evalCsv || G.PolicyChangeBlindCsv, (ui.evalCsv ? 'CSV của bạn' : 'Tập mù 40 ca') + ' · động cơ + AI ngữ nghĩa', true),
    'copy-nudge': el => { copyText(el.dataset.text || '').then(ok => toast(ok ? 'Đã sao chép lời nhắn. Dán vào Zalo, Teams hoặc email để gửi.' : 'Không sao chép được; hãy dùng “Soạn email”.', ok ? 'info' : 'error')); },
    'eval-learning': () => {
      const parse = (/** @type {string} */ csv) => Evaluation.parseCsv(csv || '').cases;
      const sets = { dev: parse(G.PolicyChangeHoldoutCsv), blind1: parse(G.PolicyChangeBlindCsv), blind2: parse(G.PolicyChangeBlind2Csv) };
      const deps = { Engine, Learning: G.PolicyChangeLearning, Workflow, Evaluation };
      ui.learnRows = G.PolicyChangeLearningEval.splits(sets).map((/** @type {any} */ s) => ({ s, r: G.PolicyChangeLearningEval.run({ train: s.trainCases, test: s.testCases, registry: Data.SEED_REGISTRY, ...deps }) }));
      render();
    },
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
      // Gõ vào câu yêu cầu / giá trị mới: khoá nút Ban hành ngay (không vẽ lại toàn trang để khỏi mất con trỏ).
      if (String(el.dataset.bind).startsWith('form.')) refreshFormGuard();
    });
    document.addEventListener('change', ev => {
      const el = ev.target;
      if (el.id === 'personaSel') { app.setPersona(el.value); return; }
      if (el.dataset && el.dataset.bind) {
        if (el.dataset.bind.startsWith('legal.') && el.dataset.bind !== 'legalAck') ui.legalAck = false;
        bindValue(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
        if (['form.ruleId', 'form.issuerTier', 'docTier', 'ratify', 'legalAck', 'legal.source', 'legal.mode', 'legal.asOf', 'legal.docId', 'history.a', 'history.b'].includes(el.dataset.bind)) render();
      }
      if (el.dataset && el.dataset.actionChange === 'doc-file' && el.files && el.files[0]) {
        const file = el.files[0];
        if (file.size > G.PolicyChangeDocImport.MAX_BYTES) { toast('Tệp lớn hơn 5 MB.', 'error'); el.value = ''; return; }
        file.arrayBuffer().then(buf => G.PolicyChangeDocImport.readDocument(file.name, buf)).then(res => {
          if (!res.lines.length) { toast('Tệp không có dòng chữ nào.', 'error'); return; }
          ui.newDoc.title = ui.newDoc.title.trim() || res.title;
          ui.newDoc.body = res.lines.join('\n');
          ui.docFileNote = 'Đã đọc ' + res.lines.length + ' dòng từ “' + file.name + '”' + (res.truncated ? ' (chỉ lấy ' + res.lines.length + ' dòng đầu)' : '') + '. Kiểm tra nội dung, chọn đơn vị và cấp, rồi bấm “Nạp vào kho”.';
          render();
        }).catch(err => toast(err && err.message ? err.message : 'Không đọc được tệp.', 'error'));
        el.value = '';
      }
      if (el.dataset && el.dataset.actionChange === 'eval-file' && el.files && el.files[0]) {
        el.files[0].text().then(text => { ui.evalCsv = text; runEval(text, 'CSV của bạn · ' + el.files[0].name, false); });
      }
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.id === 'reqText') { ev.preventDefault(); actions.analyze(); }
      if (ev.key === 'Enter' && ev.target.id === 'newVal') { ev.preventDefault(); actions.analyze(); }
      if (ev.key === 'Enter' && ev.target.dataset && String(ev.target.dataset.bind || '').startsWith('anchorDraft.')) {
        ev.preventDefault(); actions['add-anchor']({ dataset: { rule: ev.target.dataset.bind.split('.')[1] } });
      }
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest && ev.target.closest('svg [data-action="legal-node"]')) { ev.preventDefault(); actions['legal-node'](ev.target.closest('[data-action]')); }
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
    // Bấm ra ngoài khung hướng dẫn (vào nền mờ) thì đóng.
    $('#helpDlg').addEventListener('click', ev => {
      const d = /** @type {HTMLDialogElement} */ (ev.currentTarget), r = d.getBoundingClientRect();
      if (ev.target === d && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) d.close();
    });
    $('#helpBtn').innerHTML = icon('help');
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
    // Chỉ ghi nhớ workspace dùng chung đã mở được; "ngoại tuyến" chỉ được nhớ khi người dùng tự chọn (go-offline),
    // không nhớ khi máy chủ tạm mất mạng lúc khởi động.
    let legalWorkspace = S.workspace.id;
    app.subscribe(() => {
      if (legalWorkspace !== S.workspace.id) { ui.legal.result = null; ui.legal.assess = null; ui.legalAck = false; legalWorkspace = S.workspace.id; }
      if (!S.busy && S.source === 'remote' && !S.fallbackFrom) writeWorkspace(S.workspace.id);
    });
    // Thoát minh hoạ bằng bất kỳ đường nào (nút Thoát, đăng nhập, đổi nguồn): trả biểu mẫu về như trước minh hoạ.
    app.subscribe(() => {
      if (ui.savedForm && S.source !== 'sandbox') {
        Object.assign(ui.form, ui.savedForm.form); ui.understanding = ui.savedForm.understanding; ui.ratify = ui.savedForm.ratify;
        ui.savedForm = null; ui.demoStatus = null; ui.shownAt = {};
      }
    });
    app.subscribe(() => render());
    setInterval(() => { if (document.visibilityState === 'visible') app.poll(); }, Math.max(5, Number(cfg.pollSeconds) || 20) * 1000);
  }

  wire();
  render();
  const remembered = readWorkspace();
  app.init({ prefer: params.get('offline') === '1' || (remembered === 'local' && !params.get('workspace')) ? 'local' : 'remote',
    workspace: params.get('workspace') || (remembered && remembered !== 'local' ? remembered : undefined) });
})();
