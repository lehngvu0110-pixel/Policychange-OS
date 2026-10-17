# Căn cứ pháp lý và lịch sử phiên bản

Mã cục bộ đã được gia cố ngày 17/10/2026. Chưa triển khai các thay đổi của đợt này; không chạy migration hay sửa dữ liệu production. Trạng thái triển khai trước đó không được kiểm chứng bằng quyền quản trị trong đợt làm việc này.

## Tra cứu và mức độ đầy đủ

`js/legal-refs.js` trích số hiệu, giữ các thành phần định danh và chuẩn hoá khoảng trắng, dấu tiếng Việt, chữ hoa/thường. `js/legal-discovery.js` duyệt theo chiều rộng qua adapter, chống trùng lượt tra và chu trình. Nội dung nguồn chỉ là dữ liệu; không đưa vào AI để quyết định hiệu lực hay ban hành thay đổi.

Giới hạn mỗi lượt khám phá:

| Giới hạn | Giá trị |
|---|---|
| Độ sâu | 1–8 |
| Tổng lượt resolve, kể cả lỗi, không tìm thấy và thử lại | 1–200, mặc định 25; tính tích luỹ khi tiếp tục |
| Thử lại một số hiệu | Tối đa 2 lần sau lần đầu, chỉ khi lỗi có thể thử lại |
| Nút / cạnh | 1.000 văn bản pháp luật cộng nút đầu vào / 4.000 cạnh |
| Thời gian | Mặc định 45 giây mỗi resolve, tối đa 60 giây; 120 giây cho mỗi lần khám phá hoặc tiếp tục |
| Nội dung | 300.000 ký tự mỗi văn bản; cắt nội dung hoặc quan hệ luôn làm kết quả chưa đầy đủ |
| Ứng viên cho một resolve trực tuyến | Tối đa 3 URL duy nhất, tuần tự; không tự thử lại trong cùng resolve |
| Mỗi trang nguồn | 2 MB, 8 giây cho toàn bộ chuỗi tải và đọc, tối đa 3 chuyển hướng |
| Phản hồi tìm kiếm | 1 MB, 8 giây, không đi theo chuyển hướng |

Đường tìm kiếm/tải nguồn của Edge Function còn có deadline 40 giây. Khoảng đợi cùng host có thể huỷ và không xếp hàng quá 6 giây; khi nguồn bận, trả lỗi có thể thử lại. Truy vấn CSDL phụ thuộc timeout của Supabase; không coi deadline mạng nguồn là giao dịch timeout CSDL.

Abort được truyền từ bộ khám phá qua adapter tới fetch. Các adapter tự viết phải tôn trọng `context.signal`; bộ khám phá không thể buộc một Promise bên ngoài không hỗ trợ huỷ dừng công việc của nó. Bộ nhớ đệm máy chủ không gọi lại URL do client cung cấp.

`complete` chỉ có khi không còn frontier, lỗi, tham chiếu không tìm được, giới hạn cắt nội dung hay khoảng trống quan hệ đã biết. `partial` không đồng nghĩa với không tìm thấy. `unresolved` gồm cả nút chưa tra, không tìm thấy và lỗi; lỗi không thể thử lại vẫn là khoảng trống bằng chứng. Nút Tiếp tục chỉ bật khi còn frontier hoặc lỗi được phép thử lại. Có thể cần sửa cấu hình/nguồn hoặc mở một lần tra mới nếu giới hạn thử lại đã hết.

## Hiệu lực tại ngày được chọn

`js/legal-status.js` trả `IN_FORCE`, `PARTIAL`, `EXPIRED`, `SUSPENDED`, `NOT_YET`, `UNVERIFIED` hoặc `CONFLICT`, cùng lý do, bằng chứng, `limitations` và `evidenceComplete`.

