# Phản hồi nhận xét Sprint 1 của Ban tổ chức

Nhóm AbleMind · PolicyChange OS · Sprint 2 (28/09 – 15/10/2026)

Chúng tôi kiểm lại từng nhận xét với mã nguồn trước khi sửa. Bảng dưới ghi nhận xét, việc đã làm và cách kiểm chứng.

## Ưu tiên 1

### 1. Chưa có backend và cơ sở dữ liệu dùng chung; tải lại trang là mất dữ liệu

**Đúng.** Sprint 1 giữ toàn bộ trạng thái trong bộ nhớ trình duyệt.

**Đã làm:**
- Supabase Postgres với 6 bảng (`workspaces`, `members`, `policies`, `documents`, `audit_log`, `feedback_events`)
  và Row Level Security: client **chỉ đọc**.
- Mọi thao tác ghi đi qua Edge Function `policy-api`. Máy chủ không tin dữ liệu client gửi lên ngoài *ý định*;
  nó nạp dữ liệu từ CSDL, chạy lại chính động cơ + prover dùng trong trình duyệt, kiểm quyền, rồi gọi hàm SQL
  `apply_change` ghi tài liệu + sổ kiểm toán + phản hồi trong **một giao dịch** có khoá workspace và kiểm đuôi sổ
  (hai người ban hành cùng lúc → người sau nhận 409 và được nạp lại).
- Nhiều người dùng: workspace `demo` (công khai, vai trò giả lập) và `hcmut-pilot` (bắt buộc đăng nhập).
- **Hàng đợi duyệt dùng chung** (bảng `open_changes`, `change_decisions`): phần chắc chắn áp ngay; các vị trí cần
  người trở thành hồ sơ `CR-n` mà mỗi người có thẩm quyền quyết trên máy của mình. Mỗi quyết định được áp và ghi sổ
  ngay, đứng tên người quyết; hai người quyết cùng một vị trí → người sau nhận 409.
- Mất mạng → tự lùi về chế độ Ngoại tuyến lưu bằng **IndexedDB**; tải lại trang vẫn còn.

**Kiểm chứng:** `tests/policy-server.test.cjs`, `tests/app-controller.test.cjs`, `tests/remote-store.test.cjs`;
E2E “tải lại vẫn còn” trong `tests/e2e/flow.spec.mjs`; kiểm thử SQL trực tiếp trên dự án (ghi hợp lệ, xung đột
đuôi sổ, dòng đã đổi, chuỗi không khớp đều bị từ chối và không ghi gì).

### 2. Chưa kết nối LLM thật vào `js/policy-ai.js`

**Đúng.** Sprint 1 chỉ có khe adapter và parser tiền định.

**Đã làm:**
- `ai-extract` (hiểu câu yêu cầu) và `ai-discover` (rà soát ngữ nghĩa) gọi **OpenAI Chat Completions với Structured
  Outputs** (`json_schema`, `strict`). Khoá chỉ nằm trong Secrets của Edge Function.
- Thiết kế chống ảo giác: mô hình chỉ được trả **trích dẫn nguyên văn**; mã tự tìm vị trí. Đầu ra đi qua đúng
  validator đã có ở Sprint 1 (`policy-ai.js#validateOutput`, `semantic-discovery.js#validateCandidates`).
- AI không có quyền phân loại hay ban hành: chỉ có thể giữ một AUTO_PATCH lại cho người duyệt.
- Có hạn mức gọi theo ngày và thời gian chờ; AI lỗi/hết giờ thì hệ thống tự dùng động cơ tiền định và ghi rõ lý do.

**Kiểm chứng:** `tests/openai-mapping.test.cjs` (trích dẫn bịa bị loại; mô hình chọn nhầm quy định cùng giá trị bị
validator từ chối; lệnh chèn trong câu yêu cầu chỉ nằm trong phần dữ liệu của prompt; AI không nâng được U2 thành tự sửa). Bật bằng cách dán `OPENAI_API_KEY` (xem `docs/SETUP-BACKEND.md`).

## Ưu tiên 2

### 3. Chuyển sang TypeScript + Vite

**Làm một phần, có chủ đích.** Chúng tôi đồng ý mục tiêu (bắt lỗi kiểu sớm, mã dễ bảo trì) nhưng không đưa bước build vào:

- Cùng một tệp JS được chạy ở **ba môi trường**: trình duyệt (kể cả mở bằng `file://` khi không có mạng ở phòng
  chấm), Node (test, benchmark) và Deno (Edge Function). Máy chủ tái lập được đúng quyết định của giao diện là nhờ
  dùng chung một mã nguồn không qua biên dịch.
