# QT-KSTL-01 — Quy trình kiểm soát tài liệu khi thay đổi quy định

**Phiên bản 2.0 (01/10/2026) · Tài liệu quy định của quy trình được chọn cho Đề A (Bộ điều phối chuyển tiếp)**

> **Đây là văn bản quy định mà phần mềm thi hành.** Mỗi điều có mã (§…) và được kiểm bằng một phép thử chạy được:
> `npm run verify` in bảng ĐẠT/TRƯỢT theo đúng các mã điều này (xem Phụ lục A). Sổ đăng ký quy định (Mục 3) chỉ là
> *dữ liệu đầu vào* của quy trình; còn quy trình — khi nào được tự sửa, khi nào phải dừng, hỏi ai, hỏi thế nào,
> ghi gì — nằm trong văn bản này.
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
| **Neo chủ đề** | Từ/ngữ cho biết câu văn đang nói về **việc** của quy định nào. Ví dụ: "phúc khảo", "tạm ứng", "hai chữ ký". |
| **Neo đại lượng** | Từ/ngữ cho biết con số trong câu **đo cái gì** của việc đó. Ví dụ với hạn phúc khảo: "nộp", "thời hạn", "tiếp nhận"; với hạn mức tạm ứng: "duyệt", "hạn mức". Quy định có neo chủ đề đủ hẹp (ví dụ "hai chữ ký") có thể không khai neo đại lượng. |
| **Vị trí bị ảnh hưởng** | Một dòng trong một tài liệu có chứa giá trị hiện hành của quy định gốc được sửa — **ở dạng số chuẩn hoặc dạng tương đương** (viết bằng chữ, quy đổi tuần, gõ không dấu). |
| **Cấp tài liệu** | Cấp thẩm quyền ban hành tài liệu (Mục 4). |
| **Cấp ban hành thay đổi** | Cấp thẩm quyền của người/đơn vị ra quyết định thay đổi quy định lần này. |

## 3. Sổ đăng ký quy định

Mọi quy định chịu kiểm soát phải được đăng ký trước khi hệ thống được phép tác động lên nó. Một mục
đăng ký gồm: `mã · tên · giá trị hiện hành · văn bản nguồn · đơn vị chủ quản · neo chủ đề · neo đại lượng`.

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

Không xác định chắc chắn được con số ở dòng đó là giá trị của quy định đang sửa. Ba trường hợp:

- **§5.3.a — Không có neo.** Dòng không có neo chủ đề của quy định đang sửa (hoặc có neo của nhiều quy định). Điển
  hình: con số nằm trong khối ví dụ, bảng không tiêu đề, hoặc một mốc nội bộ chưa đăng ký.
- **§5.3.b — Giá trị viết khác dạng.** Giá trị cũ xuất hiện dưới dạng chữ ("bảy ngày", "hai mươi bốn tín chỉ",
  "mười triệu"), quy đổi đơn vị ("một tuần" = 7 ngày lịch) hoặc gõ không dấu ("7 ngay"). Hệ thống **phải nhận ra**
  để không bỏ sót, nhưng **không được tự viết lại câu**; bản sửa đề xuất thay đúng đoạn khớp để người duyệt đọc lại.
- **§5.3.c — Đúng chủ đề, không rõ đại lượng.** Dòng có neo chủ đề nhưng không có neo đại lượng, và neo chủ đề không
  chi phối trực tiếp con số. Ví dụ: "Kết quả phúc khảo được thông báo sau 7 ngày" — đúng chủ đề phúc khảo nhưng 7
  ngày là thời gian thông báo kết quả, không phải hạn nộp đơn.

→ Chuyển tiếp cho **chuyên viên phụ trách tài liệu**.
→ **Nghiêm cấm suy đoán.** Hệ thống không được tự quyết định con số đó "chắc là" thuộc quy định nào.

### 5.4. Tự động xử lý

Chỉ khi **đồng thời**:
1. không rơi vào U2, U3, U1;
2. giá trị cũ được viết đúng dạng số đã đăng ký (cho phép các cách viết số chuẩn: `7 ngày`, `07 ngày`,
   `10.000.000 đồng`, `10tr`, `10 triệu đồng`);
