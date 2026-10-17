-- Tra cứu văn bản pháp luật liên quan, xác minh hiệu lực (yêu cầu bổ sung của BTC, 17/10/2026).
--
-- legal_documents     : bộ nhớ đệm văn bản đã tải từ nguồn trong allowlist. Là dữ liệu công khai (văn bản pháp luật),
--                       ai cũng đọc được; chỉ Edge Function legal-discover (service role) ghi.
-- legal_fetch_usage   : đếm lượt tra cứu mỗi ngày, theo máy khách (băm IP), để chặn lạm dụng. Chỉ service role.
-- legal_discovery_runs: kết quả một lần khám phá và đánh giá hiệu lực, gắn với workspace. Đọc theo đúng quyền đọc
--                       workspace (private.can_read_workspace); ghi qua Edge Function sau khi kiểm tra thành viên.
--
-- Lịch sử phiên bản tài liệu KHÔNG cần bảng mới: được dựng lại từ public.audit_log (chuỗi băm sẵn có, chỉ ghi thêm).

create table public.legal_documents (
  canonical_id   text primary key check (char_length(canonical_id) between 3 and 80),
  number         text check (number is null or char_length(number) <= 80),
  kind           text check (kind is null or char_length(kind) <= 60),
  title          text check (title is null or char_length(title) <= 400),
  issuer         text check (issuer is null or char_length(issuer) <= 200),
  issue_date     date,
  effective_from date,
  expires_on     date,
  official_status jsonb check (official_status is null or (jsonb_typeof(official_status) = 'object' and pg_column_size(official_status) < 4000)),
  sources        jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array' and pg_column_size(sources) < 8000),
  relations      jsonb not null default '[]'::jsonb check (jsonb_typeof(relations) = 'array' and pg_column_size(relations) < 200000),
  body_text      text not null default '' check (char_length(body_text) <= 300000),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  retrieved_at   timestamptz not null default now(),
  cache_until    timestamptz not null default now() + interval '7 days'
);
create index legal_documents_cache_until_idx on public.legal_documents (cache_until);
alter table public.legal_documents enable row level security;
create policy "đọc bộ nhớ đệm văn bản pháp luật" on public.legal_documents for select to anon, authenticated using (true);
revoke insert, update, delete, truncate, references, trigger on public.legal_documents from anon, authenticated;
comment on table public.legal_documents is 'Văn bản pháp luật đã tải từ nguồn trong allowlist. Chỉ service role ghi.';

create table public.legal_fetch_usage (
  day    date not null,
  client text not null check (client ~ '^([0-9a-f]{16,64}|\*)$'),
  calls  integer not null default 0,
  primary key (day, client)
);
alter table public.legal_fetch_usage enable row level security;
comment on table public.legal_fetch_usage is 'Lượt tra cứu nguồn ngoài theo ngày; client = băm IP, "*" = tổng. Chỉ service role.';

create function public.consume_legal_fetch_quota(p_limit integer, p_client text, p_client_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare used integer; mine integer;
begin
  if p_client is not null then
    insert into public.legal_fetch_usage (day, client, calls) values (current_date, p_client, 1)
    on conflict (day, client) do update set calls = public.legal_fetch_usage.calls + 1
    returning calls into mine;
    if mine > p_client_limit then return false; end if;
  end if;
  insert into public.legal_fetch_usage (day, client, calls) values (current_date, '*', 1)
  on conflict (day, client) do update set calls = public.legal_fetch_usage.calls + 1
  returning calls into used;
  return used <= p_limit;
end;
$$;
revoke all on function public.consume_legal_fetch_quota(integer, text, integer) from public, anon, authenticated;
grant execute on function public.consume_legal_fetch_quota(integer, text, integer) to service_role;

create table public.legal_discovery_runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   text not null check (char_length(created_by) <= 160),
  start_label  text not null check (char_length(start_label) <= 200),
  as_of        date not null,
  adapter      text not null check (char_length(adapter) <= 80),
  live         boolean not null,
  state        text not null check (state in ('complete', 'partial')),
  stop_reasons text[] not null default '{}',
  limits       jsonb not null check (jsonb_typeof(limits) = 'object'),
  stats        jsonb not null check (jsonb_typeof(stats) = 'object'),
  -- Đồ thị rút gọn (không kèm toàn văn) và kết quả đánh giá hiệu lực theo as_of.
  graph        jsonb not null check (jsonb_typeof(graph) = 'object' and pg_column_size(graph) < 500000),
  assessments  jsonb not null check (jsonb_typeof(assessments) = 'object' and pg_column_size(assessments) < 500000)
);
create index legal_discovery_runs_ws_idx on public.legal_discovery_runs (workspace_id, created_at desc);
alter table public.legal_discovery_runs enable row level security;
create policy "đọc kết quả tra cứu của workspace" on public.legal_discovery_runs
  for select to anon, authenticated using ((select private.can_read_workspace(workspace_id)));
revoke insert, update, delete, truncate, references, trigger on public.legal_discovery_runs from anon, authenticated;
comment on table public.legal_discovery_runs is 'Kết quả khám phá văn bản liên quan theo workspace. Ghi qua Edge Function legal-discover.';
