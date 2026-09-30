-- PolicyChange OS · Sprint 2 · Hàng đợi duyệt dùng chung + hạn mức AI theo từng máy khách.
--
-- Trước đây quyết định chuyển tiếp chỉ nằm trong trình duyệt của người khởi tạo thay đổi, nên người có thẩm quyền
-- (ví dụ trưởng đơn vị sở hữu quy định bị đụng ở U2) không thấy hồ sơ trên máy của mình. Nay mỗi thay đổi còn vị trí
-- chờ quyết sẽ mở một hồ sơ (open_changes); từng quyết định được ghi vào change_decisions và áp dụng ngay.

create table public.open_changes (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  id           text not null check (id ~ '^CR-[0-9]{1,9}$'),
  rule_id      text not null,
  old_value    text not null,
  new_value    text not null,
  issuer_tier  smallint not null check (issuer_tier between 1 and 3),
  request_text text not null default '',
  created_by   text not null,
  created_user uuid,
  held         jsonb not null default '[]'::jsonb,
  status       text not null default 'open' check (status in ('open', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, id)
);
comment on table public.open_changes is 'Hồ sơ thay đổi còn vị trí chờ người có thẩm quyền quyết (U1/U2/U3 hoặc AI giữ lại).';

create table public.change_decisions (
  workspace_id text not null,
  change_id    text not null,
  doc_id       text not null,
  line_index   integer not null,
  line         text not null,
  act          text not null check (act in ('a', 'b', 'approve', 'reject')),
  accepted     boolean not null,
  decided_by   text not null,
  decided_user uuid,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, change_id, doc_id, line_index, line),
  foreign key (workspace_id, change_id) references public.open_changes(workspace_id, id) on delete cascade
);
comment on table public.change_decisions is 'Quyết định của người cho từng vị trí trong hồ sơ; khoá chính chống quyết hai lần.';

alter table public.open_changes     enable row level security;
alter table public.change_decisions enable row level security;
create policy "đọc hồ sơ thay đổi" on public.open_changes
  for select to anon, authenticated using ((select private.can_read_workspace(workspace_id)));
create policy "đọc quyết định" on public.change_decisions
  for select to anon, authenticated using ((select private.can_read_workspace(workspace_id)));
create index change_decisions_change_idx on public.change_decisions (workspace_id, change_id);

-- ---------- apply_change: thêm hồ sơ và quyết định vào cùng giao dịch ----------
drop function if exists public.apply_change(text, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb);

