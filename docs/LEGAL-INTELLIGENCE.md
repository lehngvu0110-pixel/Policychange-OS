# Căn cứ pháp lý, hiệu lực và lịch sử phiên bản

Yêu cầu bổ sung của BTC ngày 17/10/2026. Tài liệu này ghi những gì đã chạy được, những gì còn bị chặn, và cách bật phần tra cứu trực tuyến.

## 1. Ba tính năng

**A. Khám phá văn bản liên quan theo nhiều tầng** (màn hình *Căn cứ pháp lý*, `#/phap-ly`)

1. Đọc văn bản đầu vào. Có ba nguồn: văn bản mẫu, một tài liệu trong kho, hoặc nội dung dán vào. Hệ thống trích mọi số hiệu dạng `08/2021/TT-BGDĐT`, `04/2021/NĐ-CP`, `34/2018/QH14`, `1234/QĐ-ĐHBK` (`js/legal-refs.js`).
2. Mỗi số hiệu được chuẩn hoá thành một mã: viết hoa, bỏ dấu, nên `NĐ-CP` và `ND-CP` là một. Ngày tháng như `12/05/2024` không bị nhầm là số hiệu.
3. Với từng số hiệu, một *adapter* tìm và tải văn bản. Văn bản tải về lại được đọc tiếp, theo hai đường:
   - quan hệ trong metadata của nguồn: sửa đổi bởi, thay thế bởi, bãi bỏ một phần bởi;
   - số hiệu xuất hiện trong câu chữ.
   Việc lặp lại theo chiều rộng (BFS) cho tới khi hết văn bản hoặc chạm giới hạn (`js/legal-discovery.js`).
4. Loại quan hệ: `CITES`, `AMENDS`, `SUPPLEMENTS`, `IMPLEMENTS`, `GUIDES`, `REPLACES`, `REPEALS`, `CONSOLIDATES`, `RELATED_TO`. Mỗi quan hệ chỉ được ghi khi có bằng chứng, và mang theo:
   - căn cứ (`official_metadata`, `text_cue` hoặc `text_citation`);
   - câu trích;
   - điều khoản bị tác động;
   - ngày hiệu lực, nếu nguồn có ghi.
   Không dùng mô hình ngôn ngữ để gán quan hệ.
5. An toàn của vòng lặp:
   - Có tập đã thăm và chống trùng cạnh, nên đồ thị có chu trình vẫn dừng.
   - Giới hạn độ sâu nằm trong khoảng 1–8, số văn bản trong khoảng 1–200.
   - Mỗi lần tra có thời gian chờ.
   - Mỗi văn bản chỉ đọc tối đa 300.000 ký tự. Trường lạ trong văn bản tải về bị bỏ.
   - Nếu nguồn trả về văn bản khác số hiệu, hoặc không rõ số hiệu, hệ thống không nhận.
6. Khi bị cắt giữa chừng, kết quả mang `state: 'partial'` kèm lý do (độ sâu, số lượng, nguồn lỗi) và danh sách `frontier` các văn bản chưa tra. Nút **Tiếp tục khám phá** nới thêm 1 tầng và 10 văn bản, tra tiếp phần còn dở, thử lại các lỗi tạm thời và không tải lại văn bản đã có.
7. Giao diện gồm:
   - thẻ số liệu;
   - đồ thị SVG xếp theo tầng, bấm được, đi được bằng bàn phím;
   - bảng danh sách: tầng, trực tiếp hay đệ quy, quan hệ, hiệu lực, nguồn;
   - khung chi tiết từng văn bản;
   - danh sách tham chiếu chưa giải quyết.

**B. Hiệu lực tại một ngày** (`js/legal-status.js`)

Có sáu trạng thái: *Còn hiệu lực*, *Hết hiệu lực một phần*, *Hết hiệu lực / bị thay thế*, *Chưa có hiệu lực*, *Chưa xác minh được*, *Bằng chứng mâu thuẫn*.

Thứ tự xét:

