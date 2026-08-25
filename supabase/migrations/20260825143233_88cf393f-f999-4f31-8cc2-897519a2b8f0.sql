ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'dia1';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'dia2';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'dia3';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'lista_fria';

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_since timestamp with time zone NOT NULL DEFAULT now();
UPDATE public.leads SET stage_since = COALESCE(updated_at, created_at);

CREATE OR REPLACE FUNCTION public.set_stage_since()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_since = now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS leads_stage_since ON public.leads;
CREATE TRIGGER leads_stage_since BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_stage_since();

CREATE OR REPLACE FUNCTION public.escalate_stale_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  passo record;
BEGIN
  FOR passo IN
    SELECT * FROM (VALUES
      ('atendimento','dia1'),
      ('dia1','dia2'),
      ('dia2','dia3'),
      ('dia3','lista_fria')
    ) AS t(de, para)
  LOOP
    EXECUTE format(
      'UPDATE public.leads SET stage = %L::public.lead_stage
       WHERE stage = %L::public.lead_stage
         AND GREATEST(stage_since, COALESCE(ultima_interacao, stage_since)) < now() - interval ''1 day''',
      passo.para, passo.de);
  END LOOP;
END; $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('escalate-stale-leads') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escalate-stale-leads');
SELECT cron.schedule('escalate-stale-leads', '*/10 * * * *', $$SELECT public.escalate_stale_leads();$$);