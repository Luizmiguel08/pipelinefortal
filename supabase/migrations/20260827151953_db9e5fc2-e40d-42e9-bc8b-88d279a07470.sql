CREATE TABLE public.lead_stage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage public.lead_stage NOT NULL,
  canal text NOT NULL DEFAULT 'slack',
  enviado_em timestamptz NOT NULL DEFAULT now(),
  erro text,
  UNIQUE (lead_id, stage)
);

GRANT SELECT ON public.lead_stage_alerts TO authenticated;
GRANT ALL ON public.lead_stage_alerts TO service_role;

ALTER TABLE public.lead_stage_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores veem os avisos enviados"
ON public.lead_stage_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

SELECT cron.schedule(
  'notificar-escalonamento',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--423b02de-c88b-46ea-881a-f33ddd0383ed.lovable.app/api/public/hooks/escalation-notify',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_V52Ot5YJoGs01FYJ6LH_Eg_18PaTq5r"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);