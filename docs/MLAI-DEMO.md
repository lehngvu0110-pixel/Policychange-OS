# Kịch bản trình diễn PolicyChange OS (3–5 phút)

Bản cập nhật 11/10/2026 cho Demo Day.

**Trước giờ demo:**
- Mở trang web, nhấn Cmd+Shift+R để chắc chắn trang đã tải bản mới.
- Ở thanh bên, bấm **Khôi phục dữ liệu mẫu** để workspace Trình diễn sạch.
- Nếu mạng phòng chấm chặn máy chủ, ứng dụng tự chuyển sang **Ngoại tuyến**. Mọi bước dưới vẫn chạy, chỉ phần AI tắt.

## Các bước

1. **Tổng quan.** Giới thiệu một câu: *tự sửa chỗ chắc chắn, hỏi đúng người ở chỗ cần hỏi*. Chỉ vào khung **Máy làm gì, khi nào thì hỏi người?** (Tự sửa / U1 / U2 / U3 bằng lời thường) và bảng độ chính xác của hai tập mù. Nút **?** trên thanh trên mở hướng dẫn và thuật ngữ. Chỉ vào các ô Dữ liệu, AI
   (đang dùng Gemini) và Vai trò, cùng trạng thái chuỗi SHA-256.

2. **Minh hoạ 1 · Tự sửa an toàn** (bấm "Chạy").
   - Hạn phúc khảo 7 → 5 ngày. Ngày "17/07/2025" trong cùng dòng không bị đụng tới.
   - Prover đạt 14/14 điều kiện, rồi ban hành.
   - Mở **Sổ kiểm toán**, bấm **Hoàn tác**: sổ thêm một bản ghi hoàn tác, không xoá vết cũ.
   - Bấm **Thoát minh hoạ**.

3. **Thay đổi quy định.**
   - Gõ: "Rút thời hạn nộp đơn phúc khảo từ 7 xuống 5 ngày, do Trưởng phòng Đào tạo ban hành."
   - Bấm **Hiểu yêu cầu**. Hệ thống hiểu đúng dù câu chỉ ghi "ngày" một lần, và nhắc người dùng kiểm tra lại.
   - Bấm **Phân tích tác động**. Đọc to câu tóm tắt ở đầu kết quả: *Máy tự sửa 6 chỗ chắc chắn. Còn 3 câu hỏi cần người trả lời*, kèm ai trả lời câu nào. 9 vị trí, gồm 6 tự sửa và U1, U2, U3 mỗi loại một; ba câu hỏi nằm trên cùng. Nếu AI giữ lại dòng nào, ô "AI giữ
     lại" hiện ra và số tự sửa giảm tương ứng. Chỉ vào đồ thị tác động.
   - Sửa thử câu trong ô: nút **Ban hành** khoá ngay vì biểu mẫu đã khác phân tích. Sửa lại như cũ thì nút mở lại.

4. **Phân quyền.**
   - Đổi **Vai trò** sang *Chuyên viên Phòng Đào tạo*:
     - quyết được U1 (HD-04). Câu hỏi nhắc rõ quy định này đo "nộp / tiếp nhận / thời hạn";
     - bị khoá ở U2, vì cần Trưởng phòng Thanh tra – Pháp chế;
     - không bấm được **Ban hành**, vì đây là thay đổi cấp 2.
   - Đổi lại *Trưởng phòng Đào tạo* và bấm **Ban hành**. Phần chắc chắn được áp ngay. U2 và U3 thành **hồ sơ CR-1**
     trong **Hàng đợi duyệt**.
   - Nếu có máy thứ hai:
     - chọn *Trưởng phòng Thanh tra – Pháp chế* rồi quyết U2;
     - chọn *Hiệu trưởng* rồi quyết U3;
     - hồ sơ tự đóng, và sổ ghi đúng tên từng người quyết.

5. **Minh hoạ 2 · AI giữ lại.** Động cơ nói tự sửa được, nhưng bằng chứng ngữ nghĩa là "có thể liên quan", nên vị trí
   bị giữ lại chờ người. Bằng chứng ở minh hoạ này là dữ liệu mẫu có ghi nhãn mock. Với phân tích thật, AI (Gemini) tự
   rà mọi dòng tự sửa trước khi ban hành; nút **Rà soát ngữ nghĩa bằng AI** dùng để chạy tay.

6. **Minh hoạ 3 · Từ chối.** Câu "Đổi tất cả các thời hạn 7 ngày thành 5 ngày" bị từ chối trước khi phân tích. Kho và
   sổ không đổi, và không còn kết quả cũ nào để ban hành.

