# Phương pháp kiểm chứng PolicyChange OS

Tài liệu này trả lời mục **Method (Gap)** trong phản hồi doanh nghiệp Sprint 1. Câu hỏi ở đây là: *làm sao biết hệ
thống phân loại đúng trên những câu văn nó chưa từng thấy, chứ không chỉ trên bộ test nhóm tự viết?*

Mọi số trong tài liệu này chạy lại được bằng một lệnh (Mục 6).

## 1. Bốn lớp kiểm chứng

| Lớp | Trả lời câu hỏi | Ở đâu | Ai viết |
|---|---|---|---|
| Kiểm thử đơn vị và E2E | Từng thành phần có làm đúng điều nó hứa không? | `tests/*.test.cjs` (219 ca), `tests/e2e/` (Playwright) | nhóm |
| `npm run verify` | Phần mềm có thi hành **đúng từng điều** của QT-KSTL-01 không? | `scripts/verify.cjs`: 14 điều, mỗi điều một phép thử | nhóm |
| Tập phát triển 48 ca | Động cơ có ổn trên các cách viết nhóm nghĩ ra không? | `bench/holdout.csv` | nhóm, gắn nhãn tay |
| **Tập mù 40 ca** | Động cơ có ổn trên cách viết **người khác** nghĩ ra không? | `bench/blind.csv` | tác tử độc lập, **không xem mã** |

Lớp thứ năm là thử nghiệm với ít nhất 3 nhân sự thật (`docs/THU-NGHIEM-NGUOI-DUNG.md`). Lớp này đo thời gian ra quyết
định và mức người dùng hiểu câu hỏi, nên bổ sung chứ không thay cho các tập có nhãn.

## 2. Vì sao cần tập mù

Doanh nghiệp nhận xét đúng: bộ phân loại dựa trên cụm từ sẽ qua mọi ca nhóm tự viết, vì người viết ca cũng là người
viết cụm từ. Tập 48 ca của Sprint 1 có vấn đề này. Hơn nữa, ở đợt sửa này nhóm đã **dùng nó để thiết kế** neo đại
lượng, nên nó không còn là tập độc lập. Từ đây chúng tôi gọi nó là *tập phát triển*.

Tập mù được lập theo quy trình sau:

1. **Người viết không thấy hệ thống.** Một tác tử AI chạy trong phiên riêng được dặn không mở bất kỳ tệp nào của kho mã.
   Đầu vào duy nhất của nó: các nhánh phân loại của QT-KSTL-01, bảng tên – giá trị – cấp – đơn vị của 6 quy định
   (**không** kèm cụm từ neo), và yêu cầu "cách diễn đạt cố tình đa dạng": từ đồng nghĩa, văn phong FAQ / chatbot /
   email / SMS, viết số bằng chữ, không dấu, chữ viết tắt, ca bẫy chuỗi con.
2. **Nhãn theo nghĩa, không theo máy.** Nhãn là quyết định *đúng* mà một cán bộ pháp chế cẩn thận sẽ đưa ra khi đọc câu.
3. **Đóng băng trước khi đo.** Tệp được commit cùng mã băm SHA-256 (`bench/BLIND-PROVENANCE.md`, commit `86e5eac`)
   **trước** mọi thay đổi động cơ. Kiểm thử `tests/policy-evaluation.test.cjs` báo lỗi nếu tệp bị sửa.
4. **Không chỉnh theo tập mù.** Neo đại lượng lấy từ tên quy định, kho tài liệu mẫu và tập phát triển. Không thêm
   cụm từ nào chỉ vì nó có trong tập mù, kể cả khi điều đó sẽ làm số đẹp hơn.

## 3. Chỉ số

Định nghĩa đầy đủ ở QT-KSTL-01 §10. Tóm tắt theo mức độ nguy hiểm:

- **Tự sửa sai**: máy tự sửa một dòng không được phép tự sửa. Văn bản công bố một con số sai mà không ai được hỏi.
  Ngưỡng là **0**.
- **Bỏ sót**: dòng cần người mà máy không hỏi (tự sửa hoặc bỏ qua). Ngưỡng là **0**.
- **Báo lên thừa**: dòng lẽ ra tự sửa được mà máy vẫn hỏi. Nó chỉ tốn vài giây của người duyệt. Chúng tôi báo cáo và
  theo dõi xu hướng, chưa đặt ngưỡng.

