CREATE INDEX IF NOT EXISTS idx_leads_data_c2s ON public.leads (data_c2s DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_corretor_stage ON public.leads (corretor_id, stage);
CREATE INDEX IF NOT EXISTS idx_agenda_appointments_criado_em ON public.agenda_appointments (agenda_criado_em DESC);