# Sprint 2 — Backend dùng chung, LLM thật, học từ phản hồi, giao diện mới

> **For agentic workers:** Execute task by task with TDD. Every task ends with `npm test` green and the benchmark output unchanged unless the task says otherwise.

**Goal:** Trả lời trực tiếp hai điểm P1 trong đánh giá Sprint 1 của BTC (lưu trữ dùng chung + đa người dùng; kết nối LLM thật) và hai yêu cầu nâng cao bắt buộc của Đề A ở Sprint 2 (tự điều chỉnh ngưỡng chuyển tiếp từ phản hồi; báo cáo độ chính xác trên tập độc lập), đồng thời làm lại giao diện thành một ứng dụng nhiều màn hình có phân vai.

**Architecture:** Toàn bộ logic nghiệp vụ được tách khỏi `index.html` thành các module UMD thuần (chạy được trong trình duyệt, Node và Deno). Trình duyệt dùng các module đó để hiển thị; máy chủ (Supabase Edge Function) dùng **chính các module đó** để chạy lại động cơ + prover trước khi ghi, nên client không thể tự ban hành một bản vá mà máy chủ không tái lập được. Dữ liệu dùng chung nằm trong Postgres; client chỉ được đọc, mọi thao tác ghi đi qua Edge Function và một hàm SQL giao dịch khoá theo workspace. LLM chỉ được gọi phía máy chủ, chỉ được trả về *ứng viên có trích dẫn*, và mọi ứng viên vẫn phải qua validator + prover hiện có. Khi mất mạng hoặc chưa cấu hình backend, ứng dụng lùi về chế độ Offline, lưu bền bằng IndexedDB.

**Tech Stack:** JavaScript thuần (UMD, `// @ts-check` + JSDoc), Node `node:test`, Playwright, Supabase (Postgres 15 + RLS + Edge Functions/Deno), OpenAI Chat Completions với Structured Outputs.

**Spec:**
- `Danh_Gia_Sprint_1_AbleMind.md` (đánh giá kỹ thuật Sprint 1 của BTC) — mục 4, 5, 11, 12, 13.
- Đề bài `Challenge_Brief_OrganizationAI_VN.docx`, mục 2.A "Yêu cầu nâng cao (Sprint 2)".

## Global Constraints

- Động cơ tiền định là nơi **duy nhất** ra quyết định AUTO_PATCH / ESCALATE. LLM không bao giờ được nâng một vị trí từ ESCALATE lên AUTO_PATCH.
- Mọi kết quả trên bảng Verify và benchmark 26 ca phải giữ nguyên sau khi tách module.
- Mở `index.html` bằng `file://` vẫn phải chạy đủ chế độ Offline (không bundler, không ES module bắt buộc).
- Khoá API chỉ tồn tại ở phía máy chủ (Supabase secrets). Publishable key được phép nằm trong mã nguồn vì RLS chặn mọi thao tác ghi từ client.
- Máy chủ phải kiểm tra cấp thẩm quyền của **người gửi yêu cầu** chứ không tin `issuerTier` do client khai.
- Không có số liệu nào được hiển thị như kết quả thực tế nếu nó đến từ dữ liệu tổng hợp; giao diện phải gắn nhãn rõ.
- Giao diện tiếng Việt nhất quán; mọi chuỗi dữ liệu người dùng phải đi qua `escapeText`.

## Review Focus