- Vite thêm bước build và phụ thuộc, trong khi lợi ích chính của TypeScript — kiểm kiểu — có thể đạt được bằng
  **JSDoc + `// @ts-check`**. Tất cả module mới của Sprint 2 đều có chú thích kiểu và được kiểm bằng
  `tsc --noEmit` ở chế độ `strict` trong CI (`npm run typecheck`).
- Nếu sau Demo Day cần mở rộng giao diện nhiều hơn, việc chuyển các tệp này sang `.ts` là cơ học vì kiểu đã có sẵn.

### 4. Phân quyền theo vai trò: “Chuyên viên phòng ban chỉ duyệt sửa văn bản thuộc phạm vi của mình”

**Đã làm** (`js/policy-authz.js`): mỗi người có **cấp** (1 chuyên viên · 2 trưởng đơn vị · 3 Hiệu trưởng) và
**danh sách đơn vị phụ trách**. U1 chỉ người phụ trách tài liệu quyết; U2 chỉ trưởng đơn vị sở hữu quy định bị đụng;
U3 cần đủ cấp của tài liệu; thêm neo cũng theo cấp × đơn vị; hoàn tác còn đòi cấp ≥ cấp ban hành của thay đổi (chuyên viên không hoàn tác được
quyết định của trưởng phòng). Giao diện khoá nút và ghi rõ cần ai;
máy chủ chặn thật (403) kể cả khi client bị sửa.

**Kiểm chứng:** `tests/policy-authz.test.cjs`, `tests/policy-server.test.cjs`; E2E “hàng đợi lọc theo vai trò”.

## Các khoảng trống khác

| Nhận xét | Đã làm |
|---|---|
| Chưa có E2E | Playwright: luồng phân tích → quyết định → ban hành → tải lại → hoàn tác; phân quyền; Verify; báo cáo đánh giá; minh hoạ; từ chối yêu cầu toàn cục; học neo; bố cục 390 px sáng/tối không tràn ngang. Chạy trong GitHub Actions. |
| Chưa có kiểm thử tải | `bench/load.cjs`: động cơ + prover đến 2.400 tài liệu / 9.200 dòng; máy chủ lập kế hoạch ghi với sổ 10.000 bản ghi. Đồng thời sửa một lỗi phát hiện nhờ bước này: máy chủ trước đây chỉ đọc tối đa 1.000 bản ghi sổ (giới hạn PostgREST). |
| Dữ liệu mất khi F5 | Mục 1. |

## Yêu cầu nâng cao của Đề A trong Sprint 2

| Yêu cầu | Cách làm | Ở đâu |
|---|---|---|
| Tự điều chỉnh ngưỡng chuyển tiếp từ phản hồi | Ghi mọi câu trả lời U1/U2/U3 và rà soát AI vào `feedback_events`. Khi ≥ 2 câu trả lời “Có, thuộc quy định X” ở U1 cùng chứa một cụm từ chưa là neo, hệ thống **đề xuất** cụm đó làm neo mới cho X. Trưởng đơn vị duyệt → ghi sổ → lần sau các dòng tương tự được tự xử lý. Cụm từ trùng neo quy định khác, có trong câu trả lời “Không”, hoặc toàn từ chức năng bị loại. | `js/policy-learning.js`, màn hình **Sổ đăng ký & học** |
| Báo cáo độ chính xác trên tập kiểm thử độc lập | Tập `bench/holdout.csv` 48 ca gắn nhãn tay theo quy tắc nghiệp vụ, tách biệt dữ liệu phát triển (có test kiểm không trùng dòng). Báo cáo tỉ lệ bỏ sót, tỉ lệ chuyển tiếp thừa, độ đúng loại, ma trận nhầm lẫn; tải được CSV; người dùng có thể tải tập CSV của mình. | `js/policy-evaluation.js`, màn hình **Đánh giá**, `npm run eval` |
| Thử nghiệm với ≥ 3 nhân sự thật | Workspace thí điểm có đăng nhập và phân quyền thật; kịch bản và phiếu ghi nhận ở `docs/THU-NGHIEM-NGUOI-DUNG.md`. Việc tuyển người và chạy buổi thử do nhóm thực hiện. | |

Kết quả hiện tại trên tập độc lập (chỉ động cơ tiền định): đúng 81,3 %, **bỏ sót 22,2 %** (6/27), chuyển tiếp thừa
14,3 % (3/21). Chúng tôi công bố cả con số chưa đẹp này vì nó chỉ đúng chỗ cần cải thiện: cả 6 ca bỏ sót là ca có neo
đúng nhưng con số nói về việc khác (ví dụ thời hạn *công bố kết quả* phúc khảo, không phải hạn *nộp đơn*). Đó là
nhiệm vụ của lớp AI ngữ nghĩa; số đo khi bật AI sẽ được cập nhật sau khi chạy trên khoá thật.