Hai ngưỡng bằng 0 chỉ chặn được hai lỗi nguy hiểm trên tập mù. Chúng không chứng minh hệ thống không bao giờ sai: với
23 ca cần người, kết quả 0 bỏ sót vẫn tương thích với tỉ lệ bỏ sót thật tới **14,3 %** (khoảng tin cậy Wilson 95 %).
Vì vậy tập mù cần lớn dần qua mỗi sprint.

## 4. Kết quả

### 4.1. Tập mù 40 ca (14 AUTO · 13 U1 · 5 U2 · 5 U3 · 3 bẫy)

| | Trước (động cơ Sprint 1) | Sau (động cơ hiện tại) |
|---|---|---|
| Tự sửa sai | **3** / 9 lần tự sửa | **0** / 5 lần tự sửa |
| Bỏ sót | 8 / 23 (34,8 %) | **0 / 23** (0 %; KTC 95 %: 0–14,3 %) |
| Báo lên thừa | 8 / 17 (47,1 %) | 9 / 17 (52,9 %) |
| Đúng hoàn toàn | 22 / 40 (55,0 %) | 29 / 40 (72,5 %) |
| Đúng loại U1/U2/U3 | 86,7 % | 91,3 % |

Ba lần sửa sai cũ: B17 (số dư tạm ứng theo thời điểm), B19 (hạn sinh viên đến nhận giấy) và B34 (thời gian công bố
kết quả phúc khảo). Cả ba đúng chủ đề nhưng con số đo việc khác, nay vào U1 theo §5.3.c. Năm ca bỏ sót do số viết bằng
chữ, "một tuần" hay không dấu (B05, B14, B29, B32, B37) nay vào U1 theo §5.3.b.

**Cái giá:** báo lên thừa tăng thêm một ca (B31, "Giấy xác nhận SV thường có sau 3 ngày"). Câu này không có neo đại
lượng nên máy hỏi lại người. Đây là đánh đổi có chủ đích theo Nguyên tắc 5.5.

**Còn lại 11 ca sai, không ca nào nguy hiểm:**

- 9 ca báo lên thừa do từ đồng nghĩa chưa có trong sổ: "xem lại bài", "phúc tra", "ứng trước", "giấy chứng nhận
  đang học", "ghi danh", "đăng ký môn", "hai người ký duyệt chi"… Đây đúng là điểm yếu doanh nghiệp đã chỉ ra. Chúng
  tôi chọn để nó biểu hiện thành "hỏi thêm" chứ không thành "sửa sai".
- 2 ca U2 bị xếp thành U1 (B02, B35): vẫn dừng hỏi người, chỉ hỏi nhầm người.

### 4.2. Tập phát triển 48 ca

| | Trước | Sau |
|---|---|---|
| Tự sửa sai | 5 / 23 | 2 / 19 |
| Bỏ sót | 6 / 27 (22,2 %) | 2 / 27 (7,4 %) |
| Báo lên thừa | 3 / 21 (14,3 %) | 4 / 21 (19,0 %) |

Hai ca còn tự sửa sai được giữ lại làm bằng chứng về giới hạn của lớp tiền định:

- H40: "Giấy xác nhận sinh viên có giá trị sử dụng trong 3 ngày *kể từ ngày cấp*". Có neo chủ đề và có cả từ "cấp".
- H47: "Giấy xác nhận *vay vốn* được cấp trong 3 ngày làm việc". Neo "giấy xác nhận" quá rộng.

Bắt được hai ca này cần đọc nghĩa: lớp AI §5.6, hoặc neo chủ đề hẹp hơn mà người phụ trách duyệt qua vòng học.
Chúng tôi không thêm luật riêng cho hai câu này, vì làm vậy chỉ là học thuộc đề.

### 4.3. Lớp AI (đo thật ngày 01/10/2026, Gemini 3.5 Flash-Lite gói miễn phí)

Khi máy chủ có khoá AI, mô hình **tự động** rà mọi dòng sắp tự sửa trước khi ban hành (§5.6). Mô hình chỉ có thể giữ
lại một dòng, không bao giờ biến một hồ sơ chuyển tiếp thành tự sửa. Chúng tôi gọi thật `ai-discover` qua Edge Function
cho **cả 24 dòng** mà động cơ muốn tự sửa (5 ở tập mù, 19 ở tập phát triển), rồi cho kết quả đi qua đúng bộ kiểm tra
bằng chứng của sản phẩm. Kết quả lưu ở `bench/ai-run-2026-10-01.json`; phát lại bằng `npm run eval:ai`.