- Hai người cùng ban hành vào một workspace cùng lúc → chuỗi băm có thể rẽ nhánh. Kỳ vọng: giao dịch thứ hai bị từ chối với lỗi xung đột, không ghi gì. Được kiểm bằng ràng buộc `expected_tail` trong `apply_commit` (Task 4) và test `authz`/`workflow` (Task 2, 5).
- Chuyên viên cấp 1 khai `issuerTier: 3` để mở rộng phạm vi tự sửa. Kỳ vọng: máy chủ trả 403. Test trong Task 5.
- LLM trả trích dẫn không có thật hoặc offset sai. Kỳ vọng: hàm ánh xạ tự tính offset từ trích dẫn, trích dẫn không tồn tại → validator từ chối, lùi về parser tiền định. Test trong Task 6.
- Tài liệu bị người khác sửa giữa lúc phân tích và lúc ban hành. Kỳ vọng: dòng đó bị bỏ qua và báo "stale", các dòng khác vẫn ban hành. Test trong Task 2.
- Người dùng tải lại trang giữa chừng. Kỳ vọng: tài liệu, sổ kiểm toán và phản hồi đã lưu vẫn còn; phân tích dở dang được làm lại. Test E2E trong Task 10.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `js/sha256.js` | SHA-256 thuần JS (dùng chung trình duyệt / Node / Deno) |
| `js/policy-engine.js` | Chuẩn hoá giá trị, tìm vị trí, `ownersOfLine`, `analyze`, `escalationQuestion`, `parseFreeText` — nhận `registry` làm tham số |
| `js/policy-data.js` | Sổ đăng ký + kho tài liệu mẫu + hai bộ Verify |
| `js/policy-ledger.js` | Payload băm, append, verify, isReverted |
| `js/policy-workflow.js` | Chuyển trạng thái thuần: quyết định người, rà soát ngữ nghĩa, ban hành, hoàn tác, chạy một ca Verify |
| `js/policy-authz.js` | Quy tắc phân quyền theo cấp (dùng chung client + server) |
| `js/policy-learning.js` | Đề xuất neo mới từ phản hồi + thống kê chuyển tiếp |
| `js/policy-evaluation.js` | Chạy tập kiểm thử có nhãn (CSV/JSON), tính tỷ lệ bỏ sót / chuyển tiếp thừa |
| `js/policy-store.js` | Lưu trữ: `createLocalStore` (IndexedDB) và `createRemoteStore` (Supabase) cùng một giao diện |
| `js/openai-mapping.js` | Schema Structured Outputs, dựng prompt, ánh xạ output LLM → hợp đồng adapter (tự tính offset) |
| `js/remote-ai-adapter.js` | Adapter `extract` / `discover` gọi Edge Function |
| `js/config.js` | URL + publishable key của Supabase, cờ bật backend |
| `js/app.js`, `css/app.css`, `index.html` | Vỏ ứng dụng nhiều màn hình, phân vai, đồ thị SVG |
| `supabase/migrations/*.sql` | Schema, RLS, hàm `apply_commit` / `apply_undo` / `apply_anchor`, seed |
| `supabase/functions/policy-api/index.ts` | Ban hành / hoàn tác / thêm neo phía máy chủ |
| `supabase/functions/ai-extract/index.ts`, `ai-discover/index.ts` | Gọi OpenAI |
| `supabase/functions/_shared/*.js` | Bản sao đồng bộ của các module ở `js/` (kiểm tra bằng test) |
| `tests/e2e/*.spec.mjs` | Playwright |
| `.github/workflows/ci.yml` | Unit + benchmark + type-check + E2E |

---

### Task 1: Tách động cơ khỏi `index.html`

**Files:** Create `js/sha256.js`, `js/policy-engine.js`, `js/policy-data.js`, `js/policy-ledger.js`; Modify `index.html`, `bench/production-adapter.cjs`; Test `tests/policy-engine.test.cjs`, `tests/policy-ledger.test.cjs`.

**Interfaces (Produces):**
- `PolicyChangeEngine.analyze(change, docs, registry) → { props, elapsedMs }`
- `PolicyChangeEngine.ownersOfLine(line, registry) → Rule[]`
- `PolicyChangeEngine.parseFreeText(text, registry) → { ok, ruleId?, oldValue?, newValue?, issuerTier?, msg? }`
- `PolicyChangeEngine.escalationQuestion(prop, change, registry) → { q, a, b }`
- `PolicyChangeEngine.{parseValue, valueRegex, renderValue, isStructuredNumericOccurrence, policyValueKey, bumpVersion, cloneDocs, TIER_LABEL, TIER_APPROVER}`
- `PolicyChangeLedger.{GENESIS, payload(entry), append(ledger, entry) → record, verify(ledger) → boolean, isReverted(ledger, seq)}`
- `PolicyChangeData.{SEED_REGISTRY, SEED_DOCUMENTS, SUITE_REQUIRED, SUITE_ESCALATION}` (deep-frozen)

- [ ] Test: `analyze` trên kho mẫu với R-PK-01 7→5 ngày, cấp 2 ra đúng 9 vị trí, 6 AUTO_PATCH, U1 tại HD-04 dòng 4, U2 tại QT-07 dòng 2, U3 tại QD-01 dòng 2.
- [ ] Test: `ledger.verify` phát hiện sửa lén một trường bất kỳ của bản ghi giữa chuỗi.
- [ ] Test: benchmark (`node bench/run.cjs --json`) cho kết quả giống hệt trước khi tách (so với snapshot).
- [ ] Tách module, sửa adapter benchmark dùng `require` thay vì trích regex từ HTML.

