# PolicyChange OS

**Đường dẫn trực tuyến:** https://lehngvu0110-pixel.github.io/Policychange-OS/
**Trọng tài kiểm soát tài liệu khi quy định thay đổi.**

MLAI Hackathon 2026 · Bảng 1 OrganizationAI · **Đề A — Bộ điều phối chuyển tiếp (The Escalation Referee)**

---

## Vấn đề

Đổi một quy định thì không chỉ sửa một văn bản. Giá trị cũ nằm rải rác trong quy trình tác nghiệp, biểu
mẫu, checklist quầy một cửa, trang hỏi đáp và mẫu thư tự động. Thực tế: văn bản gốc được sửa, các tài
liệu vệ tinh thì không. Sinh viên đọc hướng dẫn cũ, chuyên viên làm theo checklist cũ, hệ thống gửi thư
trích dẫn con số đã hết hiệu lực.

Rà soát thủ công thì chậm và sót. Tự động thay thế toàn bộ bằng find-and-replace thì nguy hiểm — cùng
một con số ở hai chỗ có thể là hai quy định khác nhau.

## Giải pháp

Quy trình thường quy được chọn: **kiểm soát tài liệu khi thay đổi quy định** (xem
`docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md`).

Hệ thống nhận một thay đổi quy định, quét toàn bộ kho tài liệu, và với mỗi vị trí bị ảnh hưởng thì hoặc
tự sửa, hoặc dừng lại và hỏi đúng một câu cho đúng người:

| | Nhóm dừng | Khi nào | Ai quyết |
|---|---|---|---|
| **U1** | Chưa xác định được dữ kiện | Con số không có cụm từ nào neo nó vào một quy định đã đăng ký | Chuyên viên phụ trách tài liệu |
| **U2** | Ngoài phạm vi quy định | Dòng đang nói về một quy định **khác** cũng mang giá trị đó — sửa là đụng nhầm | Đơn vị chủ quản quy định bị đụng |
| **U3** | Vượt thẩm quyền | Tài liệu do cấp cao hơn ban hành — khóa quyền sửa | Người ban hành tài liệu đó |

Mọi trường hợp còn lại được **xử lý tự động, không hỏi người**. Đó là phần lớn khối lượng.

## Chạy thử

### Trực tuyến

Mở đường dẫn trực tuyến → bấm **▶ Chạy thay đổi mẫu**. Không cần tài khoản, không cần cài đặt.

### Tại máy (runbook đầy đủ, từ kho mã nguồn sạch)

```bash
git clone https://github.com/lehngvu0110-pixel/Policychange-OS.git
cd Policychange-OS
python3 -m http.server 8080      # hoặc: npx serve .
# mở http://localhost:8080
```

Không có bước build, không có phụ thuộc cho ứng dụng, không cần khóa API hay biến môi trường.
Ứng dụng tĩnh gồm `index.html` và các tệp trong `js/`; cần giữ nguyên cấu trúc thư mục.
Nên dùng HTTP server để kiểm tra giống môi trường triển khai.

### Triển khai

```bash
# GitHub Pages: sau khi thay đổi đã có trên nhánh main
# Settings → Pages → Source: Deploy from a branch → main / (root)

# hoặc Vercel / Netlify: kéo thả thư mục, không cấu hình gì thêm
```

## Lộ trình kiểm thử cho giám khảo (dưới 90 giây)

1. **▶ Chạy thay đổi mẫu** — hạn nộp đơn phúc khảo `7 ngày → 5 ngày`, ban hành ở cấp Trưởng phòng.
   Hệ thống quét 12 tài liệu, tự sửa 6 vị trí, dừng lại ở 3 vị trí và nêu rõ lý do từng chỗ.
2. **Mục 3** — ba câu hỏi chuyển tiếp, mỗi câu đúng hai nút. Bấm chọn.
3. **Mục 4** — **Ban hành**, xem sổ nhật ký SHA-256. Bấm **Hoàn tác** một bản ghi khi dòng hiện tại vẫn khớp nội dung đã ban hành.
4. **Mục 5** — **▶ Verify** chạy 9 ca kiểm thử, in bảng pass/fail kèm dấu thời gian.
5. Nhập dữ liệu mới: chọn quy định khác, gõ câu lệnh tiếng Việt tự do, hoặc dán một tài liệu mới vào kho.

Chi tiết từng ca: `TESTCASES.md`.

## Kiến trúc

