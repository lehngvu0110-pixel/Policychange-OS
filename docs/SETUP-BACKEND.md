# Cài đặt backend (Supabase + Gemini)

Theo hồ sơ triển khai trước đây, dự án Supabase `rsenhrsrzylubjavkqxs` có schema, dữ liệu mẫu và ba Edge Function (`policy-api`,
`ai-extract`, `ai-discover`). Đợt khắc phục 17/10/2026 chưa xác minh lại trạng thái production và không triển khai thay đổi. Ứng dụng kết nối qua `js/config.js`. Phần dưới là những việc **nhóm tự làm**,
vì liên quan tới khoá bí mật hoặc tài khoản người thật.

## 1. Bật AI thật: Google Gemini, gói miễn phí (2 phút)

Nhóm đang dùng cách này. Hệ thống gọi mô hình qua API chuẩn OpenAI, nên đổi nhà cung cấp chỉ cần đổi Secrets, không cần sửa mã:

1. Vào https://aistudio.google.com/apikey (đăng nhập Gmail) → **Create API key** → copy khoá.
2. Trong Supabase → Edge Functions → Secrets, thêm:

   | Tên | Giá trị |
   |---|---|
   | `AI_API_KEY` | khoá vừa tạo ở AI Studio |
   | `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
   | `AI_MODEL` | `gemini-3.5-flash-lite` (không bắt buộc; mặc định khi trỏ tới Gemini) |

3. Mở ứng dụng, tải lại trang: ô **AI** trên thanh trên cùng hiện tên mô hình Gemini. Nếu còn secret `OPENAI_API_KEY` cũ thì xoá đi (`AI_API_KEY` được ưu tiên nếu có cả hai).

Lưu ý: ở gói miễn phí, Google có thể dùng nội dung gửi lên để cải thiện sản phẩm. Dữ liệu demo là dữ liệu tổng hợp nên
không sao; khi thí điểm với văn bản thật của trường thì cân nhắc gói trả phí hoặc chỉ gửi văn bản đã công khai.

Hạn mức gọi AI (dùng cho cả hai cách, đều không bắt buộc):

| Tên | Giá trị |
|---|---|
| `AI_DAILY_LIMIT` | số lượt gọi AI tối đa mỗi ngày cho cả hệ thống, mặc định `300` |
| `AI_CLIENT_LIMIT` | số lượt tối đa mỗi ngày cho một máy khách (theo IP đã băm), mặc định `40` |

### Phương án thay thế: dùng khoá OpenAI

1. Vào Supabase Dashboard → dự án → **Edge Functions** → **Secrets** (hoặc *Project Settings → Edge Functions*).
2. Thêm secret:

   | Tên | Giá trị | Bắt buộc |
   |---|---|---|
   | `OPENAI_API_KEY` | khoá `sk-...` của nhóm | có |
   | `OPENAI_MODEL` | ví dụ `gpt-4o-mini` (mặc định) hoặc model khác hỗ trợ Structured Outputs | không |

3. Mở ứng dụng, tải lại trang: ô **AI** trên thanh trên cùng chuyển thành “AI · gpt-4o-mini”.
   Nút **Hiểu yêu cầu bằng AI** và **Rà soát ngữ nghĩa bằng AI** bắt đầu gọi mô hình thật.

Khoá chỉ nằm ở máy chủ; trình duyệt không bao giờ nhận được. **Không** dán khoá vào `js/config.js` hay commit lên
GitHub. Nếu lỡ lộ khoá, thu hồi ngay trên trang của nhà cung cấp (Google AI Studio hoặc OpenAI) rồi dán khoá mới vào Secrets.

Kiểm tra nhanh chi phí: mỗi lần “Hiểu yêu cầu” là 1 lượt; mỗi lần “Rà soát ngữ nghĩa” là 1 lượt cho cả tập vị trí.
Hạn mức ngày được đếm trong bảng `ai_usage` (toàn hệ thống) và `ai_usage_clients` (theo máy khách).

## 2. Workspace thí điểm cho người dùng thật (yêu cầu “≥ 3 nhân sự thật” của Sprint 2)

Workspace `hcmut-pilot` bắt buộc đăng nhập. Mỗi người thử nghiệm cần một tài khoản và một dòng trong bảng `members`.

1. **Tắt đăng ký tự do:** Authentication → Sign In / Providers → Email → tắt *Allow new users to sign up*
   (chỉ quản trị tạo tài khoản).
2. **Tạo tài khoản:** Authentication → Users → **Add user** → *Create new user* → nhập email + mật khẩu,
   tick *Auto Confirm User*.
3. **Cấp quyền** trong SQL Editor (sửa email, tên hiển thị, cấp, đơn vị):

   ```sql
   insert into public.members (workspace_id, user_id, display_name, tier, units)
   select 'hcmut-pilot', id, 'Nguyễn Văn A, Trưởng phòng Đào tạo', 2,
          array['Phòng Đào tạo', 'Cổng thông tin sinh viên']
   from auth.users where email = 'a@hcmut.edu.vn';
   ```

   - `tier`: 1 = chuyên viên, 2 = trưởng đơn vị, 3 = Hiệu trưởng / Hội đồng Trường.
   - `units`: tên đơn vị **trùng khớp** với cột `owner` của tài liệu/quy định (xem màn hình Kho tài liệu);
     `array['*']` = toàn trường.
   - Đổi quyền: `update public.members set tier = ..., units = ... where ...;`. Xoá: `delete from public.members where ...;`

4. Người dùng mở ứng dụng → **Đăng nhập (thí điểm)** ở thanh bên → sau khi đăng nhập bấm **Mở workspace thí điểm**.

Gợi ý kịch bản thử nghiệm với 3 người: `docs/THU-NGHIEM-NGUOI-DUNG.md`.

## 3. Triển khai lại khi sửa mã

Cần [Supabase CLI](https://supabase.com/docs/guides/cli) và quyền trên dự án.

```bash
supabase login
supabase link --project-ref rsenhrsrzylubjavkqxs
npm run sync:edge                                    # chép js/*.js dùng chung sang supabase/functions/_shared/
supabase db push                                     # sau khi kiểm local/staging và xác nhận đúng dự án
supabase functions deploy policy-api ai-extract ai-discover legal-discover
```

CI kiểm tra `supabase/functions/_shared` luôn khớp với `js/` (bước “Edge Function dùng đúng bản module mới nhất”).

## 4. Dựng trên một dự án Supabase mới

1. Tạo dự án, xác nhận project ref, rồi `supabase link --project-ref <ref>` và `supabase db push` (chạy tất cả migration trong `supabase/migrations/` theo thứ tự; hiện có 10 tệp).
2. `npm run sync:edge` rồi `supabase functions deploy policy-api ai-extract ai-discover legal-discover`.
3. Sửa `js/config.js`: `supabaseUrl` = `https://<ref>.supabase.co`, `anonKey` = khoá **anon (legacy JWT)** trong
   Project Settings → API. Edge Function bật `verify_jwt` nên cần khoá dạng JWT.
