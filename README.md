# PolicyChange OS

**Trọng tài kiểm soát tài liệu khi quy định thay đổi.**
MLAI Hackathon 2026 · Bảng 1 OrganizationAI · **Đề A · The Escalation Referee**

Bản chạy trực tuyến: https://lehngvu0110-pixel.github.io/Policychange-OS/

---

## Vấn đề

Đổi một quy định không chỉ là sửa một văn bản. Giá trị cũ còn nằm trong quy trình tác nghiệp, biểu mẫu,
checklist quầy một cửa, trang hỏi đáp và mẫu thư tự động. Văn bản gốc thường được sửa, còn các tài liệu
vệ tinh thì không. Rà soát tay thì chậm và sót; find-and-replace thì nguy hiểm, vì cùng một con số ở hai chỗ
có thể thuộc hai quy định khác nhau.

## Giải pháp

Hệ thống nhận một thay đổi quy định, quét toàn bộ kho, và với mỗi vị trí bị ảnh hưởng thì **tự sửa** nếu
chắc chắn, hoặc **dừng lại và hỏi đúng một câu, cho đúng người**:

| | Khi nào | Ai quyết (được phân quyền thật) |
|---|---|---|
| **U1** · chưa rõ dữ kiện | Con số không có neo vào quy định nào; hoặc đúng chủ đề nhưng không rõ con số đo cái gì; hoặc giá trị viết khác dạng (“một tuần”, “hai mươi bốn”, gõ không dấu) | Người phụ trách đơn vị sở hữu tài liệu |
| **U2** · ngoài phạm vi | Dòng đang nói về một quy định **khác** cùng giá trị | Trưởng đơn vị sở hữu quy định bị đụng |
| **U3** · vượt thẩm quyền | Tài liệu do cấp cao hơn cấp ra thay đổi ban hành | Người đủ cấp của đơn vị ban hành tài liệu |

Quy trình mà phần mềm thi hành được viết thành văn bản **QT-KSTL-01 v2.0** (`docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md`).
Lệnh `npm run verify` kiểm từng điều của văn bản này.

- **Động cơ tiền định** là nơi duy nhất quyết định tự sửa hay hỏi người. Máy chỉ tự sửa khi dòng có **neo chủ đề**
  (dòng nói về việc gì) và **neo đại lượng** (con số đo cái gì), hoặc khi neo chủ đề đứng ngay trước thời hạn hay hạn
  mức đó, như “phúc khảo trong 7 ngày”.
- Một bộ **prover** độc lập kiểm 14 điều kiện trước mỗi lần máy tự sửa; thiếu một điều kiện là chặn.
- **AI (Google Gemini 3.5 Flash-Lite)** chỉ làm hai việc: hiểu câu yêu cầu tiếng Việt, và rà lại mọi dòng máy định tự
  sửa trước khi ban hành. AI chỉ được trả **trích dẫn nguyên văn** và chỉ có thể giữ một dòng lại cho người xem, không
  bao giờ tự sửa thay người. Khi không có AI (chạy ngoại tuyến), hệ thống dùng bộ phân tích tiếng Việt tiền định.
- Mọi thay đổi ghi vào **sổ kiểm toán SHA-256** chỉ ghi thêm. Người đủ quyền hoàn tác được, và mỗi lần hoàn tác cũng là
  một bản ghi mới.

## Đã sửa theo phản hồi doanh nghiệp (Sprint 1)

