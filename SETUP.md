# Setup

## Applying migrations on a new Supabase project

Run `supabase/migrations/001_initial_schema.sql` through `007_delete_person.sql`
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

## One-time dashboard settings (do these before giving anyone access)

These live in the Supabase dashboard, not in the code or the migrations:

1. **Turn off public sign-ups.** **Authentication → Sign In / Providers** →
   turn **off** "Allow new users to sign up". Otherwise anyone can create an
   account through the public API. Such an account gets no edit rights (it
   isn't in `admins`), but it's junk you'd have to clean up.
2. **Set the site address.** **Authentication → URL Configuration → Site
   URL** = `https://al-mustafa-family.netlify.app`. Otherwise any link in an
   auth email (invite, password reset) points at `localhost`.

## إضافة محرر جديد — Adding an editor

There is no self-service signup. The owner creates every account by hand.

**What an editor can and can't do.** An editor (`role = 'editor'`) can add
people, marriages and children, edit profiles and photos, correct a
person's «الأب» / «الأم», remove a marriage (the link only — both people
stay), and manage the saved views. Only the owner (`role = 'owner'`) can
delete a person or a whole family branch.

**1. Create the user.** Supabase dashboard → **Authentication → Users →
Add user** → enter their email and a password, and tick **Auto Confirm
User** (there's no email-confirmation flow). Save, then copy the new
user's UUID from the users table.

**2. Make them an editor.** Supabase dashboard → **SQL Editor** → run:

```sql
insert into admins (id, role, name)
values ('<the UUID from step 1>', 'editor', 'Their Name');
```

They can now sign in at `/login` and edit at `/edit`. Give them the email
and password from step 1 privately (e.g. by phone). Use `'owner'` instead
of `'editor'` only for someone who should also be able to delete people.

### Removing an editor

SQL Editor:

```sql
delete from admins where id = '<their UUID>';
```

That takes their edit rights away immediately. Then delete the login too:
**Authentication → Users** → find them → **Delete user**. Nothing they
added or edited is removed.

### Resetting a forgotten password

The simplest way, with no emails involved:

1. **Authentication → Users** → find them → **Delete user**.
2. **Add user** again with the same email and a new password (tick
   **Auto Confirm User**), and copy the **new** UUID.
3. Re-insert their `admins` row with the new UUID (step 2 above) — the
   old row went away with the deleted user.

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
