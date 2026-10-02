# Nguồn gốc tập mù `bench/blind.csv`

- **Ngày tạo:** 01/10/2026, trước mọi thay đổi động cơ của đợt sửa theo phản hồi doanh nghiệp.
- **Người viết:** một tác tử AI độc lập (phiên con), được dặn **không đọc** bất kỳ tệp nào trong kho mã nguồn.
  Đầu vào duy nhất: các nhánh phân loại của QT-KSTL-01 (§5), bảng tên – giá trị – cấp – đơn vị của 6 quy định
  (**không** có cụm từ neo), thang cấp tài liệu, và yêu cầu "cách diễn đạt cố tình đa dạng".
- **Quy mô:** 40 ca — 14 AUTO, 13 U1, 5 U2, 5 U3, 3 NONE (ca bẫy: "17 ngày", "110 triệu", "124 tín chỉ").
- **SHA-256 khi đóng băng:** `03862e162b7b2d6391d1781254a98fadf9b59cb5258035c17817ddeb379c65f4`
- **Quy tắc dùng:** không sửa nhãn, không thêm/bớt ca sau khi đã xem kết quả. Mọi cải tiến động cơ được đo lại
  trên chính tệp này; nếu cần ca mới thì lập tập mù mới, không sửa tập cũ.

Kết quả động cơ **trước** khi sửa (commit đóng băng):

```
blind.csv: 40 ca (23 cần người, 14 tự sửa được, 3 bẫy không được đụng)
Đúng hoàn toàn:            22/40 (55.0%)
Sửa sai (tự sửa nhầm):     3/9 lần tự sửa · độ chính xác tự sửa 66.7%
Bỏ sót (cần người, máy không hỏi): 8/23 (34.8%)
Báo lên thừa:              8/17 (47.1%) · chiếm 34.8% số hồ sơ đẩy lên người
Đúng loại U1/U2/U3:        86.7%
```
