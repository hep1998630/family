-- ============================================================
-- Family Tree — Saved ("custom") tree views
-- 005_saved_views.sql
--
-- A saved view is a named way of looking at part of the tree:
-- "the descendants of <top person>", optionally only those from one
-- of their marriages (<partner>), down to <depth> generations.
-- Admins create them; everyone can open them.
--
-- Run this BEFORE deploying the app version that reads
-- `saved_views`, otherwise the landing page can't load its views.
-- ============================================================

create table saved_views (
  id             uuid        primary key default uuid_generate_v4(),
  name           text        not null check (length(btrim(name)) > 0),
  top_person_id  uuid        not null references people(id) on delete cascade,
  -- Generations shown below the top person; null = all of them.
  depth          int         check (depth is null or depth >= 1),
  -- Show only this marriage of the top person (null = all partners).
  partner_id     uuid        references people(id) on delete set null,
  sort_order     int         not null default 0,
  created_by     uuid        default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_saved_views_top_person on saved_views(top_person_id);
create index idx_saved_views_partner    on saved_views(partner_id);

create trigger saved_views_updated_at
  before update on saved_views
  for each row execute function handle_updated_at();

-- ============================================================
-- partner_id must really be a partner of top_person_id
-- ============================================================

create or replace function saved_views_check_partner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.partner_id is not null and not exists (
    select 1 from partnerships
    where (person_a_id = new.top_person_id and person_b_id = new.partner_id)
       or (person_a_id = new.partner_id and person_b_id = new.top_person_id)
  ) then
    raise exception 'saved view partner % is not a partner of %', new.partner_id, new.top_person_id
      using errcode = '23514'; -- check_violation
  end if;
  return new;
end;
$$;

create trigger saved_views_check_partner
  before insert or update of top_person_id, partner_id on saved_views
  for each row execute function saved_views_check_partner();

-- If that marriage is later removed, the view falls back to "all
-- partners" instead of pointing at someone who is no longer a partner.
-- SECURITY DEFINER so the owner's partnership delete isn't blocked by
-- saved_views' own RLS/grants.
create or replace function saved_views_drop_removed_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update saved_views set partner_id = null
  where (top_person_id = old.person_a_id and partner_id = old.person_b_id)
     or (top_person_id = old.person_b_id and partner_id = old.person_a_id);
  return old;
end;
$$;

create trigger partnerships_drop_saved_view_partner
  after delete on partnerships
  for each row execute function saved_views_drop_removed_partner();

-- ============================================================
-- RLS: anyone can read; any admin (not only the owner) can write.
-- Views are presentation settings, not family data, so editors
-- may create, change and remove them.
-- ============================================================

alter table saved_views enable row level security;

create policy "public_read_saved_views" on saved_views
  for select using (true);
create policy "admin_insert_saved_views" on saved_views
  for insert with check (is_admin());
create policy "admin_update_saved_views" on saved_views
  for update using (is_admin()) with check (is_admin());
create policy "admin_delete_saved_views" on saved_views
  for delete using (is_admin());

-- New tables get no API grants on this project (see 004), so without
-- these every request fails with "permission denied" before RLS runs.
grant select on public.saved_views to anon, authenticated;
grant insert, update, delete on public.saved_views to authenticated;
