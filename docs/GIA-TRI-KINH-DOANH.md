# Giá trị kinh doanh: chi phí của một con số công bố sai

Phản hồi doanh nghiệp Sprint 1 viết: *"quy định chỉ đổi vài lần mỗi năm, nên bạn không bán số giờ tiết kiệm. Bạn bán
việc tránh sai sót… Hãy đi tìm con số đó."* Tài liệu này làm đúng việc đó. Mục 1 là bằng chứng công khai, có nguồn.
Mục 2 là mô hình chi phí có giả định ghi rõ. Mục 3 là kế hoạch lấy số thật của trường trong buổi thử nghiệm.

## 1. Một con số sai trong tài liệu vệ tinh tốn tiền thật — bằng chứng công khai

| Sự việc | Chuyện gì đã xảy ra | Bài học cho PolicyChange OS |
|---|---|---|
| **Moffatt v. Air Canada** (Tòa giải quyết tranh chấp dân sự British Columbia, 02/2024) | Chatbot trên website nói khách có thể xin giá vé tang lễ *sau* chuyến bay. Trang chính sách thì nói phải xin *trước*. Hãng lập luận chatbot "là một thực thể riêng". Tòa bác lập luận đó và buộc hãng bồi thường khoảng **812 CAD**: *"It makes no difference whether the information comes from a static page or a chatbot."* | Tổ chức chịu trách nhiệm cho **mọi** câu trả lời mình công bố, không riêng văn bản gốc. FAQ, chatbot và mẫu thư trong kho mẫu (HD-04, EM-06) chính là loại tài liệu này. |
| **Nghị định 04/2021/NĐ-CP** (xử phạt vi phạm hành chính trong lĩnh vực giáo dục) | Điều 7 khoản 2 điểm b: công khai thông tin **không chính xác** bị phạt **20–30 triệu đồng**. Điều 8 khoản 1 điểm a: thông báo tuyển sinh không đúng hoặc không đầy đủ bị phạt **10–20 triệu đồng**. | Với cơ sở giáo dục Việt Nam, một con số sai trên kênh công khai có giá được luật định. |
| **Trường ĐH Khoa học – ĐH Huế** (Tuổi Trẻ, 15/05/2024) | Thao tác sai trên phần mềm làm học phí 3 học phần thay thế (10 tín chỉ) bị đặt thấp hơn mức chuẩn. Sắp tốt nghiệp, mỗi sinh viên bị yêu cầu đóng thêm **3.750.000 đồng**. Trường phải xin lỗi, giảm 75 % lệ phí tốt nghiệp và cho gia hạn. | Sai sót phát hiện muộn thì nhà trường gánh phần lớn chi phí sửa (giảm phí, xin lỗi, gia hạn), dù đúng về quy định. |
| **Gartner** (2020) | Dữ liệu kém chất lượng làm mỗi tổ chức tốn trung bình **ít nhất 12,9 triệu USD/năm**. | Bối cảnh chung. Đây không phải số riêng cho tài liệu quy định. |

## 2. Mô hình chi phí cho một lần đổi quy định

Ví dụ trong bản demo là rút hạn nộp đơn phúc khảo từ 7 xuống 5 ngày. Giá trị cũ nằm ở 9 vị trí trong 8 tài liệu: quy
định, quy trình, biểu mẫu, FAQ, checklist, mẫu thư. Giả sử văn bản gốc đã sửa nhưng **một** tài liệu vệ tinh bị sót,
chẳng hạn trang hỏi đáp HD-04 vẫn ghi "trong vòng 7 ngày".

```
Chi phí kỳ vọng của một vị trí bị sót
  = (số người đọc vị trí đó trong kỳ) × (tỉ lệ làm theo con số sai) × (chi phí xử lý một trường hợp)
  + (xác suất bị xem là công bố thông tin không chính xác) × (mức phạt)
  + chi phí hoàn tác: xin lỗi, gia hạn, sửa lại hàng loạt
```

| Tham số | Giá trị dùng để minh hoạ | Nguồn / trạng thái |
|---|---|---|
| Lượt đơn phúc khảo mỗi học kỳ | 2.000 | **giả định**, cần số của Phòng Đào tạo |
| Tỉ lệ nộp ở ngày thứ 6–7 (đúng theo trang cũ, trễ theo quy định mới) | 5 % → 100 đơn | **giả định** |
| Thời gian xử lý một đơn bị từ chối rồi khiếu nại | 2 giờ chuyên viên | **giả định** |
| Chi phí một giờ chuyên viên (chỉ tính lương ngạch) | ≈ 33.600 đồng | hệ số 2,34 × lương cơ sở 2.530.000 đồng (từ 01/07/2026, NĐ 161/2026/NĐ-CP) ÷ 176 giờ |
| Mức phạt công khai thông tin không chính xác | 20–30 triệu đồng | NĐ 04/2021/NĐ-CP, Điều 7.2.b |

