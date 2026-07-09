# CLAUDE.md — Callscade

Project context for Claude Code. Lives in the repo so it syncs via Git to every machine.
Keep this updated when architecture, accounts, or remaining-work change.

## What this is

**Callscade** — a cascade email-outreach SaaS for orchestra / event managers. The core
feature: send a ranked "cascade" of emails to substitute contacts — email contact #1,
wait for their response (or a deadline), and if no/declined, automatically advance to
contact #2, and so on, until a position is filled. Also supports "broadcast" mode (email
everyone at once). Managers compose messages, manage contacts, use templates, and track
responses.

- **Live at:** https://callscade.com (Vercel). Private beta — public signups disabled.
- **Repo:** https://github.com/leemalaimare-hub/orchestra-app
- **Git identity required** (Vercel rejects mismatched authors):
  `git config user.email "lee.malaimare@gmail.com"`

## Stack

- **Next.js 14.2** (App Router, `'use client'` where needed). Note: Next 14, so `cookies()` is sync.
- **Supabase** — Postgres + RLS + Auth. Project ref `lrweslgsnxwgtwlbeara`.
- **Auth: `@supabase/ssr`** (browser + server + middleware). See Auth section — this was
  hard-won; do not revert to `@supabase/auth-helpers-nextjs` (deprecated, crashes in prod).
- **Stripe** (billing, TEST mode currently), **Resend** (transactional + auth SMTP),
  **Gmail/Outlook/SMTP** (sending), **PostHog** (analytics), **Tiptap** (rich text editor).

## Repo layout

- `app/` — routes. Key areas: `app/auth/*`, `app/dashboard/*` (email/compose, drafts, sent,
  view, templates, musicians, groups, settings), `app/api/*`.
- `lib/` — `supabase.ts` (browser client), `supabase-server.ts` (server + admin clients),
  `auth.ts` (getCurrentManager/requireManager), `sendEngine.ts` (cascade logic), `usage.ts`,
  `plans.ts`, `dashboardStats.ts`, `resend.ts`, `analytics.ts`.
- `components/`, `hooks/`, `types/`, `supabase/migrations/` (001–016), `scripts/`.

## Auth architecture (IMPORTANT — read before touching auth)

All three clients use `@supabase/ssr`:
- `lib/supabase.ts` → `createBrowserClient` (handles chunked cookies automatically).
- `lib/supabase-server.ts` → `createServerClient` with `cookies()` getAll/setAll adapter;
  plus `createAdminClient` (service role, bypasses RLS).
- `middleware.ts` → `createServerClient` + `getUser()` to validate/refresh session.
  Matcher only `/dashboard` + `/onboarding`.
- Login (`app/auth/login/page.tsx`) MUST have a `try/catch` (not just `finally`) — a missing
  catch once swallowed every error silently. After sign-in use `window.location.href` (full
  reload) so the cookie is sent on the next request.

**Why this matters:** the original single-cookie storage broke because the JWT session (~3–4KB)
exceeded the 4KB browser cookie limit when URL-encoded → cookie dropped → redirect loop /
silent login failure. `@supabase/ssr` chunks cookies and fixes it.

`@supabase/auth-helpers-nextjs` is still in package.json but unused — safe to `npm uninstall` later.

## Local dev setup (new machine)

1. `git clone https://github.com/leemalaimare-hub/orchestra-app.git && cd orchestra-app`
2. `npm install --legacy-peer-deps`  ← the flag matters (needed for @supabase/ssr peer deps)
3. Recreate `.env.local` (gitignored — copy from password manager or pull from dashboards).
4. `git config user.email "lee.malaimare@gmail.com"`
5. `npm run dev` → http://localhost:3000
- Scripts: `dev`, `build`, `start`, `lint`. Type-check with `npx tsc --noEmit`.

## Environment variables

`.env.local` is gitignored (correct). EVERY var must ALSO be set in **Vercel → Settings →
Environment Variables**, then redeploy. Required set:
- `NEXT_PUBLIC_SUPABASE_URL` = https://lrweslgsnxwgtwlbeara.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase migrated to publishable/secret keys; the new
  `sb_secret_...` **Secret key** is the service_role replacement — use that)
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, 4× Stripe price IDs,
  `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` (`Callscade <noreply@callscade.com>`)
