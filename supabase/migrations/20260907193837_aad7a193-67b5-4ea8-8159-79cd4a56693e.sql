DROP FUNCTION IF EXISTS public.desempenho_corretores(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.desempenho_corretores(
  p_inicio timestamptz DEFAULT NULL,
  p_fim timestamptz DEFAULT NULL
)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  ativo boolean,
  leads_total bigint,
  valor_total numeric,
  por_stage jsonb,
  sem_telefone bigint,
  sem_valor bigint,
  sem_entrada bigint,
  sem_finalidade bigint,
  sem_estagio_imovel bigint,
  sem_nenhum_indicador bigint,
  ultima_atualizacao timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH escopo AS (
    SELECT l.*,
           COALESCE(NULLIF(l.valor, 0), public.valor_projeto(l.imovel), 0) AS valor_efetivo
    FROM public.leads l
    WHERE (p_inicio IS NULL OR COALESCE(l.data_c2s, l.created_at) >= p_inicio)
      AND (p_fim IS NULL OR COALESCE(l.data_c2s, l.created_at) < p_fim)
  )
  SELECT
    c.id,
    c.nome,
    c.ativo,
    COUNT(e.id)::bigint,
    COALESCE(SUM(e.valor_efetivo), 0)::numeric,
    COALESCE(
      (SELECT jsonb_object_agg(x.stage, x.total)
       FROM (SELECT e2.stage::text AS stage, COUNT(*)::bigint AS total
             FROM escopo e2 WHERE e2.corretor_id = c.id GROUP BY e2.stage) x),
      '{}'::jsonb
    ),
    COUNT(*) FILTER (WHERE e.id IS NOT NULL AND COALESCE(e.telefone, '') = '')::bigint,
    COUNT(*) FILTER (WHERE e.id IS NOT NULL AND COALESCE(e.valor_efetivo, 0) = 0)::bigint,
    COUNT(*) FILTER (WHERE e.id IS NOT NULL AND COALESCE(e.entrada, 0) = 0)::bigint,
    COUNT(*) FILTER (WHERE e.id IS NOT NULL AND COALESCE(e.finalidade, '') = '')::bigint,
    COUNT(*) FILTER (WHERE e.id IS NOT NULL AND COALESCE(e.estagio_imovel, '') = '')::bigint,
    COUNT(*) FILTER (
      WHERE e.id IS NOT NULL
        AND COALESCE(e.entrada, 0) = 0
        AND COALESCE(e.finalidade, '') = ''
        AND COALESCE(e.estagio_imovel, '') = ''
        AND e.documentacao_ok IS NOT TRUE
    )::bigint,
    MAX(e.updated_at)
  FROM public.corretores c
  LEFT JOIN escopo e ON e.corretor_id = c.id
  GROUP BY c.id, c.nome, c.ativo
  ORDER BY COUNT(e.id) DESC, c.nome;
$$;

REVOKE ALL ON FUNCTION public.desempenho_corretores(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desempenho_corretores(timestamptz, timestamptz) TO authenticated;