| Phản hồi | Đã làm | Bằng chứng |
|---|---|---|
| **Rào cản bắt buộc:** phân loại chỉ dùng regex, trượt cách diễn đạt mới | Tự sửa chỉ khi có neo chủ đề **và** neo đại lượng; nhận ra số viết bằng chữ / quy đổi tuần / không dấu nhưng luôn hỏi người; mô hình thật (Gemini, schema ràng buộc) tự rà mọi dòng tự sửa, prover tất định vẫn là lớp kiểm | Tập **mù** 40 ca: tự sửa sai **3 → 0**, bỏ sót **8/23 → 0/23** |
| Bộ dữ liệu thử ≥ 15 ca, diễn đạt cố tình đa dạng | Tập mù 40 ca do tác tử **không xem mã** viết, đóng băng bằng SHA-256 trước khi sửa động cơ; giữ tập 48 ca làm tập phát triển | `bench/blind.csv`, `bench/BLIND-PROVENANCE.md` |
| Đo tỷ lệ báo lên sai | Báo cáo bỏ sót, **tự sửa sai**, **báo lên thừa**, ma trận nhầm lẫn, ca bẫy | `npm run eval:blind`; màn hình Đánh giá |
| Policy doc *Partial* | QT-KSTL-01 v2.0: mỗi điều có mã, bảng truy vết điều → mã → kiểm thử | Phụ lục A của QT-KSTL-01 |
| Verify run *Partial* · Method *Gap* | `npm run verify`: 14 điều, ĐẠT/TRƯỢT, chạy trong CI; tài liệu phương pháp có khoảng tin cậy và mối đe doạ | `docs/PHUONG-PHAP-KIEM-CHUNG.md` |
| Đi tìm con số chi phí một lần công bố sai | Bằng chứng có nguồn (Air Canada 2024, NĐ 04/2021, ĐH Khoa học Huế 2024) + mô hình chi phí + bảng hỏi số thật | `docs/GIA-TRI-KINH-DOANH.md` |

Đối chiếu đầy đủ từng mục: `docs/PHAN-HOI-DOANH-NGHIEP-SPRINT-1.md`.

## Sprint 2 có gì mới