| | Chỉ động cơ | Động cơ + AI |
|---|---|---|
| Tập mù · tự sửa sai | 0 / 5 | 0 / 5 |
| Tập mù · bỏ sót | 0 / 23 | 0 / 23 |
| Tập phát triển · tự sửa sai | 2 / 19 | **0 / 17** |
| Tập phát triển · bỏ sót | 2 / 27 | **0 / 27** |
| Dòng đúng bị AI giữ oan | — | **0 / 22** |

- AI bắt được đúng hai ca mà lớp tiền định bỏ sót:
  - H40: *"nói về thời hạn sử dụng của giấy xác nhận chứ không phải thời gian cấp giấy"*;
  - H47: *"nói về giấy xác nhận vay vốn trong khi quy định đích nói về giấy xác nhận sinh viên"*.
- 22 dòng tự sửa đúng thì AI đều xác nhận "supports", nên không có dòng nào bị giữ oan.
- Lớp AI **không** làm giảm báo lên thừa. Đó là thiết kế có chủ đích, vì AI không được phép bỏ một điểm dừng.

**Giới hạn của lần đo này:**

- Mới có 24 lần gọi, với một mô hình, vào một ngày.
- Mô hình không đơn định tuyệt đối, dù đã đặt `temperature = 0`.
- Bản ghi chỉ lưu nhãn quan hệ và lời giải thích; trích dẫn được phát lại dưới dạng cả dòng.

Lần đo sau nên chạy lại từ màn hình Đánh giá → "Chạy kèm AI ngữ nghĩa", hoặc chạy trên tập mù số 2.

### 4.4. Học từ phản hồi

`node bench/learning-sim.cjs` mô phỏng vòng học: các câu trả lời U1 trên tập phát triển dùng làm phản hồi của người
phụ trách, trưởng đơn vị duyệt mọi đề xuất, rồi chấm lại tập mù. **Kết quả: chưa học được neo nào.** Tập phát triển chỉ
có 4 câu "Có", mỗi câu một cách viết, trong khi luật học cần ít nhất 2 câu chung một cụm.

Kết quả này phù hợp với thiết kế. Vòng học có ích khi cùng một cách viết lặp lại, như mẫu thư, checklist hay FAQ của
cùng một đơn vị. Đó là trường hợp phổ biến trong tổ chức thật nhưng không có trong một tập cố tình đa dạng. Thử nghiệm
3 nhân sự là nơi đo đúng hiệu ứng này.

## 5. Mối đe doạ đối với kết luận

1. **Dữ liệu tổng hợp.** Cả hai tập đều do người hoặc máy soạn, không phải văn bản thật của trường.
2. **Người viết tập mù là một mô hình AI.** Nó độc lập với mã nguồn nhưng không độc lập với "kiểu nghĩ" của mô hình
   ngôn ngữ. Lần tới nên để chính nhân sự phòng ban viết ca trong buổi thử nghiệm.
3. **Cỡ mẫu nhỏ.** Xem khoảng tin cậy ở Mục 3. Mỗi sprint nên thêm một tập mù mới chứ không sửa tập cũ.
4. **Người thiết kế đã thấy kết quả "trước" của tập mù.** Kết quả "trước" được in ra lúc đóng băng, nên nhóm đã thấy
   những ca bị sai. Biện pháp giảm thiểu là quy tắc ở Mục 2.4: không đưa cụm từ nào chỉ có trong tập mù vào neo.
   Biện pháp triệt để là lập một tập mù mới (B41+) sau khi đóng băng động cơ hiện tại.

## 6. Chạy lại

```bash
npm test               # 219 kiểm thử đơn vị
npm run verify         # 14 điều của QT-KSTL-01, bảng ĐẠT/TRƯỢT, mã thoát ≠ 0 nếu trượt
npm run eval:blind     # tập mù 40 ca
node bench/blind.cjs --csv=bench/holdout.csv   # tập phát triển với cùng bộ chỉ số
node bench/learning-sim.cjs                    # mô phỏng vòng học
npm run e2e            # Playwright
```

Giám khảo có thể tự viết CSV theo cột `id,rule_id,new_value,issuer_tier,doc_tier,line,expected[,phenomenon]` rồi tải
lên ở màn hình **Đánh giá → Tải CSV của bạn**, hoặc chạy `node bench/blind.cjs --csv=tệp-của-bạn.csv`.
