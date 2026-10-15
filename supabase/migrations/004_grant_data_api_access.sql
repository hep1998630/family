-- ============================================================
-- Grant Data API access to anon/authenticated
-- 004_grant_data_api_access.sql
--
-- Since 2026-05-30, new Supabase projects no longer auto-grant table
-- privileges to the `anon`/`authenticated` roles by default:
-- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
--
-- Without this, every query from the app (even ones RLS would
-- otherwise allow) fails with "permission denied" at the Postgres
-- grant level, before RLS is even evaluated — which looks identical
-- to "not an admin" / "not allowed" from the app's point of view.
--
-- RLS (from 001 and 003) still decides which ROWS and which
-- operations are actually allowed — these GRANTs only restore the
-- table-level access that used to be automatic.
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select
  on public.roots, public.people, public.partnerships, public.parent_child
  to anon, authenticated;

grant insert, update, delete
  on public.roots, public.people, public.partnerships, public.parent_child
  to authenticated;

grant select on public.admins to authenticated;
