# Bộ trường hợp kiểm thử — PolicyChange OS

Chạy bằng **một thao tác**: mở đường dẫn trực tuyến → màn hình **Đánh giá** → bấm **Chạy Verify**.
Bảng kết quả đo tại thời điểm bấm. Không cần cài đặt, không cần tài khoản.

Mỗi ca chạy lại toàn bộ động cơ trên **một bản sao sạch** của kho tài liệu rồi đối chiếu với kỳ vọng.
Không có kết quả nào được ghi sẵn trong mã nguồn — sửa kho tài liệu thì bảng kết quả đổi theo.

---

## A. Bộ 4 ca bắt buộc

| Mã | Dữ liệu đầu vào | Hành vi kỳ vọng | Cách thực thi |
|---|---|---|---|
| **TC-01** | R-PK-01 `7 ngày → 5 ngày`, cấp ban hành 2. Vị trí: QT-02 dòng 1 (có cụm từ neo "phúc khảo", tài liệu cấp 2) | `AUTO_PATCH` — tự sửa, không hỏi người | Nút Verify, dòng TC-01 |
| **TC-02** | R-PK-01 `7 ngày → 5 ngày`, cấp ban hành 2. Vị trí: QT-07 dòng 2 — cùng giá trị nhưng neo vào R-KN-01 (hạn phản hồi khiếu nại) | `ESCALATE / U2` — **từ chối sửa**, chuyển Phòng Thanh tra – Pháp chế | Nút Verify, dòng TC-02 |
| **TC-03** | R-PK-01 `7 ngày → 5 ngày`, cấp ban hành 2. Vị trí: QD-01 dòng 2 — quy định cấp Trường | `ESCALATE / U3` — khóa quyền sửa, chuyển Hiệu trưởng | Nút Verify, dòng TC-03 |
| **TC-04** | Câu lệnh tự do: *"Đổi hạn nộp hồ sơ từ 42 ngày xuống 30 ngày."* — không quy định nào trong sổ mang giá trị 42 ngày | `REFUSE` — **từ chối xử lý**, không sinh bất kỳ đề xuất nào | Nút Verify, dòng TC-04 |

TC-02, TC-03 và TC-04 là các ca mà **hành vi đúng là từ chối hoặc chuyển tiếp** (yêu cầu bắt buộc của đề bài).

## B. Bộ Escalation — bài kiểm tra 90 giây của Đề A

3 ca thường quy phải được xử lý tự động hoàn toàn, 2 ca phải được chuyển tiếp và phân loại đúng.

| Mã | Vị trí | Kỳ vọng | Nhóm dừng |
|---|---|---|---|
| ESC-01 | QT-02 dòng 5 — ghi chú có neo "phúc khảo" | `AUTO_PATCH` | — |
| ESC-02 | BM-03 dòng 2 — biểu mẫu cấp Phòng | `AUTO_PATCH` | — |
| ESC-03 | CL-05 dòng 2 — checklist tác nghiệp | `AUTO_PATCH` | — |
| ESC-04 | HD-04 dòng 4 — "Phòng thi chỉ lưu bài trong 7 ngày…", không cụm từ neo nào | `ESCALATE` | **U1** chưa xác định dữ kiện |
| ESC-05 | QD-13 dòng 2 — Quy chế chi tiêu nội bộ do Hiệu trưởng ban hành, đổi hạn mức tạm ứng `10 triệu → 15 triệu` ở cấp 2 | `ESCALATE` | **U3** vượt thẩm quyền |

## C. Kịch bản cho giám khảo nhập dữ liệu mới

Hệ thống nhận dữ liệu đầu vào chưa từng thấy theo ba đường, không cần sửa mã nguồn:

**C1 — Chọn quy định khác trong sổ đăng ký.** Màn hình **Thay đổi quy định** → chọn bất kỳ trong 6 quy định,
nhập giá trị mới, chọn cấp ban hành → **Phân tích tác động**. Ví dụ: `R-DK-01` đổi `24 tín chỉ → 20 tín chỉ` ở cấp 2 sẽ trả về U3 vì
Điều 37.1 thuộc quy định cấp Trường.

**C2 — Gõ câu lệnh tiếng Việt tự do.** Ô *Câu mô tả thay đổi* → *"Nâng hạn mức tạm ứng do Trưởng đơn vị duyệt từ
10 triệu lên 15 triệu."* → **Hiểu yêu cầu** (AI khi đã cấu hình khoá, nếu không thì bộ phân tích tiền định). Bộ phân tích nhận dạng cặp giá trị, cấp ban hành và
quy định đích. Câu lệnh mơ hồ hoặc tham chiếu giá trị không đăng ký sẽ bị từ chối kèm lý do.

**C3 — Thêm tài liệu mới vào kho.** Màn hình **Kho tài liệu** → *Nạp tài liệu mới* → dán nội dung bất kỳ, chọn
đơn vị và cấp (không cao hơn cấp của vai trò đang chọn) → **Nạp vào kho** → chạy lại phân tích. Tài liệu mới được quét như mọi tài liệu khác.

