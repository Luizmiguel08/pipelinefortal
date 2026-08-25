ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'visita';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS visita_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS visita_realizada boolean NOT NULL DEFAULT false;