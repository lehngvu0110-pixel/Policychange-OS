# Nhật ký phát triển — PolicyChange OS

## Công cụ AI đã dùng và dùng thế nào

| Công cụ | Phạm vi sử dụng |
|---|---|
| Codex | Hỗ trợ xây ứng dụng tĩnh, adapter AI, kiểm tra ngữ nghĩa, graph, prover, benchmark, test hồi quy và review an toàn. Nhóm cần tự kiểm tra kết quả và chịu trách nhiệm về quyết định đưa vào demo. |
| Claude (Cowork) | Sprint 2: tách động cơ thành module dùng chung, backend Supabase (schema, RLS, hàm SQL giao dịch, Edge Functions), nối OpenAI, phân quyền, học từ phản hồi, báo cáo đánh giá, giao diện mới, E2E và CI. Mọi thay đổi đi kèm test; nhóm review qua Pull Request trước khi gộp. |

## Chỗ công cụ giúp được

- Dựng nhanh các bộ dữ liệu tổng hợp, test hồi quy và benchmark có ground truth ghi rõ trong fixture.
- Tìm và sửa các lỗi ở ranh giới tự động sửa: cùng giá trị thuộc hai quy định, số nằm trong ngày tháng, dữ liệu cũ khi Hoàn tác và tính toàn vẹn của sổ kiểm toán.

## Chi phí và giới hạn gặp phải

- Kết quả do AI hỗ trợ vẫn phải kiểm tra bằng test, đọc mã và thao tác trình duyệt; benchmark tổng hợp không đo độ chính xác trên văn bản thật.
- Provider model sống và kho tài liệu thật chưa được tích hợp. Guided demo dùng deterministic fallback và một fixture mock được ghi nhãn rõ.
- Sprint 1: sổ kiểm toán chỉ tồn tại trong bộ nhớ trình duyệt. Sprint 2 đã lưu bền trên Postgres (và IndexedDB khi ngoại tuyến); vẫn chưa có mốc băm độc lập bên ngoài CSDL.
- Sprint 2: tập độc lập do nhóm gắn nhãn tay nên vẫn là dữ liệu tổng hợp; số đo khi bật AI chưa công bố vì chưa chạy trên khoá thật.

## Phần chưa triển khai

Sprint 2 đã nối model sống (OpenAI, bật bằng secret ở máy chủ). **Kho tài liệu thật** (Google Drive / SharePoint) vẫn để ngoài bản demo. Ứng dụng phải chạy được không cần khóa API; model chỉ được đề xuất cách hiểu câu lệnh hoặc bằng chứng, còn quyền sửa vẫn qua động cơ tiền định và prover. Tài liệu ảnh quét và PDF không có lớp văn bản cũng chưa được xử lý.

## Dòng thời gian theo lịch sử Git

| Ngày | Việc |
|---|---|
| 2026-09-21 | Thêm quy trình QT-KSTL-01, động cơ U1/U2/U3, kho tài liệu, Verify, runbook và bảng test case. |
| 2026-09-25 | Thêm adapter AI có fallback, semantic validator, graph, prover, guided demo và benchmark tổng hợp 26 ca. |
| 2026-09-25 | Gia cố các rào chắn an toàn ở đường tự động sửa. |
| 2026-09-25 | Sửa Hoàn tác khi dòng đã đổi, sổ kiểm toán chỉ ghi thêm, kiểm tra chuỗi SHA-256 và định dạng số đầu vào. |
| 2026-09-29 | Sprint 2: tách động cơ, luồng nghiệp vụ, sổ kiểm toán thành module dùng chung trình duyệt / Node / Deno; sửa lỗi “10 trang” bị hiểu là “10 tr”. |
| 2026-09-29 | Supabase: schema + RLS chỉ đọc, hàm `apply_change` giao dịch, `policy-api`; OpenAI qua `ai-extract` / `ai-discover`; phân quyền cấp × đơn vị. |
| 2026-09-29 | Học neo từ phản hồi, tập độc lập 48 ca và báo cáo tỉ lệ bỏ sót / chuyển tiếp thừa. |
| 2026-09-30 | Giao diện 7 màn hình, đồ thị tác động SVG, E2E Playwright, kiểm thử tải, CI; sửa lỗi máy chủ chỉ đọc 1.000 bản ghi sổ. |
| 2026-09-30 | Hàng đợi duyệt dùng chung (hồ sơ `CR-n`, mỗi người quyết phần của mình trên máy mình), sổ ghi đúng người quyết, quyền hoàn tác theo cấp ban hành, hạn mức AI theo máy khách. |
