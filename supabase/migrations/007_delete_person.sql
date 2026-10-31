-- ============================================================
-- Family Tree — Delete a person in one step
-- 007_delete_person.sql
--
-- Deleting a person used to be several separate requests (marriages,
-- parent links, then the person). If one failed halfway, the person could
-- be left with some links gone. delete_person() does it all in ONE
-- transaction: everything is deleted, or — on any error — nothing is.
--
-- It runs with the caller's rights (SECURITY INVOKER), so the RLS policies
-- still apply: only the owner may delete people (003).
--
-- New functions on this project get no EXECUTE grant by default (the
-- 2026-05-30 Data API change, see 004), so it is granted explicitly — to
-- signed-in users only, never to anon.
-- ============================================================

create or replace function public.delete_person(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  ids uuid[];      -- the person and their shortcut rows in other branches
  deleted integer;
begin
  -- Already gone (e.g. a retry after a lost response): nothing to do.
  if not exists (select 1 from people where id = p_id) then
    return;
  end if;

  if not is_owner() then
    raise exception 'only the owner can delete people'
      using errcode = '42501';
  end if;

  ids := array(select id from people where id = p_id or original_person_id = p_id);

  if exists (select 1 from parent_child where parent_id = any(ids))
     or exists (select 1 from people where mother_id = any(ids) and not (id = any(ids))) then
    raise exception 'this person still has children — remove or move them first'
      using errcode = '23503';
  end if;

  delete from partnerships where person_a_id = any(ids) or person_b_id = any(ids);
  delete from parent_child where child_id = any(ids);
  delete from people where original_person_id = p_id;
  delete from people where id = p_id;

  -- RLS skips rows silently; make sure the person really went (otherwise
  -- the exception undoes everything above).
  get diagnostics deleted = row_count;
  if deleted <> 1 then
    raise exception 'the person could not be deleted'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_person(uuid) from public, anon;
grant execute on function public.delete_person(uuid) to authenticated;
