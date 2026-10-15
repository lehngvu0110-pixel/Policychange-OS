# Kết quả thử nghiệm người dùng

Cách làm: `docs/THU-NGHIEM-NGUOI-DUNG.md`. Bảng dưới chỉ chép dữ liệu từ phiếu thật (bảng `user_test_responses` trên
Supabase). Không điền số giả định.

## 1. Người thử (đợt 1, phiếu trực tuyến, 14/10/2026)

| Mã | Vai trò thật (ghi đúng theo phiếu) | Có soạn / duyệt văn bản hành chính? | Hình thức | Đồng ý trích? |
|---|---|---|---|---|
| P1 | Sinh viên | Có | Tự làm theo phiếu trực tuyến | **Không trích** (chỉ ghi tóm ý, không tên) |
| P2 | Nhân, BCH Đoàn khoa | Có | Tự làm theo phiếu trực tuyến | Tên và công việc |
| P3 | Trung, sinh viên năm 2 | Có | Tự làm theo phiếu trực tuyến | Tên và công việc |

Cả ba đều là sinh viên (một người trong BCH Đoàn khoa). Đợt này **chưa có** chuyên viên hay trưởng phòng thật.
Ban tổ chức sẽ chuyển phản hồi của 3 người dùng phía VNG vào ngày 16/10; phần đó ghi thành đợt 2 bên dưới.

## 2. Kết quả nhiệm vụ

| Việc | P1 | P2 | P3 |
|---|---|---|---|
| 1 · Báo một thay đổi (7 → 5 ngày) | Bị vướng: không thấy giá trị 5 ngày hiện ra | Làm được | Làm được |
| 2 · Trả lời câu hỏi của mình | Làm được | Làm được | Làm được |
| 3 · Ban hành và xem Sổ kiểm toán | Làm được | Làm được | Làm được |
| "Tôi hiểu vì sao máy dừng lại hỏi người" (1–5) | 3 | 4 | 4 |
| "Nếu nơi tôi làm có công cụ này, tôi sẽ dùng" (1–5) | 4 | 4 | 4 |

Tổng: 8/9 việc hoàn thành. Điểm hiểu trung bình 3,7/5; điểm sẽ dùng 4/5. Không phiếu nào gửi kèm số đo thời gian
trả lời, nên chưa có số giây.

## 3. Góp ý

- **P1** (không đồng ý trích nguyên văn, nên chỉ ghi tóm ý): giao diện nhiều chữ; nên tinh gọn như trang tìm kiếm
  chỉ có một ô; nếu là một trưởng phòng lớn tuổi thì sẽ rất khó dùng. Ở việc 1, P1 không thấy giá trị 5 ngày.
- **P2**, câu "Chỗ nào khó hiểu hoặc khó chịu nhất?": "Không".
- **P3**, cùng câu: "không".

## 4. Cải tiến làm ra từ phản hồi

| Góp ý gốc | Đã sửa gì | Commit |
|---|---|---|
| P1, việc 1: không thấy giá trị 5 ngày | Nguyên nhân: phải bấm "Hiểu yêu cầu" rồi mới bấm "Phân tích tác động"; bấm thẳng nút sau thì ô Giá trị mới còn trống. Nay "Phân tích tác động" tự đọc câu nếu câu chưa được đọc, một nút là đủ. Có E2E giữ lỗi này không quay lại. | xem `git log --grep "P1"` |
| P1: nhiều chữ, trưởng phòng lớn tuổi khó dùng | Màn hình mới **Hướng dẫn** đứng đầu thanh bên: 4 bước bằng lời thường, mỗi bước một nút đưa tới đúng chỗ ("Thử với câu mẫu", "Chỉ cho tôi ô Vai trò"…); phần giải thích khái niệm và câu hỏi thường gặp. Tổng quan có ô "Lần đầu dùng? Xem hướng dẫn". | như trên |
| P1: như trên | Nút **Aa / Chữ lớn** trên thanh trên cùng phóng to toàn bộ giao diện, nhớ lựa chọn trên máy. Chữ nhỏ nhất cũng được tăng nhẹ. | như trên |

## 5. Bất cập còn lại

- Hai trong ba người trả lời "không" ở câu khó hiểu, nên đợt này chưa khai thác được bất cập phát sinh khi dùng. Phiếu
  gửi ban tổ chức (đợt 2) có thêm câu "Dùng công cụ này rồi thì có việc gì mới phát sinh cho anh/chị không?".
- Điểm "hiểu vì sao máy hỏi" thấp nhất (3/5) ở chính người gặp vướng; cần đo lại sau cải tiến.
- Mẫu nhỏ, toàn sinh viên. Chưa thử với người đang thật sự duyệt văn bản ở phòng ban.

## 6. Đợt 2: 3 người dùng phía VNG (ban tổ chức chuyển, dự kiến 16/10)

Chưa có. Sẽ chép đúng phản hồi nhận được.
