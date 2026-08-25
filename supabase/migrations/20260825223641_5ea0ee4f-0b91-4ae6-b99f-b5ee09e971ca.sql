CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('agenda-sync-minuto') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'agenda-sync-minuto'
);

SELECT cron.schedule(
  'agenda-sync-minuto',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--423b02de-c88b-46ea-881a-f33ddd0383ed.lovable.app/api/public/hooks/agenda-sync',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_V52Ot5YJoGs01FYJ6LH_Eg_18PaTq5r"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);