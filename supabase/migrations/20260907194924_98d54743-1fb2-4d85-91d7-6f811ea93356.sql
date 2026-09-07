REVOKE ALL ON FUNCTION public.log_lead_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_valor_projeto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_lead_audit() TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_valor_projeto() TO service_role;

CREATE OR REPLACE FUNCTION public.precos_projetos_rebuild_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $t$
BEGIN
  PERFORM public.rebuild_valor_projeto();
  RETURN NULL;
END;
$t$;

REVOKE ALL ON FUNCTION public.precos_projetos_rebuild_trg() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.precos_projetos_rebuild_trg() TO service_role;

DROP TRIGGER IF EXISTS precos_projetos_rebuild ON public.precos_projetos;
CREATE TRIGGER precos_projetos_rebuild
  AFTER INSERT OR UPDATE OR DELETE ON public.precos_projetos
  FOR EACH STATEMENT EXECUTE FUNCTION public.precos_projetos_rebuild_trg();