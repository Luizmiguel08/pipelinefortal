CREATE OR REPLACE FUNCTION public.escalate_stale_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Automação de escalonamento desativada: leads permanecem na coluna
  -- (nao_respondeu, dia1, dia2, dia3) até movimentação manual do corretor.
  RETURN;
END;
$$;