### Task 2: Luồng nghiệp vụ thuần (`policy-workflow.js`)

**Consumes:** Task 1. **Produces:**
- `decide(state, propId, act) → state` · `reviewSemantic(state, propId, approve, ctx) → state`
- `commit(state, ctx) → { state, applied, proverHeld, stale, message }` với `ctx = { now, actorFor(prop) }`
- `undo(state, seq, ctx) → { state, ok, message }`
- `runVerifyCase(tc, { registry, seedDocuments }) → { id, ok, expected, actual, ms, detail }`
- `state = { registry, docs, current, ledger }`

- [ ] Test: ban hành chỉ áp dụng AUTO_PATCH đã qua prover và ESCALATE đã được người chấp thuận.
- [ ] Test: dòng bị đổi sau khi phân tích → không áp dụng, đếm `stale`.
- [ ] Test: sổ bị sửa lén → `commit` từ chối toàn bộ.
- [ ] Test: hoàn tác khi dòng hiện tại khác bản đã ban hành → từ chối.
- [ ] Nối `index.html` và adapter benchmark vào module này.

### Task 3: Lưu bền cục bộ (chế độ Offline)

**Produces:** `PolicyChangeStore.createLocalStore({ backend }) → { load(), save(snapshot), clear() }`; snapshot = `{ schemaVersion, registry, docs, ledger, feedback }`.
- [ ] Test với backend giả (Map): lưu → tải lại → giống nhau; snapshot hỏng → trả `null` chứ không ném lỗi.

### Task 4: Schema Supabase + RLS + hàm giao dịch

**Files:** `supabase/migrations/20260929000001_core.sql`, `…02_rpc.sql`, `…03_seed.sql`.
- Bảng: `workspaces`, `members`, `policies`, `documents`, `audit_log`, `feedback_events`.
- RLS bật trên mọi bảng. `select` cho `anon`/`authenticated` với workspace `mode='demo'`; workspace `live` chỉ thành viên đọc. **Không có** policy insert/update/delete → chỉ service role ghi được.
- `apply_commit(p_workspace, p_expected_tail, p_doc_updates jsonb, p_entries jsonb)`: khoá `workspaces` `FOR UPDATE`; nếu `ledger_tail <> p_expected_tail` → lỗi `ledger_conflict`; kiểm từng dòng `from` còn khớp; ghi tài liệu + audit + cập nhật tail trong một giao dịch.
- [ ] Kiểm bằng `execute_sql`: gọi hai lần với cùng `expected_tail` → lần hai lỗi, không ghi thêm dòng nào.
- [ ] `get_advisors` (security) không còn cảnh báo RLS.

### Task 5: Edge Function `policy-api` + phân quyền

**Produces:** `PolicyChangeAuthz.{requiredTierFor(prop), canIssue(member, change), canDecide(member, prop), canUndo(member, doc)}`.
- Quy tắc: tạo thay đổi cần `member.tier ≥ change.issuerTier`; quyết định U1 cần cấp ≥ 1; U2 cần cấp ≥ 2; U3 cần cấp ≥ cấp tài liệu; hoàn tác cần cấp ≥ cấp tài liệu; thêm neo cần cấp ≥ 2.
- Máy chủ chạy lại `analyze` + prover, ánh xạ quyết định của người theo khoá `(docId, lineIndex, line)`, gọi `apply_commit`.
- [ ] Test Node: chuyên viên cấp 1 gửi `issuerTier:3` → `canIssue` false; U3 ở tài liệu cấp 3 do cấp 2 quyết → false.
- [ ] Test: bản sao `supabase/functions/_shared/*.js` giống hệt `js/*.js`.

### Task 6: LLM thật qua OpenAI

