# Đối chiếu phản hồi doanh nghiệp Sprint 1 (Track VNG)

Nhóm AbleMind · PolicyChange OS · cập nhật 01/10/2026

Bảng dưới đi qua từng mục trong phiếu phản hồi. Mỗi dòng ghi phản hồi, việc đã làm, cách kiểm chứng và phần **còn
mở**. Mọi số liệu chạy lại được bằng `npm run verify`, `npm run eval:blind` và `npm test`.

## 1. Rào cản bắt buộc phải sửa

> *"Việc phân loại chỉ dùng regex… trượt cách diễn đạt của giám khảo trên case mới… Nối bộ chuyển đổi vào một mô hình
> thật với schema ràng buộc."*

Chúng tôi xử lý theo hai hướng song song.

**(a) Mô hình thật, schema ràng buộc, bộ chứng minh tất định giữ vai trò lớp kiểm tra**

- `ai-extract` đọc câu yêu cầu tiếng Việt, `ai-discover` rà ngữ nghĩa. Cả hai gọi **OpenAI Structured Outputs** với JSON
  schema `strict`, qua Edge Function. Khoá chỉ nằm ở máy chủ.
- Mới trong đợt này: khi máy chủ có khoá, mô hình **tự động** rà mọi dòng sắp tự sửa trước khi ban hành
  (`app.ensureSemanticReview`), không cần ai nhớ bấm nút. Mô hình chỉ trả trích dẫn nguyên văn. Trích dẫn được kiểm
  lại từng vị trí ký tự, và mô hình chỉ có thể **giữ lại** một dòng (QT-KSTL-01 §5.6).
- Prover tất định độc lập kiểm **14 điều kiện** trước mỗi bản vá. Điều kiện mới là `registered_measure_cue`.

**(b) Lớp tiền định thất bại an toàn trước cách viết lạ**

Phiếu phản hồi đúng ở điểm: một từ đồng nghĩa chưa liệt kê thì regex không thấy. Điều nguy hiểm thật sự là regex
**tự sửa sai** những câu có đúng từ khoá nhưng nói về việc khác. Chúng tôi đổi điều kiện tự sửa như sau:

- **Neo chủ đề + neo đại lượng** (§5.4). "Kết quả phúc khảo được thông báo sau 7 ngày" có từ "phúc khảo" nhưng không có
  "nộp", "thời hạn" hay "tiếp nhận", nên vào U1 thay vì bị tự sửa.
- **Giá trị viết khác dạng** (§5.3.b): "một tuần", "hai mươi bốn tín chỉ", "mười triệu", "7 ngay". Trước đây máy không
  thấy các dạng này (bỏ sót). Nay máy nhận ra nhưng **luôn hỏi người**.
- Khi không chắc, máy hỏi thêm chứ không đoán. Hỏi thừa vẫn là lỗi được đo (§5.5), nhưng là lỗi rẻ.

**Kiểm chứng trên tập mù**: 40 ca, do tác tử không xem mã viết, đóng băng trước khi sửa.

| | Trước | Sau |
|---|---|---|
| Tự sửa sai | 3 | **0** |
| Bỏ sót | 8/23 | **0/23** |
| Báo lên thừa | 8/17 | 9/17 |

**Còn mở**

- Báo lên thừa trên tập mù còn **52,9 %**, chủ yếu do từ đồng nghĩa ("phúc tra", "ứng trước", "ghi danh"…).
- Lớp AI chưa được đo vì nhóm chưa dán khoá.
- Hai ca của tập phát triển (H40, H47) vẫn bị lớp tiền định tự sửa sai khi tắt AI.

Chi tiết: `docs/PHUONG-PHAP-KIEM-CHUNG.md`.

## 2. Kế hoạch hành động ưu tiên cho Sprint 2

| # | Phản hồi | Đã làm | Kiểm chứng |
|---|---|---|---|
| 1 | Nối bộ chuyển đổi AI vào mô hình thật; giữ bộ chứng minh tất định làm lớp kiểm tra | OpenAI Structured Outputs qua `ai-extract` / `ai-discover`, tự rà trước khi ban hành, prover 14 điều kiện, validator trích dẫn | `tests/openai-mapping.test.cjs`, `tests/app-controller.test.cjs`, verify §5.4, §5.6 |
| 2 | Thêm backend nhỏ và CSDL để lịch sử thẩm định không mất khi tải lại trang | Supabase Postgres + RLS. Mọi ghi đi qua `policy-api`, chạy lại động cơ và gọi `apply_change` trong một giao dịch. Có hàng đợi duyệt dùng chung cho nhiều người. Mất mạng thì dùng IndexedDB | E2E "tải lại vẫn còn"; smoke test trên máy chủ thật (commit → 403 / 200 / 409) |
| 3 | Bộ dữ liệu thử nội bộ ≥ 15 ca, cách diễn đạt cố tình đa dạng | **Tập mù 40 ca** (`bench/blind.csv`) gồm FAQ, chatbot, SMS không dấu, số viết bằng chữ, từ đồng nghĩa và bẫy chuỗi con, đóng băng SHA-256. Kèm tập phát triển 48 ca | `bench/BLIND-PROVENANCE.md`; kiểm thử khoá mã băm |
| 4 | Đo tỷ lệ báo lên sai | Đo cả 3 chiều: **tự sửa sai**, **bỏ sót**, **báo lên thừa**, kèm ma trận nhầm lẫn và khoảng tin cậy | `npm run eval:blind`; màn hình Đánh giá; `docs/PHUONG-PHAP-KIEM-CHUNG.md` §4 |

