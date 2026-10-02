# PolicyChange OS

**Trọng tài kiểm soát tài liệu khi quy định thay đổi.**
MLAI Hackathon 2026 · Bảng 1 OrganizationAI · **Đề A — The Escalation Referee**

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

Quy trình mà phần mềm thi hành được viết thành văn bản quy định **QT-KSTL-01 v2.0** (`docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md`);
`npm run verify` kiểm từng điều của nó. Động cơ tiền định là nơi duy nhất quyết định tự sửa hay chuyển người, và chỉ tự
sửa khi dòng có **cả neo chủ đề lẫn neo đại lượng**. Một bộ **prover** độc lập kiểm 14 điều kiện trước mỗi bản vá tự động. **AI (OpenAI)** chỉ làm hai việc: hiểu câu yêu cầu tiếng Việt và **tự động** rà soát ngữ nghĩa
mọi vị trí động cơ định tự sửa trước khi ban hành; AI chỉ được trả **trích dẫn nguyên văn** và chỉ có thể làm kết quả **thận trọng
hơn**, không bao giờ biến một ca chuyển tiếp thành tự sửa. Mọi thay đổi ghi vào **sổ kiểm toán SHA-256** chỉ
ghi thêm và hoàn tác được.

## Đã sửa theo phản hồi doanh nghiệp (Sprint 1)

| Phản hồi | Đã làm | Bằng chứng |
|---|---|---|
| **Rào cản bắt buộc:** phân loại chỉ dùng regex, trượt cách diễn đạt mới | Tự sửa chỉ khi có neo chủ đề **và** neo đại lượng; nhận ra số viết bằng chữ / quy đổi tuần / không dấu nhưng luôn hỏi người; mô hình thật (OpenAI, schema ràng buộc) tự rà mọi dòng tự sửa, prover tất định vẫn là lớp kiểm | Tập **mù** 40 ca: tự sửa sai **3 → 0**, bỏ sót **8/23 → 0/23** |
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
| Chưa nối LLM thật | `ai-extract` và `ai-discover` gọi **OpenAI Structured Outputs** qua máy chủ (khoá không bao giờ tới trình duyệt), có hạn mức gọi trong ngày (toàn hệ thống và theo từng máy khách). |
| Chưa phân quyền | Cấp (1–3) × đơn vị phụ trách: *chuyên viên chỉ duyệt văn bản thuộc phạm vi của mình*. Giao diện khoá nút kèm lý do; máy chủ chặn thật. |
| Nhiều người dùng thật sự cùng làm | **Hàng đợi duyệt dùng chung**: người ban hành áp phần chắc chắn ngay, các vị trí U1/U2/U3 thành *hồ sơ* `CR-n` lưu trên máy chủ; mỗi người có thẩm quyền mở máy của mình và quyết phần của mình — áp dụng và ghi sổ ngay, ghi đúng tên người quyết. Hoàn tác đòi cấp ≥ cấp ban hành của thay đổi. |
| TypeScript + Vite | Giữ JavaScript thuần để vẫn mở được bằng `file://`, nhưng kiểm kiểu bằng **JSDoc + `tsc --noEmit`** trong CI. Lý do: `docs/PHAN-HOI-BTC-SPRINT-1.md`. |
| Chưa có E2E, chưa có kiểm thử tải | **Playwright** (luồng chính, phân quyền, 390 px sáng/tối) và `bench/load.cjs`. |
| Yêu cầu nâng cao của Đề A | **Học từ phản hồi** (đề xuất cụm từ neo mới từ các câu trả lời U1, người duyệt rồi mới áp dụng) và **báo cáo độ chính xác** trên tập độc lập 48 ca (tỉ lệ bỏ sót, chuyển tiếp thừa, ma trận nhầm lẫn). |
| Giao diện | Làm lại thành ứng dụng 7 màn hình: Tổng quan · Thay đổi quy định · Hàng đợi duyệt · Sổ kiểm toán · Kho tài liệu · Sổ đăng ký & học · Đánh giá; đồ thị tác động SVG; chế độ tối; dùng tốt trên điện thoại. |

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
npm run verify                    # kiểm từng điều của QT-KSTL-01 v2.0 — bảng ĐẠT/TRƯỢT (không cần npm install)
npm test                          # 219 unit test: động cơ, sổ, phân quyền, máy chủ, học, đánh giá, bộ điều khiển
npm run eval:blind                # tập mù 40 ca (đóng băng, do tác tử độc lập viết)
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
  “ứng trước”, “ghi danh”…) — máy hỏi thêm thay vì đoán; vòng học neo và lớp AI nhắm vào đây.
