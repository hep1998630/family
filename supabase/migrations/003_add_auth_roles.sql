-- ============================================================
-- Family Tree — Auth & Role-Based Access Control
-- 003_add_auth_roles.sql
--
-- Locks down writes: public read stays open, but insert/update
-- now require an authenticated admin, and delete requires the
-- "owner" role specifically. There is no self-service signup —
-- the owner creates every admin account manually in the Supabase
-- dashboard (Authentication → Users → Add user), then adds a row
-- to `admins` for that user's id. See SETUP.md for the exact steps.
-- ============================================================

-- ============================================================
-- ADMINS TABLE
-- ============================================================

create table admins (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'editor')),
  name       text,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- No public/authenticated insert, update or delete policy on
-- purpose — rows are only ever written by the owner via the
-- Supabase dashboard or SQL editor, which use the service role
-- and bypass RLS entirely. A logged-in admin may only read their
-- own row (e.g. to resolve their own display name / role in the UI).
create policy "admins_read_own_row" on admins
  for select using (auth.uid() = id);

-- ============================================================
-- ROLE-CHECK HELPERS
-- ============================================================
-- SECURITY DEFINER so these can safely query `admins` from inside
-- RLS policies on OTHER tables without the caller needing their
-- own read access to `admins`, and without recursing into the
-- `admins` policy above. `set search_path` pins name resolution
-- so the function can't be hijacked by a session-level search_path.

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admins where id = auth.uid());
$$;

create or replace function is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admins where id = auth.uid() and role = 'owner');
$$;

grant execute on function is_admin() to anon, authenticated;
grant execute on function is_owner() to anon, authenticated;

-- ============================================================
-- REPLACE OPEN WRITE POLICIES WITH ADMIN/OWNER-GATED ONES
-- (public_read_* select policies are untouched — viewing stays
-- open with no login required.)
-- ============================================================

-- roots
drop policy if exists "open_insert_roots" on roots;
drop policy if exists "open_update_roots" on roots;
drop policy if exists "open_delete_roots" on roots;

create policy "admin_insert_roots" on roots for insert with check (is_admin());
create policy "admin_update_roots" on roots for update using (is_admin());
create policy "owner_delete_roots" on roots for delete using (is_owner());

-- people
drop policy if exists "open_insert_people" on people;
drop policy if exists "open_update_people" on people;
drop policy if exists "open_delete_people" on people;

create policy "admin_insert_people" on people for insert with check (is_admin());
create policy "admin_update_people" on people for update using (is_admin());
create policy "owner_delete_people" on people for delete using (is_owner());

-- partnerships
drop policy if exists "open_insert_partnerships" on partnerships;
drop policy if exists "open_update_partnerships" on partnerships;
drop policy if exists "open_delete_partnerships" on partnerships;

create policy "admin_insert_partnerships" on partnerships for insert with check (is_admin());
create policy "admin_update_partnerships" on partnerships for update using (is_admin());
create policy "owner_delete_partnerships" on partnerships for delete using (is_owner());

-- parent_child
drop policy if exists "open_insert_parent_child" on parent_child;
drop policy if exists "open_update_parent_child" on parent_child;
drop policy if exists "open_delete_parent_child" on parent_child;

create policy "admin_insert_parent_child" on parent_child for insert with check (is_admin());
create policy "admin_update_parent_child" on parent_child for update using (is_admin());
create policy "owner_delete_parent_child" on parent_child for delete using (is_owner());

-- ============================================================
-- STORAGE: avatars bucket policies
-- ============================================================
-- The bucket itself is still created manually in the dashboard
-- (see 001_initial_schema.sql's note and SETUP.md) — this just
-- locks down who can write into it once it exists. Photo uploads
-- aren't deletions of a person, so any admin (not owner-only) may
-- insert/update/delete objects here.
--
-- NOTE: if the `avatars` bucket was previously given ad-hoc public
-- write policies by hand in the dashboard, remove those manually —
-- a migration can't drop policies it didn't create, since it
-- doesn't know their names. See SETUP.md.

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_admin_insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and is_admin());

create policy "avatars_admin_update" on storage.objects
  for update using (bucket_id = 'avatars' and is_admin());

create policy "avatars_admin_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and is_admin());