**Produces:** `PolicyChangeOpenAIMapping.{EXTRACT_SCHEMA, DISCOVER_SCHEMA, extractMessages(input), discoverMessages(payload), toExtractContract(raw, requestText), toDiscoverContract(raw, payload)}`; `PolicyChangeRemoteAI.create({ baseUrl, anonKey, fetch }) → { extract, discover }`.
- LLM chỉ trả **chuỗi trích dẫn**; hàm ánh xạ tự tìm vị trí (`indexOf`) và bỏ các trường `null` để khớp hợp đồng validator hiện có.
- [ ] Test: trích dẫn không có trong câu → output bị validator từ chối và `resolveRequest` lùi về parser tiền định.
- [ ] Test: mạng lỗi / 500 / timeout → `{ available:false }`, không ném lỗi.
- [ ] Test: LLM cố "nâng cấp" một vị trí U2 → `applyEvidenceToProps` vẫn giữ ESCALATE (chỉ được giữ lại AUTO_PATCH, không được nâng).

### Task 7: Học từ phản hồi (yêu cầu nâng cao #1 của Đề A)

**Produces:** `PolicyChangeLearning.{suggestAnchors(feedback, registry, options) → Suggestion[], escalationStats(feedback) → Stats}`.
- Khi người trả lời U1 là "Có — thuộc quy định X" ở ≥ 2 dòng khác nhau, cụm từ 2–4 tiếng lặp lại quanh các dòng đó được đề xuất làm neo mới cho X. Cụm từ bị loại nếu: đã là neo, xuất hiện trong dòng được trả lời "Không", hoặc là neo của quy định khác.
- Đề xuất chỉ có hiệu lực khi người cấp ≥ 2 duyệt; việc duyệt được ghi vào sổ kiểm toán.
- [ ] Test: hai phản hồi "Có" cùng chứa "lưu bài thi" → đề xuất "lưu bài thi" cho R-PK-01 với `support: 2`.
- [ ] Test: một phản hồi "Không" chứa cùng cụm → không đề xuất.
- [ ] Test: sau khi thêm neo, `analyze` biến vị trí U1 cũ thành AUTO_PATCH (ngưỡng chuyển tiếp dịch chuyển có kiểm soát).

### Task 8: Báo cáo độ chính xác trên tập độc lập (yêu cầu nâng cao #2)

**Produces:** `PolicyChangeEvaluation.{parseCsv(text) → Case[], evaluate(cases, { registry }) → Report}`; Report gồm `total, correct, missRate, overEscalationRate, categoryAccuracy, confusion, rows[]`.
- Định nghĩa: **bỏ sót** = ca kỳ vọng ESCALATE mà hệ thống AUTO_PATCH; **chuyển tiếp thừa** = ca kỳ vọng AUTO_PATCH mà hệ thống ESCALATE.
- CSV: `id,rule_id,new_value,issuer_tier,doc_tier,line,expected` với `expected ∈ {AUTO, U1, U2, U3}`.
- [ ] Test: tập 4 dòng có 1 bỏ sót + 1 thừa → `missRate = 1/2`, `overEscalationRate = 1/2`.
- [ ] Test: CSV có dấu phẩy trong ngoặc kép, dòng trống, BOM.
- [ ] `bench/holdout.csv`: tập tách biệt với fixtures, gắn nhãn là dữ liệu tổng hợp.

### Task 9: Giao diện mới

- Vỏ ứng dụng: thanh trên (kết nối, AI, vai trò, giao diện), thanh bên 7 màn hình, định tuyến bằng hash để chạy được cả `file://`.
- Màn hình: Tổng quan · Thay đổi quy định · Hàng đợi duyệt · Sổ kiểm toán · Kho tài liệu · Sổ đăng ký & học từ phản hồi · Đánh giá.
- Đồ thị tác động dạng SVG (quy định → tài liệu → dòng, màu theo kết quả).
- Hàng đợi lọc theo vai trò; mục vượt cấp bị khoá, ghi rõ cần cấp nào.
- [ ] Không lỗi console ở 1280px và 390px, sáng và tối.

### Task 10: E2E + CI + kiểm tra kiểu

- Playwright chạy chế độ Offline trên server tĩnh: kịch bản trình diễn, phân tích → quyết định → ban hành → hoàn tác, tải lại trang vẫn còn sổ, Verify 9/9, khoá theo vai trò, tải CSV đánh giá.
- `jsconfig.json` + `// @ts-check` cho các module mới; `tsc --noEmit` trong CI.
- `.github/workflows/ci.yml`: `npm test`, `node bench/run.cjs`, `npx tsc`, Playwright.

### Task 11: Tài liệu

- `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP-BACKEND.md`, `docs/PHAN-HOI-BTC-SPRINT-1.md` (đối chiếu từng điểm, kể cả chỗ không làm theo và lý do), cập nhật `BUILD_LOG.md`.