- **Tập phát triển 48 ca** (nhóm gắn nhãn, đã dùng để thiết kế): sửa sai 5 → 2, bỏ sót 22,2 % → 7,4 %. Hai ca còn
  sai (H40, H47) được giữ lại làm bằng chứng giới hạn của lớp tiền định — cần lớp AI.
- **Lớp AI (đo thật, Gemini 3.5 Flash-Lite miễn phí):** trên 24 dòng động cơ muốn tự sửa, AI giữ lại đúng 2 ca lớp tiền
  định bỏ sót (H40, H47) và không giữ oan dòng đúng nào → tập phát triển còn **0 sửa sai, 0 bỏ sót**. `npm run eval:ai`.
- **Tải:** 2.400 tài liệu / 9.200 dòng phân tích trong ~30 ms; máy chủ lập kế hoạch ghi với sổ 10.000 bản ghi
  trong ~0,3 s (kiểm lại toàn chuỗi SHA-256 mỗi lần ghi). Số đo trên máy phát triển, chạy `npm run load` để tái lập.

Toàn bộ dữ liệu là **dữ liệu tổng hợp** do nhóm tự soạn; các con số trên không phải tỉ lệ lỗi trên văn bản thật.

## Kiến trúc tóm tắt

```
Trình duyệt (HTML/JS thuần, chạy cả file://)
  js/app/ui.js ─► js/app-controller.js ─► động cơ · prover · workflow · phân quyền (module dùng chung)
        │  đọc (RLS, chỉ đọc)                     │ ghi: ý định (quy định, giá trị, cấp, quyết định A/B)
        ▼                                         ▼
  Supabase PostgREST              Edge Function policy-api ─ chạy lại CÙNG các module ─► SQL apply_change
                                  Edge Function ai-extract / ai-discover ─► OpenAI (khoá ở máy chủ)
  Mất mạng ─► IndexedDB trên máy (chế độ Ngoại tuyến)
```

Chi tiết: `docs/ARCHITECTURE.md`. Cài backend, khoá OpenAI và cấp tài khoản thí điểm: `docs/SETUP-BACKEND.md`.

## Giới hạn đã biết

1. Chỉ xử lý thay đổi dạng **thay giá trị**; thêm mới hoặc bãi bỏ điều khoản nằm ngoài phạm vi.
2. Chất lượng phân loại phụ thuộc độ đầy đủ của neo chủ đề và neo đại lượng. Thiếu neo làm tăng U1 (hỏi nhiều hơn
   cần) — hướng lệch có chủ đích; cơ chế học neo thu hẹp dần khoảng này.
3. Dòng có đủ neo nhưng con số đo việc khác (“giấy xác nhận vay vốn được cấp trong 3 ngày”) vẫn có thể bị tự sửa
   nếu tắt AI; lớp AI ngữ nghĩa (tự chạy khi có khoá) đã bắt được các ca này trong lần đo thật.
4. Chưa đọc tài liệu ảnh quét hay PDF không có lớp văn bản; chưa nối Google Drive / SharePoint.
5. Workspace **trình diễn** cho phép ai có đường dẫn cũng thao tác với vai trò giả lập và khôi phục dữ liệu mẫu —
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
js/semantic-discovery.js, js/policy-prover.js, js/policy-ai.js, js/policy-impact-graph.js   (từ Sprint 1)
supabase/migrations/          schema, RLS, hàm SQL giao dịch, hạn mức AI
supabase/functions/           policy-api, ai-extract, ai-discover (+ _shared: bản sao module, `npm run sync:edge`)
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