```
Thay đổi quy định ──┐
(form hoặc câu      │
 tiếng Việt tự do)  ▼
              Bộ phân tích câu lệnh (tiền định, regex + sổ đăng ký)
                    │  ├─ không khớp quy định nào ──► TỪ CHỐI XỬ LÝ
                    ▼
              Bộ quét vị trí (chuẩn hoá giá trị: 10 triệu = 10.000.000 = 10tr)
                    ▼
              Bộ phân loại tiền định   U2 → U3 → U1 → tự động
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   Tự sinh bản vá        Sinh câu hỏi đơn lượt + 2 nút
        │                       │ (người quyết)
        └───────────┬───────────┘
                    ▼
              Ban hành + Sổ kiểm toán SHA-256 nối chuỗi + Hoàn tác
```

**Thành phần thực tế (đã chạy được):** phân tích tiền định, semantic evidence validation, graph, deterministic prover,
commit, audit và undo chạy trong trình duyệt. Provider adapter đã có nhưng **chưa cấu hình provider sống**;
phân tích câu lệnh dùng deterministic fallback. Ca semantic review trong guided demo dùng fixture mock được gắn nhãn,
đi qua validator thật.

**Thành phần giả lập:** kho 12 tài liệu và sổ 6 quy định là **dữ liệu tổng hợp do nhóm tự soạn**, mô phỏng
hệ thống văn bản của một trường đại học. Không dùng văn bản thật của bất kỳ đơn vị nào.

**Chưa có:** kết nối model provider thật; kết nối kho tài liệu thật (Google Drive / SharePoint); xử lý tài liệu dạng ảnh quét.

## Vì sao động cơ là tiền định chứ không phải mô hình ngôn ngữ

Ba lý do, theo thứ tự quan trọng:

1. **Quyết định phải giải thích được.** Nhật ký kiểm toán phải trả lời được "vì sao hệ thống dừng ở dòng này" bằng một quy tắc tra ngược được, không phải bằng điểm số độ tin cậy.
2. **Không được suy đoán trên dữ liệu mơ hồ.** Mô hình ngôn ngữ có xu hướng đoán khi thiếu thông tin. Ở đây đoán sai nghĩa là sửa nhầm một quy định đang có hiệu lực.
3. **Chạy được ở mọi lúc.** Không khóa API, không quota, không phụ thuộc mạng — điều kiện để giám khảo bấm vào là chạy.

Đã có adapter cho bước hiểu câu lệnh và kiểm tra bằng chứng ngữ nghĩa, nhưng chưa kết nối model sống.
Khi provider không khả dụng, bước hiểu câu lệnh dùng parser tiền định; model không được quyền phân loại hay ban hành.

## MLAI Demo

Mở ứng dụng qua GitHub Pages hoặc `python3 -m http.server 8080`, rồi vào phần **MLAI guided demo** ở đầu trang.
Provider chưa được cấu hình: bước hiểu yêu cầu sẽ ghi rõ **deterministic fallback**; ca mơ hồ ghi rõ **fixture/mock**.

1. Bấm **Run safe/date demo**. Hệ thống phân tích yêu cầu `R-PK-01 · 7 ngày → 5 ngày`, hiển thị policy, phạm vi một registry entry, request basis, graph và proof thật, rồi ban hành qua commit handler hiện có.
2. Quan sát `DEMO-7D`: hạn đổi thành 5 ngày, ngày `17/07/2025` được giữ nguyên. Mở audit entry để xem before/after và proof reference; bấm **Hoàn tác** ngay trong ledger để khôi phục dòng và thêm reversal event.
3. Bấm **Try global-scope refusal**. Yêu cầu đổi mọi deadline bị từ chối trước analysis; nội dung và ledger không đổi.
4. Bấm **Load ambiguity fixture · mock**. Graph và evidence đến từ fixture `semantic-ambiguous` qua semantic validator thật. Xem `REVIEW · semantic hold`, sau đó chọn **Duyệt đề xuất này** hoặc **Giữ nguyên dòng**; quyết định engine `AUTO_PATCH` vẫn hiển thị riêng.
5. Xem benchmark snapshot, rồi tái lập đầy đủ bằng `node bench/run.cjs`.

To reproduce interactively, use an HTTP server rather than `file://`; this also avoids browser restrictions on local-file access. The browser Verify harness is a separate check from the Node regression suites. Benchmark figures are measurements on the included synthetic fixtures only, not real-world error rates.

