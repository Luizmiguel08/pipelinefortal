CREATE OR REPLACE VIEW public.board_cards
WITH (security_invoker = true) AS
SELECT
  l.id::text AS id,
  l.id AS lead_id,
  l.nome,
  l.telefone,
  l.email,
  l.imovel,
  l.valor,
  l.entrada,
  l.stage::text AS stage,
  l.corretor_id,
  l.origem,
  l.observacoes,
  l.ultima_interacao,
  COALESCE(l.data_c2s, l.created_at) AS data_entrada,
  l.data_c2s,
  l.created_at,
  l.stage_since,
  l.finalidade,
  l.estagio_imovel,
  l.documentacao_ok,
  l.visita_em,
  l.visita_realizada,
  l.visita_status,
  l.visita_motivo,
  l.visita_projeto,
  l.c2s_contact_id,
  false AS agenda_record,
  false AS encontrado_c2s,
  NULL::text AS corretor_agenda_nome,
  l.updated_at AS ordem
FROM public.leads l
WHERE l.stage NOT IN ('visita'::lead_stage, 'visita_realizada'::lead_stage)

UNION ALL

SELECT
  'agenda:' || a.id || ':agendado' AS id,
  NULL::uuid AS lead_id,
  a.cliente_nome AS nome,
  a.cliente_telefone AS telefone,
  NULL::text AS email,
  a.empreendimento AS imovel,
  0::numeric AS valor,
  0::numeric AS entrada,
  'visita' AS stage,
  a.corretor_id,
  'Agenda' AS origem,
  a.motivo AS observacoes,
  COALESCE(a.agenda_atualizado_em, a.visita_em) AS ultima_interacao,
  COALESCE(a.agenda_criado_em, a.created_at) AS data_entrada,
  COALESCE(a.agenda_criado_em, a.created_at) AS data_c2s,
  a.created_at,
  COALESCE(a.agenda_atualizado_em, a.created_at) AS stage_since,
  NULL::text AS finalidade,
  NULL::text AS estagio_imovel,
  false AS documentacao_ok,
  a.visita_em,
  (a.status = 'realizado') AS visita_realizada,
  a.status AS visita_status,
  a.motivo AS visita_motivo,
  a.empreendimento AS visita_projeto,
  a.lead_id::text AS c2s_contact_id,
  true AS agenda_record,
  a.encontrado_c2s,
  a.corretor_nome AS corretor_agenda_nome,
  a.visita_em AS ordem
FROM public.agenda_appointments a

UNION ALL

SELECT
  'agenda:' || a.id || ':realizado' AS id,
  NULL::uuid AS lead_id,
  a.cliente_nome,
  a.cliente_telefone,
  NULL::text,
  a.empreendimento,
  0::numeric,
  0::numeric,
  'visita_realizada' AS stage,
  a.corretor_id,
  'Agenda',
  a.motivo,
  COALESCE(a.agenda_atualizado_em, a.visita_em),
  COALESCE(a.visita_em, a.agenda_atualizado_em, a.created_at) AS data_entrada,
  COALESCE(a.visita_em, a.agenda_atualizado_em, a.created_at) AS data_c2s,
  a.created_at,
  COALESCE(a.agenda_atualizado_em, a.created_at),
  NULL::text,
  NULL::text,
  false,
  a.visita_em,
  true,
  a.status,
  a.motivo,
  a.empreendimento,
  a.lead_id::text,
  true,
  a.encontrado_c2s,
  a.corretor_nome,
  a.visita_em
FROM public.agenda_appointments a
WHERE a.status = 'realizado';

GRANT SELECT ON public.board_cards TO authenticated;

CREATE OR REPLACE FUNCTION public.board_resumo(
  p_corretor uuid DEFAULT NULL,
  p_inicio timestamptz DEFAULT NULL,
  p_fim timestamptz DEFAULT NULL,
  p_busca text DEFAULT NULL
)
RETURNS TABLE (stage text, total bigint, soma numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.stage, count(*)::bigint, COALESCE(sum(b.valor), 0)::numeric
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
  GROUP BY b.stage;
$$;

GRANT EXECUTE ON FUNCTION public.board_resumo(uuid, timestamptz, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.board_cards_page(
  p_stage text,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_corretor uuid DEFAULT NULL,
  p_inicio timestamptz DEFAULT NULL,
  p_fim timestamptz DEFAULT NULL,
  p_busca text DEFAULT NULL
)
RETURNS SETOF public.board_cards
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.*
  FROM public.board_cards b
  WHERE b.stage = p_stage
    AND (p_corretor IS NULL OR b.corretor_id = p_corretor)
    AND (p_inicio IS NULL OR b.data_entrada >= p_inicio)
    AND (p_fim IS NULL OR b.data_entrada <= p_fim)
    AND (
      p_busca IS NULL OR p_busca = ''
      OR b.nome ILIKE '%' || p_busca || '%'
      OR COALESCE(b.imovel, '') ILIKE '%' || p_busca || '%'
      OR COALESCE(b.email, '') ILIKE '%' || p_busca || '%'
      OR COALESCE(b.telefone, '') ILIKE '%' || p_busca || '%'
    )
  ORDER BY b.ordem DESC NULLS LAST
  LIMIT LEAST(GREATEST(p_limit, 1), 200)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.board_cards_page(text, integer, integer, uuid, timestamptz, timestamptz, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_leads_data_entrada ON public.leads ((COALESCE(data_c2s, created_at)));
CREATE INDEX IF NOT EXISTS idx_leads_stage_updated ON public.leads (stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agenda_status_visita ON public.agenda_appointments (status, visita_em DESC);