# Cài đặt backend (Supabase + OpenAI)

Dự án Supabase `rsenhrsrzylubjavkqxs` đã có sẵn schema, dữ liệu mẫu và ba Edge Function (`policy-api`,
`ai-extract`, `ai-discover`). Ứng dụng tự kết nối qua `js/config.js`. Phần dưới là những việc **nhóm tự làm**,
vì liên quan tới khoá bí mật hoặc tài khoản người thật.

## 1. Bật AI thật — dán khoá OpenAI (2 phút)

1. Vào Supabase Dashboard → dự án → **Edge Functions** → **Secrets** (hoặc *Project Settings → Edge Functions*).
2. Thêm secret:

   | Tên | Giá trị | Bắt buộc |
   |---|---|---|
   | `OPENAI_API_KEY` | khoá `sk-...` của nhóm | có |
   | `OPENAI_MODEL` | ví dụ `gpt-4o-mini` (mặc định) hoặc model khác hỗ trợ Structured Outputs | không |
   | `AI_DAILY_LIMIT` | số lượt gọi AI tối đa mỗi ngày cho cả hệ thống, mặc định `300` | không |

3. Mở ứng dụng, tải lại trang: ô **AI** trên thanh trên cùng chuyển thành “AI · gpt-4o-mini”.
   Nút **Hiểu yêu cầu bằng AI** và **Rà soát ngữ nghĩa bằng AI** bắt đầu gọi mô hình thật.

Khoá chỉ nằm ở máy chủ; trình duyệt không bao giờ nhận được. **Không** dán khoá vào `js/config.js` hay commit lên
GitHub. Nếu lỡ lộ khoá, thu hồi ngay trên trang OpenAI rồi dán khoá mới vào Secrets.

Kiểm tra nhanh chi phí: mỗi lần “Hiểu yêu cầu” là 1 lượt; mỗi lần “Rà soát ngữ nghĩa” là 1 lượt cho cả tập vị trí.
Hạn mức ngày được đếm trong bảng `ai_usage`.

## 2. Workspace thí điểm cho người dùng thật (yêu cầu “≥ 3 nhân sự thật” của Sprint 2)

Workspace `hcmut-pilot` bắt buộc đăng nhập. Mỗi người thử nghiệm cần một tài khoản và một dòng trong bảng `members`.

1. **Tắt đăng ký tự do:** Authentication → Sign In / Providers → Email → tắt *Allow new users to sign up*
   (chỉ quản trị tạo tài khoản).
2. **Tạo tài khoản:** Authentication → Users → **Add user** → *Create new user* → nhập email + mật khẩu,
   tick *Auto Confirm User*.
3. **Cấp quyền** trong SQL Editor (sửa email, tên hiển thị, cấp, đơn vị):

   ```sql
   insert into public.members (workspace_id, user_id, display_name, tier, units)
   select 'hcmut-pilot', id, 'Nguyễn Văn A — Trưởng phòng Đào tạo', 2,
          array['Phòng Đào tạo', 'Cổng thông tin sinh viên']
   from auth.users where email = 'a@hcmut.edu.vn';
   ```

   - `tier`: 1 = chuyên viên, 2 = trưởng đơn vị, 3 = Hiệu trưởng / Hội đồng Trường.
   - `units`: tên đơn vị **trùng khớp** với cột `owner` của tài liệu/quy định (xem màn hình Kho tài liệu);
     `array['*']` = toàn trường.
   - Đổi quyền: `update public.members set tier = ..., units = ... where ...;` — xoá: `delete from public.members where ...;`

4. Người dùng mở ứng dụng → **Đăng nhập (thí điểm)** ở thanh bên → sau khi đăng nhập bấm **Mở workspace thí điểm**.

Gợi ý kịch bản thử nghiệm với 3 người: `docs/THU-NGHIEM-NGUOI-DUNG.md`.

## 3. Triển khai lại khi sửa mã

Cần [Supabase CLI](https://supabase.com/docs/guides/cli) và quyền trên dự án.

```bash
supabase login
supabase link --project-ref rsenhrsrzylubjavkqxs
npm run sync:edge                                    # chép js/*.js dùng chung sang supabase/functions/_shared/
supabase functions deploy policy-api ai-extract ai-discover
supabase db push                                     # chỉ khi có migration mới
```

CI kiểm tra `supabase/functions/_shared` luôn khớp với `js/` (bước “Edge Function dùng đúng bản module mới nhất”).

## 4. Dựng trên một dự án Supabase mới

1. Tạo dự án, rồi `supabase link --project-ref <ref>` và `supabase db push` (chạy 5 migration trong `supabase/migrations/`).
2. `npm run sync:edge && supabase functions deploy policy-api ai-extract ai-discover`.
3. Sửa `js/config.js`: `supabaseUrl` = `https://<ref>.supabase.co`, `anonKey` = khoá **anon (legacy JWT)** trong
   Project Settings → API. Edge Function bật `verify_jwt` nên cần khoá dạng JWT.
4. Dán secret như mục 1; tạo tài khoản như mục 2.

## 5. Khôi phục workspace trình diễn

Trong ứng dụng: thanh bên → **Khôi phục dữ liệu mẫu** (chỉ áp dụng cho workspace `demo`). Workspace thí điểm
không có nút này để tránh mất dữ liệu thật.
