# Nhật ký phát triển — PolicyChange OS

## Công cụ AI đã dùng và dùng thế nào

| Công cụ | Phạm vi sử dụng |
|---|---|
| Codex | Hỗ trợ xây ứng dụng tĩnh, adapter AI, kiểm tra ngữ nghĩa, graph, prover, benchmark, test hồi quy và review an toàn. Nhóm cần tự kiểm tra kết quả và chịu trách nhiệm về quyết định đưa vào demo. |

## Chỗ công cụ giúp được

- Dựng nhanh các bộ dữ liệu tổng hợp, test hồi quy và benchmark có ground truth ghi rõ trong fixture.
- Tìm và sửa các lỗi ở ranh giới tự động sửa: cùng giá trị thuộc hai quy định, số nằm trong ngày tháng, dữ liệu cũ khi Hoàn tác và tính toàn vẹn của sổ kiểm toán.

## Chi phí và giới hạn gặp phải

- Kết quả do AI hỗ trợ vẫn phải kiểm tra bằng test, đọc mã và thao tác trình duyệt; benchmark tổng hợp không đo độ chính xác trên văn bản thật.
- Provider model sống và kho tài liệu thật chưa được tích hợp. Guided demo dùng deterministic fallback và một fixture mock được ghi nhãn rõ.
- Sổ kiểm toán chỉ tồn tại trong bộ nhớ trình duyệt; cần lưu trữ bền vững và mốc băm độc lập nếu dùng trong quy trình thật.

## Phần chưa triển khai

**Kết nối model sống và kho tài liệu thật** được để ngoài bản demo hiện tại. Ứng dụng phải chạy được không cần khóa API; model chỉ được đề xuất cách hiểu câu lệnh hoặc bằng chứng, còn quyền sửa vẫn qua động cơ tiền định và prover. Tài liệu ảnh quét và PDF không có lớp văn bản cũng chưa được xử lý.

## Dòng thời gian theo lịch sử Git

| Ngày | Việc |
|---|---|
| 2026-09-21 | Thêm quy trình QT-KSTL-01, động cơ U1/U2/U3, kho tài liệu, Verify, runbook và bảng test case. |
| 2026-09-25 | Thêm adapter AI có fallback, semantic validator, graph, prover, guided demo và benchmark tổng hợp 26 ca. |
| 2026-09-25 | Gia cố các rào chắn an toàn ở đường tự động sửa. |
| 2026-09-25 | Sửa Hoàn tác khi dòng đã đổi, sổ kiểm toán chỉ ghi thêm, kiểm tra chuỗi SHA-256 và định dạng số đầu vào. |
