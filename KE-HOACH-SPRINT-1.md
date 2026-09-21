# Việc còn lại trước 23h00 ngày 22/09

Sắp theo thứ tự ăn điểm. Làm từ trên xuống, dừng ở đâu cũng vẫn nộp được.

## Ưu tiên 1 — Ba thứ không có là bị loại ở Giai đoạn 0 (khoảng 2 giờ)

- [ ] **Tạo repo public** `policychange-os`, push toàn bộ thư mục này.
      Commit **nhiều lần, rải theo giờ thực**. Tuyệt đối không `squash`, không `force-push` — lịch sử commit là bằng chứng chấm điểm.
- [ ] **Bật GitHub Pages**: Settings → Pages → Deploy from a branch → `main` / `(root)`.
      Kiểm tra đường dẫn mở được trên điện thoại, ở chế độ ẩn danh, không đăng nhập.
- [ ] **Bấm thử Verify trên chính đường dẫn đó** — phải in bảng 9/9 PASS kèm dấu thời gian.

Xong ba gạch đầu dòng này là đã qua cửa loại và có 22/40 điểm vận hành.

## Ưu tiên 2 — Chống hỏng trước mặt giám khảo (khoảng 1 giờ)

- [ ] Mở trên Chrome, Safari, Firefox và một điện thoại. Ghi lại nếu có gì vỡ.
- [ ] Nhờ **một người ngoài nhóm** mở đường dẫn, chỉ đọc dòng hướng dẫn trên trang, và làm thử. Nếu họ lưỡng lự quá 10 giây ở bước đầu thì sửa lại câu hướng dẫn, không sửa người dùng.
- [ ] Tự đóng vai giám khảo: nghĩ ra 3 thay đổi quy định mà nhóm **chưa từng thử**, gõ vào, xem hệ thống có xử lý hoặc từ chối hợp lý không. Sửa những chỗ nó trả lời ngớ ngẩn.

## Ưu tiên 3 — 5 slide + video (khoảng 3 giờ)

Đúng 5 slide, không thêm. **Slide 3 và Slide 5 trọng số lớn nhất; thiếu một trong hai bị trừ 50% mục đó.**

| Slide | Nội dung |
|---|---|
| 1 | Hiện trạng: đổi một quy định thì văn bản gốc được sửa, còn checklist, biểu mẫu, trang hỏi đáp, mẫu thư tự động thì không. Nêu hệ quả cụ thể. |
| 2 | Đầu vào → Xử lý → Đầu ra, và **chỉ rõ ba điểm con người quyết định** (U1 chuyên viên, U2 đơn vị chủ quản, U3 người ban hành tài liệu). Sơ đồ này phải **khớp đúng** với hệ thống đang chạy — giám khảo sẽ đối chiếu. |
| 3 | **Tác động + phương pháp đo.** Sprint 1 chỉ cần nêu *cách sẽ đo*, chưa cần số. Xem mục dưới. |
| 4 | Kiến trúc và **phân định rõ phần thực tế với phần giả lập**. Nói thẳng: động cơ là thật, kho 12 tài liệu là dữ liệu tổng hợp tự soạn. |
| 5 | Giới hạn và rủi ro — chép từ mục "Giới hạn đã biết" trong `README.md`, thêm hướng xử lý tiếp. |

Video: quay màn hình mộc, dưới 3 phút, để nguyên chỗ chưa hoàn thiện. Đừng dựng đẹp.

## Phương pháp đo lường dự kiến (dùng cho Slide 3)

Đây là thứ Sprint 1 chấm, chứ không chấm con số. Viết đúng như sau:

**Chỉ số 1 — Số vị trí bị bỏ sót khi rà soát thủ công.**
Cách đo: đưa cùng một thay đổi quy định và cùng bộ tài liệu cho 3 người, yêu cầu họ tự tìm mọi vị trí cần
sửa, bấm giờ. Đối chiếu danh sách của họ với danh sách hệ thống tìm được. Đếm số vị trí người bỏ sót và
số vị trí hệ thống bỏ sót.

**Chỉ số 2 — Thời gian từ khi có thay đổi đến khi mọi tài liệu nhất quán.**
Cách đo: đo hai lần trên cùng một thay đổi, một lần làm thủ công, một lần qua hệ thống. Tính cả thời gian
chờ giữa các bước bàn giao, không chỉ thời gian thao tác.

**Chỉ số 3 — Tỷ lệ chuyển tiếp thừa và bỏ sót.**
Cách đo: một người am hiểu quy chế tự gán nhãn đúng cho từng vị trí (đây là chuẩn đối chiếu), rồi so với
nhãn hệ thống. Bỏ sót = hệ thống tự sửa một chỗ đáng lẽ phải hỏi. Chuyển tiếp thừa = hỏi một chỗ lẽ ra
tự làm được. **Báo cáo cả hai, kể cả khi số xấu.**

**Chỉ số 4 — Bất cập phát sinh.**
Cách đo: hỏi thẳng người dùng thử *"dùng cái này rồi thì việc gì mới sinh ra cho anh/chị?"*. Trả lời
"không có bất cập nào" bị chấm **0 điểm** cho cả mục 20 điểm người dùng thật. Phải tìm ra bằng được.

> Cảnh báo: bịa số liệu, tạo người dùng ảo hoặc làm giả ý kiến xác nhận bị **truất quyền thi đấu**, không
> phải trừ điểm. Sprint 1 chưa cần số. Đừng điền số vào chỗ chưa đo.

## Ưu tiên 4 — Chuẩn bị cho Sprint 2 (làm sau 22/09, không gấp)

- [ ] Nhật ký phát triển 1 trang (`BUILD_LOG.md` đã có khung sẵn).
- [ ] Liên hệ trước **3 người dùng thật có chức danh cụ thể** đang thực sự làm công việc duy trì văn bản/biểu mẫu. Gợi ý theo bối cảnh đã chọn: chuyên viên Phòng Đào tạo hoặc Phòng Công tác Sinh viên phụ trách biểu mẫu; thư ký Ban chấp hành Đoàn – Hội; thủ quỹ hoặc ban chủ nhiệm câu lạc bộ phụ trách quy chế chi tiêu.
      Cần: họ tên, chức danh thật, **trích dẫn nguyên văn** phản hồi của họ, và **một thay đổi cụ thể trong sản phẩm sinh ra từ phản hồi đó**, thể hiện bằng commit.
- [ ] Lớp mô hình ngôn ngữ cho câu lệnh tiếng Việt tự do — đặt **ngoài** đường ra quyết định.

## Phân công gợi ý cho nhóm

| Người | Việc |
|---|---|
| 1 | Repo, GitHub Pages, kiểm tra đa trình duyệt, lịch sử commit |
| 2 | Thử phá hệ thống bằng đầu vào lạ, ghi lại chỗ trả lời ngớ ngẩn, sửa |
| 3 | 5 slide + video |
| 4 | Liên hệ 3 người dùng thật, đặt lịch cho Sprint 2 |

Nhóm ít người thì bỏ dần từ dưới lên. Ưu tiên 1 không được bỏ.