- Không có ngày hiệu lực hợp lệ, nguồn chính thức hoặc bằng chứng có đường dẫn: chưa xác minh được. Ngày ban hành không thay thế ngày hiệu lực.
- `IN_FORCE` cần phạm vi đầy đủ, không có tham chiếu chưa giải quyết, và bằng chứng phù hợp ngày xét: lịch sử đầy đủ, hoặc tình trạng chính thức được quan sát đúng ngày đó. Không tìm thấy bãi bỏ trong tìm kiếm dang dở không chứng minh còn hiệu lực.
- Các mốc hiệu lực/hết hạn và quan hệ có ngày được so với ngày người dùng chọn. Tình trạng trên trang ở ngày tải không được kéo ngược hoặc kéo dài sang ngày khác khi không có lịch sử hỗ trợ. Ngày không hợp lệ không tự chuyển thành hôm nay.
- Ngưng hiệu lực được phân biệt với bãi bỏ/hết hạn. Khoảng thời gian ngưng có dạng `[from, until)`; thiếu mốc hoặc phạm vi thì chưa xác minh được. Giữ nguyên câu nguồn và thời điểm quan sát.
- Cạnh pháp lý đi từ văn bản tác động tới văn bản bị tác động. Sửa đổi/bổ sung không bãi bỏ toàn bộ; hợp nhất không tự chấm dứt văn bản cũ. Thay thế/bãi bỏ chỉ kết luận toàn bộ khi phạm vi và ngày được chứng minh. Phạm vi chưa rõ cho kết quả chưa xác minh được.
- Bãi bỏ/thay thế một phần không chứng nhận hiệu lực của phần còn lại: hệ thống chưa dựng lại lịch sử từng điều.
- Mâu thuẫn đòi hỏi bằng chứng đối lập; thiếu quan hệ trong kết quả chưa đầy đủ không tự tạo mâu thuẫn với tình trạng nguồn.

Màn hình Căn cứ pháp lý, chi tiết, đồ thị và cảnh báo trước Ban hành dùng cùng bộ đánh giá. Cảnh báo không ẩn tham chiếu lỗi hoặc chưa tìm thấy. Đánh dấu đã xem không chứng nhận hiệu lực, không đổi AUTO/U1/U2/U3 và không bỏ qua Prover. Đổi ngày, tiếp tục tra hoặc đổi workspace xoá xác nhận cũ.

## Định danh và đọc nguồn

`js/legal-page.js` yêu cầu số hiệu ở trường định danh khớp toàn bộ và tiêu đề văn bản khớp; trường mâu thuẫn, trang tìm kiếm, số hiệu chỉ xuất hiện trong trích dẫn/điều hướng không được nhận. Không gán ngày hay tình trạng của trang khác cho văn bản được hỏi.

Trích yếu có nhãn trên `vanban.chinhphu.vn` được đọc thành quan hệ sửa đổi/bổ sung/hợp nhất khi có câu chữ rõ ràng, kèm hướng, trích dẫn và provenance của trường. Đây là `text_cue`, không phải sổ quan hệ chính thức đầy đủ. Không bịa quan hệ khi không đọc được cấu trúc.

