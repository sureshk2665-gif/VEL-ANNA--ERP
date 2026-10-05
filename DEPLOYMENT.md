# Deploying VIPL ERP — Vercel (website) + Supabase (database)

- **Vercel** hosts the website (static React build) — production deploys from `main`.
- **Supabase** stores the data: one JSON row (`id = 'main'`) in the `erp_data` table.
- **Supabase Auth** checks usernames/passwords. Only signed-in users can read or write data.
  Which modules each person may use is still set in the ERP: **Admin → Users**.

ERP project: `https://oupnwllczzezcejcnruc.supabase.co` (separate from the payroll project).

---

## 1. Create the database table (once)

Supabase → your ERP project → **SQL Editor → New query** → paste all of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**. You should see "Success. No rows returned".

## 2. Lock down sign-up (once — important)

Supabase → **Authentication → Sign In / Providers** (or *Providers → Email*):

- **Allow new users to sign up** → **OFF**. Otherwise anyone could create a login and read the data.
- Keep **Email** provider **enabled** and **Confirm email** **ON**.

## 3. Create the logins

Supabase → **Authentication → Users → Add user → Create new user**, one per person:

| Field | Value |
|---|---|
| Email | `<username>@vipl-erp.local` — e.g. `softwareadmin@vipl-erp.local`, `vipl1@vipl-erp.local` |
| Password | a strong password for that person |
| Auto Confirm User | ✅ **ticked** |

People sign in to the ERP with just the **username** part (`vipl1`) and that password.
Start with **`softwareadmin`** — on the very first sign-in the ERP creates its default user
list, including `softwareadmin` with full rights.

For each Supabase login there must be an ERP user with the **same username** in
**Admin → Users** (that's where their module rights are set). The password field on that
ERP screen is no longer used for signing in — passwords live only in Supabase.

**Changing a password:** these logins use made-up email addresses, so "send password reset
email" can't work. Instead delete the user in Authentication → Users and create it again with
the same email and the new password. Their ERP rights and data are not affected.

**Removing someone:** delete their Supabase login (they can no longer sign in), and remove or
restrict their ERP user in Admin → Users.

## 4. Vercel settings

Vercel → project **vel-anna-erp** → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://oupnwllczzezcejcnruc.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_n8_H2eMPhprIAieHI4gEQQ_QMQkWlWB` |

Then **Deployments → ⋯ → Redeploy**. Variables only take effect after a redeploy.

With `VITE_SUPABASE_URL` set, the ERP automatically uses Supabase Auth sign-in.
Without it, it keeps using the original project in the old open mode.

**Recommended: test first.** Add the two variables for the **Preview** environment only,
open the preview URL of the working branch (Vercel → Deployments), check everything, then
add them for **Production** and redeploy.

## 5. Move the existing data

1. On the **current** site, sign in as softwareadmin → **Admin → Data Backup & Restore** →
   download a backup (JSON). Keep it safe.
2. On the **new** setup, sign in as `softwareadmin` (the Supabase login from step 3).
3. **Admin → Data Backup & Restore → Restore from Backup** → choose the file.
4. Check **Admin → Users**: every username that should sign in needs a Supabase login (step 3).

## 6. Check it works

- Header **Sync** dot turns green after sign-in.
- Add a test record on one computer, click **Sync** on another — it appears.
- Signed out, nothing loads; a wrong password is rejected.

---

## Local development

`npm run dev` uses whatever `.env.local` says (see [`.env.example`](.env.example)).
Use `VITE_SUPABASE_URL=off` to work with browser-only data, or a separate test project —
don't test against the live data.

## Free plan notes

- A free project **pauses after 7 days without activity** — open Supabase and click *Restore*.
- 500 MB database; no downloadable automatic backups → download an ERP backup weekly
  (Admin → Data Backup), or upgrade to Pro (~$25/month) for daily backups.

## Security status

Fixed by this setup: the data is no longer readable or writable with the public key alone, and
sign-in passwords are checked by Supabase Auth instead of being compared in the browser.

Still to improve (next steps):
1. All signed-in users can technically read the whole data set (the per-module rights are
   enforced by the ERP screens, not the database). Moving modules to their own tables will
   allow database-level rules per unit/role.
2. The ERP user records still contain the old (unused) passwords — clear them or set them to
   something meaningless after migrating.
3. The 4-digit code is shown on screen, so it adds no protection.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid username or password." | The Supabase login doesn't exist, the password is wrong, or **Auto Confirm User** wasn't ticked. |
| "Signed in, but there is no ERP user named …" | Add that username in **Admin → Users** (sign in as softwareadmin). |
| **Sync error** after sign-in | `schema.sql` not run, or env variables wrong — the browser console shows the exact Supabase error. Redeploy after fixing variables. |
| Sign-in screen still accepts old passwords | `VITE_SUPABASE_URL` isn't set for that environment, or you didn't redeploy. |