| Nhận xét của BTC ở Sprint 1 | Đã làm |
|---|---|
| Không có backend, tải lại trang là mất dữ liệu | **Supabase** (Postgres + RLS + Edge Functions): nhiều người dùng chung một kho; mọi thao tác ghi đi qua máy chủ, chạy lại động cơ + prover và ghi trong **một giao dịch** có khoá. Mất mạng thì tự lùi về **IndexedDB** trên máy. |
| Chưa nối LLM thật | `ai-extract` và `ai-discover` gọi **Gemini 3.5 Flash-Lite** với JSON schema ràng buộc (qua endpoint tương thích OpenAI) từ máy chủ (khoá không bao giờ tới trình duyệt), có hạn mức gọi trong ngày (toàn hệ thống và theo từng máy khách). |
| Chưa phân quyền | Cấp (1–3) × đơn vị phụ trách: *chuyên viên chỉ duyệt văn bản thuộc phạm vi của mình*. Giao diện khoá nút kèm lý do; máy chủ chặn thật. |
| Nhiều người dùng thật sự cùng làm | **Hàng đợi duyệt dùng chung**: người ban hành áp phần chắc chắn ngay, các vị trí U1/U2/U3 thành *hồ sơ* `CR-n` lưu trên máy chủ; mỗi người có thẩm quyền mở máy của mình và quyết phần của mình: áp dụng và ghi sổ ngay, ghi đúng tên người quyết. Hoàn tác đòi cấp ≥ cấp ban hành của thay đổi. |
| TypeScript + Vite | Giữ JavaScript thuần để vẫn mở được bằng `file://`, nhưng kiểm kiểu bằng **JSDoc + `tsc --noEmit`** trong CI. Lý do: `docs/PHAN-HOI-BTC-SPRINT-1.md`. |
| Chưa có E2E, chưa có kiểm thử tải | **Playwright** (luồng chính, phân quyền, 390 px sáng/tối) và `bench/load.cjs`. |
| Yêu cầu nâng cao của Đề A | **Học từ phản hồi** (đề xuất cụm từ neo mới từ các câu trả lời U1, người duyệt rồi mới áp dụng) và **báo cáo độ chính xác** trên tập độc lập 48 ca (tỉ lệ bỏ sót, chuyển tiếp thừa, ma trận nhầm lẫn). |
| Chứng minh vòng học chạy thật | **Minh hoạ 5** trọn vòng: hỏi → trả lời "Có" → đề xuất neo → duyệt (ghi sổ) → dòng mới tự sửa. **Thí nghiệm học neo** trên màn hình Đánh giá: học trên một tập, đo trên tập khác, công bố cả các cách chia không giảm. |
| Người được hỏi biết bằng cách nào? | Câu tóm tắt và Hàng đợi duyệt gom câu hỏi theo người cần trả lời, kèm **Sao chép lời nhắn** / **Soạn email** có đường dẫn tới Hàng đợi (không tự gửi). |
| Người duyệt bị hỏi lặp | **Gộp câu hỏi trùng**: cùng loại hồ sơ, cùng người có thẩm quyền, cùng mệnh đề chứa con số → một câu hỏi, trả lời một lần áp cho mọi vị trí; sổ vẫn ghi từng dòng, vòng học chỉ nhận một phản hồi. Minh hoạ 4 trên Tổng quan. |
| Chưa có số đo chi phí người duyệt | **Đo thời gian quyết định** ngay trong ứng dụng (trung vị, mức 90 %, tải CSV), làm số liệu cho buổi thử nghiệm và `docs/GIA-TRI-KINH-DOANH.md`. |
| Giám khảo muốn thử tài liệu của mình | **Nạp tài liệu từ tệp .docx / .txt / .md**, đọc ngay trên trình duyệt, không gửi tệp đi đâu; hàng bảng thành một dòng "ô \| ô". |
| Giao diện | Làm lại thành ứng dụng 7 màn hình (nay thêm màn hình Hướng dẫn): Tổng quan · Thay đổi quy định · Hàng đợi duyệt · Sổ kiểm toán · Kho tài liệu · Sổ đăng ký & học · Đánh giá; đồ thị tác động SVG; chế độ tối; dùng tốt trên điện thoại. |
| Phản hồi thử nghiệm 14/10: nhiều chữ, trưởng phòng lớn tuổi khó dùng; gõ câu rồi bấm Phân tích thì không thấy 5 ngày | Màn hình **Hướng dẫn** đứng đầu: 4 bước bằng lời thường, mỗi bước một nút đưa tới đúng chỗ, giải thích khái niệm, câu hỏi thường gặp. Nút **Aa · Chữ lớn** phóng to toàn bộ giao diện. **Phân tích tác động** tự đọc câu tiếng Việt nếu chưa bấm Hiểu yêu cầu. |
| Người mới nhìn vào phải hiểu ngay | **Giao diện bằng lời thường** (13/10): kết quả mở đầu bằng một câu tóm tắt ("Máy tự sửa 6 chỗ chắc chắn. Còn 3 câu hỏi cần người trả lời.") kèm danh sách *ai cần trả lời câu nào*; thanh tiến trình 4 bước; việc cần người xếp lên đầu, căn cứ kỹ thuật thu gọn; mỗi câu hỏi có "Vì sao phải hỏi"; bảng giải thích Tự sửa / U1 / U2 / U3 và hộp **Hướng dẫn & thuật ngữ**; Tổng quan tính lại độ chính xác trên cả hai tập mù. |

## Bổ sung theo yêu cầu BTC (17/10)

- **Căn cứ pháp lý** (`#/phap-ly`):
  - Trích số hiệu văn bản pháp luật trong một tài liệu, tìm cả văn bản chưa tải lên, rồi lần tiếp nhiều tầng: văn bản sửa đổi, thay thế, bãi bỏ, hướng dẫn.
  - Quan hệ chỉ được ghi khi có bằng chứng, không dùng AI.
  - Có giới hạn độ sâu và số lượng. Kết quả dang dở được ghi rõ và có nút *Tiếp tục khám phá*.