4. Dán secret như mục 1; tạo tài khoản như mục 2.

## 5. Khôi phục workspace trình diễn

Trong ứng dụng: thanh bên → **Khôi phục dữ liệu mẫu** (chỉ áp dụng cho workspace `demo`). Workspace thí điểm
không có nút này để tránh mất dữ liệu thật.

## 6. Căn cứ pháp lý và khôi phục phiên bản

Xem [LEGAL-INTELLIGENCE.md](LEGAL-INTELLIGENCE.md) cho hợp đồng API, secrets `LEGAL_SEARCH_PROVIDER`, `LEGAL_SEARCH_API_KEY`, `LEGAL_SEARCH_CX`, giới hạn tra cứu và mức độ tin cậy. Migration 9 tạo các bảng pháp luật; migration 10 thêm bằng chứng cache và mức tin cậy bản lưu. Cả hai chưa được áp vào production trong đợt làm việc này. Bản lưu cũ có `trust_version = 0` không phải kết quả máy chủ đã kiểm chứng.

Triển khai migration trước Edge Functions và frontend mới. Cần triển khai lại `policy-api` để có action `restore` nguyên tử qua RPC `apply_change` hiện có; không cần thêm RPC hay cấp quyền ghi client. Chưa chạy PostgreSQL local/staging hoặc provider trực tiếp trong đợt này; quản trị cần kiểm migration, RLS, transaction rollback và tra cứu nguồn thật ở môi trường kiểm thử trước khi triển khai production.
