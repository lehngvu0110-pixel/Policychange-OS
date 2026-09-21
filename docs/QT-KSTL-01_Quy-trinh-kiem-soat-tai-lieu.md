# QT-KSTL-01 — Quy trình kiểm soát tài liệu khi thay đổi quy định

**Phiên bản 1.0 · Tài liệu quy định của quy trình được chọn cho Đề A (Bộ điều phối chuyển tiếp)**
MLAI Hackathon 2026 · Bảng 1 OrganizationAI

> **Tuyên bố dữ liệu:** Toàn bộ mã tài liệu, tên đơn vị và nội dung điều khoản trong quy trình này và trong
> kho tài liệu của bản demo là **dữ liệu tổng hợp do nhóm tự soạn**, mô phỏng hệ thống văn bản của một
> trường đại học. Không sao chép văn bản thật của bất kỳ đơn vị nào.

---

## 1. Mục đích và phạm vi

Khi một quy định thay đổi (đổi hạn mức, đổi thời hạn, đổi cấp phê duyệt), giá trị cũ không chỉ nằm ở
văn bản gốc mà còn rải rác trong quy trình tác nghiệp, biểu mẫu, checklist, hướng dẫn và mẫu thư tự động.
Thực tế phổ biến là văn bản gốc được sửa còn các tài liệu vệ tinh thì không — sinh viên đọc hướng dẫn cũ,
chuyên viên làm theo checklist cũ, hệ thống gửi thư trích dẫn con số đã hết hiệu lực.

Quy trình này quy định cách **rà soát, đề xuất, phê duyệt và ban hành** việc cập nhật toàn bộ tài liệu bị
ảnh hưởng bởi một thay đổi quy định, và quy định **những trường hợp bắt buộc dừng để hỏi con người**.

Phạm vi áp dụng: mọi tài liệu nằm trong kho tài liệu có kiểm soát của đơn vị.

## 2. Định nghĩa

| Thuật ngữ | Định nghĩa |
|---|---|
| **Quy định gốc** | Một mục trong Sổ đăng ký quy định (Mục 3), gồm: mã, tên, giá trị đang có hiệu lực, văn bản nguồn, đơn vị chủ quản, và danh sách cụm từ neo. |
| **Cụm từ neo** | Từ/ngữ đặc trưng cho phép xác định một câu văn đang nói về quy định nào. Ví dụ: "phúc khảo", "tạm ứng", "hai chữ ký". |
| **Vị trí bị ảnh hưởng** | Một dòng trong một tài liệu có chứa giá trị hiện hành của quy định gốc được sửa. |
| **Cấp tài liệu** | Cấp thẩm quyền ban hành tài liệu (Mục 4). |
| **Cấp ban hành thay đổi** | Cấp thẩm quyền của người/đơn vị ra quyết định thay đổi quy định lần này. |

## 3. Sổ đăng ký quy định

Mọi quy định chịu kiểm soát phải được đăng ký trước khi hệ thống được phép tác động lên nó. Một mục
đăng ký gồm: `mã · tên · giá trị hiện hành · văn bản nguồn · đơn vị chủ quản · cụm từ neo`.

**Nguyên tắc 3.1 — Không có trong sổ thì không xử lý.** Nếu thay đổi tham chiếu tới một giá trị không
khớp với bất kỳ quy định nào trong sổ, hệ thống **từ chối xử lý** và yêu cầu đăng ký quy định trước. Hệ
thống không được phép tự suy đoán quy định đích.

**Nguyên tắc 3.2 — Trùng giá trị không phải trùng quy định.** Hai quy định khác nhau có thể cùng mang
một giá trị (ví dụ: hạn nộp đơn phúc khảo và hạn phản hồi khiếu nại cùng là 7 ngày). Việc trùng số tuyệt
đối không được coi là căn cứ để sửa.

## 4. Phân cấp thẩm quyền tài liệu

| Cấp | Loại tài liệu | Người ban hành | Ví dụ |
|---|---|---|---|
| **Cấp 1** | Tài liệu tác nghiệp | Chuyên viên / đơn vị tự ban hành | Checklist quầy Một cửa, hướng dẫn hỏi đáp, mẫu thư tự động |
| **Cấp 2** | Quy trình cấp Phòng/Ban | Trưởng đơn vị ký | Quy trình nghiệp vụ, biểu mẫu chuẩn |
| **Cấp 3** | Quy định cấp Trường | Hiệu trưởng / Hội đồng Trường ký | Quy định công tác học vụ, quy chế chi tiêu nội bộ |

**Nguyên tắc 4.1 — Không sửa lên trên.** Một thay đổi ban hành ở cấp *n* chỉ được tự động áp dụng lên
tài liệu có cấp ≤ *n*. Tài liệu cấp cao hơn bị **khóa quyền sửa** và phải trình đúng cấp.

## 5. Phân loại xử lý

Với mỗi vị trí bị ảnh hưởng, hệ thống xác định tập **quy định neo** của dòng đó (các quy định có cụm từ
neo xuất hiện trong dòng), rồi áp dụng bốn nhánh sau **theo đúng thứ tự**:

### 5.1. U2 — Ngoài phạm vi quy định *(chuyển tiếp)*

Dòng được neo vào một quy định **khác** với quy định đang sửa, và quy định đó cũng đang mang giá trị cũ.
Sửa tại đây sẽ vô tình thay đổi một quy định thứ hai chưa ai yêu cầu sửa.

