-- ============================================================
-- Family Tree — Site settings (the family's name)
-- 008_site_settings.sql
--
-- The same code runs more than one site (one per family, each with its
-- own Supabase project). What differs between them, besides the data, is
-- kept here, in a single row the owner edits from «إعدادات الموقع»:
--   • family_name     — the site's name: page title, header, login page,
--                       phone home-screen name and export files;
--   • other_site_url  — optional link to the other family's site, shown
--                       to admins only (never on the public page).
--
-- Until this has been run the site still works: it falls back to
-- «شجرة العائلة» (lib/settings/getSiteSettings.ts) — only saving the
-- settings fails.
--
-- Everyone may read the row (the name shows on the public page); only
-- the owner may change it. There is no insert or delete policy: the one
-- row is created here and stays. Grants are explicit — new tables on
-- this project get none by default (see 004).
-- ============================================================

create table if not exists public.site_settings (
  id             smallint    primary key default 1 check (id = 1),
  family_name    text        not null default 'شجرة العائلة'
                             check (length(btrim(family_name)) between 1 and 60),
  other_site_url text        check (other_site_url is null or other_site_url like 'https://%'),
  updated_at     timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.site_settings_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch
  before update on public.site_settings
  for each row execute function public.site_settings_touch();

alter table public.site_settings enable row level security;

drop policy if exists "public_read_site_settings" on public.site_settings;
create policy "public_read_site_settings" on public.site_settings
  for select using (true);

drop policy if exists "owner_update_site_settings" on public.site_settings;
create policy "owner_update_site_settings" on public.site_settings
  for update using (is_owner()) with check (is_owner());

grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;
