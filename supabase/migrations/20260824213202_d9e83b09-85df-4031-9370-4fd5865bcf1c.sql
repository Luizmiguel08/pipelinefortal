SELECT cron.unschedule('c2s-sync-minuto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'c2s-sync-minuto');

DROP EXTENSION IF EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'c2s-sync-minuto',
  '* * * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://project--423b02de-c88b-46ea-881a-f33ddd0383ed-dev.lovable.app/api/public/hooks/c2s-sync',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_V52Ot5YJoGs01FYJ6LH_Eg_18PaTq5r"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);