- **Hiệu lực tại một ngày**:
  - Bảy trạng thái, phân biệt ngưng hiệu lực với hết hiệu lực; mỗi kết luận kèm bằng chứng và giới hạn tra cứu. Kết quả chưa đầy đủ không chứng nhận còn hiệu lực.
  - Nếu văn bản căn cứ có cảnh báo, nút Ban hành khoá tới khi người ban hành xác nhận đã xem. Kết quả của động cơ và prover không đổi.
- **Lịch sử phiên bản** trong Kho tài liệu:
  - Dựng từ sổ kiểm toán sẵn có. Hiện người làm (AI hay người), cách được duyệt, hồ sơ CR, bản ghi băm.
  - So sánh theo dòng và theo từ. Khôi phục nguyên tử qua một giao dịch, giữ các bản ghi cũ và ghi thêm các hoàn tác.

Khi chưa cấu hình nguồn tra cứu trực tuyến, ứng dụng chạy trên **kho văn bản mô phỏng** và luôn gắn nhãn như vậy. Chi tiết, biến môi trường, migration và giới hạn: `docs/LEGAL-INTELLIGENCE.md`.

Mã khắc phục cục bộ ngày 17/10/2026 và các bước kiểm chứng/triển khai còn lại: [báo cáo kỹ thuật](docs/ENGINEERING-REMEDIATION.md). Chưa triển khai thay đổi của đợt này vào production.

## Chạy thử

**Trực tuyến:** mở đường dẫn ở trên → bấm **Xem minh hoạ 3 phút**, hoặc vào **Thay đổi quy định**.
Thanh trên cùng có ô **Vai trò** để đổi người đang thao tác (chuyên viên, trưởng phòng, Hiệu trưởng) và thấy
phân quyền thay đổi theo.

**Tại máy:**

```bash
git clone https://github.com/lehngvu0110-pixel/Policychange-OS.git
cd Policychange-OS
npm run serve                      # http://localhost:8080 (không cần npm install)
# chạy hoàn toàn ngoại tuyến, không gọi máy chủ: http://localhost:8080/index.html?offline=1
```

Mở thẳng `index.html` bằng trình duyệt cũng chạy được.

**Kiểm thử:**

```bash
npm install                       # chỉ cần cho Playwright và TypeScript
npm run verify                    # kiểm từng điều của QT-KSTL-01 v2.0, in bảng ĐẠT/TRƯỢT (không cần npm install)
npm test                          # 261 unit test: động cơ, sổ, phân quyền, máy chủ, học, đánh giá, bộ điều khiển
npm run eval:blind                # tập mù 40 ca (đóng băng, do tác tử độc lập viết)
npm run eval:blind2               # tập mù số 2, 36 ca (đóng băng 04/10)
npm run eval:learning             # thí nghiệm học neo: học trên một tập, đo trên tập khác
npm run bench                     # benchmark 26 fixture (naive / LLM-only / PolicyChange OS)
npm run eval                      # tập phát triển bench/holdout.csv
npm run load                      # kiểm thử tải cục bộ
npm run typecheck                 # tsc trên các module có // @ts-check
npx playwright install chromium && npm run e2e
```

## Kết quả đo được

- **Verify của đề bài:** 9/9 ca (màn hình Đánh giá).
- **Benchmark 26 fixture tổng hợp:** PolicyChange OS tự sửa sai **0/13**; naive 16/25; LLM-only (mock) 13/18.
- **`npm run verify`:** 14/14 điều của QT-KSTL-01 v2.0 đạt.
- **Tập mù 40 ca** (tác tử độc lập viết, không xem mã; đóng băng trước khi sửa), *chỉ động cơ tiền định*:
  **tự sửa sai 0/5**, **bỏ sót 0/23** (KTC 95 %: 0–14,3 %), báo lên thừa 9/17 (52,9 %), đúng 29/40.
  Trước đợt sửa: sửa sai 3, bỏ sót 8/23. Báo lên thừa còn cao vì từ đồng nghĩa chưa có trong sổ (“phúc tra”,
  “ứng trước”, “ghi danh”…): máy hỏi thêm thay vì đoán; vòng học neo và lớp AI nhắm vào đây.
