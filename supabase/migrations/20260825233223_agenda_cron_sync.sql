-- Agenda de visitas: sincroniza a cada 1 minuto via pg_cron
-- (idêntico ao padrão já usado pelo C2S sync)
SELECT cron.schedule(
  'agenda-sync-every-minute',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.service_url') || '/api/public/hooks/agenda-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', current_setting('app.settings.anon_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