## Giới hạn đã biết

1. Chỉ xử lý thay đổi dạng **thay giá trị**. Thêm mới hoặc bãi bỏ điều khoản nằm ngoài phạm vi.
2. Chất lượng phân loại phụ thuộc độ đầy đủ của cụm từ neo. Khai báo thiếu làm tăng số hồ sơ U1 — hệ thống dừng nhiều hơn cần thiết, chứ không sửa sai. Đây là hướng lệch có chủ đích.
3. Chỉ phát hiện mâu thuẫn đi qua con số. Mâu thuẫn diễn đạt thuần ngữ nghĩa chưa phát hiện được.
4. Chưa đọc được tài liệu dạng ảnh quét hoặc PDF không có lớp văn bản.
5. Kho tài liệu hiện nằm trong bộ nhớ trình duyệt; tải lại trang là về trạng thái gốc. Bản tích hợp thật cần kho có phiên bản.
6. Sổ SHA-256 được kiểm tra lại trong phiên hiện tại và Hoàn tác chỉ thêm sự kiện mới. Sổ chưa có lưu trữ bền vững, chữ ký số hay mốc băm độc lập nên chưa thể dùng làm bằng chứng kiểm toán chống người có quyền sửa toàn bộ dữ liệu.
7. Số dùng định dạng Việt Nam: dấu chấm tách hàng nghìn, dấu phẩy cho phần thập phân. Ví dụ `10,5 triệu` và `10.500.000 đồng` hợp lệ; `10.5 triệu` bị từ chối.

## Cấu trúc kho mã nguồn

```
index.html      giao diện và động cơ chính; tải thêm các module trong js/
js/             AI adapter, semantic validator, graph, prover, demo và HTML escaping
README.md       tài liệu này — gồm runbook
TESTCASES.md    bảng trường hợp kiểm thử + kịch bản cho giám khảo
BUILD_LOG.md    nhật ký phát triển
tests/          bộ test Node.js
bench/          benchmark offline với dữ liệu tổng hợp
docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md
                tài liệu quy định của quy trình được chọn (yêu cầu bắt buộc của Đề A)
```

## Phase 5 benchmark (synthetic, offline)

The benchmark in `bench/` compares three deliberately different systems on the same authored fixtures:

- `naive`: replaces every matching numeric token without policy or document checks.
- `llmOnly`: follows a fixture-specified mock model response; it has no registry or deterministic prover.
- `policyChangeOS`: loads the current browser implementation from `index.html`, runs the deterministic request fallback, analysis, semantic evidence validation where supplied, prover, and existing commit handler. It does not connect to a live model.

Run it from the repository root with `node bench/run.cjs`. Add `--json` for machine-readable output. Run the benchmark contract tests with `node tests/benchmark.test.cjs`.

Run all Node regression suites with `node --test tests/*.test.cjs`. In environments that block child-process spawning, run each `tests/*.test.cjs` file separately with `node`. The in-browser Verify button is a separate check of the browser UI.

All 26 cases are synthetic. `bench/fixtures.json` contains the explicit input and manually authored ground truth for each case, including expected mutations and engine classifications. These fixtures are demonstrations of behavior, not a statistically representative sample and not evidence of real-world performance. The LLM-only responses are mocks, not model outputs.

Metrics are computed from fixture ground truth. Correct decision rate compares outcome, review category, human-review flag, and refusal flag. Correct mutation rate requires the exact expected mutation set. False auto-patch rate is the number of cases with at least one automatic mutation that includes an unapproved mutation, divided by all cases with at least one automatic mutation; it is `n/a` if that denominator is zero. Unsafe mutation count counts unapproved mutation tuples. Correct refusal rate is measured only over fixtures whose ground truth requires refusal; correct escalation rate only over fixtures requiring human review. Missed safe automation rate is the fraction of fixtures with expected safe mutations where at least one expected mutation was missed. PolicyChange-OS also reports engine classification accuracy against the explicitly authored per-line engine decisions.

The harness does not report inferential statistics or claim generalization. It does not measure provider latency (there is no live provider), and it does not benchmark undo. It adapts the actual browser code through a Node VM harness; browser rendering and interactive Verify are outside this benchmark. The retained date fixture is now a regression check: structured numeric components are excluded from candidate matching and independently rejected by the prover's replacement recheck, while a genuine deadline on the same line remains patchable.