3. dòng có **neo chủ đề** độc quyền của quy định đang sửa **và** (có **neo đại lượng**, hoặc neo chủ đề chi phối
   trực tiếp con số: giữa neo và con số chỉ có tối đa hai tiếng rồi tới khung "trong / trong vòng / tối đa / không quá /
   đến / từ", không qua dấu câu — ví dụ "phúc khảo trong 7 ngày");
4. tài liệu nằm trong thẩm quyền;
5. bộ chứng minh (prover) xác nhận đủ **14 điều kiện**, độc lập với động cơ.

→ Hệ thống **tự sửa**, không hỏi người. Đây là trường hợp thường quy, chiếm phần lớn khối lượng.

**Nguyên tắc 5.5 — Không chuyển tiếp thừa.** Vị trí thỏa Mục 5.4 mà bị đẩy lên người là lỗi xử lý và được đo, báo
cáo công khai (Mục 10). Khi phải chọn giữa hai lỗi, hệ thống **luôn chọn hỏi thừa thay vì sửa sai**: hỏi thừa tốn vài
giây của người duyệt, sửa sai làm văn bản công bố một con số sai.

**Nguyên tắc 5.6 — AI chỉ làm kết quả thận trọng hơn.** Khi bật mô hình ngôn ngữ, mô hình rà lại **mọi** dòng sắp
tự sửa trước khi ban hành (không cần ai bấm nút). Mô hình chỉ trả trích dẫn nguyên văn làm bằng chứng; bằng chứng được
kiểm lại vị trí từng ký tự. Mô hình có thể **giữ lại** một dòng tự sửa để người duyệt; mô hình **không bao giờ** biến
một hồ sơ U1/U2/U3 thành tự sửa, không sửa sổ đăng ký, không ban hành.

## 6. Yêu cầu đối với câu hỏi chuyển tiếp

Mỗi hồ sơ chuyển tiếp phải sinh ra **đúng một câu hỏi đóng**, kèm **đúng hai nút hành động**, thỏa:

1. **§6.1** Nêu đủ: mã tài liệu, số dòng, trích nguyên văn dòng, giá trị cũ, giá trị mới đề xuất.
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

Phạm vi quyết định là **cấp × đơn vị phụ trách**: chuyên viên chỉ quyết hồ sơ của tài liệu thuộc đơn vị mình; trưởng
đơn vị chỉ quyết U2 của quy định đơn vị mình sở hữu; quyền hoàn tác đòi cấp ≥ cấp ban hành của thay đổi. Máy chủ chặn
thật (HTTP 403) kể cả khi giao diện bị sửa.

## 9. Học từ phản hồi (tự điều chỉnh ngưỡng chuyển tiếp)

1. Mỗi câu trả lời cho hồ sơ U1 được lưu làm phản hồi (quy định, dòng, Có/Không, người trả lời).
2. Khi ít nhất **hai** câu trả lời "Có" cùng chứa một cụm từ chưa là neo, hệ thống **đề xuất** cụm đó làm neo, kèm
   loại neo còn thiếu (chủ đề, đại lượng, hoặc cả hai). Cụm xuất hiện trong một dòng từng bị trả lời "Không", hoặc
   chồng lên neo của quy định khác, bị loại.
3. Chỉ trưởng đơn vị sở hữu quy định (cấp ≥ 2) được duyệt đề xuất. Duyệt là một bản ghi trong sổ kiểm toán.
4. Hệ thống không bao giờ tự thêm neo.

## 10. Đo lường và ngưỡng chấp nhận

| Chỉ số | Định nghĩa | Ngưỡng |
|---|---|---|
| **Tự sửa sai** | số vị trí máy tự sửa mà nhãn đúng không phải tự sửa | **0** trên tập mù |
| **Bỏ sót** | vị trí cần người (U1/U2/U3) mà máy tự sửa hoặc bỏ qua, ÷ số vị trí cần người | **0** trên tập mù |
| **Báo lên thừa** | vị trí lẽ ra tự sửa (hoặc không được đụng tới) mà máy vẫn hỏi, ÷ số vị trí đó | báo cáo, theo dõi xu hướng |
| **Đúng loại** | trong các vị trí đã chuyển tiếp, tỉ lệ đúng U1/U2/U3 | báo cáo |

Tập mù là tập ca do người (hoặc tác tử) **không xem mã nguồn** viết từ văn bản này, được đóng băng bằng mã băm trước
khi đo; không sửa nhãn sau khi xem kết quả. Phương pháp: `docs/PHUONG-PHAP-KIEM-CHUNG.md`.

## 11. Giới hạn đã biết

1. Quy trình chỉ xử lý được thay đổi dạng **thay giá trị**. Thay đổi làm phát sinh điều khoản mới hoặc bãi bỏ điều khoản nằm ngoài phạm vi.
2. Chất lượng phân loại phụ thuộc vào độ đầy đủ của neo chủ đề và neo đại lượng. Thiếu neo làm tăng U1 — hệ thống
   dừng nhiều hơn mức cần thiết. Lớp tiền định vẫn có thể sai khi một dòng có đủ neo nhưng con số đo việc khác
   (ví dụ "giấy xác nhận vay vốn được cấp trong 3 ngày"); trường hợp này cần lớp AI (§5.6) hoặc neo hẹp hơn.
3. Mâu thuẫn logic không đi qua con số (hai điều khoản mô tả cùng một việc bằng hai cách khác nhau) chưa phát hiện được.
4. Tài liệu ở dạng ảnh quét hoặc PDF không có lớp văn bản chưa được hỗ trợ.

## Phụ lục A — Truy vết điều khoản → mã nguồn → kiểm thử

| Điều | Thi hành ở | Kiểm bằng |
|---|---|---|
| §3.1 | `Engine.parseFreeText`, `Workflow.buildChange` | `npm run verify` §3.1; `tests/policy-engine.test.cjs` |
| §3.2, §5.1 | `Engine.analyze` nhánh U2 | verify §3.2; Verify TC-02; tập mù (5 ca U2) |
| §4.1, §5.2 | `Engine.analyze` nhánh U3; `Authz.canIssue`; `Server.planCommit` (403) | verify §4.1; `tests/policy-server.test.cjs` |
| §5.3.a | `Engine.analyze` nhánh U1 (không neo) | verify §5.3.a; Verify ESC-04 |
| §5.3.b | `Engine.equivalentHits`, `numberWords`, `stripDiacritics` | verify §5.3.b; `tests/policy-engine.test.cjs` |
| §5.3.c | `Engine.measureCuesInLine`, `anchorGovernsValue` | verify §5.3.c; tập mù |
| §5.4 | `Engine.analyze`; `Prover.proveAutomaticPatch` (14 điều kiện, gồm `registered_measure_cue`) | verify §5.4; `tests/policy-prover.test.cjs` |
| §5.6 | `SemanticDiscovery.applyEvidenceToProps`; `app.ensureSemanticReview` | verify §5.6; `tests/app-controller.test.cjs` |
| §6 | `Engine.escalationQuestion` | verify §6 |
| §7 | `Ledger`, `Workflow.commit/undo`; SQL `apply_change` | verify §7; `tests/policy-ledger.test.cjs` |
| §8 | `Authz.canDecide/canUndo/canEditRegistry`; `policy-api` | verify §8; `tests/policy-authz.test.cjs`; E2E phân vai |
| §9 | `Learning.suggestAnchors`, `Workflow.addAnchor` | verify §9; `tests/policy-learning.test.cjs` |
| §10 | `Evaluation.evaluate`; `bench/blind.cjs` | verify §10; CI |

## Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0 | 21/09/2026 | Bản đầu: U1/U2/U3, phân cấp, câu hỏi chuyển tiếp, sổ kiểm toán. |
| 2.0 | 01/10/2026 | Theo phản hồi doanh nghiệp Sprint 1: tách neo chủ đề / neo đại lượng (§5.4); thêm U1 cho giá trị viết khác dạng (§5.3.b) và đúng chủ đề – sai đại lượng (§5.3.c); nguyên tắc AI chỉ thận trọng hơn (§5.6); học từ phản hồi (§9); chỉ số và ngưỡng (§10); truy vết điều → mã → kiểm thử (Phụ lục A). |
