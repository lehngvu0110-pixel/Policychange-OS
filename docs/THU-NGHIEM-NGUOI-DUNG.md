# Thử nghiệm với người dùng (Sprint 2, 13–15/10/2026)

Mục tiêu theo thang điểm: **ít nhất 3 người** dùng thử, ghi **nguyên văn** điều họ nói, và chỉ ra **một cải tiến làm
ra từ phản hồi của họ** (có commit). Mỗi buổi 15 phút. Kết quả ghi vào `docs/KET-QUA-THU-NGHIEM.md`.

## Cách nhanh nhất: gửi đường dẫn phiếu

Gửi hàng loạt đường dẫn **https://lehngvu0110-pixel.github.io/Policychange-OS/thu-nghiem.html**. Phiếu tự hướng dẫn
mở ứng dụng, giao ba việc, hỏi hai câu chấm điểm và ba câu hỏi mở. Người thử bấm **Gửi phiếu** là câu trả lời vào thẳng
bảng `user_test_responses` trên Supabase (ai cũng gửi được, không ai đọc được qua API công khai; nhóm đọc bằng SQL trong
Supabase). Nếu họ đồng ý, phiếu gửi kèm số đo thời gian trả lời câu hỏi đã đo trên trình duyệt của họ — không cần tải CSV.
Mạng lỗi thì nút **Sao chép câu trả lời** cho phép dán gửi qua Zalo.

Đọc kết quả (SQL Editor của Supabase):

```sql
select created_at, answers, timing from public.user_test_responses order by created_at;
```

## Quy tắc trung thực (bắt buộc)

- Ghi đúng người thử là ai: vai trò thật, có làm văn bản hành chính hay không. Một sinh viên đóng vai chuyên viên
  được ghi là *sinh viên đóng vai chuyên viên*, không ghi là *chuyên viên*.
- Chỉ trích những câu người thử thực sự nói hoặc viết. Không viết lại cho "hay hơn", không thêm người.
- Câu chê cũng ghi. Thang điểm chấm 0 nếu báo cáo "không có bất cập nào".
- Xin phép trước khi ghi tên. Nếu họ không muốn, ghi P1, P2, P3 kèm vai trò.

**Nên tìm ai.** Tốt nhất là người đang soạn hoặc duyệt văn bản hành chính: thư ký văn phòng khoa, trợ giảng, anh chị
trong BCH Đoàn – Hội khoa hay CLB đang ra thông báo, kế hoạch, biểu mẫu. Bạn bè chưa làm văn bản vẫn dùng được để thử
độ dễ hiểu của giao diện, nhưng nên có ít nhất một người thật sự làm văn bản.

## Chuẩn bị (5 phút, không cần tài khoản)

1. Mỗi người mở https://lehngvu0110-pixel.github.io/Policychange-OS/ trên máy hoặc điện thoại của họ, nhấn
   Cmd+Shift+R (máy tính) để tải bản mới.
2. Thanh bên → **Khôi phục dữ liệu mẫu**.
3. Người quan sát mở `docs/KET-QUA-THU-NGHIEM.md` (hoặc giấy) để ghi. Không giải thích trước cách dùng; chỉ đọc nhiệm
   vụ.

## Nhiệm vụ (người thử tự làm, người quan sát không gợi ý)

| # | Nhiệm vụ đọc cho người thử | Quan sát và ghi |
|---|---|---|
| N1 | "Bạn là Trưởng phòng Đào tạo. Hạn nộp đơn phúc khảo đổi từ 7 xuống 5 ngày. Hãy cho hệ thống biết và xem nó định sửa những gì." | Có tìm ra mục Thay đổi quy định? Đọc câu tóm tắt có hiểu không? Mất bao lâu? |
| N2 | "Chỗ nào máy không chắc? Vì sao nó hỏi?" | Người thử giải thích U1 / U2 / U3 bằng lời của họ — ghi nguyên văn |
| N3 | "Đổi vai trò thành Chuyên viên Phòng Đào tạo và trả lời câu hỏi của bạn." | Trả lời trong bao lâu? Có chọn đúng ý mình không? |
| N4 | "Thử ban hành với vai trò Chuyên viên." | Có hiểu vì sao bị khoá? |
| N5 | "Quay lại Trưởng phòng, ban hành, rồi tìm xem ai đã sửa gì." | Có tìm ra Sổ kiểm toán? Có tin sổ này không? |
| N6 | (Tuỳ chọn) "Nạp một văn bản của bạn (.docx) và thử đổi một con số trong đó." | Kết quả có hợp lý với văn bản thật của họ không? |

Cuối buổi, trên máy người thử: **Hàng đợi duyệt → Tải CSV** (tệp `thoi-gian-quyet-dinh.csv`, thời gian trả lời từng câu
hỏi do ứng dụng tự đo). Gửi tệp về cho nhóm.

## Ba câu hỏi phỏng vấn (ghi nguyên văn)

1. "Chỗ nào làm bạn khó hiểu hoặc khó chịu nhất?"
2. "Nếu được sửa một thứ, bạn sửa gì?"
3. "Ở chỗ bạn làm, khi một quy định đổi thì hiện giờ mọi người cập nhật các văn bản khác thế nào?"

Thang 1–5 (khoanh): *Tôi hiểu vì sao hệ thống dừng lại hỏi tôi* · *Tôi tin các chỗ hệ thống tự sửa* · *Tôi sẽ dùng nếu
chỗ tôi làm có công cụ này*.

## Sau buổi thử: biến phản hồi thành một cải tiến

1. Chọn một góp ý mà nhiều người cùng gặp, hoặc một góp ý sửa được trong vài giờ.
2. Sửa trên một nhánh riêng. Ghi trong commit message: `Theo phản hồi thử nghiệm P2 (13/10): "…nguyên văn…"`.
3. Ghi vào mục 4 của `docs/KET-QUA-THU-NGHIEM.md`: góp ý gốc → đã sửa gì → commit nào.
