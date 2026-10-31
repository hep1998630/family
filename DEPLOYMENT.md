# Deployment

A from-zero walkthrough for standing up your own copy on Supabase (free
tier) + Netlify (free tier). This is the exact path for setting up a brand
new project — if you already have a project running and just need to add
another admin, see [SETUP.md](./SETUP.md) instead.

## 1. Create a Supabase project

[supabase.com/dashboard](https://supabase.com/dashboard) → New project.
Pick any name/region, set a database password (you won't need it day to
day — Supabase manages the connection for you), and wait for it to finish
provisioning.

## 2. Run the migrations, in order

Supabase dashboard → **SQL Editor** → open each file in
`supabase/migrations/`, in this exact order, and run it:

1. `001_initial_schema.sql`
2. `002_add_gender.sql`
3. `003_add_auth_roles.sql`
4. `004_grant_data_api_access.sql`
5. `005_saved_views.sql` — the admins' saved tree views («عروض مختارة»)
6. `006_editors_can_relink.sql` — lets editors correct a parent or remove
   a marriage (deleting people stays owner-only)
7. `007_delete_person.sql` — deletes a person and their links in one step,
   so a failed delete can never leave a person half-deleted

All seven must be run, in order — each depends on the schema the previous
one created. **004 is not optional**: since 2026-05-30, new Supabase
projects no longer auto-grant table access to the API, so without it every
request from the app fails with a permission error that looks exactly
like "you're not an admin" even when you are (see Troubleshooting below).

**Already running an older copy?** Run only the migrations you haven't
run yet, in order, *before* publishing the app version that needs them.
For `005_saved_views.sql` that means before deploying the saved-views
feature: until it's run, the site still loads but shows no saved views
(the server log says `could not load — has migration 005 been run?`).
Without `006_editors_can_relink.sql`, an editor who changes a child's
father/mother or removes a marriage gets «لم يتم الحفظ: ليس لديك صلاحية
لهذا التعديل» — nothing is corrupted, but the change can't be saved.
Without `007_delete_person.sql`, deleting a person fails with an error
(«تعذّر حفظ بعض التغييرات») — run it before publishing the version that
needs it.

Before giving anyone else access, also do the one-time dashboard settings
in [SETUP.md](./SETUP.md#one-time-dashboard-settings-do-these-before-giving-anyone-access)
(turn off public sign-ups; set the Site URL).

`003_add_auth_roles.sql` contains `drop policy if exists ...` statements
near the top — that's expected and not destructive. It's replacing the
fully-open write policies from `001` with admin-gated ones; it doesn't
touch any of your data.

## 3. Create the `avatars` storage bucket

Supabase dashboard → **Storage** → New bucket → name it exactly `avatars`,
mark it **public**. (Migration 003 adds the read/write policies for this
bucket; it can't create the bucket itself.)

## 4. Create your own account and make yourself the owner

1. Supabase dashboard → **Authentication → Users → Add user**. Enter your
   email and a password, and check **Auto Confirm User** (otherwise
   you'd need a working email-confirmation flow before you could sign
   in — there isn't one, since there's no self-service signup). Save,
   then copy the new user's UUID from the users table.
2. Supabase dashboard → **SQL Editor** → run:
   ```sql
   insert into admins (id, role, name)
   values ('<the UUID from step 1>', 'owner', 'Your Name');
   ```

See [SETUP.md](./SETUP.md) for adding further admins later the same way.

## 5. Get your project's URL and anon key

Supabase dashboard → **Project Settings → Data API**. You need:
- **Project URL** — looks like `https://<project-id>.supabase.co`. This is
  the *base* URL — don't add `/rest/v1` to it, the Supabase client adds
  that itself.
- **anon public key** (sometimes labelled `anon` / `public`).

## 6. Deploy to Netlify

1. [app.netlify.com](https://app.netlify.com) → Add new site → Import an
   existing project → connect your GitHub account and pick this repo.
   Netlify auto-detects the Next.js build settings via
   `@netlify/plugin-nextjs` — no manual build command needed.
2. Before the first deploy (or right after, then redeploy): **Site
   configuration → Environment variables** → add both:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from step 5
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key from step 5
3. Deploy. Netlify will also build a deploy preview for every future pull
   request automatically.

Visit your Netlify URL → `/edit` → sign in with the account from step 4.

## Troubleshooting

**"You're not an admin" even though you inserted the right row into
`admins`.** This is migration 004 not having been run (see step 2) — new
Supabase projects don't grant API access to tables by default as of
2026-05-30. If this is the actual cause, `/edit` shows a distinct "خطأ في
إعدادات الخادم" (server configuration error) screen rather than the usual
"not an admin" one — if you see *that* screen, it's this. Run
`004_grant_data_api_access.sql` and try again.

**The site suddenly can't reach the database / everything looks broken
after a week of nobody visiting.** Supabase's free tier pauses a project
after 7 days with no activity. Supabase dashboard → your project → there
will be a "Restore" / "Resume project" button; click it, wait a minute,
and the site works again. `.github/workflows/weekly-backup.yml` (once set
up — see its own comments) doubles as a keep-alive by querying the
database every week, which should prevent this from happening at all; it
needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` added as **repository**
secrets (GitHub repo → Settings → Secrets and variables → Actions → New
repository secret) — same values as step 5 above, just stored on GitHub's
side instead of Netlify's.