- `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL` (= https://callscade.com in prod, localhost in dev)
- `CRON_SECRET` (Bearer token protecting the cron routes)

**#1 debugging rule:** "works locally, broken in prod" → suspect a missing/wrong Vercel env
var FIRST. Almost every production bug so far was exactly that, hidden by silent failures.

## Admin / accounts

- Admin user: `chambana5454@gmail.com` — role=admin, lifetime Pro plan (send_limit 999999).
- org_id: `c89f0d48-0fb8-4e2d-9d76-48539b310e99`
- Supabase Auth: Site URL = https://callscade.com; redirect URLs include
  `https://callscade.com/**`. Custom SMTP via Resend. Recovery email template links to
  `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`.
- Gmail OAuth working in prod (gmail.send scope; redirect URI
  https://callscade.com/api/auth/gmail/callback). Microsoft/Outlook OAuth not yet configured.

## Domain gotchas

- The `concerts` DB table + backend (`lib/sendEngine.ts`) still power cascades, even though
  the `/dashboard/concerts/*` UI was removed. "Concert" = an outreach/email campaign internally.
- UI terminology: use **"contact"**, not "musician/recipient" (DB tables may still say `musicians`).
- One-off compose templates are hidden from the Templates list (name prefix `[Compose] `).

## Migrations

`supabase/migrations/001`–`017` applied. Latest: 015 (nullable deadline), 016 (one-off
templates), 017 (pg_cron jobs — see Cron section; the repo file has a `<CRON_SECRET>`
placeholder, the applied version had the real secret substituted). Apply new migrations in
the Supabase SQL editor.

## Cron jobs (pg_cron)

Set up 2026-07-09 via Supabase pg_cron + pg_net (migration 017). Two jobs call the prod
endpoints with `Authorization: Bearer CRON_SECRET`:
- `check-deadlines` — every 15 min → `/api/cron/check-deadlines` (advances stuck cascades).
- `reset-billing` — daily 02:10 UTC → `/api/cron/reset-billing` (only touches orgs whose
  `billing_period_end` has passed, so daily is safe and handles rolling anniversaries).
`CRON_SECRET` is set in Vercel (matches `.env.local`); both endpoints verified returning 200.
Inspect: `select jobname, schedule, active from cron.job;` and recent results via
`select status, (response).status_code, created from net._http_response order by created desc;`
**Caveat:** the Supabase project is on the free tier — it auto-pauses after ~1 week of
inactivity, which stops the DB *and* these cron jobs (cascades stop advancing). Upgrade to
Pro or keep the project active.

## Remaining / TODO

- [x] **Cron jobs** — DONE 2026-07-09 via Supabase pg_cron (see Cron jobs section).
- [ ] **Supabase free-tier auto-pause** — paused project = dead app + dead crons. Decide:
      upgrade to Pro, or accept the risk during quiet beta periods.
- [ ] **Backups** — free tier has none; before real customers, Pro (daily backups) or
      periodic manual `pg_dump`.
- [ ] **Stripe** end-to-end test (checkout/webhook/plan-change); still in TEST mode — switch to
      LIVE before real customers.
- [ ] Audit that ALL env vars are present in Vercel.
- [ ] Confirm `ENCRYPTION_KEY` backed up.
- [ ] `npm uninstall @supabase/auth-helpers-nextjs` (unused).
- [ ] Microsoft/Outlook OAuth.

## Cross-machine workflow

- Code syncs via Git only. Do NOT put the project folder in iCloud/Dropbox/Drive (corrupts
  `.git`/`node_modules`).
- Always `git pull` before starting, `git push` when done.
- Chat transcripts are NOT synced (by choice) — this CLAUDE.md is the durable cross-machine
  context instead.

## Error boundaries

- `app/error.tsx` = parent boundary ("contact support" copy). Catches errors thrown in
  `app/dashboard/layout.tsx` (e.g. getCurrentManager).
- `app/dashboard/error.tsx` = catches errors in dashboard pages/children.
- Debug trick for stripped prod server errors: temporarily wrap the throwing server component
  in try/catch and render the message inline (re-throw NEXT_REDIRECT/NEXT_NOT_FOUND digests).
