# Setup

## Applying migrations on a new Supabase project

Run `supabase/migrations/001_initial_schema.sql` through `004_grant_data_api_access.sql`
**in order** — each one depends on the schema the previous one created.
This matters more than it used to: since 2026-05-30, new Supabase projects
no longer auto-grant table access to the `anon`/`authenticated` roles by
default, so `004_grant_data_api_access.sql` is not optional on a project
created after that date — without it, every query from the app fails with
a permission error at the Postgres grant level (before RLS is even
evaluated), which looks identical to "not an admin" / "not allowed" from
the app's point of view. If `/edit` shows "خطأ في إعدادات الخادم" (server
configuration error) instead of the usual "not an admin" screen, this is
the first thing to check — look at your deployment's function logs for the
exact Postgres error `middleware.ts` logs.

## Adding a new admin (editor or owner)

There is no self-service signup. Every admin account is created manually by
the owner, in two steps:

**1. Create the user in Supabase Auth**

Supabase dashboard → **Authentication → Users → Add user** → enter their
email and a password (or send a magic invite, if preferred), then save.
Copy the generated user's UUID (shown in the users table).

**2. Give them a role in the `admins` table**

Supabase dashboard → **SQL Editor** → run:

```sql
insert into admins (id, role, name)
values ('<the user''s UUID from step 1>', 'editor', 'Their Name');
```

Use `role = 'owner'` instead of `'editor'` if they should also be able to
delete people, partnerships, roots, and parent/child links. Everyone with a
row in `admins` (either role) can add and edit; only `'owner'` can delete.

That's it — they can now sign in at `/login` with the email/password from
step 1 and get full edit access at `/edit`.

## Avatars storage bucket

If the `avatars` bucket doesn't exist yet, create it manually: Supabase
dashboard → **Storage → New bucket** → name it `avatars`, mark it **public**.

Migration `003_add_auth_roles.sql` adds RLS policies on `storage.objects`
scoped to this bucket (public read, admin-only insert/update/delete). If the
bucket was previously given ad-hoc permissive policies by hand in the
dashboard (e.g. "public insert"), **remove those manually** — a migration
can't drop policies it didn't create, since it has no way to know their
names, so a stale permissive policy would keep allowing anonymous writes
alongside the new admin-gated ones.
