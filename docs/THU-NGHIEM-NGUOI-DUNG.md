# Kịch bản thử nghiệm với nhân sự thật (Sprint 2)

Mục tiêu: ít nhất **3 người** đang làm công việc văn bản/hành chính (chuyên viên phòng ban, trưởng/phó phòng,
thư ký khoa…) dùng thử trên workspace `hcmut-pilot`, mỗi buổi 20–25 phút. Dữ liệu trong workspace là dữ liệu tổng
hợp; không nhập văn bản thật có thông tin cá nhân.

## Chuẩn bị (quản trị)

1. Tạo 3 tài khoản và cấp quyền theo `docs/SETUP-BACKEND.md` mục 2, ví dụ:

   | Người | Cấp | Đơn vị |
   |---|---|---|
   | P1 | 1 · chuyên viên | Phòng Đào tạo, Cổng thông tin sinh viên |
   | P2 | 2 · trưởng đơn vị | Phòng Đào tạo, Cổng thông tin sinh viên |
   | P3 | 2 · trưởng đơn vị | Phòng Thanh tra – Pháp chế |

2. Mỗi người mở ứng dụng trên máy của mình → **Đăng nhập (thí điểm)** → **Mở workspace thí điểm**.

## Nhiệm vụ (người thử tự làm, người quan sát không gợi ý)

| # | Ai | Nhiệm vụ | Quan sát |
|---|---|---|---|
| T1 | P2 | Gõ: “Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.” → phân tích | Có hiểu 5 ô thống kê và đồ thị không? |
| T2 | P1 | Mở **Hàng đợi duyệt** → trả lời hồ sơ U1 của HD-04 | Có trả lời được trong < 90 giây? Có hiểu câu hỏi? |
| T3 | P3 | Trả lời hồ sơ U2 của QT-07 | Có thấy vì sao hồ sơ thuộc về mình? |
| T4 | P1 | Thử bấm **Ban hành** | Có hiểu vì sao bị khoá? |
| T5 | P2 | Ban hành → mở **Sổ kiểm toán** → hoàn tác một bản ghi | Có tin tưởng sổ kiểm toán? |
| T6 | P2 | Mở **Sổ đăng ký & học**, thêm một cụm từ neo | Có hiểu tác dụng của neo? |

## Phiếu ghi nhận (mỗi người)

- Thời gian hoàn thành từng nhiệm vụ; số lần hỏi người quan sát.
- Thang 1–5: *Tôi hiểu vì sao hệ thống dừng lại hỏi tôi* · *Tôi tin các chỗ hệ thống tự sửa là đúng* ·
  *Tôi sẵn sàng dùng công cụ này khi quy định đổi*.
- Một điều làm bạn khó chịu nhất; một điều bạn muốn có thêm.
- Có câu hỏi chuyển tiếp nào bạn trả lời khác với ý định thật không?

Sau buổi thử: màn hình **Sổ đăng ký & học** hiển thị các phản hồi đã ghi; màn hình **Đánh giá** chạy lại tập độc lập để
xem cơ chế học neo có làm giảm tỉ lệ chuyển tiếp thừa không. Ghi kết quả tổng hợp vào `BUILD_LOG.md`.
