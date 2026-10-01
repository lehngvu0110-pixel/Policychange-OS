-- PolicyChange OS · phản hồi doanh nghiệp Sprint 1: "phân loại chỉ dùng regex sẽ trượt cách diễn đạt mới".
-- Thêm NEO ĐẠI LƯỢNG cho quy định: máy chỉ tự sửa khi dòng có cả neo chủ đề lẫn neo đại lượng (QT-KSTL-01 §5.4).
-- Mảng rỗng = neo chủ đề đã đủ hẹp (giữ hành vi cũ), nên các workspace cũ vẫn chạy đúng sau migration.

alter table public.policies add column if not exists measures text[] not null default '{}';
comment on column public.policies.measures is 'Neo đại lượng: cụm từ cho biết con số trong dòng đo đúng đại lượng của quy định. Rỗng = không yêu cầu.';

-- Điền neo đại lượng mẫu cho các quy định mẫu (mọi workspace), chỉ khi chưa có.
update public.policies p set measures = v.measures
  from (values
    ('R-PK-01', array['nộp','tiếp nhận','thời hạn','hạn nộp','trong hạn','quá hạn','đề nghị','kể từ ngày công bố']),
    ('R-KN-01', array['phản hồi','trả lời','giải quyết','xử lý','xem xét']),
    ('R-XN-01', array['cấp','trả','xử lý','giải quyết']),
    ('R-DK-01', array['tối đa','không quá','không vượt','vượt','nhiều nhất','trở xuống','giới hạn']),
    ('R-TC-01', array['duyệt','hạn mức','trưởng đơn vị','thẩm quyền'])
  ) as v(id, measures)
 where p.id = v.id and cardinality(p.measures) = 0;

-- ---------- apply_change: cập nhật cả neo đại lượng khi có ----------
create or replace function public.apply_change(
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
           measures = case when item ? 'measures' then array(select jsonb_array_elements_text(item->'measures')) else p.measures end,
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

-- ---------- Khôi phục demo: ghi cả neo đại lượng ----------
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
    insert into public.policies (workspace_id, id, name, value, tier, source, owner, aliases, measures, position)
    values (p_workspace, item->>'id', item->>'name', item->>'value', (item->>'tier')::smallint, item->>'source',
            item->>'owner', array(select jsonb_array_elements_text(item->'aliases')),
            array(select jsonb_array_elements_text(coalesce(item->'measures', '[]'::jsonb))), pos);
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