- **Tập mù số 2, 36 ca** (04/10; lập sau khi động cơ đã đóng băng; tác tử đóng vai 3 cán bộ viết, một tác tử khác kiểm
  nhãn): **tự sửa sai 0/8**, **bỏ sót 0/21**, báo lên thừa 4/15 (26,7 %). Lần chạy đầu phát hiện một dòng máy không
  thấy ("24TC"); đã sửa để luôn hỏi người. `npm run eval:blind2`.
- **Tập phát triển 48 ca** (nhóm gắn nhãn, đã dùng để thiết kế): sửa sai 5 → 2, bỏ sót 22,2 % → 7,4 %. Hai ca còn
  sai (H40, H47) được giữ lại làm bằng chứng giới hạn của lớp tiền định, cần lớp AI.
- **Lớp AI (đo thật, Gemini 3.5 Flash-Lite miễn phí):** trên 24 dòng động cơ muốn tự sửa, AI giữ lại đúng 2 ca lớp tiền
  định bỏ sót (H40, H47) và không giữ oan dòng đúng nào → tập phát triển còn **0 sửa sai, 0 bỏ sót**. `npm run eval:ai`.
- **Học neo, đo trung thực** (13/10): học trên một tập, đo trên tập khác không tham gia học; câu trả lời của người ở
  tập học là **mô phỏng** (đúng theo nhãn). Học từ tập phát triển + tập mù số 2, đo trên tập mù số 1: báo lên thừa
  **9/17 → 6/17**, không phát sinh sửa sai hay bỏ sót. Ba cách chia còn lại **không giảm** (từ đồng nghĩa ít lặp nên
  không đủ 2 câu "Có" để đề xuất neo). `npm run eval:learning`; màn hình Đánh giá.
- **Tải:** 2.400 tài liệu / 9.200 dòng phân tích trong ~30 ms; máy chủ lập kế hoạch ghi với sổ 10.000 bản ghi
  trong ~0,3 s (kiểm lại toàn chuỗi SHA-256 mỗi lần ghi). Số đo trên máy phát triển, chạy `npm run load` để tái lập.

Toàn bộ dữ liệu là **dữ liệu tổng hợp** do nhóm tự soạn; các con số trên không phải tỉ lệ lỗi trên văn bản thật.

**Thử nghiệm người dùng (đợt 1, 14/10):** 3 người thật qua phiếu trực tuyến, cả ba là sinh viên (một người trong BCH Đoàn khoa), chưa có chuyên viên hay trưởng phòng thật. 8/9 việc hoàn thành; điểm "hiểu vì sao máy hỏi" 3,7/5, "sẽ dùng" 4/5. Một người vướng ở việc 1 và góp ý giao diện nhiều chữ, khó cho trưởng phòng lớn tuổi; nhóm đã sửa theo góp ý này (xem bảng Sprint 2). Chi tiết và bất cập còn lại: `docs/KET-QUA-THU-NGHIEM.md`; cách làm: `docs/THU-NGHIEM-NGUOI-DUNG.md`.

## Kiến trúc tóm tắt

```
Trình duyệt (HTML/JS thuần, chạy cả file://)
  js/app/ui.js ─► js/app-controller.js ─► động cơ · prover · workflow · phân quyền (module dùng chung)
        │  đọc (RLS, chỉ đọc)                     │ ghi: ý định (quy định, giá trị, cấp, quyết định A/B)
        ▼                                         ▼
  Supabase PostgREST              Edge Function policy-api ─ chạy lại CÙNG các module ─► SQL apply_change
                                  Edge Function ai-extract / ai-discover ─► Gemini (khoá ở máy chủ)
  Mất mạng ─► IndexedDB trên máy (chế độ Ngoại tuyến)
```

