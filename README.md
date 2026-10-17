# PolicyChange OS

**Trọng tài kiểm soát tài liệu khi quy định thay đổi.**

MLAI Hackathon 2026 · Bảng 1 OrganizationAI · Đề A: *The Escalation Referee*

[**Mở bản demo**](https://lehngvu0110-pixel.github.io/Policychange-OS/) · [Kịch bản trình diễn](docs/MLAI-DEMO.md) · [Cài backend](docs/SETUP-BACKEND.md) · [Phương pháp kiểm chứng](docs/PHUONG-PHAP-KIEM-CHUNG.md)

Khi một quy định đổi, giá trị cũ có thể vẫn nằm trong quy trình, biểu mẫu, checklist, FAQ và mẫu thư. PolicyChange OS rà kho tài liệu, đề xuất cập nhật những vị trí đủ điều kiện và chuyển các trường hợp cần phán đoán đến người có thẩm quyền. Mỗi lần áp dụng, từ chối hoặc hoàn tác đều được ghi vào sổ kiểm toán.

> **Phạm vi:** nguyên mẫu dùng dữ liệu tổng hợp trong bối cảnh trường đại học. Các thay đổi pháp lý và khôi phục lịch sử ngày 17/10/2026 đã được triển khai trong mã và kiểm chứng cục bộ; chưa được xác nhận triển khai trên bản demo trực tuyến. Xem [báo cáo kỹ thuật](docs/ENGINEERING-REMEDIATION.md).

## Chạy thử trong vài phút

### Bản demo trực tuyến

1. Mở [PolicyChange OS](https://lehngvu0110-pixel.github.io/Policychange-OS/).
2. Chọn **Xem minh hoạ 3 phút**, hoặc vào **Thay đổi quy định** để tự thử.
3. Đổi **Vai trò** trên thanh trên cùng để xem quyền của chuyên viên, trưởng phòng và Hiệu trưởng.
4. Xem các câu hỏi cần người trả lời, ban hành phần đủ điều kiện và kiểm tra sổ kiểm toán.

Workspace `demo` dùng vai trò giả lập và dữ liệu dùng chung; người có đường dẫn có thể thao tác, kể cả khôi phục dữ liệu mẫu. Workspace thí điểm yêu cầu đăng nhập và được cấp quyền.

### Chạy trên máy

Dùng **Node.js 22** để khớp môi trường CI. Máy chủ tĩnh và các lệnh kiểm chứng bằng Node không cần cài gói ngoài.

```bash
git clone https://github.com/lehngvu0110-pixel/Policychange-OS.git
cd Policychange-OS
npm run serve
```

Mở [localhost:8080](http://localhost:8080/). Cấu hình mặc định trong `js/config.js` trỏ tới backend demo dùng chung.

Để thử bằng dữ liệu cục bộ, mở [chế độ ngoại tuyến](http://localhost:8080/index.html?offline=1). Chế độ này lưu dữ liệu bằng IndexedDB trên trình duyệt và không gọi backend. Ứng dụng cũng hỗ trợ mở trực tiếp `index.html`; dùng máy chủ cục bộ là cách thuận tiện để kiểm thử.

## Từ thay đổi quy định đến quyết định

**Nhập yêu cầu → rà tài liệu → tự sửa hoặc hỏi người → ban hành và ghi sổ.**

Động cơ tiền định phân loại từng vị trí theo neo chủ đề, neo đại lượng, giá trị và cấp ban hành. Những vị trí được đề xuất tự sửa phải qua bộ kiểm chứng độc lập (*Prover*) với 14 điều kiện trước khi áp dụng.

| Kết quả | Trường hợp điển hình | Người xử lý |
|---|---|---|
| **Tự sửa** | Đủ căn cứ liên hệ giá trị với quy định, đủ thẩm quyền và vượt qua Prover | Hệ thống áp dụng khi ban hành |
| **U1 · Chưa rõ dữ kiện** | Thiếu neo, chưa rõ con số đo gì hoặc giá trị viết khác dạng | Người phụ trách đơn vị sở hữu tài liệu |
| **U2 · Ngoài phạm vi** | Dòng thuộc một quy định khác có cùng giá trị | Trưởng đơn vị sở hữu quy định bị ảnh hưởng |
| **U3 · Vượt thẩm quyền** | Tài liệu do cấp cao hơn cấp ban hành thay đổi ban hành | Người đủ cấp, phụ trách đơn vị sở hữu tài liệu |

Mỗi hồ sơ chuyển tiếp có một câu hỏi, hai lựa chọn và trích dẫn vị trí liên quan. Phân quyền xét cả **cấp người dùng** và **đơn vị phụ trách**, được kiểm tra lại ở máy chủ khi dùng backend.

Quy trình được mô tả trong [QT-KSTL-01 v2.0](docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md); lệnh `npm run verify` đối chiếu theo từng điều.

## Các khả năng chính

| Khả năng | Cách hoạt động |
|---|---|
| **Rà soát có kiểm chứng** | Động cơ đề xuất; Prover kiểm điều kiện trước khi tự sửa. |
| **AI hỗ trợ ngữ nghĩa** | Hiểu yêu cầu tiếng Việt và rà lại các dòng dự định tự sửa qua Edge Functions. Bằng chứng phải trích nguyên văn; AI có thể giữ dòng lại cho người xem, không được nâng U1/U2/U3 thành tự sửa. |
| **Duyệt nhiều người** | Phần đủ điều kiện có thể áp dụng trước; phần cần duyệt trở thành hồ sơ `CR-n` trong hàng đợi dùng chung. |
| **Sổ kiểm toán và lịch sử** | Chuỗi băm SHA-256, chỉ ghi thêm; so sánh phiên bản theo dòng hoặc từ. Khôi phục tạo bản ghi hoàn tác mới và được thiết kế áp dụng trong một giao dịch. |
| **Học từ phản hồi** | Đề xuất neo mới từ câu trả lời U1; chỉ cập nhật sổ neo khi người có quyền duyệt. |
| **Căn cứ pháp lý** | Trích số hiệu, khám phá quan hệ nhiều tầng và đánh giá hiệu lực tại ngày chọn, kèm bằng chứng và giới hạn tra cứu. |
| **Làm việc ngoại tuyến** | Lưu cục bộ bằng IndexedDB; không có AI thì dùng bộ phân tích tiền định. |

Khoá AI nằm ở máy chủ. Backend dùng API tương thích OpenAI; các bản ghi thí nghiệm hiện có sử dụng Gemini. Khi AI không khả dụng, hệ thống có thể giữ kết quả của động cơ tiền định, nên các giới hạn ngữ nghĩa bên dưới vẫn áp dụng.

Tra cứu pháp lý không dùng AI để tự suy ra quan hệ. Khi chưa cấu hình nguồn trực tuyến, giao diện dùng **kho văn bản mô phỏng** và gắn nhãn rõ. Tra cứu chưa đầy đủ không chứng nhận văn bản còn hiệu lực; xác nhận đã xem cảnh báo không thay đổi quyết định của động cơ hay bỏ qua Prover. Xem [phạm vi và cấu hình pháp lý](docs/LEGAL-INTELLIGENCE.md).

## Kiểm thử và đánh giá

### Các lệnh thường dùng

```bash
# Không cần cài dependency
npm run verify          # Kiểm chứng 14 mục theo QT-KSTL-01
npm test                # Unit test bằng Node.js
npm run bench           # 26 fixture: naive / LLM-only mock / PolicyChange OS
npm run eval            # Tập phát triển 48 ca
npm run eval:blind      # Tập mù số 1: 40 ca
npm run eval:blind2     # Tập mù số 2: 36 ca
npm run eval:ai         # Phát lại bằng chứng AI đã lưu, không gọi mô hình trực tuyến
npm run eval:learning   # Học trên một tập, đo trên tập khác
npm run load            # Kiểm thử tải cục bộ
```

Kiểm tra kiểu và E2E cần cài dependency:

```bash
npm ci
npm run typecheck
npx playwright install chromium
npm run e2e
```

CI chạy Node.js 22, kiểm thử, benchmark, đánh giá, kiểm tra kiểu, độ đồng bộ module Edge và Playwright; có job riêng chạy `deno check` cho Edge Functions. Không có bước build frontend: giao diện dùng HTML, CSS và JavaScript thuần.

### Kết quả tái lập cục bộ

Các kết quả dưới đây được chạy lại ngày **17/10/2026**, trên dữ liệu tổng hợp:

| Bộ kiểm chứng | Kết quả |
|---|---|
| `npm run verify` | **14/14** mục đạt; bao gồm **9/9** ca Verify của đề bài |
| Benchmark 26 fixture | Tự sửa sai: **0/13** ca có tự sửa với PolicyChange OS; naive **16/25**; LLM-only mock **13/18** |
| Tập mù 1 · 40 ca, chỉ động cơ | Đúng hoàn toàn **29/40**; tự sửa sai **0/5**; bỏ sót **0/23**; báo lên thừa **9/17** (52,9%) |
| Tập mù 2 · 36 ca, chỉ động cơ | Đúng hoàn toàn **30/36**; tự sửa sai **0/8**; bỏ sót **0/21**; báo lên thừa **4/15** (26,7%) |

**Cách đọc:** tự sửa sai tính trên các ca có hành động tự sửa; bỏ sót tính trên các ca cần người; báo lên thừa tính trên các ca lẽ ra tự sửa hoặc không cần xử lý. Không có sửa sai trong một tập nhỏ không đồng nghĩa với bảo đảm an toàn trên tài liệu thực tế. LLM-only trong benchmark là mô phỏng, không phải lần gọi mô hình thật.

Tập `holdout.csv` gồm 48 ca **đã dùng để phát triển**, không phải tập kiểm thử độc lập. Hai ca H40/H47 vẫn có thể bị động cơ và Prover chấp nhận sai khi thiếu bằng chứng AI. `eval:ai` phát lại các lần đo đã lưu để kiểm tra lớp ngữ nghĩa; lệnh này không đo chất lượng mô hình hiện tại.

Nguồn dữ liệu, quy trình đóng băng và giới hạn phương pháp: [benchmark](bench/README.md), [tập mù 1](bench/BLIND-PROVENANCE.md), [tập mù 2](bench/BLIND2-PROVENANCE.md), [phương pháp kiểm chứng](docs/PHUONG-PHAP-KIEM-CHUNG.md).

Thử nghiệm người dùng ngày 14/10 ghi nhận **8/9 việc hoàn thành** từ 3 người tham gia là sinh viên; chưa có chuyên viên hoặc trưởng phòng thật. Xem [kết quả và giới hạn thử nghiệm](docs/KET-QUA-THU-NGHIEM.md).

## Kiến trúc

```text
Trình duyệt · HTML / CSS / JavaScript
  └─ Giao diện → App Controller → động cơ / Prover / workflow / phân quyền
       ├─ Ngoại tuyến → IndexedDB
       └─ Trực tuyến
            ├─ Đọc → Supabase PostgREST + RLS
            ├─ Ghi → policy-api → kiểm lại nghiệp vụ → giao dịch SQL
            ├─ AI → ai-extract / ai-discover → API mô hình
            └─ Pháp lý → legal-discover → cache bằng chứng / nguồn tra cứu
```

Các module nghiệp vụ được dùng chung giữa trình duyệt, Node.js và Deno. Sau khi sửa module dùng ở Edge Functions, chạy `npm run sync:edge` để cập nhật bản sao trong `_shared`.

| Đường dẫn | Nội dung |
|---|---|
| `index.html`, `css/` | Vỏ ứng dụng và giao diện |
| `js/app/`, `js/app-controller.js` | Hiển thị, sự kiện và điều phối nghiệp vụ |
| `js/policy-*.js`, `js/semantic-discovery.js` | Động cơ, Prover, workflow, sổ kiểm toán, phân quyền, học và đánh giá |
| `js/legal-*.js`, `js/doc-history.js` | Tra cứu pháp lý, hiệu lực và lịch sử tài liệu |
| `js/remote-*.js`, `js/config.js` | Kết nối backend và cấu hình trình duyệt |
| `supabase/functions/`, `supabase/migrations/` | API máy chủ, schema, RLS và hàm giao dịch |
| `tests/`, `tests/e2e/` | Unit test và Playwright |
| `bench/`, `scripts/` | Dữ liệu đánh giá, công cụ kiểm chứng và máy chủ cục bộ |
| `docs/` | Kiến trúc, cài đặt, quy trình và bằng chứng đánh giá |

Chi tiết: [kiến trúc hệ thống](docs/ARCHITECTURE.md). Để dùng backend riêng, làm theo [hướng dẫn Supabase, AI và tài khoản thí điểm](docs/SETUP-BACKEND.md); cấu hình bổ sung cho pháp lý nằm trong [Legal Intelligence](docs/LEGAL-INTELLIGENCE.md).

## Giới hạn cần biết

- Luồng cập nhật quy định hiện chỉ xử lý **thay giá trị**; thêm mới hoặc bãi bỏ điều khoản nằm ngoài phạm vi của động cơ cập nhật.
- Thiếu neo làm tăng số câu hỏi chuyển cho người. Có đủ neo vẫn có thể hiểu sai ý nghĩa con số; H40/H47 là các ví dụ đã biết. Prover không bảo đảm hiểu đúng toàn bộ ngữ nghĩa.
- Chưa hỗ trợ OCR cho ảnh quét hoặc PDF không có lớp văn bản; chưa kết nối Google Drive / SharePoint.
- Tra cứu pháp lý trực tuyến chưa được kiểm chứng end-to-end với nhà cung cấp và toàn bộ cấu trúc nguồn. Phạm vi quan hệ, lịch sử còn chưa rõ; kết quả trực tuyến được giữ ở mức chưa đầy đủ.
- Migration bằng chứng pháp lý và giao dịch khôi phục chưa được kiểm thử tích hợp với PostgreSQL trong đợt kiểm chứng ngày 17/10. Xem [các việc còn lại trước triển khai](docs/ENGINEERING-REMEDIATION.md).
- Chuỗi băm kiểm toán chưa có chữ ký số hoặc mốc băm độc lập bên ngoài CSDL.
- Giá trị số theo định dạng Việt Nam: `10,5 triệu` và `10.500.000 đồng` hợp lệ; `10.5 triệu` bị từ chối.

## Tài liệu liên quan

| Bạn muốn… | Tài liệu |
|---|---|
| Trình diễn sản phẩm | [Kịch bản demo](docs/MLAI-DEMO.md) |
| Hiểu quy tắc tự sửa và chuyển tiếp | [QT-KSTL-01](docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md) |
| Cài backend và cấp quyền | [Setup backend](docs/SETUP-BACKEND.md) |
| Hiểu căn cứ pháp lý, nguồn và biến môi trường | [Legal Intelligence](docs/LEGAL-INTELLIGENCE.md) |
| Kiểm tra cách đo và bằng chứng | [Phương pháp kiểm chứng](docs/PHUONG-PHAP-KIEM-CHUNG.md) · [Benchmark](bench/README.md) |
| Xem phản hồi và các thay đổi theo sprint | [Phản hồi doanh nghiệp](docs/PHAN-HOI-DOANH-NGHIEP-SPRINT-1.md) · [Phản hồi BTC](docs/PHAN-HOI-BTC-SPRINT-1.md) |
| Hiểu giá trị ứng dụng | [Giá trị kinh doanh](docs/GIA-TRI-KINH-DOANH.md) |
| Xem tình trạng kiểm chứng ngày 17/10 | [Báo cáo kỹ thuật](docs/ENGINEERING-REMEDIATION.md) |