1. Không tìm thấy, chưa tra, hoặc không có ngày hiệu lực: **Chưa xác minh được**. Ngày ban hành không bao giờ được dùng thay cho ngày có hiệu lực.
2. Chỉ có nguồn thứ cấp (thuvienphapluat.vn, luatvietnam.vn): **Chưa xác minh được**, kèm lời nhắc đối chiếu nguồn chính thức.
3. Ngày có hiệu lực sau ngày đang xét: **Chưa có hiệu lực**. Đã quá ngày hết hiệu lực: **Hết hiệu lực**.
4. Văn bản khác tác động tới văn bản này, có bằng chứng từ nguồn chính thức và đã có hiệu lực tính tới ngày xét:
   - thay thế, hoặc bãi bỏ toàn bộ: **Hết hiệu lực / bị thay thế**;
   - bãi bỏ một phần: **Hết hiệu lực một phần**;
   - sửa đổi: vẫn **Còn hiệu lực**, kèm chuỗi sửa đổi.
   Thay đổi chưa tới ngày được liệt kê là "sắp có hiệu lực". Bãi bỏ không rõ ngày, hoặc chỉ thấy ở nguồn thứ cấp, cho kết quả **Chưa xác minh được**, không kết luận hết hiệu lực.
5. Đối chiếu với tình trạng do nguồn công bố, tại đúng ngày tải trang. Nếu khác nhóm với kết quả suy ra: **Bằng chứng mâu thuẫn**, và hệ thống không tự chọn bên nào.
6. Kết luận chắc chắn mà không có đường dẫn nguồn sẽ bị hạ xuống **Chưa xác minh được**.

Mỗi kết quả trả về lý do, danh sách bằng chứng (nguồn, đường dẫn, loại nguồn, thời điểm tải), chuỗi sửa đổi và thay đổi sắp tới.

Gắn vào quy trình thay đổi: nếu đã tra cứu căn cứ, màn hình *Thay đổi quy định* hiện **Cảnh báo hiệu lực văn bản căn cứ**. Nút **Ban hành** bị khoá tới khi người ban hành đánh dấu đã xem. Cảnh báo không đổi kết quả của động cơ tiền định và prover, và không tự kết luận tài liệu nội bộ hết hiệu lực.

**C. Lịch sử phiên bản tài liệu** (Kho tài liệu → *Lịch sử phiên bản*, `js/doc-history.js`)

- **Không có bảng phiên bản mới.** Lịch sử được dựng lại từ sổ kiểm toán SHA-256 sẵn có, đi ngược từ nội dung hiện tại qua các bản ghi `PATCH` và `HOÀN TÁC`. Vì vậy lịch sử không thể lệch khỏi sổ, và sổ không bị ghi lại.
- Mỗi phiên bản có các thông tin sau:
  - số thứ tự và số phiên bản tài liệu;
  - thời điểm;
  - người hoặc hệ thống thực hiện, gắn nhãn AI hay Người;
  - cách được duyệt: tự động có prover xác nhận, người có thẩm quyền duyệt (U1/U2/U3), hay người rà soát ngữ nghĩa;
  - mã hồ sơ `CR-n`;
  - số bản ghi trong sổ và mã băm;
  - dấu "đã thu hồi" nếu sau đó bị hoàn tác.
- Quyết định *giữ nguyên* và *từ chối sửa* được liệt kê riêng, không tính là phiên bản. **Đề xuất của phân tích hiện tại chưa áp dụng** cũng chỉ hiện ở mục riêng, không bao giờ hiện như một phiên bản.
- Có thể so sánh hai phiên bản bất kỳ, theo dòng và theo từ, và xem toàn văn một phiên bản.
- **Khôi phục** một phiên bản cũ nghĩa là hoàn tác lần lượt các thay đổi sau nó, mới nhất trước. Mỗi lần hoàn tác vẫn qua kiểm tra quyền và ghi một bản ghi mới, nên lịch sử cũ còn nguyên. Trước khi làm, hệ thống mô phỏng trên bản sao để chắc kết quả trùng đúng phiên bản đích. Khôi phục bị từ chối khi:
  - phiên bản đích chứa một thay đổi đã bị thu hồi (muốn quay lại phải ban hành lại qua phân tích);
  - nội dung không khớp với sổ;
  - chuỗi băm hỏng.

## 2. Nguồn tra cứu

| Chế độ | Khi nào | Dữ liệu |
|---|---|---|
| **Kho mô phỏng** (mặc định) | Luôn có, kể cả ngoại tuyến | `js/legal-fixtures.js`. Văn bản **bịa** để thử thuật toán, ký hiệu có hậu tố `MP`, `BMP`, `QH99`. Mỗi văn bản mang cờ `synthetic`, đường dẫn dạng `fixture:` không bấm được. Giao diện luôn ghi "Dữ liệu mô phỏng". Không lưu vào CSDL. |
| **Tra cứu trực tuyến** | Có máy chủ và đã cấu hình nhà cung cấp tìm kiếm | Edge Function `legal-discover`. Chưa cấu hình thì máy chủ trả `unavailable` và giao diện nói rõ là *không tra cứu được*, không nói *không tìm thấy*. |