Với các số trên, riêng giờ công xử lý khiếu nại là khoảng 100 × 2 × 33.600 ≈ **6,7 triệu đồng mỗi học kỳ, cho một
trang bị sót**. Chưa tính rủi ro phạt 20–30 triệu đồng.

Chi phí lớn nhất lại không nằm trong bảng: 100 sinh viên mất quyền phúc khảo vì tin vào văn bản của chính trường. Theo
nguyên tắc trong vụ Air Canada, nhiều khả năng trường phải chấp nhận các đơn đó. Khi ấy quy định mới **mất hiệu lực trên
thực tế** trong học kỳ đầu.

So sánh: PolicyChange OS rà toàn bộ kho trong vài mili giây cho mỗi thay đổi. Chi phí gọi AI bị chặn bởi hạn mức ngày
(`AI_DAILY_LIMIT`) và không tăng theo số tài liệu. Lập luận bán hàng vì thế **không** phải "tiết kiệm giờ rà soát".
Lập luận là: **mỗi lần đổi quy định, xác suất còn sót một vị trí trên kênh công khai giảm về gần 0, và mọi chỗ máy
không chắc đều có tên người chịu trách nhiệm.**

## 3. Lấy số thật của trường (làm cùng buổi thử nghiệm 3 nhân sự)

Hỏi Phòng Đào tạo, Phòng Công tác Sinh viên và Phòng Kế hoạch – Tài chính, rồi điền vào bảng. Không cần số chính xác,
chỉ cần đúng bậc độ lớn.

| Câu hỏi | Phòng | Trả lời |
|---|---|---|
| Mỗi năm có bao nhiêu lần đổi một con số trong quy định/quy chế (hạn, mức, ngưỡng)? | cả ba | |
| Mỗi lần đổi, bao nhiêu tài liệu vệ tinh phải sửa theo (biểu mẫu, FAQ, mẫu thư, checklist, trang web)? | cả ba | |
| Lần gần nhất có tài liệu vệ tinh bị sót là khi nào, phát hiện bằng cách nào, sau bao lâu? | cả ba | |
| Số đơn phúc khảo / giấy xác nhận / đề nghị tạm ứng mỗi học kỳ | từng phòng | |
| Một khiếu nại vì thông tin cũ tốn bao nhiêu giờ, qua mấy người? | Thanh tra – Pháp chế | |
| Đã từng phải gia hạn, hoàn phí, xin lỗi vì văn bản cũ chưa? Bao nhiêu tiền? | Kế hoạch – Tài chính | |

Khi có số thật, thay vào Mục 2 và ghi nguồn là "phỏng vấn [phòng], [ngày]".

## Nguồn

- CBS News, "Air Canada chatbot costs airline discount it wrongly offered customer", 02/2024 — https://www.cbsnews.com/news/aircanada-chatbot-discount-customer/
- Nghị định 04/2021/NĐ-CP, Thư viện Pháp luật — https://thuvienphapluat.vn/van-ban/Vi-pham-hanh-chinh/Nghi-dinh-04-2021-ND-CP-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-giao-duc-450564.aspx
- Tuổi Trẻ, "Sinh viên sắp tốt nghiệp phải đóng thêm học phí do sơ suất của nhà trường", 15/05/2024 — https://tuoitre.vn/sinh-vien-sap-tot-nghiep-phai-dong-them-hoc-phi-do-so-suat-cua-nha-truong-20240515141223743.htm
- Báo Chính phủ, "Chính thức tăng lương cơ sở lên 2.530.000 đồng/tháng từ 01/7/2026" — https://baochinhphu.vn/chinh-thuc-tang-luong-co-so-len-2530000-dong-thang-tu-01-7-2026-102260516214238878.htm
- LuatVietnam, "Bảng lương cán bộ, công chức, viên chức năm 2026" (hệ số A1 bậc 1 = 2,34) — https://luatvietnam.vn/can-bo-cong-chuc/bang-luong-can-bo-cong-chuc-vien-chuc-nam-2026-566-107608-article.html
- Gartner, "Data Quality: Why It Matters and How to Achieve It" — https://www.gartner.com/en/data-analytics/topics/data-quality
