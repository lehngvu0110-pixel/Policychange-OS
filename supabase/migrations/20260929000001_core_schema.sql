-- PolicyChange OS · Sprint 2 · Schema dùng chung + phân quyền đọc (RLS)
-- Nguyên tắc: client (anon / authenticated) CHỈ được đọc. Mọi thao tác ghi đi qua Edge Function
-- `policy-api` với service role, sau khi máy chủ đã chạy lại động cơ + prover và kiểm tra quyền.

create table public.workspaces (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  mode        text not null check (mode in ('demo', 'live')),
  ledger_seq  integer not null default 0 check (ledger_seq >= 0),
  ledger_tail text not null default repeat('0', 64) check (ledger_tail ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.workspaces is 'Không gian làm việc. demo = sandbox công khai có thể khôi phục; live = chỉ thành viên đăng nhập.';

create table public.members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  tier         smallint not null check (tier between 1 and 3),
  units        text[] not null default '{}',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
comment on table public.members is 'Thành viên workspace live: cấp (1 chuyên viên · 2 trưởng đơn vị · 3 Hiệu trưởng) và đơn vị phụ trách (* = toàn trường).';

create table public.policies (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  id           text not null,
  name         text not null,
  value        text not null,
  tier         smallint not null check (tier between 1 and 3),
  source       text not null,
  owner        text not null,
  aliases      text[] not null check (cardinality(aliases) > 0),
  position     integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.documents (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  id           text not null,
  title        text not null,
  owner        text not null,
  tier         smallint not null check (tier between 1 and 3),
  version      text not null,
  lines        text[] not null,
  position     integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.audit_log (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  seq          integer not null check (seq > 0),
  ts           text not null,
  actor        text not null,
  actor_user   uuid,
  doc_id       text not null,
  line_index   integer,
  action       text not null,
  from_text    text not null,
  to_text      text not null,
  basis        text not null,
  prop_id      text,
  reverts_seq  integer,
  prev_hash    text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash         text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, seq)
);
comment on table public.audit_log is 'Sổ kiểm toán chỉ ghi thêm, chuỗi băm SHA-256. Không có policy update/delete cho bất kỳ vai trò client nào.';

create table public.feedback_events (
  id           bigint generated always as identity primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id      uuid,
  actor        text not null,
  rule_id      text not null,
  category     text not null check (category in ('U1', 'U2', 'U3', 'SEMANTIC')),
  doc_id       text not null,
  line_index   integer not null,
  line         text not null,
  answer       text not null check (answer in ('accept', 'reject')),
  created_at   timestamptz not null default now()
);
comment on table public.feedback_events is 'Câu trả lời của người cho từng hồ sơ chuyển tiếp — nguồn dữ liệu cho cơ chế học neo mới.';

create index feedback_events_workspace_idx on public.feedback_events (workspace_id, rule_id);
create index members_user_idx on public.members (user_id);

-- ---------- Phân quyền đọc ----------
create or replace function public.is_workspace_member(p_workspace text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.workspace_id = p_workspace and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_read_workspace(p_workspace text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspaces w where w.id = p_workspace and w.mode = 'demo')
      or public.is_workspace_member(p_workspace);
$$;

revoke all on function public.is_workspace_member(text) from public;
revoke all on function public.can_read_workspace(text) from public;
grant execute on function public.is_workspace_member(text) to anon, authenticated;
grant execute on function public.can_read_workspace(text) to anon, authenticated;

alter table public.workspaces      enable row level security;
alter table public.members         enable row level security;
alter table public.policies        enable row level security;
alter table public.documents       enable row level security;
alter table public.audit_log       enable row level security;
alter table public.feedback_events enable row level security;

create policy "đọc workspace demo hoặc là thành viên" on public.workspaces
  for select to anon, authenticated using ((select public.can_read_workspace(id)));
create policy "chỉ đọc tư cách thành viên của chính mình" on public.members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "đọc sổ đăng ký" on public.policies
  for select to anon, authenticated using ((select public.can_read_workspace(workspace_id)));
create policy "đọc kho tài liệu" on public.documents
  for select to anon, authenticated using ((select public.can_read_workspace(workspace_id)));
create policy "đọc sổ kiểm toán" on public.audit_log
  for select to anon, authenticated using ((select public.can_read_workspace(workspace_id)));
create policy "đọc phản hồi" on public.feedback_events
  for select to anon, authenticated using ((select public.can_read_workspace(workspace_id)));

-- Cập nhật thời gian thực cho nhiều người dùng cùng lúc.
alter publication supabase_realtime add table public.workspaces;