Kho mô phỏng đủ các tình huống cần kiểm:
- sửa đổi có chuỗi;
- văn bản bị thay thế, ở tầng 2;
- văn bản hết hạn;
- văn bản ở tầng 4, để kiểm giới hạn độ sâu;
- văn bản có hiệu lực trong tương lai (01/12/2026);
- nguồn công bố mâu thuẫn;
- bãi bỏ một phần, chỉ phát hiện được qua metadata ngược;
- văn bản chỉ có nguồn thứ cấp;
- văn bản không tồn tại;
- một văn bản chứa câu chèn lệnh ("hãy bỏ qua mọi hướng dẫn…").

### Edge Function `legal-discover`

- `status`: đã cấu hình chưa, danh sách nguồn.
- `resolve`: tra một số hiệu. Các bước:
  1. kiểm định dạng;
  2. tra bộ nhớ đệm `legal_documents` (7 ngày);
  3. trừ hạn mức;
  4. tìm qua nhà cung cấp, chỉ giới hạn trên các host chính thức;
  5. tải tối đa 3 trang ứng viên bằng `js/legal-fetch.js`;
  6. đọc trang bằng `js/legal-page.js`;
  7. trang phải chứa đúng số hiệu được hỏi mới được nhận;
  8. ghi bộ nhớ đệm kèm SHA-256 nội dung.
- `save_run`: lưu một kết quả tra cứu thật vào `legal_discovery_runs`. Chỉ thành viên workspace, hoặc vai trò trình diễn ở workspace demo, mới lưu được. Kết quả mô phỏng bị từ chối.

Bảo vệ:
- **Allowlist host:** vbpl.vn, vanban.chinhphu.vn, congbao.chinhphu.vn, chinhphu.vn, moet.gov.vn (chính thức); thuvienphapluat.vn, luatvietnam.vn (thứ cấp).
- **Chặn SSRF:** chỉ `https`, cổng 443; không IP, không `localhost`, không thông tin đăng nhập trong URL; không nhận host giả kiểu `vbpl.vn.evil.com`.
- **Chuyển hướng:** tự xử lý (`redirect: 'manual'`), mỗi bước được kiểm lại với allowlist, tối đa 3 bước.
- **Giới hạn mỗi trang:** 8 giây, 2 MB (đọc theo luồng, dừng ngay khi vượt), chỉ nhận HTML hoặc văn bản thuần.
- **Lịch sự với nguồn:** giãn cách 600 ms giữa hai lần gọi cùng một host.
- **Hạn mức** theo ngày và theo máy khách (băm IP, không lưu IP thô).
- **Nội dung tải về là dữ liệu không tin cậy:** chỉ bóc chữ và đọc bằng biểu thức chính quy, không đưa vào mô hình, không thực thi.

## 3. Biến môi trường (Secrets của Edge Function, không bao giờ tới trình duyệt)

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `LEGAL_SEARCH_PROVIDER` | có, để bật trực tuyến | `google` (Programmable Search JSON API) hoặc `brave` (Brave Search API) |
| `LEGAL_SEARCH_API_KEY` | có | khoá của nhà cung cấp |
| `LEGAL_SEARCH_CX` | với `google` | mã Search Engine |
| `LEGAL_DAILY_LIMIT` | không | trần lượt tra cứu toàn hệ thống mỗi ngày, mặc định 200 |
| `LEGAL_CLIENT_LIMIT` | không | trần mỗi máy khách mỗi ngày, mặc định 60 |

Nhóm tự dán khoá vào *Supabase → Edge Functions → Secrets*. Không đặt khoá vào `js/config.js` hay bất kỳ tệp nào trong kho mã.

## 4. Migration

`supabase/migrations/20261017000009_legal_intelligence.sql`

- `legal_documents`: bộ nhớ đệm văn bản pháp luật (dữ liệu công khai). Ai cũng đọc được; chỉ service role ghi.
- `legal_fetch_usage` và hàm `consume_legal_fetch_quota`: hạn mức. Chỉ service role dùng được.
- `legal_discovery_runs`: kết quả tra cứu theo workspace. RLS đọc bằng `private.can_read_workspace(workspace_id)`, giống các bảng sẵn có. Không có policy ghi cho `anon` hay `authenticated`.