## 3. Đánh giá năng lực thực thi

| Tiêu chí | Sprint 1 | Đã làm |
|---|---|---|
| **Nó chạy (40 %)** — Tốt | — | Vẫn mở được tức thì, không cần cài, kể cả mở thẳng `index.html`. Có thêm bản dùng chung trên máy chủ. |
| **Ranh giới con người (20 %)** — Một phần | — | Phân quyền **cấp × đơn vị** chặn thật ở máy chủ (403). Hàng đợi dùng chung: mỗi người quyết phần của mình trên máy mình, sổ ghi đúng tên người quyết. Hoàn tác đòi đủ cấp ban hành. Mỗi câu hỏi nêu đủ tài liệu, dòng, trích dẫn và giá trị cũ → mới (§6.1, nay được kiểm tự động). |
| **Khớp yêu cầu đề bài (20 %)** — Một phần | — | Mục 4 bên dưới. |
| **Phương pháp kiểm chứng (20 %)** — Thiếu | — | `npm run verify` kiểm 14 điều. Tập mù có quy trình đóng băng. Tài liệu phương pháp nêu rõ chỉ số, khoảng tin cậy và mối đe doạ đối với kết luận. CI chạy cả hai. |

## 4. Đối chiếu tiêu chuẩn kỹ thuật đề bài

| Tiêu chí | Sprint 1 | Hiện tại | Bằng chứng |
|---|---|---|---|
| Tài liệu quy định (Policy doc) | Một phần — *"sổ bộ chưa hẳn là tài liệu quy định"* | QT-KSTL-01 **v2.0** là văn bản quy trình mà phần mềm thi hành, mỗi điều có mã. Sổ đăng ký chỉ là dữ liệu đầu vào. Phụ lục A truy vết điều → mã → kiểm thử | `docs/QT-KSTL-01_Quy-trinh-kiem-soat-tai-lieu.md` |
| Bộ dữ liệu thử nội bộ (Test set) | Một phần | Tập mù 40 ca + tập phát triển 48 ca; giám khảo tải được CSV riêng | `bench/` |
| Ba kiểu dừng riêng biệt | Đạt | Giữ nguyên. U1 nay rõ hơn với 3 nhánh con a/b/c | verify §5.1–5.4, §5.3.* |
| Câu hỏi báo lên cụ thể | Đạt | Câu hỏi U2/U3 được bổ sung trích dẫn nguyên văn và giá trị cũ → mới | verify §6 |
| Không bao giờ đoán bừa | Đạt | Thêm bằng chứng: 0 tự sửa sai trên tập mù | verify §10 |
| Không báo lên thừa | Một phần | Đo công khai: 52,9 % trên tập mù. Có cơ chế học neo đúng loại còn thiếu. **Còn mở** | `docs/PHUONG-PHAP-KIEM-CHUNG.md` §4.1, §4.4 |
| Đường dẫn chạy trực tiếp | Đạt | Giữ nguyên | README |
| Lệnh chạy kiểm chứng (Verify run) | Một phần | `npm run verify`: một lệnh, bảng ĐẠT/TRƯỢT theo từng điều, mã thoát ≠ 0 nếu trượt, chạy trong CI. Nút "Chạy Verify" trong ứng dụng vẫn còn | `scripts/verify.cjs` |
| Kho mã nguồn sạch | Đạt | Giữ nguyên. CI chạy test, verify, tập mù, typecheck và E2E | `.github/workflows/ci.yml` |

## 5. Góc nhìn doanh nghiệp: "bán việc tránh sai sót… hãy đi tìm con số đó"

`docs/GIA-TRI-KINH-DOANH.md` gồm:

- Bằng chứng công khai có nguồn: vụ **Air Canada (2024)**, tổ chức phải chịu trách nhiệm cho câu trả lời sai của chính
  chatbot của mình; **NĐ 04/2021/NĐ-CP**, công khai thông tin không chính xác bị phạt 20–30 triệu đồng; vụ **ĐH Khoa
  học – ĐH Huế (2024)**, sai sót phần mềm học phí khiến trường phải xin lỗi và giảm 75 % lệ phí tốt nghiệp.
- Mô hình chi phí cho một vị trí bị sót, với giả định ghi rõ. Lương chuyên viên theo lương cơ sở 2.530.000 đồng từ
  01/07/2026.
- Bảng hỏi để lấy **số thật** của Phòng Đào tạo, CTSV và KH-TC trong buổi thử nghiệm 3 nhân sự.

## 6. Việc nhóm cần làm tiếp

1. Dán `OPENAI_API_KEY` vào Supabase Secrets, rồi chạy "Chạy kèm AI ngữ nghĩa" trên tập mù và ghi số vào
   `docs/PHUONG-PHAP-KIEM-CHUNG.md` §4.3.
2. Thử nghiệm với 3 nhân sự (`docs/THU-NGHIEM-NGUOI-DUNG.md`):
   - mời mỗi người **viết 5 câu** theo cách của đơn vị mình, gom thành tập mù số 2;
   - lấy số cho bảng ở `docs/GIA-TRI-KINH-DOANH.md` §3.
3. Theo dõi tỉ lệ báo lên thừa sau khi trưởng đơn vị duyệt các neo học được từ câu trả lời thật.
