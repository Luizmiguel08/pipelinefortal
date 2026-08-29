CREATE OR REPLACE FUNCTION public.atividade_corretores(p_dias integer DEFAULT 7)
RETURNS TABLE(
  corretor_id uuid,
  nome text,
  ativo boolean,
  movimentacoes bigint,
  manuais bigint,
  automaticas bigint,
  hoje bigint,
  ultima_movimentacao timestamptz,
  ultima_edicao timestamptz,
  leads_total bigint,
  leads_qualificados bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH janela AS (
    SELECT now() - (GREATEST(LEAST(p_dias, 90), 1) || ' days')::interval AS desde
  ),
  ev AS (
    SELECT l.corretor_id,
           count(*)::bigint AS movimentacoes,
           count(*) FILTER (WHERE e.para NOT IN ('nao_respondeu','dia1','dia2','dia3','lista_fria'))::bigint AS manuais,
           count(*) FILTER (WHERE e.para IN ('nao_respondeu','dia1','dia2','dia3','lista_fria'))::bigint AS automaticas,
           count(*) FILTER (WHERE e.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')::bigint AS hoje,
           max(e.created_at) AS ultima_movimentacao
    FROM public.lead_events e
    JOIN public.leads l ON l.id = e.lead_id
    CROSS JOIN janela j
    WHERE e.created_at >= j.desde
    GROUP BY l.corretor_id
  ),
  ld AS (
    SELECT l.corretor_id,
           count(*)::bigint AS leads_total,
           count(*) FILTER (
             WHERE l.valor > 0 OR l.entrada > 0 OR l.finalidade IS NOT NULL
                OR l.estagio_imovel IS NOT NULL OR l.documentacao_ok
           )::bigint AS leads_qualificados,
           max(l.updated_at) AS ultima_edicao
    FROM public.leads l
    GROUP BY l.corretor_id
  )
  SELECT c.id, c.nome, c.ativo,
         COALESCE(ev.movimentacoes, 0),
         COALESCE(ev.manuais, 0),
         COALESCE(ev.automaticas, 0),
         COALESCE(ev.hoje, 0),
         ev.ultima_movimentacao,
         ld.ultima_edicao,
         COALESCE(ld.leads_total, 0),
         COALESCE(ld.leads_qualificados, 0)
  FROM public.corretores c
  LEFT JOIN ev ON ev.corretor_id = c.id
  LEFT JOIN ld ON ld.corretor_id = c.id
  ORDER BY COALESCE(ev.movimentacoes, 0) DESC, c.nome;
$$;

CREATE OR REPLACE FUNCTION public.atividade_eventos(
  p_dias integer DEFAULT 7,
  p_corretor uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  lead_id uuid,
  lead_nome text,
  corretor_id uuid,
  corretor_nome text,
  de text,
  para text,
  automatico boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT e.id, e.created_at, l.id, l.nome, c.id, c.nome,
         e.de::text, e.para::text,
         (e.para IN ('nao_respondeu','dia1','dia2','dia3','lista_fria')) AS automatico
  FROM public.lead_events e
  JOIN public.leads l ON l.id = e.lead_id
  LEFT JOIN public.corretores c ON c.id = l.corretor_id
  WHERE e.created_at >= now() - (GREATEST(LEAST(p_dias, 90), 1) || ' days')::interval
    AND (p_corretor IS NULL OR l.corretor_id = p_corretor)
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.atividade_corretores(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atividade_eventos(integer, uuid, integer) TO authenticated;

CREATE INDEX IF NOT EXISTS lead_events_created_at_idx ON public.lead_events (created_at DESC);