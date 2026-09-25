# Bộ trường hợp kiểm thử — PolicyChange OS

Chạy bằng **một thao tác**: mở đường dẫn trực tuyến → mục 5 → bấm **▶ Verify — chạy toàn bộ**.
Bảng kết quả in kèm dấu thời gian thực. Không cần cài đặt, không cần tài khoản.

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

**C1 — Chọn quy định khác trong sổ đăng ký.** Mục 1 → chọn bất kỳ trong 6 quy định, nhập giá trị mới,
chọn cấp ban hành → ▶ Chạy. Ví dụ: `R-DK-01` đổi `24 tín chỉ → 20 tín chỉ` ở cấp 2 sẽ trả về U3 vì
Điều 37.1 thuộc quy định cấp Trường.

**C2 — Gõ câu lệnh tiếng Việt tự do.** Ô bên phải → *"Nâng hạn mức tạm ứng do Trưởng đơn vị duyệt từ
10 triệu lên 15 triệu."* → **Phân tích câu lệnh**. Bộ phân tích nhận dạng cặp giá trị, cấp ban hành và
quy định đích. Câu lệnh mơ hồ hoặc tham chiếu giá trị không đăng ký sẽ bị từ chối kèm lý do.

**C3 — Thêm tài liệu mới vào kho.** Mục 1 → *Thêm tài liệu mới* → dán nội dung bất kỳ, chọn cấp → **Thêm
vào kho** → chạy lại phân tích. Tài liệu mới được quét như mọi tài liệu khác.

## D. Cách kiểm chứng vai trò con người và nhật ký kiểm toán

1. Chạy một thay đổi ở mục 1.
2. Mục 3 — trả lời các câu hỏi chuyển tiếp. Mỗi câu đúng hai nút, quyết dứt điểm trong một lượt.
3. Mục 4 — bấm **Ban hành**. Sổ nhật ký in ra: tác nhân là AI hay người, vai trò gì, tài liệu nào, dòng nào, nội dung trước/sau, căn cứ điều khoản, băm SHA-256 nối chuỗi.
4. Bấm **Hoàn tác** trên một bản ghi khi dòng hiện tại vẫn đúng bằng nội dung bản ghi đã ban hành. Nội dung trở về nguyên trạng và sổ **thêm** một bản ghi hoàn tác. Nếu dòng đã thay đổi, ứng dụng từ chối hoàn tác và giữ nguyên sổ.
5. Mục 6 — mở tài liệu để đối chiếu nội dung và số hiệu phiên bản đã tăng.

## E. Kết quả chạy gần nhất

| Bộ | Kết quả |
|---|---|
| 4 ca bắt buộc | 4/4 PASS |
| Escalation 90 giây | 5/5 PASS |

Độ trễ mỗi ca dưới 10 ms trên máy để bàn thông thường. Con số hiển thị trong bảng là đo thực tế tại thời
điểm bấm nút, không phải giá trị ghi sẵn.
