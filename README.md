# PolicyChange OS


**Đường dẫn trực tuyến:** https://lehngvu0110-pixel.github.io/Policychange-OS/
**Trọng tài kiểm soát tài liệu khi quy định thay đổi.**

MLAI Hackathon 2026 · Bảng 1 OrganizationAI · **Đề A — Bộ điều phối chuyển tiếp (The Escalation Referee)**

---

## Vấn đề

Đổi một quy định thì không chỉ sửa một văn bản. Giá trị cũ nằm rải rác trong quy trình tác nghiệp, biểu
mẫu, checklist quầy một cửa, trang hỏi đáp và mẫu thư tự động. Thực tế: văn bản gốc được sửa, các tài
liệu vệ tinh thì không. Sinh viên đọc hướng dẫn cũ, chuyên viên làm theo checklist cũ, hệ thống gửi thư
trích dẫn con số đã hết hiệu lực.

Rà soát thủ công thì chậm và sót. Tự động thay thế toàn bộ bằng find-and-replace thì nguy hiểm — cùng
một con số ở hai chỗ có thể là hai quy định khác nhau.

## Giải pháp

Quy trình thường quy được chọn: **kiểm soát tài liệu khi thay đổi quy định** (xem
`docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md`).

Hệ thống nhận một thay đổi quy định, quét toàn bộ kho tài liệu, và với mỗi vị trí bị ảnh hưởng thì hoặc
tự sửa, hoặc dừng lại và hỏi đúng một câu cho đúng người:

| | Nhóm dừng | Khi nào | Ai quyết |
|---|---|---|---|
| **U1** | Chưa xác định được dữ kiện | Con số không có cụm từ nào neo nó vào một quy định đã đăng ký | Chuyên viên phụ trách tài liệu |
| **U2** | Ngoài phạm vi quy định | Dòng đang nói về một quy định **khác** cũng mang giá trị đó — sửa là đụng nhầm | Đơn vị chủ quản quy định bị đụng |
| **U3** | Vượt thẩm quyền | Tài liệu do cấp cao hơn ban hành — khóa quyền sửa | Người ban hành tài liệu đó |

Mọi trường hợp còn lại được **xử lý tự động, không hỏi người**. Đó là phần lớn khối lượng.

## Chạy thử

### Trực tuyến

Mở đường dẫn trực tuyến → bấm **▶ Chạy thay đổi mẫu**. Không cần tài khoản, không cần cài đặt.

### Tại máy (runbook đầy đủ, từ kho mã nguồn sạch)

```bash
git clone <URL kho mã nguồn>
cd policychange-os
python3 -m http.server 8080      # hoặc: npx serve .
# mở http://localhost:8080
```

Không có bước build, không có phụ thuộc, không cần khóa API, không cần biến môi trường. Mở trực tiếp
tệp `index.html` bằng trình duyệt (`file://`) cũng chạy đầy đủ kể cả hàm băm SHA-256.

### Triển khai

```bash
# GitHub Pages
git push origin main
# Settings → Pages → Source: Deploy from a branch → main / (root)

# hoặc Vercel / Netlify: kéo thả thư mục, không cấu hình gì thêm
```

## Lộ trình kiểm thử cho giám khảo (dưới 90 giây)

1. **▶ Chạy thay đổi mẫu** — hạn nộp đơn phúc khảo `7 ngày → 5 ngày`, ban hành ở cấp Trưởng phòng.
   Hệ thống quét 12 tài liệu, tự sửa 6 vị trí, dừng lại ở 3 vị trí và nêu rõ lý do từng chỗ.
2. **Mục 3** — ba câu hỏi chuyển tiếp, mỗi câu đúng hai nút. Bấm chọn.
3. **Mục 4** — **Ban hành**, xem sổ nhật ký SHA-256. Bấm **Hoàn tác** một bản ghi bất kỳ.
4. **Mục 5** — **▶ Verify** chạy 9 ca kiểm thử, in bảng pass/fail kèm dấu thời gian.
5. Nhập dữ liệu mới: chọn quy định khác, gõ câu lệnh tiếng Việt tự do, hoặc dán một tài liệu mới vào kho.

