CREATE OR REPLACE FUNCTION public.board_resumo_corretor(
  p_corretor uuid DEFAULT NULL,
  p_inicio timestamptz DEFAULT NULL,
  p_fim timestamptz DEFAULT NULL,
  p_busca text DEFAULT NULL
)
RETURNS TABLE (corretor_id uuid, total bigint, soma numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.corretor_id, count(*)::bigint, COALESCE(sum(b.valor), 0)::numeric
  FROM public.board_cards b
  WHERE (p_corretor IS NULL OR b.corretor_id = p_corretor)
    AND (p_inicio IS NULL OR b.data_entrada >= p_inicio)
    AND (p_fim IS NULL OR b.data_entrada <= p_fim)
    AND (
      p_busca IS NULL OR p_busca = ''
      OR b.nome ILIKE '%' || p_busca || '%'
      OR COALESCE(b.imovel, '') ILIKE '%' || p_busca || '%'
      OR COALESCE(b.email, '') ILIKE '%' || p_busca || '%'
      OR COALESCE(b.telefone, '') ILIKE '%' || p_busca || '%'
    )
  GROUP BY b.corretor_id;
$$;

GRANT EXECUTE ON FUNCTION public.board_resumo_corretor(uuid, timestamptz, timestamptz, text) TO authenticated;