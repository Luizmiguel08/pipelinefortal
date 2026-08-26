CREATE INDEX IF NOT EXISTS idx_leads_updated_at_desc ON public.leads (updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads (stage);
CREATE INDEX IF NOT EXISTS idx_leads_corretor_id ON public.leads (corretor_id);
CREATE INDEX IF NOT EXISTS idx_agenda_appointments_visita_em_desc ON public.agenda_appointments (visita_em DESC, id);
ANALYZE public.leads;
ANALYZE public.agenda_appointments;