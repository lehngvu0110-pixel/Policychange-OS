# Báo cáo kiểm thử PolicyChange OS — bản đã sửa

Báo cáo gốc: kiểm thử độc lập ngày 02/10/2026 tại commit `60b419e`, chạy trên Windows. Bản này giữ nguyên các phát hiện
và ghi thêm cách đã sửa, test chứng minh và kết quả chạy lại. Nhánh sửa: `claude/fix-bao-cao-kiem-thu`, 3 commit
(`0efda41`, `4c6d9a9`, `2354f01`).

**Kết luận:** đã sửa đủ 8 mục F01–F08. Mỗi mục có test hồi quy. Các test này đều **trượt trên mã cũ và đạt trên mã mới**.
Sau khi sửa, một vòng rà soát mã độc lập tìm thêm 5 lỗi cùng nhóm với F01–F05; 5 lỗi này cũng đã sửa, có test (mục "Phát
hiện thêm khi rà soát mã").

## Kết quả chạy lại

| Bộ | Trước (60b419e) | Sau (2354f01) | Ghi chú |
|---|---|---|---|
| `npm test` | 219/220 trên Windows | **237/237** | Thêm 17 test hồi quy. Đã giả lập checkout CRLF: vẫn đạt |
| `npm run verify` | 14/14 | **14/14** | TC-04 nay từ chối đúng lý do (F07) |
| `npm run typecheck` | Qua | Qua | |
| E2E (Playwright, Chromium) | 14 qua, 1 bỏ qua | **20 qua, 1 bỏ qua** | Thêm 6 kịch bản theo báo cáo. Ca bỏ qua vẫn là menu hẹp ở cấu hình desktop |
| `deno check` 3 Edge Function | — | Qua | |
| `npm run eval` | 42/48 | 42/48 | Không đổi: đợt sửa không chạm logic phân loại |
| `npm run eval:blind` | 29/40, 0 tự sửa sai | 29/40, 0 tự sửa sai | Tập mù và mã băm `03862e16…` giữ nguyên |
| `npm run eval:ai` | Giữ H40/H47 | Giữ H40/H47 | |

## Từng lỗi

### F01 · P1 · Rà soát lại thất bại làm mất yêu cầu người duyệt — ĐÃ SỬA

- `js/semantic-discovery.js`: các lượt rà không thành (không có AI, hết giờ, lỗi mạng, bằng chứng bị loại) giữ nguyên
  từng đề xuất. Trước đây chúng xoá bằng chứng và đặt `semanticHold:false`.
- `js/app-controller.js`: chỉ lượt rà hợp lệ mới cập nhật phân tích. Sau khi đã có một lượt hợp lệ
  (`semanticSettled`), bấm Ban hành không gọi lại AI.
- Thông báo nói rõ hệ thống "giữ nguyên kết quả rà soát trước (N vị trí đang giữ lại)".
- **Test:**
  - `F01: rà soát lần hai thất bại KHÔNG xoá cờ giữ lại` gồm hai lượt liên tiếp: giữ lại → lỗi mạng → Ban hành áp dụng
    0 dòng.
  - Test thứ hai cho trường hợp lượt rà tự động ngay trước Ban hành bị lỗi.
  - `semantic-discovery.test.cjs` kiểm cả 4 kiểu thất bại.

### F02 · P1 · Câu mới bị từ chối nhưng còn kết quả cũ và nút Ban hành — ĐÃ SỬA

- Mỗi phân tích lưu dấu vân tay của biểu mẫu: quy định, giá trị mới, cấp, câu yêu cầu. `commit()` từ chối nếu biểu mẫu
  hiện tại khác dấu này.
- Trên giao diện, nút Ban hành khoá **ngay khi gõ**, kèm cảnh báo "Biểu mẫu đã khác với phân tích". Nút cũng khoá khi
  câu gần nhất bị từ chối hoặc cần làm rõ.
- Câu bị từ chối sẽ xoá phân tích cũ và hai ô giá trị mới, cấp ban hành. Ngoại lệ: phân tích đang có quyết định của
  người mà chưa ban hành thì được giữ, để không âm thầm xoá việc của người. Nút Ban hành vẫn khoá trong trường hợp đó.
- Minh hoạ 3 chạy trên bản sao tạm.
- **Test:** `F02: biểu mẫu khác với phân tích → không ban hành` (controller). E2E `F02: câu mới bị từ chối…` đúng kịch bản
  demo 2 → demo 3 của báo cáo. E2E `F02: sửa câu yêu cầu sau khi phân tích → khoá Ban hành`.

### F03 · P2 · AI thật ghi đè dữ liệu mẫu trong minh hoạ giữ lại — ĐÃ SỬA

- Mỗi lượt rà có mã lượt. Chỉ lượt bắt đầu sau cùng được ghi vào phân tích; lượt cũ về muộn bị bỏ.
- Minh hoạ 1 và 2 không tự gọi AI song song nữa:
  - minh hoạ 2 chỉ dùng dữ liệu mẫu;
  - minh hoạ 1 rà ngay lúc Ban hành và báo đúng khi AI giữ lại dòng.
- **Test:** `F03: kết quả của lượt rà cũ về muộn bị bỏ, không ghi đè lượt mới hơn`.

### F04 · P2 · Thoát minh hoạ làm hàng đợi dùng chung trống — ĐÃ SỬA

- Lúc vào minh hoạ, ảnh chụp trạng thái lưu thêm `openChanges`, `decisions`, người đăng nhập và cờ dữ liệu cũ. Thoát ra
  thì khôi phục, rồi kiểm tra máy chủ xem có ai vừa ghi không.
- Biểu mẫu cũng được lưu và trả lại nguyên vẹn.
- Lượt rà AI về trong lúc đang xem minh hoạ vẫn được ghi vào phân tích đã lưu, nên phân tích không kẹt ở trạng thái
  "đang rà".
- **Test:**
  - `F04: thoát minh hoạ khôi phục hàng đợi dùng chung`;
  - `phân tích có lượt rà đang chạy khi vào minh hoạ: thoát ra không kẹt`;
  - E2E `ghé minh hoạ giữa chừng rồi thoát…`: sau khi chạy minh hoạ 2 và 3, quyết định U1 còn và vẫn ban hành được 6 dòng.

### F05 · P2 · Tải lại trang trở về workspace Trình diễn — ĐÃ SỬA

- Trình duyệt nhớ workspace đã mở. Nếu chưa nhớ gì mà còn phiên đăng nhập thì mở thẳng `hcmut-pilot`.
- Khi không có quyền đọc workspace đã nhớ, ví dụ vì phiên đã hết hạn, hệ thống lùi về Trình diễn và báo rõ. Lựa chọn lùi
  này không được ghi nhớ.
- Lỗi máy chủ tạm thời (5xx) không làm đổi workspace.
- Chế độ ngoại tuyến chỉ được nhớ khi người dùng tự chọn.
- **Test:** `F05: khởi động mở lại workspace đã chọn…`, `F05: lỗi máy chủ tạm thời không đổi workspace…`, E2E `F05: tải
  lại trang giữ lựa chọn nguồn dữ liệu`.

### F06 · P2 · Câu "từ 7 xuống 5 ngày" không hiểu được — ĐÃ SỬA

- Nguyên nhân đã tách được, nằm ở **cả hai lớp**:
  - bộ phân tích tiền định bóc ra "7" không có đơn vị;
  - validator AI đòi trích dẫn giá trị cũ phải có đơn vị.
- Cách sửa: khi giá trị cũ chỉ là con số và giá trị mới mang đơn vị, hệ thống mượn đơn vị đó. Việc mượn **chỉ được chấp
  nhận khi kết quả khớp đúng giá trị hiện hành của quy định**. "Từ 70 xuống 5 ngày" vẫn bị từ chối. "10.000.000" không
  bị ghép thêm "triệu".
- Hướng dẫn cho mô hình (`ai-extract`) có thêm quy tắc cho cách viết này.
- Màn hình hiện lưu ý "câu chỉ ghi đơn vị một lần, hệ thống hiểu giá trị cũ là 7 ngày", để người dùng kiểm tra trước
  khi phân tích.
- **Test:** 2 test ở `policy-ai.test.cjs` (validator AI và luồng đầy đủ), 1 test ở `policy-engine.test.cjs`, E2E `F06`.

### F07 · P3 · Thông báo trạng thái gây hiểu nhầm — ĐÃ SỬA (cả 4 ý)

- **Cảnh báo dữ liệu cũ:** sau chính lần ban hành của mình, trang không còn cảnh báo "kho đã thay đổi". Ở chế độ dùng
  chung, hệ thống chỉ coi là "của mình" khi sổ trên máy chủ dài thêm đúng số bản ghi vừa ghi. Có người khác ghi xen vào
  thì vẫn cảnh báo.
- **Thanh Ban hành:**
  - ghi "Phân tích này không còn vị trí chờ";
  - nếu có, ghi thêm "Hàng đợi dùng chung còn N vị trí ở các hồ sơ đã ban hành trước".
- **Gợi ý "Đổi vai trò ở thanh trên":** chỉ hiện ở chế độ trình diễn. Trong workspace đăng nhập, trang giải thích ai sẽ
  quyết hồ sơ.
- **Verify TC-04:**
  - đầu vào nay đủ cấp ban hành;
  - ca chỉ đạt khi lý do từ chối đúng là "Không có quy định nào trong sổ đăng ký đang mang giá trị “42 ngày”";
  - đầu vào cũ, bị từ chối vì thiếu cấp, nay bị tính là trượt.
- **Test:** `F07: sau chính lần Ban hành của mình…` (controller và E2E), `F07: ca Verify TC-04 từ chối đúng vì giá trị
  ngoài sổ`.

### F08 · P3 · Test đồng bộ holdout không ổn định trên Windows — ĐÃ SỬA

- Thêm `.gitattributes`: tệp văn bản dùng LF. Riêng `bench/blind.csv` được đánh dấu `-text`, nên git giữ nguyên từng
  byte.
- Khi kiểm tra lại, phát hiện tập mù được đóng băng **với xuống dòng CRLF**: mã băm `03862e16…` tính trên bản CRLF.
- Test so khớp dữ liệu nhúng sau khi chuẩn hoá xuống dòng. Mã băm tập mù được tính trên dạng CRLF đúng như lúc đóng
  băng, nên kiểu checkout nào cũng ra cùng kết quả.
- **Không sửa tập mù và không đổi mã băm.**
- **Test:** `F08: so khớp và mã băm tập mù không phụ thuộc kiểu xuống dòng`. Đã chạy lại trên bản checkout giả lập
  Windows (`core.autocrlf=true`).

## Phát hiện thêm khi rà soát mã (đã sửa)

| # | Lỗi | Cách sửa | Test |
|---|---|---|---|
| R1 | Lượt rà **hợp lệ** thứ hai có thể gỡ cờ giữ lại và xoá quyết định "Giữ nguyên" của người, sau đó Ban hành sửa luôn dòng đó. Cùng nhóm với F01 | `mergeSemanticReview`: trong một phân tích, AI chỉ được **thêm** cờ giữ lại; quyết định của người luôn được giữ | `rà lại lần hai (hợp lệ) không gỡ cờ giữ lại…` |
| R2 | Kết quả rà ghi đè quyết định U1/U2/U3 mà người bấm trong lúc chờ AI | Gộp theo mã đề xuất trên bản hiện tại | `quyết định của người bấm trong lúc AI đang rà…` |
| R3 | Sau lượt rà thứ hai, prover chặn cả dòng đã được người duyệt (bằng chứng cũ không còn trong danh sách đã kiểm chứng) | Cộng dồn danh sách bằng chứng đã kiểm chứng | `rà lại lần hai không làm prover chặn…` |
| R4 | Thoát minh hoạ thì biểu mẫu vẫn mang giá trị của minh hoạ, nên Ban hành bị khoá oan | Lưu và khôi phục biểu mẫu quanh minh hoạ | E2E `ghé minh hoạ giữa chừng…` |
| R5 | Ban hành vẫn chạy khi một lượt rà mới hơn còn đang chạy | Từ chối khi lượt rà còn chạy hoặc đã có lượt mới hơn | Có trong các test F01/F03 |

## Cải tiến thêm từ dữ liệu thí điểm

Bản ghi #8 (HD-04 "lưu bài trong 7 ngày") được hệ thống chuyển U1 đúng, nhưng người duyệt chọn "Có — sửa". Câu hỏi U1
nay nhắc thêm đại lượng mà quy định đo, khi dòng không có cụm nào như vậy:

> Quy định này đo “nộp” / “tiếp nhận” / “thời hạn”; dòng này không có cụm nào như vậy — nếu con số ở đây đo việc khác
> (ví dụ thời gian lưu, thời gian chờ kết quả) thì chọn Không.

## Máy chủ

- Đổi ở `_shared/` gồm `policy-engine`, `policy-data`, `policy-workflow`, `semantic-discovery` và `openai-mapping`. Đã
  đồng bộ bằng `npm run sync:edge`, kiểm bằng `deno check`.
- Không có thay đổi CSDL hay migration.
- Đã triển khai lên máy chủ ngày 03/10/2026: `policy-api` v10, `ai-extract` v10, `ai-discover` v10, cả ba `verify_jwt`
  bật. Đã gọi thử: `policy-api` (whoami) và `ai-extract` (probe, mô hình `gemini-3.5-flash-lite`) đều trả 200.

## Còn mở (không thuộc phạm vi sửa mã)

- Chưa thử đăng nhập bằng tài khoản Chuyên viên thật trên máy chủ.
- Chưa thu 5 câu do mỗi người tự viết cho tập mù số 2. Mẫu ghi đã nêu trong báo cáo gốc.
- Chưa kiểm thử trên Safari/Firefox, tải đồng thời nhiều người, hay RLS qua truy vấn đối kháng.
- Dữ liệu thí điểm (CR-1, CR-2, 11 bản ghi) là dữ liệu thử có chủ đích; giữ nguyên, không xoá vết.