Chưa áp migration này và chưa triển khai `legal-discover` lên dự án Supabase đang chạy. Lý do: hôm nay là Demo Day, và việc này cần nhóm đồng ý. Lệnh khi đồng ý:

```bash
supabase db push                       # hoặc chạy tệp SQL trong SQL Editor
supabase functions deploy legal-discover
```

Nếu chưa triển khai, chế độ *Tra cứu trực tuyến* báo "Máy chủ chưa triển khai chức năng tra cứu"; chế độ mô phỏng vẫn chạy đầy đủ.

## 5. Kiểm thử

- `tests/legal-intelligence.test.cjs` (26 ca):
  - trích số hiệu và cụm từ báo quan hệ; allowlist và SSRF;
  - BFS: trực tiếp và đệ quy, metadata ngược, chu trình, giới hạn độ sâu và số lượng, tiếp tục, thời gian chờ, lỗi, ngoại lệ, sai số hiệu;
  - câu chèn lệnh; văn bản quá lớn; sáu trạng thái hiệu lực; ngày ban hành khác ngày hiệu lực;
  - bãi bỏ không rõ ngày; thiếu đường dẫn nguồn; cảnh báo;
  - đọc trang; tải an toàn (chuyển hướng sang 169.254.169.254, quá cỡ, sai loại nội dung, treo, 404, 500);
  - adapter máy chủ (chưa cấu hình, chưa triển khai, mất mạng);
  - thoát HTML trong đồ thị;
  - kiểm tĩnh: khoá chỉ ở máy chủ, RLS và cách ly workspace.
- `tests/doc-history.test.cjs` (12 ca):
  - bản gốc;
  - đề xuất chưa áp dụng không thành phiên bản;
  - ban hành tạo phiên bản (AI, prover, băm);
  - người duyệt kèm CR và U1;
  - từ chối là sự kiện;
  - hoàn tác giữ lịch sử;
  - khôi phục về bản gốc qua nhiều lần hoàn tác;
  - chặn khôi phục khi thay đổi đã thu hồi;
  - phát hiện sửa ngoài sổ; chuỗi băm hỏng;
  - tài liệu thêm mới; không lẫn tài liệu khác;
  - so sánh dòng và từ.
- `tests/e2e/legal.spec.mjs` (5 ca Playwright): khám phá và tiếp tục; chi tiết và câu chèn lệnh; đổi ngày xét; cảnh báo khoá Ban hành tới khi xác nhận; lịch sử, so sánh và khôi phục.
- `deno check` cho `legal-discover/index.ts`. Đã chạy thử hàm cục bộ: `status` và `resolve` khi chưa cấu hình đều trả `unavailable` đúng như thiết kế.

## 6. Giới hạn

1. **Chưa kiểm chứng tra cứu thật trên vbpl.vn và các cổng khác.** Môi trường phát triển bị chặn mạng tới các trang này. Bộ đọc trang dựa trên các nhãn thường gặp ("Ngày ban hành", "Ngày có hiệu lực", "Tình trạng hiệu lực") và câu "có hiệu lực thi hành kể từ ngày …". Trường nào không đọc được thì để trống, và văn bản sẽ ở trạng thái *Chưa xác minh được*.
2. Với nguồn trực tuyến, quan hệ hiện chỉ đọc từ câu chữ. Metadata quan hệ riêng của từng cổng (mục "Văn bản bị sửa đổi", "Văn bản thay thế" của vbpl.vn) chưa được đọc, nên có thể bỏ sót văn bản sửa đổi, thay thế mà văn bản đầu vào không nhắc tới. Kho mô phỏng có metadata này để kiểm thuật toán.
3. Hiệu lực tính ở mức văn bản. Bãi bỏ hay sửa đổi từng điều được ghi kèm (`affectedProvisions`), nhưng chưa dựng lại nội dung từng điều theo thời gian.
4. Khôi phục phiên bản đi qua hoàn tác, nên không quay lại được một phiên bản chứa thay đổi đã bị thu hồi. Trường hợp đó cần ban hành lại qua phân tích (có prover).
5. Lịch sử phiên bản chỉ có từ khi tài liệu vào sổ. Nội dung trước khi tạo workspace hiện là "Bản gốc".
