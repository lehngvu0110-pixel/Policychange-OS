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
| **U1** · chưa rõ dữ kiện | Con số không có cụm từ nào neo nó vào một quy định đã đăng ký | Người phụ trách đơn vị sở hữu tài liệu |
| **U2** · ngoài phạm vi | Dòng đang nói về một quy định **khác** cùng giá trị | Trưởng đơn vị sở hữu quy định bị đụng |
| **U3** · vượt thẩm quyền | Tài liệu do cấp cao hơn cấp ra thay đổi ban hành | Người đủ cấp của đơn vị ban hành tài liệu |

Động cơ tiền định là nơi duy nhất quyết định tự sửa hay chuyển người. Một bộ **prover** kiểm 13 điều kiện
trước mỗi bản vá tự động. **AI (OpenAI)** chỉ làm hai việc: hiểu câu yêu cầu tiếng Việt và rà soát ngữ nghĩa
các vị trí động cơ định tự sửa; AI chỉ được trả **trích dẫn nguyên văn** và chỉ có thể làm kết quả **thận trọng
hơn**, không bao giờ biến một ca chuyển tiếp thành tự sửa. Mọi thay đổi ghi vào **sổ kiểm toán SHA-256** chỉ
ghi thêm và hoàn tác được.

## Sprint 2 có gì mới

| Nhận xét của BTC ở Sprint 1 | Đã làm |
|---|---|
| Không có backend, tải lại trang là mất dữ liệu | **Supabase** (Postgres + RLS + Edge Functions): nhiều người dùng chung một kho; mọi thao tác ghi đi qua máy chủ, chạy lại động cơ + prover và ghi trong **một giao dịch** có khoá. Mất mạng thì tự lùi về **IndexedDB** trên máy. |
| Chưa nối LLM thật | `ai-extract` và `ai-discover` gọi **OpenAI Structured Outputs** qua máy chủ (khoá không bao giờ tới trình duyệt), có hạn mức gọi trong ngày. |
| Chưa phân quyền | Cấp (1–3) × đơn vị phụ trách: *chuyên viên chỉ duyệt văn bản thuộc phạm vi của mình*. Giao diện khoá nút kèm lý do; máy chủ chặn thật. |
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
npm test                          # 195 unit test: động cơ, sổ, phân quyền, máy chủ, học, đánh giá, bộ điều khiển
npm run bench                     # benchmark 26 fixture (naive / LLM-only / PolicyChange OS)
npm run eval                      # báo cáo trên tập độc lập bench/holdout.csv
npm run load                      # kiểm thử tải cục bộ
npm run typecheck                 # tsc trên các module có // @ts-check
npx playwright install chromium && npm run e2e
```

## Kết quả đo được

- **Verify của đề bài:** 9/9 ca (màn hình Đánh giá).
- **Benchmark 26 fixture tổng hợp:** PolicyChange OS tự sửa sai **0/13**; naive 16/25; LLM-only (mock) 13/18.
- **Tập độc lập 48 ca** (nhóm gắn nhãn tay, tách biệt dữ liệu phát triển), *chỉ động cơ tiền định*:
  đúng 39/48 (81,3 %), **bỏ sót 6/27 (22,2 %)**, chuyển tiếp thừa 3/21 (14,3 %), đúng loại U1/U2/U3 100 %.
  Các ca bỏ sót là ca ngữ nghĩa (“kết quả phúc khảo được thông báo sau 7 ngày” không phải hạn nộp đơn) —
  đúng loại lỗi mà lớp AI ngữ nghĩa và cơ chế học neo nhắm tới. Nút **Chạy kèm AI ngữ nghĩa** đo lại khi đã
  cấu hình khoá OpenAI; chúng tôi chưa công bố số đó vì chưa chạy trên khoá thật.
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
2. Chất lượng phân loại phụ thuộc độ đầy đủ của cụm từ neo. Thiếu neo làm tăng U1 (hỏi nhiều hơn cần), không
   làm sửa sai — hướng lệch có chủ đích; cơ chế học neo thu hẹp dần khoảng này.
3. Bỏ sót ngữ nghĩa (con số có neo nhưng nói về việc khác) chỉ được bắt khi bật lớp AI ngữ nghĩa.
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
bench/                        benchmark 26 fixture, tập độc lập holdout.csv, kiểm thử tải
docs/                         kiến trúc, cài backend, phản hồi BTC, kịch bản demo, quy trình QT-KSTL-01
```

## Benchmark 26 fixture (tổng hợp, ngoại tuyến)

`bench/run.cjs` so sánh ba hệ trên cùng fixture có ground truth viết tay: `naive` (thay mọi con số khớp),
`llmOnly` (làm theo phản hồi mock của mô hình, không có sổ đăng ký hay prover) và `policyChangeOS` (dùng đúng các
module của sản phẩm). Tỉ lệ tự sửa sai = số ca có ít nhất một bản vá tự động không được phép / số ca có bản vá
tự động. Đây là minh hoạ hành vi trên dữ liệu tổng hợp, không phải mẫu đại diện và không suy ra tỉ lệ lỗi thực tế.