## D. Cách kiểm chứng vai trò con người và nhật ký kiểm toán

1. Chạy một thay đổi ở màn hình **Thay đổi quy định**.
2. **Hàng đợi duyệt** — trả lời các câu hỏi chuyển tiếp. Mỗi câu đúng hai nút, quyết dứt điểm trong một lượt.
3. Bấm **Ban hành** ở thanh dưới, rồi mở **Sổ kiểm toán**. Sổ nhật ký in ra: tác nhân là AI hay người, vai trò gì, tài liệu nào, dòng nào, nội dung trước/sau, căn cứ điều khoản, băm SHA-256 nối chuỗi.
4. Bấm **Hoàn tác** trên một bản ghi khi dòng hiện tại vẫn đúng bằng nội dung bản ghi đã ban hành. Nội dung trở về nguyên trạng và sổ **thêm** một bản ghi hoàn tác. Nếu dòng đã thay đổi, ứng dụng từ chối hoàn tác và giữ nguyên sổ.
5. **Kho tài liệu** — mở tài liệu để đối chiếu nội dung và số hiệu phiên bản đã tăng.

## E. Phân quyền theo vai trò (Sprint 2)

Đổi ô **Vai trò** trên thanh trên cùng, cùng thay đổi R-PK-01 `7 ngày → 5 ngày` cấp 2:

| Mã | Vai trò | Hành vi kỳ vọng |
|---|---|---|
| RB-01 | Chuyên viên Phòng Đào tạo | Quyết được U1 ở HD-04 (thuộc Cổng thông tin sinh viên); nút **Ban hành** bị khoá vì thay đổi ở cấp 2 |
| RB-02 | Trưởng phòng Kế hoạch – Tài chính | “Việc của tôi” trống; cả 3 hồ sơ bị khoá kèm lý do cần ai |
| RB-03 | Trưởng phòng Thanh tra – Pháp chế | Quyết được U2 ở QT-07 |
| RB-04 | Hiệu trưởng | Quyết được U3 ở QD-01; hoàn tác được mọi bản ghi |
| RB-05 | Trưởng phòng Đào tạo ban hành khi U2/U3 còn chờ (Trực tuyến) | Phần chắc chắn áp ngay; U2/U3 vào hồ sơ CR-1 trong Hàng đợi của mọi máy |
| RB-06 | Trưởng phòng Thanh tra – Pháp chế mở máy khác, quyết U2 trong CR-1 | Áp và ghi sổ ngay, đứng tên TP Thanh tra – Pháp chế; căn cứ ghi “khởi tạo bởi Trưởng phòng Đào tạo” |
| RB-07 | Chuyên viên Phòng Đào tạo bấm Hoàn tác một bản ghi do trưởng phòng ban hành | Bị khoá kèm lý do cần cấp 2 |

Tự động hoá: `tests/e2e/flow.spec.mjs`, `tests/policy-authz.test.cjs`. Ở chế độ dùng chung, máy chủ trả 403 cho mọi
quyết định vượt quyền kể cả khi giao diện bị sửa (`tests/policy-server.test.cjs`).

## F. Kết quả chạy gần nhất

| Bộ | Kết quả |
|---|---|
| 4 ca bắt buộc | 4/4 PASS |
| Escalation 90 giây | 5/5 PASS |

Độ trễ mỗi ca dưới 10 ms trên máy để bàn thông thường. Con số hiển thị trong bảng là đo thực tế tại thời
điểm bấm nút, không phải giá trị ghi sẵn.

## Ca bổ sung theo phản hồi doanh nghiệp (QT-KSTL-01 v2.0)

| Mã | Dòng (đổi hạn phúc khảo 7 → 5 ngày, trừ khi ghi khác) | Kỳ vọng | Điều |
|---|---|---|---|
| DN-01 | Kết quả phúc khảo được thông báo cho sinh viên sau 7 ngày. | U1 — đúng chủ đề, sai đại lượng | §5.3.c |
| DN-02 | Sinh viên có một tuần để nộp đơn phúc khảo. | U1 — quy đổi tuần; bản sửa đề xuất “5 ngày” | §5.3.b |
| DN-03 | Han nop don phuc khao la 7 ngay. | U1 — không dấu; bản sửa đề xuất “5 ngay” | §5.3.b |
| DN-04 | Tra cứu kết quả sau mười bảy ngày. | Không đụng tới (“mười bảy” ≠ “bảy”) | §5.3.b |
| DN-05 | Sinh viên phúc khảo trong 7 ngày. | Tự sửa — neo chủ đề chi phối trực tiếp con số | §5.4 |
| DN-06 | (R-DK-01, 24 → 30 tín chỉ) Đăng ký học phần không quá hai mươi bốn tín chỉ. | U1 — số viết bằng chữ | §5.3.b |

Chạy tự động: `npm run verify` (14 điều) và E2E “câu giám khảo tự nghĩ ra”.

