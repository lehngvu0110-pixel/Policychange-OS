# Kiến trúc PolicyChange OS (Sprint 2)

## Nguyên tắc

1. **Một nơi quyết định.** `js/policy-engine.js` là nơi duy nhất phân loại AUTO_PATCH / U1 / U2 / U3.
   Cùng một tệp chạy trong trình duyệt, Node (test, benchmark) và Deno (Edge Function), nên máy chủ tái lập
   đúng quyết định giao diện đã hiển thị.
2. **AI chỉ đưa bằng chứng.** Mô hình chỉ trả chuỗi trích dẫn nguyên văn; vị trí ký tự do mã tự tính bằng
   `indexOf`. Trích dẫn bịa → không tìm thấy → bị loại, hệ thống giữ kết quả tiền định. AI có thể giữ một
   AUTO_PATCH lại cho người duyệt; không thể biến một ca chuyển tiếp thành tự sửa.
3. **Client chỉ gửi ý định.** Trình duyệt gửi “quy định nào, giá trị mới, cấp khai, người đã chọn A hay B ở dòng
   nào”. Máy chủ tự nạp dữ liệu, chạy lại động cơ + prover, kiểm quyền, rồi mới ghi.
4. **Tự sửa cần hai tín hiệu.** Một dòng chỉ được tự sửa khi có *neo chủ đề* (đang nói về việc gì) **và** *neo đại
   lượng* (con số đo cái gì) — hoặc neo chủ đề chi phối trực tiếp con số. Giá trị viết bằng chữ, quy đổi tuần hay gõ
   không dấu được nhận ra nhưng luôn chuyển người. Prover kiểm lại độc lập 14 điều kiện (QT-KSTL-01 §5.3–5.4).
5. **Có khoá AI thì AI luôn rà trước khi ban hành.** `app.ensureSemanticReview()` chạy tự động khi phân tích xong và
   trước khi gửi lệnh ban hành.
6. **Sổ chỉ ghi thêm.** Mỗi bản ghi băm SHA-256 trên nội dung của nó nối với bản ghi trước. Hoàn tác là một bản
   ghi mới.

## Thành phần

| Tầng | Tệp | Vai trò |
|---|---|---|
| Lõi dùng chung | `sha256.js`, `policy-engine.js`, `policy-ledger.js`, `policy-workflow.js`, `policy-prover.js`, `semantic-discovery.js` | Phân tích, chứng minh, ban hành, hoàn tác, sổ kiểm toán |
| Phân quyền | `policy-authz.js` | Cấp × đơn vị phụ trách; dùng cả để khoá nút trên giao diện lẫn chặn ở máy chủ |
| Máy chủ (thuần) | `policy-server.js` | `planCommit / planUndo / planAnchor / planAddDocument` → kế hoạch ghi cho SQL; có unit test trong Node |
| Học & đánh giá | `policy-learning.js`, `policy-evaluation.js` | Đề xuất neo từ phản hồi U1; tỉ lệ bỏ sót / chuyển tiếp thừa trên tập độc lập |
| AI | `openai-mapping.js`, `policy-ai.js`, `remote-ai-adapter.js` | Schema Structured Outputs, prompt tiếng Việt, chuyển trích dẫn → hợp đồng validator sẵn có |
| Lưu trữ | `policy-store.js` (IndexedDB → localStorage → bộ nhớ), `remote-store.js` (REST Supabase + đăng nhập) | |
| Ứng dụng | `app-controller.js` (trạng thái + thao tác, không DOM), `app/ui.js`, `app/graph.js` | 7 màn hình, định tuyến bằng hash |
| Supabase | `supabase/migrations/*.sql`, `supabase/functions/*` | Schema, RLS, `apply_change`, hạn mức AI; `policy-api`, `ai-extract`, `ai-discover` |

## Luồng ban hành ở chế độ dùng chung

```
Người dùng                Trình duyệt                           policy-api (Deno)                     Postgres
   │ chọn thay đổi ─────► analyze() cục bộ, hiển thị kết quả
   │ quyết A/B ─────────► kiểm quyền cục bộ (khoá nút)
   │ Ban hành ──────────► POST {change, decisions, holds, ...} ─► xác định người gọi (JWT / vai trò demo)
   │                                                            ► nạp policies, documents, audit_log, hồ sơ mở (theo trang)
   │                                                            ► Ledger.verify + so đuôi sổ với workspace
   │                                                            ► analyze + prover lại trên dữ liệu CSDL
   │                                                            ► canIssue / canDecide từng quyết định
   │                                                            ► rpc apply_change(kế hoạch) ─────────────► khoá workspace (FOR UPDATE)
   │                                                                                                        so ledger_seq/tail (409 nếu lệch)
   │                                                                                                        so từng dòng cũ (stale_line)
   │                                                                                                        ghi tài liệu + sổ + phản hồi + hồ sơ
   │ ◄──────────────────── nạp lại dữ liệu ◄──────────────────── kết quả                          ◄──────── COMMIT (hoặc huỷ toàn bộ)
```