**Phạm vi kiểm chứng:** đã xem được phần metadata của [một trang chi tiết Chính phủ](https://vanban.chinhphu.vn/?docid=220017&pageid=27160) qua công cụ duyệt web. Node fetch trực tiếp thất bại; vbpl.vn không truy cập được qua công cụ đó. `tests/fixtures/legal/government-detail.fragment.html` là markup tổng hợp chép một đoạn metadata đã xem, không phải HTML tải nguyên trạng. Chưa kiểm chứng end-to-end với nhà cung cấp tìm kiếm hay cấu trúc quan hệ ngược của các cổng. Parser luôn trả coverage quan hệ và lịch sử `unknown` cho trang trực tuyến; kết quả được giữ ở `partial`, không chứng nhận còn hiệu lực.

## API và lưu kết quả có kiểm chứng

Edge Function `legal-discover`:

- `status`: cấu hình provider và danh sách nguồn, không trả secrets.
- `resolve`: kiểm số hiệu, thử cache có bằng chứng parser hiện tại, trừ quota, tìm kiếm, tải ứng viên có allowlist và xác minh định danh. Phân biệt không tìm thấy sau tìm kiếm thành công với `unavailable`, HTTP 403/429/5xx, mạng, timeout, huỷ, parse lỗi, định danh chưa xác minh và giới hạn ứng viên.
- `save_run`: chỉ nhận `{ workspace, persona?, run: { startText, startLabel, asOf, maxDepth, maxDocs } }`. Từ chối `live`, đồ thị, trạng thái, completeness, hash và timestamp do client gửi. Máy chủ tự dựng lại đồ thị từ cache có định danh, parser version, URL, thời điểm và SHA-256 nội dung hợp lệ; tự tính assessments, completeness, hash và thời điểm kiểm. Không có văn bản hợp lệ thì không lưu. Kết quả máy chủ có thể khác bản đang xem nếu cache đã thay đổi.

Workspace thật yêu cầu JWT hợp lệ, không ẩn danh, membership đúng workspace, tier 1–3 và danh sách đơn vị có giá trị. Workspace demo cho phép persona demo theo mô hình hiện có. Ghi qua service role; RLS vẫn chỉ cho đọc workspace có quyền. Dữ liệu pháp luật công khai trong cache có policy đọc công khai, không có policy client ghi.

Migration 10 thêm `legal_documents.evidence`, và `trust_version`, `evidence_sha256`, `validated_at`, `created_user` vào kết quả. `trust_version = 0` là bản lưu cũ do client gửi: **không tin là bằng chứng đã kiểm** dù `live = true`. Bản mới có `trust_version = 1` nghĩa là máy chủ đã tái dựng, vẫn chỉ là nghiên cứu tham khảo. Cache cũ có evidence rỗng phải được tải lại; không tự nâng mức tin cậy.

SSRF: chỉ HTTPS/cổng 443 trên allowlist trong `legal-refs.js`; chặn IP, userinfo, localhost và host giả. Mỗi chuyển hướng kiểm lại allowlist. Khoá chỉ ở secrets máy chủ, không có trong responses/logs. Request JSON được đọc theo luồng, đo byte và giới hạn thời gian trước khi parse.

## Khôi phục lịch sử nguyên tử

`doc-history.js` dựng phiên bản từ chuỗi SHA-256 của `audit_log`; đề xuất và quyết định giữ nguyên/từ chối được hiển thị riêng. Không xoá/sửa bản ghi cũ.

`policy-api` nhận `action: restore` cùng `docId`, `targetRevision`, `expectedSeq`, `expectedTail`, `expectedVersion`. `Server.planRestore()` kiểm chuỗi, reconstruct phiên bản đích từ dữ liệu workspace trên máy chủ, kiểm quyền cho tất cả PATCH cần thu hồi, mô phỏng trên bản sao và đối chiếu toàn bộ nội dung đích. Client không quyết định nội dung khôi phục.

Mọi cập nhật dòng và bản ghi HOÀN TÁC được gửi vào **một** `apply_change` RPC hiện có. SQL khoá workspace, kiểm đuôi sổ và từng dòng trong một giao dịch: lỗi bất kỳ làm rollback cả giao dịch. Căn cứ được băm chứa actor, bản nguồn/đích, seq/hash đích, đuôi sổ nguồn và thời điểm chung. Không cần migration riêng cho restore. Cần triển khai lại `policy-api` và module shared trước khi UI trực tuyến dùng action mới.

Ngoại tuyến: tính trên bản sao, ghi một snapshot IndexedDB/localStorage, chỉ công bố trạng thái mới sau khi ghi thành công. IndexedDB đợi `transaction.oncomplete`, không chỉ `request.onsuccess`. Ghi thất bại thì nội dung và sổ trong ứng dụng giữ nguyên. Chế độ sandbox chỉ đổi bộ nhớ.

Khôi phục bị chặn nếu chuỗi/nội dung không khớp, quyền không đủ, dữ liệu đã đổi, hoặc cần phục hồi một PATCH đã thu hồi. Trường hợp cuối phải ban hành lại qua quy trình phân tích và Prover.

## Cấu hình và triển khai thủ công

| Secret | Khi cần |
|---|---|
| `LEGAL_SEARCH_PROVIDER` | `google` hoặc `brave` |
| `LEGAL_SEARCH_API_KEY` | Khoá provider, chỉ trên máy chủ |
| `LEGAL_SEARCH_CX` | Chỉ Google Programmable Search |
| `LEGAL_DAILY_LIMIT` | Tuỳ chọn, mặc định 200 |
| `LEGAL_CLIENT_LIMIT` | Tuỳ chọn, mặc định 60 |

Không đặt secrets trong config trình duyệt. Sau khi người quản trị xác nhận đúng dự án, chạy migration **theo thứ tự**, gồm `20261017000009_legal_intelligence.sql` rồi `20261017000010_legal_evidence.sql`; kiểm thử trên CSDL local/staging trước. Đồng bộ bằng `npm run sync:edge`, kiểm Deno, rồi triển khai `legal-discover` và `policy-api` cùng frontend tương ứng. Không có lệnh production nào trong đợt khắc phục này đã được thực thi.

Kho mô phỏng luôn ghi nhãn dữ liệu bịa/synthetic, dùng URL `fixture:` không bấm được và không được dùng làm bằng chứng lưu máy chủ.

## Kiểm thử và giới hạn còn lại

Các ca Node kiểm status, định danh, budget, huỷ, provenance, request giả mạo, membership, hash/cache, RLS tĩnh, và restore thành công/thất bại/concurrency. `legal-edge.test.cjs` thực thi HTTP handler TypeScript thật với provider/Supabase giả; không phải integration production. Playwright dùng dữ liệu ngoại tuyến hoặc fake backend.

Xem [báo cáo khắc phục](ENGINEERING-REMEDIATION.md) để biết chính xác lệnh đã chạy và kết quả. Chưa chạy migration/RLS/rollback trên PostgreSQL thật tại máy này: không có PostgreSQL CLI, Docker daemon không chạy. Không suy từ kiểm thử mock rằng deployment hay transaction integration đã được xác minh.
