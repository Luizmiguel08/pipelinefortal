ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'visita_realizada';

CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT RIGHT(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g'), 11);
$$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agenda_appointment_id text,
  ADD COLUMN IF NOT EXISTS visita_status text,
  ADD COLUMN IF NOT EXISTS visita_motivo text,
  ADD COLUMN IF NOT EXISTS visita_projeto text,
  ADD COLUMN IF NOT EXISTS agenda_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS leads_agenda_appointment_idx
  ON public.leads (agenda_appointment_id) WHERE agenda_appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_phone_norm_idx
  ON public.leads (public.normalize_phone(telefone));

CREATE TABLE IF NOT EXISTS public.agenda_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'sucesso',
  origem text NOT NULL DEFAULT 'manual',
  total integer NOT NULL DEFAULT 0,
  criados integer NOT NULL DEFAULT 0,
  atualizados integer NOT NULL DEFAULT 0,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agenda_sync_runs TO authenticated;
GRANT ALL ON public.agenda_sync_runs TO service_role;

ALTER TABLE public.agenda_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY agenda_sync_runs_select_gestor ON public.agenda_sync_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::public.app_role));