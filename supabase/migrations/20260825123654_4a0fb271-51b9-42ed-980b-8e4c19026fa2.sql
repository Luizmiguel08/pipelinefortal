ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS data_c2s timestamptz;
CREATE INDEX IF NOT EXISTS leads_data_c2s_idx ON public.leads (data_c2s);