Chi tiết từng ca: `TESTCASES.md`.

## Kiến trúc

```
Thay đổi quy định ──┐
(form hoặc câu      │
 tiếng Việt tự do)  ▼
              Bộ phân tích câu lệnh (tiền định, regex + sổ đăng ký)
                    │  ├─ không khớp quy định nào ──► TỪ CHỐI XỬ LÝ
                    ▼
              Bộ quét vị trí (chuẩn hoá giá trị: 10 triệu = 10.000.000 = 10tr)
                    ▼
              Bộ phân loại tiền định   U2 → U3 → U1 → tự động
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   Tự sinh bản vá        Sinh câu hỏi đơn lượt + 2 nút
        │                       │ (người quyết)
        └───────────┬───────────┘
                    ▼
              Ban hành + Sổ kiểm toán SHA-256 nối chuỗi + Hoàn tác
```

**Thành phần thực tế (đã chạy được):** toàn bộ sơ đồ trên. Chạy hoàn toàn trong trình duyệt, không máy chủ,
không gọi mô hình ngôn ngữ.

**Thành phần giả lập:** kho 12 tài liệu và sổ 6 quy định là **dữ liệu tổng hợp do nhóm tự soạn**, mô phỏng
hệ thống văn bản của một trường đại học. Không dùng văn bản thật của bất kỳ đơn vị nào.

**Chưa có ở Sprint 1:** lớp mô hình ngôn ngữ để đọc câu lệnh tiếng Việt viết tự do hơn và để gợi ý cụm từ
neo cho quy định mới; kết nối kho tài liệu thật (Google Drive / SharePoint); xử lý tài liệu dạng ảnh quét.

## Vì sao động cơ là tiền định chứ không phải mô hình ngôn ngữ

Ba lý do, theo thứ tự quan trọng:

1. **Quyết định phải giải thích được.** Nhật ký kiểm toán phải trả lời được "vì sao hệ thống dừng ở dòng này" bằng một quy tắc tra ngược được, không phải bằng điểm số độ tin cậy.
2. **Không được suy đoán trên dữ liệu mơ hồ.** Mô hình ngôn ngữ có xu hướng đoán khi thiếu thông tin. Ở đây đoán sai nghĩa là sửa nhầm một quy định đang có hiệu lực.
3. **Chạy được ở mọi lúc.** Không khóa API, không quota, không phụ thuộc mạng — điều kiện để giám khảo bấm vào là chạy.

Lớp mô hình ngôn ngữ được dự kiến bổ sung ở Sprint 2 **bên ngoài đường ra quyết định**: dùng để hiểu câu
lệnh và diễn đạt câu hỏi, không dùng để phân loại.

## Giới hạn đã biết

1. Chỉ xử lý thay đổi dạng **thay giá trị**. Thêm mới hoặc bãi bỏ điều khoản nằm ngoài phạm vi.
2. Chất lượng phân loại phụ thuộc độ đầy đủ của cụm từ neo. Khai báo thiếu làm tăng số hồ sơ U1 — hệ thống dừng nhiều hơn cần thiết, chứ không sửa sai. Đây là hướng lệch có chủ đích.
3. Chỉ phát hiện mâu thuẫn đi qua con số. Mâu thuẫn diễn đạt thuần ngữ nghĩa chưa phát hiện được.
4. Chưa đọc được tài liệu dạng ảnh quét hoặc PDF không có lớp văn bản.
5. Kho tài liệu hiện nằm trong bộ nhớ trình duyệt; tải lại trang là về trạng thái gốc. Bản tích hợp thật cần kho có phiên bản.

## Cấu trúc kho mã nguồn

```
index.html      ứng dụng (một tệp, không phụ thuộc, không bước build)
README.md       tài liệu này — gồm runbook
TESTCASES.md    bảng trường hợp kiểm thử + kịch bản cho giám khảo
BUILD_LOG.md    nhật ký phát triển
docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md
                tài liệu quy định của quy trình được chọn (yêu cầu bắt buộc của Đề A)
```