Chi tiết: `docs/ARCHITECTURE.md`. Cài backend, khoá AI (Gemini) và cấp tài khoản thí điểm: `docs/SETUP-BACKEND.md`.

## Giới hạn đã biết

1. Chỉ xử lý thay đổi dạng **thay giá trị**; thêm mới hoặc bãi bỏ điều khoản nằm ngoài phạm vi.
2. Chất lượng phân loại phụ thuộc độ đầy đủ của neo chủ đề và neo đại lượng. Thiếu neo làm tăng U1 (hỏi nhiều hơn
   cần). Đây là hướng lệch có chủ đích; cơ chế học neo thu hẹp dần khoảng này.
3. Dòng có đủ neo nhưng con số đo việc khác (“giấy xác nhận vay vốn được cấp trong 3 ngày”) vẫn có thể bị tự sửa
   nếu tắt AI; lớp AI ngữ nghĩa (tự chạy khi có khoá) đã bắt được các ca này trong lần đo thật.
4. Chưa đọc tài liệu ảnh quét hay PDF không có lớp văn bản; chưa nối Google Drive / SharePoint.
5. Workspace **trình diễn** cho phép ai có đường dẫn cũng thao tác với vai trò giả lập và khôi phục dữ liệu mẫu,
   có chủ đích cho buổi chấm. Workspace **thí điểm** bắt buộc đăng nhập và được cấp quyền.
6. Sổ kiểm toán chống sửa lén qua ứng dụng, nhưng chưa có chữ ký số hay mốc băm độc lập bên ngoài CSDL.
7. Số dùng định dạng Việt Nam: `10,5 triệu` và `10.500.000 đồng` hợp lệ; `10.5 triệu` bị từ chối.

## Cấu trúc kho mã nguồn

```
index.html, css/app.css      vỏ ứng dụng
js/app/ui.js, js/app/graph.js giao diện (chỉ vẽ và nối sự kiện)
js/app-controller.js          trạng thái + thao tác nghiệp vụ (không đụng DOM, có unit test)
js/policy-*.js, js/sha256.js  lõi dùng chung trình duyệt / Node / Deno: động cơ, sổ, workflow, phân quyền, máy chủ,
                              học từ phản hồi, đánh giá, lưu trữ cục bộ
js/remote-store.js, js/remote-ai-adapter.js   máy khách REST Supabase và adapter AI
js/legal-*.js, js/doc-history.js, js/app/legal-graph.js   căn cứ pháp lý, hiệu lực, lịch sử phiên bản
js/semantic-discovery.js, js/policy-prover.js, js/policy-ai.js, js/policy-impact-graph.js   (từ Sprint 1)
supabase/migrations/          schema, RLS, hàm SQL giao dịch, hạn mức AI
supabase/functions/           policy-api, ai-extract, ai-discover, legal-discover (+ _shared: bản sao module, `npm run sync:edge`)
tests/                        unit test Node; tests/e2e: Playwright
bench/                        benchmark 26 fixture, tập phát triển holdout.csv, tập mù blind.csv, mô phỏng học, kiểm thử tải
scripts/verify.cjs            kiểm chứng theo từng điều của QT-KSTL-01
docs/                         kiến trúc, cài backend, phản hồi BTC, kịch bản demo, quy trình QT-KSTL-01
```

## Benchmark 26 fixture (tổng hợp, ngoại tuyến)

`bench/run.cjs` so sánh ba hệ trên cùng fixture có ground truth viết tay: `naive` (thay mọi con số khớp),
`llmOnly` (làm theo phản hồi mock của mô hình, không có sổ đăng ký hay prover) và `policyChangeOS` (dùng đúng các
module của sản phẩm). Tỉ lệ tự sửa sai = số ca có ít nhất một bản vá tự động không được phép / số ca có bản vá
tự động. Đây là minh hoạ hành vi trên dữ liệu tổng hợp, không phải mẫu đại diện và không suy ra tỉ lệ lỗi thực tế.
