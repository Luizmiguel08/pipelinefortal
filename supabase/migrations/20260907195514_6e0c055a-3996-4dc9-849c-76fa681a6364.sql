CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_leads_nome_trgm ON public.leads USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_imovel_trgm ON public.leads USING gin (imovel gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_email_trgm ON public.leads USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_telefone_trgm ON public.leads USING gin (telefone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_stage_data ON public.leads (stage, data_c2s DESC);
CREATE INDEX IF NOT EXISTS idx_agenda_corretor ON public.agenda_appointments (corretor_id, agenda_criado_em DESC);