### Hàng đợi duyệt dùng chung

Ban hành không đợi mọi người quyết xong. Khi còn vị trí chờ người (U1/U2/U3 hoặc bằng chứng AI chưa rà soát), máy
chủ áp ngay phần chắc chắn và mở **hồ sơ** `open_changes` (`CR-n`: quy định, giá trị cũ → mới, cấp ban hành, người
khởi tạo). Mỗi vị trí còn lại là một dòng chờ trong hàng đợi của **mọi** máy đang xem workspace.

```
Trưởng phòng Đào tạo ── commit ──► áp 6 dòng tự sửa + mở CR-1 (3 vị trí chờ)
Chuyên viên Đào tạo  ── decide(CR-1, HD-04 dòng 4, b) ──► kiểm quyền → áp/giữ → ghi sổ + change_decisions
Trưởng phòng TT–PC   ── decide(CR-1, QT-07 dòng 2, a) ──► …
Hiệu trưởng          ── decide(CR-1, QD-01 dòng 1, a) ──► … → hết vị trí chờ → đóng CR-1
```

- `decide` chạy lại động cơ trên dữ liệu hiện tại (`analyzeOpenChange`, dùng giá trị cũ của hồ sơ) nên vị trí đã bị
  sửa ở nơi khác sẽ bị từ chối (`stale_line`), không áp mù.
- Khoá chính `(workspace, change, doc, dòng, nội dung dòng)` của `change_decisions` chặn hai người quyết cùng một chỗ
  (`decision_conflict` → 409).
- Bản ghi sổ ghi **người quyết** (không phải người bấm Ban hành) và căn cứ `hồ sơ CR-n · cấp ban hành k · khởi tạo bởi …`.
- Ban hành lại cùng thay đổi khi hồ sơ còn mở sẽ dùng lại hồ sơ đó, không mở hồ sơ trùng.

Hai người ban hành cùng lúc: người thứ hai nhận 409 “Có người vừa cập nhật workspace” và giao diện tự nạp lại.
Trình duyệt kiểm đuôi sổ mỗi 20 giây để thấy thay đổi của người khác.

## Phân quyền

| Thao tác | Điều kiện |
|---|---|
| Ban hành thay đổi ở cấp *k* cho quy định R | cấp người dùng ≥ *k* **và** phụ trách đơn vị sở hữu R |
| Quyết vị trí U1 (ngay hoặc trong hồ sơ `CR-n`) | phụ trách đơn vị sở hữu tài liệu (cấp ≥ 1) |
| Quyết hồ sơ U2 | cấp ≥ 2 **và** phụ trách đơn vị sở hữu quy định bị đụng |
| Quyết hồ sơ U3, rà soát bằng chứng AI | cấp ≥ cấp tài liệu **và** phụ trách đơn vị ban hành tài liệu |
| Hoàn tác | cấp ≥ max(cấp tài liệu, cấp ban hành ghi trong căn cứ) **và** phụ trách tài liệu — chuyên viên không hoàn tác được thay đổi do trưởng phòng ban hành |
| Thêm cụm từ neo | cấp ≥ 2 **và** phụ trách đơn vị sở hữu quy định |
| Cập nhật giá trị gốc trong sổ đăng ký | thay đổi được ban hành ở cấp ≥ cấp của quy định |

Workspace `demo`: người không đăng nhập chọn một vai trò giả lập; bản ghi ghi rõ “(demo)”. Workspace `hcmut-pilot`:
bắt buộc đăng nhập, cấp và đơn vị lấy từ bảng `members` do quản trị điền.

## Bảo mật

- Bảng chỉ có policy **SELECT** cho `anon/authenticated`; không vai trò client nào INSERT/UPDATE/DELETE được.
- `apply_change`, `reset_demo_workspace`, `consume_ai_quota` chỉ cấp cho `service_role`. Hàm hỗ trợ RLS nằm ở schema
  `private` (không phơi qua `/rest/v1/rpc`). Supabase security advisor: không còn cảnh báo.
- `OPENAI_API_KEY` chỉ nằm trong Secrets của Edge Function. Khoá `anon` trong `js/config.js` là khoá công khai theo
  thiết kế của Supabase.
- Mọi chuỗi từ dữ liệu được thoát HTML trước khi chèn vào giao diện (`esc`). Nội dung tài liệu và câu yêu cầu được
  đánh dấu là dữ liệu trong prompt; mô hình được dặn bỏ qua mệnh lệnh nằm trong đó, và dù có làm theo thì đầu ra vẫn
  phải qua validator.
- Hạn mức AI theo ngày: toàn hệ thống (`AI_DAILY_LIMIT`, mặc định 300) và theo từng máy khách (`AI_CLIENT_LIMIT`,
  mặc định 40, đếm theo SHA-256 của IP — không lưu IP gốc) để một người không tiêu hết hạn mức của cả nhóm.

## Vì sao không chuyển sang TypeScript + Vite

Xem `docs/PHAN-HOI-BTC-SPRINT-1.md`, mục 3.
