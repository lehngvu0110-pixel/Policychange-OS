-- PolicyChange OS · Sprint 2 · Ghi dữ liệu theo giao dịch, khoá theo workspace.
-- Chỉ service role (Edge Function policy-api) được gọi. Hàm kiểm tra:
--   * đuôi chuỗi kiểm toán vẫn là đuôi mà máy chủ đã dùng để tính băm (chống hai người ban hành cùng lúc);
--   * mỗi dòng sắp sửa vẫn đúng nội dung lúc phân tích (chống ghi đè thay đổi của người khác);
--   * các bản ghi mới nối tiếp liền mạch (seq tăng 1, prev_hash = hash trước).
-- Sai bất kỳ điều kiện nào → toàn bộ giao dịch bị huỷ, không ghi gì.

create or replace function public.apply_change(
  p_workspace       text,
  p_expected_seq    integer,
  p_expected_tail   text,
  p_doc_updates     jsonb default '[]'::jsonb,
  p_policy_updates  jsonb default '[]'::jsonb,
  p_new_documents   jsonb default '[]'::jsonb,
  p_records         jsonb default '[]'::jsonb,
  p_feedback        jsonb default '[]'::jsonb
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

  update public.workspaces
     set ledger_seq = next_seq - 1, ledger_tail = prev_hash, updated_at = now()
   where id = p_workspace;

  return jsonb_build_object('seq', next_seq - 1, 'tail', prev_hash);
end;
$$;

-- Khôi phục workspace demo về dữ liệu mẫu. Từ chối với workspace live.
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

revoke all on function public.apply_change(text, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.reset_demo_workspace(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_change(text, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.reset_demo_workspace(text, jsonb, jsonb) to service_role;