7. **Minh hoạ 4 · Một câu, nhiều nơi.** Cùng một câu FAQ được chép lên website, chatbot và mẫu email.
   - Hệ thống thấy 3 vị trí cần người, nhưng chỉ hỏi **1 câu**. Thẻ ghi "Câu này xuất hiện ở 3 vị trí".
   - Vai trò đang là *Chuyên viên Phòng Đào tạo*. Bấm **B · Không** một lần: cả 3 vị trí được quyết; sổ vẫn ghi riêng
     từng dòng.
   - Trên **Hàng đợi duyệt** có ô "Thời gian trả lời câu hỏi" (trung vị giây/câu, tải được CSV). Nói: *đây là số đo
     chi phí thật cho người duyệt, thay cho giả định*.
   - Bấm **Thoát minh hoạ**.

8. **Câu do giám khảo tự nghĩ.** Phần này trả lời thẳng phản hồi "regex trượt cách diễn đạt mới".
   - Cách nhanh nhất: mời giám khảo đưa một tệp **.docx** của họ. Vào **Kho tài liệu → Chọn tệp .docx / .txt / .md**.
     Tệp được đọc ngay trên máy, không gửi đi đâu; mỗi đoạn văn thành một dòng, mỗi hàng bảng thành "ô | ô".
   - Hoặc vào **Kho tài liệu → Nạp tài liệu** và dán:
     - "Kết quả phúc khảo được thông báo sau 7 ngày."
     - "Sinh viên có một tuần để nộp đơn phúc khảo."
     - "Han nop don phuc khao la 7 ngay."
   - Phân tích lại hạn phúc khảo: cả ba vào **U1**, mỗi dòng có lý do riêng (sai đại lượng / quy đổi tuần / không
     dấu). Không dòng nào bị tự sửa.
   - Nhấn mạnh: *khi không chắc, máy hỏi chứ không đoán*.

9. **Đánh giá.**
   - Bấm **Chạy Verify**, rồi **Chạy tập mù 40 ca** và **Tập mù số 2 · 36 ca**. Hai tập do tác tử không xem mã viết,
     đóng băng bằng mã băm trước khi chạy.
   - Nói thẳng: cả hai tập đều tự sửa sai 0, bỏ sót 0, nhưng báo lên thừa còn 52,9 % và 26,7 %. Đó là cái giá của việc chọn "hỏi thừa" thay
     vì "sửa sai". Vòng học neo cùng lớp AI là cách kéo con số này xuống.
   - Ở terminal: `npm run verify` in kết quả 14/14 điều của QT-KSTL-01.

10. **Sổ đăng ký & học · Minh hoạ 5.** Mỗi quy định có neo chủ đề và neo đại lượng. Bấm **Chạy** ở *5 · Máy học từ
   câu trả lời*: hai dòng viết "phúc tra" bị hỏi U1 → trả lời "Có" → hệ thống đề xuất neo «phúc tra», trưởng phòng duyệt
   → một email mới cũng viết "phúc tra" được tự sửa, không hỏi lại. Khung tím ở đầu trang kể lại 4 bước.
   - Trên **Đánh giá**, bấm **Chạy thí nghiệm học neo**. Nói thẳng: học trên tập này, đo trên tập khác; một cách chia
     giảm báo lên thừa 9/17 → 6/17, ba cách còn lại chưa giảm vì từ đồng nghĩa ít lặp. Không cách nào làm phát sinh
     sửa sai.
   - Câu hỏi đang chờ người khác: nút **Sao chép lời nhắn** tạo tin nhắn có đường dẫn tới Hàng đợi để gửi qua Zalo /
     Teams / email.

## Câu hỏi thường gặp

- **Dữ liệu có mất khi tải lại trang không?** Không. Dữ liệu dùng chung nằm trên Supabase, còn khi ngoại tuyến thì nằm
  trong IndexedDB. Workspace đã chọn cũng được nhớ.
- **AI có tự sửa văn bản không?** Không. AI chỉ trả trích dẫn làm bằng chứng và chỉ có thể làm kết quả thận trọng hơn.
  Lần rà sau không gỡ được cờ giữ lại hay quyết định của người.
- **Hai người bấm Ban hành cùng lúc thì sao?** Máy chủ khoá workspace và kiểm đuôi sổ. Người sau nhận thông báo và được
  nạp lại dữ liệu.
- **Câu giống nhau ở nhiều nơi có bị hỏi nhiều lần không?** Không. Câu hỏi được gộp khi cùng loại hồ sơ, cùng người có
  thẩm quyền và cùng mệnh đề chứa con số. Khác một chữ thì vẫn hỏi riêng.
- **Đã có ai kiểm thử độc lập chưa?** Có. Báo cáo ngày 02/10 nêu 8 lỗi, tất cả đã sửa và có test
  (`docs/BAO-CAO-KIEM-THU-02-10.md`).