→ Chuyển tiếp cho **đơn vị chủ quản của quy định bị đụng tới**.

### 5.2. U3 — Vượt thẩm quyền *(chuyển tiếp)*

Cấp tài liệu > cấp ban hành thay đổi (Nguyên tắc 4.1).

→ Khóa quyền sửa, chuyển tiếp cho **người ban hành tài liệu đó**.

### 5.3. U1 — Chưa xác định được dữ kiện *(chuyển tiếp)*

Dòng không có cụm từ neo nào, tức không xác định được con số ở đó thuộc quy định nào. Trường hợp điển
hình: con số nằm trong khối ví dụ, trong bảng không có tiêu đề ngữ cảnh, hoặc là một mốc nội bộ chưa
được đăng ký.

→ Chuyển tiếp cho **chuyên viên phụ trách tài liệu**.
→ **Nghiêm cấm suy đoán.** Hệ thống không được tự quyết định con số đó "chắc là" thuộc quy định nào.

### 5.4. Tự động xử lý

Không rơi vào U1, U2, U3: dòng được neo đúng vào quy định đang sửa và tài liệu nằm trong thẩm quyền.

→ Hệ thống **tự sửa**, không hỏi người. Đây là trường hợp thường quy, chiếm phần lớn khối lượng.

**Nguyên tắc 5.5 — Không chuyển tiếp thừa.** Vị trí thỏa Mục 5.4 mà bị đẩy lên người là lỗi xử lý, bị
tính như lỗi bỏ sót.

## 6. Yêu cầu đối với câu hỏi chuyển tiếp

Mỗi hồ sơ chuyển tiếp phải sinh ra **đúng một câu hỏi đóng**, kèm **đúng hai nút hành động**, thỏa:

1. Nêu đủ: mã tài liệu, số dòng, trích nguyên văn dòng, giá trị cũ, giá trị mới đề xuất.
2. Nêu rõ căn cứ máy đã dùng để dừng (quy định nào, điều khoản nào, cấp nào).
3. Người xử lý **quyết được ngay trong một lượt trả lời, không phải mở lại tài liệu gốc để tra cứu**.
4. Kèm một dòng giải thích bằng ngôn ngữ thường, dành cho người không chuyên môn kỹ thuật.

Không được dùng câu hỏi chung chung dạng "đề nghị xem xét lại".

## 7. Ban hành và nhật ký kiểm toán

1. Chỉ các vị trí đã được duyệt (tự động thuộc Mục 5.4, hoặc người đã chọn nút chấp thuận) mới được ban hành.
2. Mỗi lần ban hành sinh một bản ghi kiểm toán gồm: `số thứ tự · thời điểm · tác nhân (AI hay người, vai trò gì) · tài liệu · dòng · nội dung trước · nội dung sau · căn cứ quy định · băm của bản ghi trước · băm của chính nó`.
3. Băm tính bằng SHA-256 trên toàn bộ nội dung bản ghi nối với băm của bản ghi liền trước. Sổ **chỉ ghi thêm**.
4. **Hoàn tác** khôi phục nội dung cũ và sinh một bản ghi mới. Bản ghi gốc không bị xóa.
5. Quyết định **từ chối sửa** cũng phải được ghi nhật ký, ngang hàng với quyết định sửa.

## 8. Vai trò và trách nhiệm

| Vai trò | Trách nhiệm | Quyết định được phép |
|---|---|---|
| Chuyên viên phụ trách tài liệu | Duy trì tài liệu cấp 1, trả lời hồ sơ U1 | Xác nhận một con số có thuộc quy định đang sửa hay không |
| Trưởng đơn vị chủ quản | Ký tài liệu cấp 2, trả lời hồ sơ U2 | Cho phép hoặc từ chối sửa kèm một quy định khác |
| Hiệu trưởng / Hội đồng Trường | Ký tài liệu cấp 3, trả lời hồ sơ U3 | Từ chối và yêu cầu ban hành quyết định đúng cấp, hoặc chấp thuận ngoại lệ có ghi nhận |
| Hệ thống (AI) | Rà soát, phân loại, sinh đề xuất và câu hỏi, ghi nhật ký | **Chỉ** tự sửa các vị trí thuộc Mục 5.4. Không bao giờ tự quyết trên U1/U2/U3 |

## 9. Giới hạn đã biết

1. Quy trình chỉ xử lý được thay đổi dạng **thay giá trị**. Thay đổi làm phát sinh điều khoản mới hoặc bãi bỏ điều khoản nằm ngoài phạm vi.
2. Chất lượng phân loại phụ thuộc vào độ đầy đủ của danh sách cụm từ neo. Một quy định khai báo thiếu cụm từ neo sẽ làm tăng số hồ sơ U1 — hệ thống dừng nhiều hơn mức cần thiết chứ không sửa sai.
3. Việc phát hiện mâu thuẫn hiện dựa trên trùng giá trị giữa các quy định đã đăng ký. Mâu thuẫn logic không đi qua con số (ví dụ hai điều khoản mô tả cùng một việc bằng hai cách khác nhau) chưa phát hiện được.
4. Tài liệu ở dạng ảnh quét hoặc PDF không có lớp văn bản chưa được hỗ trợ.
