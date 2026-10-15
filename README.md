# شجرة العائلة — Family Tree

An Arabic (RTL) family tree app. Browse the family by branch, add people,
partnerships and parent/child links, with admin-only editing backed by
Supabase Auth and row-level security.

- **First-time setup / deploying your own copy**: see [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Adding a new admin (editor or owner) to an already-deployed copy**: see [SETUP.md](./SETUP.md)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `/view` is the public
tree; `/edit` requires an admin account (see SETUP.md) and is where
people/partnerships/children/roots get added and edited.

## Stack

Next.js (App Router) + Supabase (Postgres, Auth, Storage) + Tailwind.
Hosted on Netlify (frontend) + Supabase (free tier). CI runs lint,
typecheck and build on every pull request (`.github/workflows/ci.yml`).
