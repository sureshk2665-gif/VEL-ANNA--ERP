# Deploying VIPL ERP — Vercel (website) + Supabase (database)

- **Vercel** hosts the website (the built React app — static files, no server code).
- **Supabase** stores the data: the whole ERP database is one JSON row (`id = 'main'`) in the
  `erp_data` table, read and written by the browser through Supabase's REST API.

The code already contains the Supabase project your brother set up
(`dkqwtohicclbejkmtzbm`), with the live data in it. Choose:

- **A. Keep that Supabase project** (simplest — the existing data is used as-is):
  skip step 1 and step 2 below, go straight to step 3. No environment variables are needed.
- **B. Use your own new Supabase project**: do all the steps, including moving the data (step 2).

---

## 1. Supabase — create the project (option B only)

1. Sign in at <https://supabase.com> → **New project**. Pick a region close to your users
   (e.g. *South Asia (Mumbai)*), set a database password, create.
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql),
   click **Run**. This creates the `erp_data` table and its access policy.
3. Open **Project Settings → API** (or **Connect**) and copy:
   - **Project URL** — `https://<ref>.supabase.co`
   - **anon / publishable key** — starts with `sb_publishable_…` (or a long `eyJ…` legacy anon key).
   Never use the `service_role` / secret key in this app.

## 2. Move the existing data (option B only)

1. In the **current** app, sign in as **softwareadmin** → **Admin → Data Backup & Restore** →
   download a backup (JSON file). Keep this file safe.
2. After step 3 is done, open the **new** site, sign in with the default `softwareadmin` /
   `softwareadmin` (a new empty database is seeded with the default users), go to
   **Admin → Data Backup & Restore → Restore from Backup** and choose the file.
3. Sign out and back in with your usual users, check the data, then change passwords.

## 3. Vercel — deploy the website

1. Sign in at <https://vercel.com> with GitHub → **Add New… → Project** → import
   **`sureshk2665-gif/VEL-ANNA--ERP`** (if it isn't listed, use *Adjust GitHub App Permissions*
   to give Vercel access to the repository).
2. Settings are read from [`vercel.json`](vercel.json) — Framework **Vite**, build
   `npm run build`, output `dist`. Leave them as detected.
3. **Environment Variables** (option B only — leave empty for option A):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon / publishable key |

4. Click **Deploy**. After ~1 minute you get a URL like `https://vel-anna-erp.vercel.app`.
5. Open it, sign in, check the **Sync** indicator in the header turns green, and add/edit a
   test record from two different computers to confirm both see the same data.

**Updates:** every push to the production branch (**`main`**) redeploys automatically; other
branches get their own preview URL. Make sure `main` is the repository's default branch
(GitHub → Settings → General → Default branch) and the production branch in Vercel
(Project → Settings → Git → Production Branch).

**Changing environment variables** only takes effect after a redeploy (Deployments → ⋯ → Redeploy),
because they are built into the site.

**Custom domain (optional):** Vercel → Project → Settings → Domains → add e.g. `erp.yourcompany.com`
and create the DNS record Vercel shows at your domain provider.

## Important: preview deployments and local development use the same database

Preview URLs and `npm run dev` on your computer use the **same live data** unless told
otherwise — testing there changes real records. To keep testing separate:

- Local: create `.env.local` with `VITE_SUPABASE_URL=off` (browser-only storage), or point it
  at a separate test Supabase project. See [`.env.example`](.env.example).
- Vercel previews: in Environment Variables, add different values for the **Preview** environment
  (e.g. a test project, or `VITE_SUPABASE_ROW_ID=test` to use a separate row in the same table).

## Security — please read

The setup works, but it is **not secure yet**:

1. The anon key is visible to anyone who opens the site (that's normal for Supabase), and the
   `erp_data` policy lets the anon key **read and overwrite everything** — so anyone who finds
   the URL can download or wipe all ERP data without logging in.
2. User passwords are stored in plain text inside that same data.
3. The 4-digit login code is shown on screen, so it does not add protection.

Until that is fixed, keep the site URL private and take regular backups (Admin → Data Backup).
The proper fix is to move login to **Supabase Auth** and restrict the `erp_data` policy to
signed-in users; that is a separate piece of work.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Header shows **Sync error** | Check the two environment variables (no typo, no quotes), confirm `schema.sql` was run, then redeploy. Browser console shows the exact Supabase error. |
| Data differs between computers | Both must use the same deployment/env values; click **Sync** to pull the latest. |
| Build fails on Vercel | Node 20.19+ is required (set in `package.json`); check the build log. |
