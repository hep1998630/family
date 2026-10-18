-- ============================================================
-- Family Tree — Editors can correct parents and marriages
-- 006_editors_can_relink.sql
--
-- 003 made every delete owner-only. But two everyday EDITOR actions
-- remove a *link* (not a person):
--   • changing a child's «الأب» / «الأم» replaces a parent_child row;
--   • «إزالة الشراكة» removes a partnerships row.
-- RLS silently skips rows a policy doesn't allow — the DELETE "succeeds"
-- with 0 rows — so for an editor the old link stayed (a child could end
-- up with three parents) and a removed marriage came back on reload.
--
-- Correcting a parent or a marriage is editing, so any admin may now
-- delete these two kinds of link. Deleting PEOPLE and ROOTS stays
-- owner-only (owner_delete_people / owner_delete_roots from 003 are
-- unchanged), and deleting a link never deletes a person.
--
-- No new grants are needed: 004 already grants DELETE on both tables
-- to `authenticated`; RLS (below) decides who may actually delete.
-- ============================================================

drop policy if exists "owner_delete_partnerships" on partnerships;
drop policy if exists "owner_delete_parent_child" on parent_child;
-- (safe to run twice)
drop policy if exists "admin_delete_partnerships" on partnerships;
drop policy if exists "admin_delete_parent_child" on parent_child;

create policy "admin_delete_partnerships" on partnerships
  for delete using (is_admin());
create policy "admin_delete_parent_child" on parent_child
  for delete using (is_admin());
