# Nguồn gốc tập mù số 2 `bench/blind2.csv`

- **Ngày tạo:** 04/10/2026, sau đợt sửa theo báo cáo kiểm thử 02/10 (`main` = `10fd7c6`). Đóng băng **trước** khi chạy
  động cơ trên tập này.
- **Người viết:** một tác tử AI độc lập (phiên con), được dặn **không đọc** bất kỳ tệp nào trong kho mã nguồn hay tập mù
  số 1. Tác tử đóng vai 3 cán bộ có văn phong khác nhau:
  - P1 (C01–C12): chuyên viên Phòng Đào tạo — FAQ, thông báo, câu Hỏi/Đáp;
  - P2 (C13–C24): thư ký khoa — email, tin nhắn Zalo, viết tắt, thiếu dấu;
  - P3 (C25–C36): cán bộ Phòng KH-TC và Phòng CTSV — các bước quy trình, checklist, văn phong pháp lý.
- **Đầu vào duy nhất:** tên, giá trị, đơn vị và cấp của 6 quy định; thang cấp tài liệu; định nghĩa nhãn theo ngữ nghĩa
  (NONE → U2 → U3 → U1 → AUTO), viết như cách một người kiểm soát tài liệu cẩn thận sẽ quyết. Đầu vào **không** có cụm từ
  neo hay cơ chế của động cơ.
- **Kiểm nhãn độc lập:** một tác tử thứ hai, cũng không xem mã, tự gán nhãn cho cả 36 ca rồi so với đáp án. Kết quả:
  **không bất đồng ca nào**. Có 3 ca giáp ranh, đều giữ nguyên nhãn:
  - C15 "24TC": coi là AUTO;
  - C25: số viết kèm chữ "(mười triệu đồng)", coi là U1;
  - C36: "tạm ứng" nhưng nội dung là ngưỡng chữ ký kiểm soát, coi là U2.
- **Quy mô:** 36 ca — 12 AUTO, 12 U1, 5 U2, 4 U3, 3 NONE.
- **SHA-256 khi đóng băng:** `384c4578349f1f6faec07522a37907c1ea615bca9a5e9f8235cce761f02d7b41`
- **Giới hạn:** người viết là AI mô phỏng văn phong cán bộ, **không phải cán bộ thật**. Tập này không thay cho việc thu
  câu do nhân sự thật viết (`docs/THU-NGHIEM-NGUOI-DUNG.md`).
- **Quy tắc dùng:** không sửa nhãn, không thêm hay bớt ca sau khi đã xem kết quả. Cần ca mới thì lập tập mù số 3.
