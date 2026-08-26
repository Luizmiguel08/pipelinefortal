CREATE TABLE public.agenda_appointments (
  id text PRIMARY KEY,
  cliente_nome text NOT NULL,
  cliente_telefone text,
  corretor_nome text,
  corretor_email text,
  empreendimento text,
  visita_em timestamptz,
  status text NOT NULL CHECK (status IN ('agendado', 'realizado', 'desmarcado')),
  motivo text,
  agenda_atualizado_em timestamptz,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  encontrado_c2s boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agenda_appointments TO authenticated;
GRANT ALL ON public.agenda_appointments TO service_role;
ALTER TABLE public.agenda_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_appointments_select_gestor"
ON public.agenda_appointments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "agenda_appointments_select_corretor"
ON public.agenda_appointments FOR SELECT TO authenticated
USING (public.is_my_corretor(corretor_id));
CREATE INDEX agenda_appointments_status_visita_idx ON public.agenda_appointments(status, visita_em);
CREATE INDEX agenda_appointments_corretor_idx ON public.agenda_appointments(corretor_id);
CREATE INDEX agenda_appointments_lead_idx ON public.agenda_appointments(lead_id);
CREATE TRIGGER agenda_appointments_touch
BEFORE UPDATE ON public.agenda_appointments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.agenda_sync_runs
  ADD COLUMN vinculados_c2s integer NOT NULL DEFAULT 0,
  ADD COLUMN nao_encontrados_c2s integer NOT NULL DEFAULT 0,
  ADD COLUMN corretores_nao_reconhecidos integer NOT NULL DEFAULT 0;