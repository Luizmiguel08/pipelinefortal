ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS entrada numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finalidade text,
  ADD COLUMN IF NOT EXISTS estagio_imovel text,
  ADD COLUMN IF NOT EXISTS documentacao_ok boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_lead_extra_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.finalidade IS NOT NULL AND NEW.finalidade NOT IN ('moradia','investimento') THEN
    RAISE EXCEPTION 'finalidade inválida: %', NEW.finalidade;
  END IF;
  IF NEW.estagio_imovel IS NOT NULL AND NEW.estagio_imovel NOT IN ('pronto','planta') THEN
    RAISE EXCEPTION 'estagio_imovel inválido: %', NEW.estagio_imovel;
  END IF;
  IF NEW.documentacao_ok IS TRUE AND NEW.stage NOT IN ('documentacao','fechamento') THEN
    NEW.stage := 'documentacao';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS leads_validate_extra ON public.leads;
CREATE TRIGGER leads_validate_extra
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.validate_lead_extra_fields();