create function public.apply_change(
  p_workspace       text,
  p_expected_seq    integer,
  p_expected_tail   text,
  p_doc_updates     jsonb default '[]'::jsonb,
  p_policy_updates  jsonb default '[]'::jsonb,
  p_new_documents   jsonb default '[]'::jsonb,
  p_records         jsonb default '[]'::jsonb,
  p_feedback        jsonb default '[]'::jsonb,
  p_open_change     jsonb default null,
  p_decisions       jsonb default '[]'::jsonb,
  p_close_change    text  default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws        public.workspaces%rowtype;
  item      jsonb;
  cur_lines text[];
  cur_value text;
  cstatus   text;
  idx       integer;
  next_seq  integer;
  prev_hash text;
begin
  select * into ws from public.workspaces where id = p_workspace for update;
  if not found then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;
  if ws.ledger_seq <> p_expected_seq or ws.ledger_tail <> p_expected_tail then
    raise exception 'ledger_conflict' using errcode = '40001',
      detail = format('expected seq %s, current seq %s', p_expected_seq, ws.ledger_seq);
  end if;

  for item in select value from jsonb_array_elements(p_new_documents) loop
    if exists (select 1 from public.documents d where d.workspace_id = p_workspace and d.id = item->>'id') then
      raise exception 'document_exists' using errcode = '23505', detail = item->>'id';
    end if;
    insert into public.documents (workspace_id, id, title, owner, tier, version, lines, position)
    values (p_workspace, item->>'id', item->>'title', item->>'owner', (item->>'tier')::smallint, item->>'version',
            array(select jsonb_array_elements_text(item->'lines')),
            coalesce((select max(position) + 1 from public.documents d where d.workspace_id = p_workspace), 0));
  end loop;

  for item in select value from jsonb_array_elements(p_doc_updates) loop
    idx := (item->>'lineIndex')::integer + 1;
    select d.lines into cur_lines from public.documents d
      where d.workspace_id = p_workspace and d.id = item->>'id' for update;
    if cur_lines is null or idx < 1 or idx > coalesce(array_length(cur_lines, 1), 0)
       or cur_lines[idx] is distinct from item->>'from' then
      raise exception 'stale_line' using errcode = '40001', detail = format('%s:%s', item->>'id', item->>'lineIndex');
    end if;
    update public.documents d
       set lines[idx] = item->>'to', version = item->>'version', updated_at = now()
     where d.workspace_id = p_workspace and d.id = item->>'id';
  end loop;

  for item in select value from jsonb_array_elements(p_policy_updates) loop
    select p.value into cur_value from public.policies p
      where p.workspace_id = p_workspace and p.id = item->>'id' for update;
    if cur_value is null or cur_value is distinct from item->>'expectedValue' then
      raise exception 'policy_conflict' using errcode = '40001', detail = item->>'id';
    end if;
    update public.policies p
       set value = item->>'value',
           aliases = array(select jsonb_array_elements_text(item->'aliases')),
           updated_at = now()
     where p.workspace_id = p_workspace and p.id = item->>'id';
  end loop;

  next_seq := ws.ledger_seq + 1;
  prev_hash := ws.ledger_tail;
  for item in select value from jsonb_array_elements(p_records) loop
    if (item->>'seq')::integer <> next_seq or item->>'prevHash' <> prev_hash then
      raise exception 'chain_mismatch' using errcode = '40001', detail = format('at seq %s', next_seq);
    end if;
    insert into public.audit_log (workspace_id, seq, ts, actor, actor_user, doc_id, line_index, action,
                                  from_text, to_text, basis, prop_id, reverts_seq, prev_hash, hash)
    values (p_workspace, next_seq, item->>'ts', item->>'actor', nullif(item->>'actorUser', '')::uuid,
            item->>'docId', (item->>'lineIndex')::integer, item->>'action', item->>'from', item->>'to',
            item->>'basis', item->>'propId', (item->>'revertsSeq')::integer, item->>'prevHash', item->>'hash');
    prev_hash := item->>'hash';
    next_seq := next_seq + 1;
  end loop;

  for item in select value from jsonb_array_elements(p_feedback) loop
    insert into public.feedback_events (workspace_id, user_id, actor, rule_id, category, doc_id, line_index, line, answer)
    values (p_workspace, nullif(item->>'userId', '')::uuid, item->>'actor', item->>'ruleId', item->>'category',
            item->>'docId', (item->>'lineIndex')::integer, item->>'line', item->>'answer');
  end loop;

  if p_open_change is not null and jsonb_typeof(p_open_change) = 'object' then
    if exists (select 1 from public.open_changes c where c.workspace_id = p_workspace and c.id = p_open_change->>'id') then
      if coalesce((p_open_change->>'reuse')::boolean, false) is not true then
        raise exception 'change_exists' using errcode = '40001', detail = p_open_change->>'id';
      end if;
      update public.open_changes c
         set held = coalesce(p_open_change->'held', '[]'::jsonb), status = p_open_change->>'status', updated_at = now()
       where c.workspace_id = p_workspace and c.id = p_open_change->>'id' and c.status = 'open';
      if not found then
        raise exception 'change_closed' using errcode = '40001', detail = p_open_change->>'id';
      end if;
    else
      insert into public.open_changes (workspace_id, id, rule_id, old_value, new_value, issuer_tier, request_text,
                                       created_by, created_user, held, status)
      values (p_workspace, p_open_change->>'id', p_open_change->>'ruleId', p_open_change->>'oldValue', p_open_change->>'newValue',
              (p_open_change->>'issuerTier')::smallint, coalesce(p_open_change->>'requestText', ''), p_open_change->>'createdBy',
              nullif(p_open_change->>'createdUser', '')::uuid, coalesce(p_open_change->'held', '[]'::jsonb), p_open_change->>'status');
    end if;
  end if;

  for item in select value from jsonb_array_elements(p_decisions) loop
    select c.status into cstatus from public.open_changes c
      where c.workspace_id = p_workspace and c.id = item->>'changeId' for update;
    if cstatus is null then
      raise exception 'change_missing' using errcode = '40001', detail = item->>'changeId';
    end if;
    if p_open_change is null and cstatus <> 'open' then
      raise exception 'change_closed' using errcode = '40001', detail = item->>'changeId';
    end if;
    if exists (select 1 from public.change_decisions d
               where d.workspace_id = p_workspace and d.change_id = item->>'changeId' and d.doc_id = item->>'docId'
                 and d.line_index = (item->>'lineIndex')::integer and d.line = item->>'line') then
      raise exception 'decision_conflict' using errcode = '40001', detail = format('%s:%s', item->>'docId', item->>'lineIndex');
    end if;
    insert into public.change_decisions (workspace_id, change_id, doc_id, line_index, line, act, accepted, decided_by, decided_user)
    values (p_workspace, item->>'changeId', item->>'docId', (item->>'lineIndex')::integer, item->>'line', item->>'act',
            (item->>'accepted')::boolean, item->>'decidedBy', nullif(item->>'decidedUser', '')::uuid);
  end loop;

  if p_close_change is not null then
    update public.open_changes c set status = 'closed', updated_at = now()
     where c.workspace_id = p_workspace and c.id = p_close_change;
  end if;

  update public.workspaces
     set ledger_seq = next_seq - 1, ledger_tail = prev_hash, updated_at = now()
   where id = p_workspace;

  return jsonb_build_object('seq', next_seq - 1, 'tail', prev_hash);
end;
$$;

revoke all on function public.apply_change(text, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_change(text, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) to service_role;

-- ---------- Khôi phục demo cũng xoá hồ sơ ----------
create or replace function public.reset_demo_workspace(
  p_workspace text,
  p_policies  jsonb,
  p_documents jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws   public.workspaces%rowtype;
  item jsonb;
  pos  integer := 0;
begin
  select * into ws from public.workspaces where id = p_workspace for update;
  if not found then raise exception 'workspace_not_found' using errcode = 'P0002'; end if;
  if ws.mode <> 'demo' then raise exception 'not_a_demo_workspace' using errcode = '42501'; end if;

  delete from public.open_changes    where workspace_id = p_workspace;
  delete from public.audit_log       where workspace_id = p_workspace;
  delete from public.feedback_events where workspace_id = p_workspace;
  delete from public.policies        where workspace_id = p_workspace;
  delete from public.documents       where workspace_id = p_workspace;

  for item in select value from jsonb_array_elements(p_policies) loop
    insert into public.policies (workspace_id, id, name, value, tier, source, owner, aliases, position)
    values (p_workspace, item->>'id', item->>'name', item->>'value', (item->>'tier')::smallint, item->>'source',
            item->>'owner', array(select jsonb_array_elements_text(item->'aliases')), pos);
    pos := pos + 1;
  end loop;
  pos := 0;
  for item in select value from jsonb_array_elements(p_documents) loop
    insert into public.documents (workspace_id, id, title, owner, tier, version, lines, position)
    values (p_workspace, item->>'id', item->>'title', item->>'owner', (item->>'tier')::smallint, item->>'version',
            array(select jsonb_array_elements_text(item->'lines')), pos);
    pos := pos + 1;
  end loop;

  update public.workspaces set ledger_seq = 0, ledger_tail = repeat('0', 64), updated_at = now() where id = p_workspace;
end;
$$;

-- ---------- Hạn mức AI theo từng máy khách ----------
-- Ngoài trần chung mỗi ngày, mỗi máy khách (băm địa chỉ IP, không lưu IP thô) chỉ được một phần nhỏ, để một người
-- không thể dùng hết lượt của cả hệ thống.
create table public.ai_usage_clients (
  day    date not null,
  client text not null check (client ~ '^[0-9a-f]{16,64}$'),
  calls  integer not null default 0,
  primary key (day, client)
);
alter table public.ai_usage_clients enable row level security;
comment on table public.ai_usage_clients is 'Đếm lượt gọi AI theo ngày và theo máy khách (băm SHA-256 của IP). Chỉ service role.';

drop function if exists public.consume_ai_quota(integer);
create function public.consume_ai_quota(p_limit integer, p_client text default null, p_client_limit integer default 40)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare used integer; mine integer;
begin
  if p_client is not null then
    insert into public.ai_usage_clients (day, client, calls) values (current_date, p_client, 1)
    on conflict (day, client) do update set calls = public.ai_usage_clients.calls + 1
    returning calls into mine;
    if mine > p_client_limit then return false; end if;
  end if;
  insert into public.ai_usage (day, calls) values (current_date, 1)
  on conflict (day) do update set calls = public.ai_usage.calls + 1
  returning calls into used;
  return used <= p_limit;
end;
$$;
revoke all on function public.consume_ai_quota(integer, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(integer, text, integer) to service_role;
