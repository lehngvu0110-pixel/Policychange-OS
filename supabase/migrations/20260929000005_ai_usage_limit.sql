-- Hạn mức gọi AI mỗi ngày để workspace demo công khai không bị lạm dụng làm tốn credit OpenAI.
create table public.ai_usage (
  day   date primary key,
  calls integer not null default 0
);
alter table public.ai_usage enable row level security;
comment on table public.ai_usage is 'Đếm số lần gọi mô hình mỗi ngày (UTC). Không có policy nào: chỉ service role đọc/ghi.';

create or replace function public.consume_ai_quota(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare used integer;
begin
  insert into public.ai_usage (day, calls) values (current_date, 1)
  on conflict (day) do update set calls = public.ai_usage.calls + 1
  returning calls into used;
  return used <= p_limit;
end;
$$;
revoke all on function public.consume_ai_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(integer) to service_role;
