# Kịch bản trình diễn (3–5 phút)

Mở ứng dụng (GitHub Pages, `npm run serve`, hoặc mở thẳng `index.html`). Nếu mạng phòng chấm chặn máy chủ, ứng dụng
tự chuyển sang **Ngoại tuyến**; mọi bước dưới vẫn chạy.

1. **Tổng quan** — giới thiệu một câu: *tự sửa chỗ chắc chắn, hỏi đúng người ở chỗ cần hỏi*. Chỉ vào ô Dữ liệu,
   AI, Vai trò và trạng thái chuỗi SHA-256.
2. **Minh hoạ 1 · Tự sửa an toàn** (nút “Chạy”) — hạn phúc khảo 7 → 5 ngày; ngày “17/07/2025” trong cùng dòng không
   bị đụng. Prover 13/13 điều kiện, đã ban hành. Mở **Sổ kiểm toán** → bấm **Hoàn tác** → thêm bản ghi hoàn tác, không
   xoá vết. Bấm **Thoát minh hoạ**.
3. **Thay đổi quy định** — gõ “Rút thời hạn nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.”
   → **Hiểu yêu cầu** → **Phân tích tác động**: 9 vị trí, 6 tự sửa, U1/U2/U3 mỗi loại một. Chỉ vào đồ thị tác động.
4. **Phân quyền** — đổi **Vai trò** sang *Chuyên viên Phòng Đào tạo*: quyết được U1 (HD-04), bị khoá ở U2 (cần Trưởng
   phòng Thanh tra – Pháp chế) và không bấm được **Ban hành** (thay đổi cấp 2). Đổi lại *Trưởng phòng Đào tạo* → Ban hành.
5. **Minh hoạ 2 · AI giữ lại** — động cơ nói tự sửa, nhưng bằng chứng ngữ nghĩa “có thể liên quan” → giữ lại chờ người.
   (Bằng chứng này là dữ liệu mẫu có ghi nhãn mock. Khi đã dán khoá OpenAI, dùng nút **Rà soát ngữ nghĩa bằng AI** để
   chạy thật.)
6. **Minh hoạ 3 · Từ chối** — “Đổi tất cả các thời hạn 7 ngày thành 5 ngày” bị từ chối trước khi phân tích.
7. **Đánh giá** — **Chạy Verify** (9/9) và **Chạy tập 48 ca**: nói thẳng tỉ lệ bỏ sót 22,2 % của riêng động cơ tiền
   định và vì sao lớp AI + học neo nhắm vào đúng các ca đó.
8. **Sổ đăng ký & học** — giải thích vòng học: câu trả lời U1 → đề xuất neo → trưởng đơn vị duyệt → lần sau tự xử lý.

Câu trả lời cho câu hỏi thường gặp:
- *Dữ liệu có mất khi tải lại không?* Không — dùng chung trên Supabase, hoặc IndexedDB khi ngoại tuyến.
- *AI có tự sửa văn bản không?* Không. AI chỉ trả trích dẫn làm bằng chứng và chỉ có thể làm kết quả thận trọng hơn.
- *Hai người bấm Ban hành cùng lúc?* Máy chủ khoá workspace và kiểm đuôi sổ; người sau nhận thông báo và được nạp lại.
