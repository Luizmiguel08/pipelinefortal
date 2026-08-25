CREATE TYPE public.call_period AS ENUM ('manha','tarde');
CREATE TYPE public.call_outcome AS ENUM ('atendeu','nao_atendeu','caixa_postal','numero_invalido','whatsapp');

CREATE TABLE public.lead_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  called_at timestamptz NOT NULL DEFAULT now(),
  periodo public.call_period NOT NULL,
  resultado public.call_outcome NOT NULL DEFAULT 'nao_atendeu',
  interessado boolean,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.lead_calls TO authenticated;
GRANT ALL ON public.lead_calls TO service_role;

ALTER TABLE public.lead_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_calls_select ON public.lead_calls FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR public.owns_lead(lead_id));

CREATE POLICY lead_calls_insert ON public.lead_calls FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor') OR public.owns_lead(lead_id));

CREATE POLICY lead_calls_update ON public.lead_calls FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'gestor') OR created_by = auth.uid());

CREATE INDEX lead_calls_lead_idx ON public.lead_calls (lead_id, called_at DESC);
CREATE INDEX lead_calls_called_at_idx ON public.lead_calls (called_at DESC);

CREATE TRIGGER lead_calls_touch BEFORE UPDATE ON public.lead_calls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.touch_lead_on_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
     SET ultima_interacao = GREATEST(COALESCE(ultima_interacao, NEW.called_at), NEW.called_at)
   WHERE id = NEW.lead_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER lead_calls_touch_lead AFTER INSERT ON public.lead_calls
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_on_call();

ALTER TABLE public.lead_calls REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_calls;