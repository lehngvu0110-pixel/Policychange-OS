-- Chuyển hàm hỗ trợ RLS sang schema `private` (không được PostgREST phơi ra /rest/v1/rpc),
-- xử lý cảnh báo 0028/0029 của Supabase security advisor.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_workspace_member(p_workspace text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.workspace_id = p_workspace and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_read_workspace(p_workspace text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.workspaces w where w.id = p_workspace and w.mode = 'demo')
      or private.is_workspace_member(p_workspace);
$$;

revoke all on function private.is_workspace_member(text) from public;
revoke all on function private.can_read_workspace(text) from public;
grant execute on function private.is_workspace_member(text) to anon, authenticated;
grant execute on function private.can_read_workspace(text) to anon, authenticated;

drop policy "đọc workspace demo hoặc là thành viên" on public.workspaces;
drop policy "đọc sổ đăng ký" on public.policies;
drop policy "đọc kho tài liệu" on public.documents;
drop policy "đọc sổ kiểm toán" on public.audit_log;
drop policy "đọc phản hồi" on public.feedback_events;

create policy "đọc workspace demo hoặc là thành viên" on public.workspaces
  for select to anon, authenticated using ((select private.can_read_workspace(id)));
create policy "đọc sổ đăng ký" on public.policies
  for select to anon, authenticated using ((select private.can_read_workspace(workspace_id)));
create policy "đọc kho tài liệu" on public.documents
  for select to anon, authenticated using ((select private.can_read_workspace(workspace_id)));
create policy "đọc sổ kiểm toán" on public.audit_log
  for select to anon, authenticated using ((select private.can_read_workspace(workspace_id)));
create policy "đọc phản hồi" on public.feedback_events
  for select to anon, authenticated using ((select private.can_read_workspace(workspace_id)));

drop function public.can_read_workspace(text);
drop function public.is_workspace_member(text);
