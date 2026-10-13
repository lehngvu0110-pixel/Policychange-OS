-- Phiếu dùng thử (thu-nghiem.html): ai có đường dẫn cũng GỬI được một phiếu, nhưng không ai ĐỌC, SỬA hay XOÁ được qua
-- API công khai. Nhóm đọc kết quả bằng SQL trong Supabase (vai trò quản trị). Không lưu IP; chỉ lưu nội dung người
-- thử tự điền, số đo thời gian trả lời (nếu họ đồng ý gửi kèm) và chuỗi user agent.
create table if not exists public.user_test_responses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  answers jsonb not null,
  timing jsonb,
  user_agent text,
  constraint answers_is_object check (jsonb_typeof(answers) = 'object'),
  constraint answers_size check (pg_column_size(answers) < 20000),
  constraint timing_shape check (timing is null or (jsonb_typeof(timing) = 'object' and pg_column_size(timing) < 20000)),
  constraint user_agent_len check (user_agent is null or char_length(user_agent) <= 400)
);
alter table public.user_test_responses enable row level security;
create policy user_test_responses_insert on public.user_test_responses
  for insert to anon, authenticated
  with check (jsonb_typeof(answers) = 'object');
revoke select, update, delete, truncate, references, trigger on public.user_test_responses from anon, authenticated;
