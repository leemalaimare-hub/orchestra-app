-- 017: Schedule cron jobs via pg_cron + pg_net.
-- pg_cron runs the schedule inside Postgres; pg_net makes the HTTP call to the
-- deployed app. Both endpoints require the CRON_SECRET bearer token.
--
-- IMPORTANT: Do NOT run this file verbatim. Replace <CRON_SECRET> with the real
-- value (from .env.local / Vercel env) before pasting into the Supabase SQL editor.
-- The secret is intentionally not committed to git.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-runnable: drop existing jobs with these names first.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('check-deadlines', 'reset-billing');
end $$;

-- Advance stuck cascades whose response deadline passed. Every 15 minutes.
select cron.schedule(
  'check-deadlines',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://callscade.com/api/cron/check-deadlines',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Reset billing periods + charge overages. Daily at 02:10 UTC — the route only
-- acts on orgs whose billing_period_end has passed, so a daily sweep handles
-- per-org anniversary dates correctly (a monthly 1st-of-month run would not).
select cron.schedule(
  'reset-billing',
  '10 2 * * *',
  $$
  select net.http_get(
    url := 'https://callscade.com/api/cron/reset-billing',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
