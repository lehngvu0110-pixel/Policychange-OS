# Kịch bản trình diễn (3–5 phút)

Mở ứng dụng (GitHub Pages, `npm run serve`, hoặc mở thẳng `index.html`). Nếu mạng phòng chấm chặn máy chủ, ứng dụng
tự chuyển sang **Ngoại tuyến**; mọi bước dưới vẫn chạy.

1. **Tổng quan** — giới thiệu một câu: *tự sửa chỗ chắc chắn, hỏi đúng người ở chỗ cần hỏi*. Chỉ vào ô Dữ liệu,
   AI, Vai trò và trạng thái chuỗi SHA-256.
2. **Minh hoạ 1 · Tự sửa an toàn** (nút “Chạy”) — hạn phúc khảo 7 → 5 ngày; ngày “17/07/2025” trong cùng dòng không
   bị đụng. Prover 14/14 điều kiện, đã ban hành. Mở **Sổ kiểm toán** → bấm **Hoàn tác** → thêm bản ghi hoàn tác, không
   xoá vết. Bấm **Thoát minh hoạ**.
3. **Thay đổi quy định** — gõ “Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.”
   → **Hiểu yêu cầu** → **Phân tích tác động**: 9 vị trí, 6 tự sửa, U1/U2/U3 mỗi loại một. Chỉ vào đồ thị tác động.
4. **Phân quyền** — đổi **Vai trò** sang *Chuyên viên Phòng Đào tạo*: quyết được U1 (HD-04), bị khoá ở U2 (cần Trưởng
   phòng Thanh tra – Pháp chế) và không bấm được **Ban hành** (thay đổi cấp 2). Đổi lại *Trưởng phòng Đào tạo* → Ban hành.
   **Nhiều người cùng làm (chế độ Trực tuyến)** — nếu Trưởng phòng Đào tạo bấm **Ban hành** khi U2/U3 còn chờ, phần
   chắc chắn được áp ngay và U2/U3 thành **hồ sơ CR-1** trong **Hàng đợi duyệt**. Mở tab thứ hai (hoặc máy thứ hai),
   chọn *Trưởng phòng Thanh tra – Pháp chế* → quyết U2 trong CR-1; chọn *Hiệu trưởng* → quyết U3; hồ sơ tự đóng. Sổ
   kiểm toán ghi đúng tên từng người quyết và “hồ sơ CR-1 · cấp ban hành 2 · khởi tạo bởi Trưởng phòng Đào tạo”.
   Thử đổi sang *Chuyên viên Phòng Đào tạo* và bấm Hoàn tác một dòng đó: bị khoá vì thay đổi do cấp 2 ban hành.
   Xong thì bấm **Khôi phục dữ liệu mẫu** ở thanh bên.
5. **Minh hoạ 2 · AI giữ lại** — động cơ nói tự sửa, nhưng bằng chứng ngữ nghĩa “có thể liên quan” → giữ lại chờ người.
   (Bằng chứng này là dữ liệu mẫu có ghi nhãn mock. Khi đã dán khoá OpenAI, dùng nút **Rà soát ngữ nghĩa bằng AI** để
   chạy thật.)
6. **Minh hoạ 3 · Từ chối** — “Đổi tất cả các thời hạn 7 ngày thành 5 ngày” bị từ chối trước khi phân tích.
7. **Câu của giám khảo** (trả lời thẳng phản hồi “regex trượt cách diễn đạt mới”) — vào **Kho tài liệu → Nạp tài
   liệu**, dán vài dòng tự nghĩ ra, ví dụ “Kết quả phúc khảo được thông báo sau 7 ngày.”, “Sinh viên có một tuần để
   nộp đơn phúc khảo.”, “Han nop don phuc khao la 7 ngay.” → phân tích lại hạn phúc khảo: cả ba vào **U1** với lý do
   cụ thể (sai đại lượng / quy đổi tuần / không dấu), không dòng nào bị tự sửa. Thêm “Đơn khiếu nại được trả lời trong
   vòng một tuần.” → **U2** (hạn khiếu nại cũng là 7 ngày). Nhấn mạnh: *khi không chắc, máy hỏi — không đoán*.
8. **Đánh giá** — **Chạy Verify** (9/9), rồi **Chạy tập mù 40 ca**: tập do tác tử không xem mã viết, đóng băng trước
   khi sửa. Nói thẳng: tự sửa sai 0, bỏ sót 0/23, nhưng báo lên thừa còn 52,9 % — đó là cái giá chọn “hỏi thừa” thay
   vì “sửa sai”, và vòng học neo + AI là cách kéo nó xuống. Ở terminal: `npm run verify` in 14/14 điều của QT-KSTL-01.
9. **Sổ đăng ký & học** — mỗi quy định có neo chủ đề và neo đại lượng; câu trả lời U1 → đề xuất đúng loại neo còn
   thiếu → trưởng đơn vị duyệt → lần sau tự xử lý.

Câu trả lời cho câu hỏi thường gặp:
- *Dữ liệu có mất khi tải lại không?* Không — dùng chung trên Supabase, hoặc IndexedDB khi ngoại tuyến.
- *AI có tự sửa văn bản không?* Không. AI chỉ trả trích dẫn làm bằng chứng và chỉ có thể làm kết quả thận trọng hơn.
- *Hai người bấm Ban hành cùng lúc?* Máy chủ khoá workspace và kiểm đuôi sổ; người sau nhận thông báo và được nạp lại.
- *Hai người quyết cùng một vị trí?* Người sau nhận “Vị trí này vừa được người khác quyết” và thấy quyết định của người trước.
