CREATE OR REPLACE FUNCTION public.valor_projeto(_imovel text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH n AS (
    SELECT btrim(regexp_replace(upper(translate(coalesce(_imovel,''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^A-Z0-9]+', ' ', 'g')) AS v
  )
  SELECT CASE
    WHEN (SELECT v FROM n) = '' THEN NULL
    WHEN (SELECT v FROM n) LIKE '%RMKT GUILHERMINA%' THEN 178000
    WHEN (SELECT v FROM n) LIKE '%RAJ MENDES%' OR (SELECT v FROM n) LIKE '%ON MENDES%' OR (SELECT v FROM n) LIKE '%MENDES%' THEN 178000
    WHEN (SELECT v FROM n) LIKE '%RAJ PENHA%' OR (SELECT v FROM n) LIKE '%ON PENHA%' OR (SELECT v FROM n) LIKE '%PENHA%' THEN 159000
    WHEN (SELECT v FROM n) LIKE '%RAJ HOME%' THEN 136000
    WHEN (SELECT v FROM n) LIKE '%GUILHERMINA SP%' THEN 178000
    WHEN (SELECT v FROM n) LIKE '%GUILHERMINA BR%' OR (SELECT v FROM n) LIKE '%RAJ GUILHERMINA%' OR (SELECT v FROM n) LIKE '%GUILHERMINA%' THEN 178000
    WHEN (SELECT v FROM n) LIKE '%VERTICE%' THEN 211000
    WHEN (SELECT v FROM n) LIKE '%CONSOLACAO%' THEN 190000
    WHEN (SELECT v FROM n) LIKE '%FORMULARIO R II%' THEN 136000
    WHEN (SELECT v FROM n) IN ('RAJ','RAJ 1','RAJ 2') THEN 136000
    ELSE NULL
  END::numeric;
$$;

GRANT EXECUTE ON FUNCTION public.valor_projeto(text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.board_cards AS
 SELECT l.id::text AS id,
    l.id AS lead_id,
    l.nome, l.telefone, l.email, l.imovel,
    CASE WHEN COALESCE(l.valor,0) > 0 THEN l.valor ELSE COALESCE(public.valor_projeto(l.imovel), 0) END AS valor,
    l.entrada,
    l.stage::text AS stage,
    l.corretor_id, l.origem, l.observacoes, l.ultima_interacao,
    COALESCE(l.data_c2s, l.created_at) AS data_entrada,
    l.data_c2s, l.created_at, l.stage_since, l.finalidade, l.estagio_imovel,
    l.documentacao_ok, l.visita_em, l.visita_realizada, l.visita_status,
    l.visita_motivo, l.visita_projeto, l.c2s_contact_id,
    false AS agenda_record,
    false AS encontrado_c2s,
    NULL::text AS corretor_agenda_nome,
    l.updated_at AS ordem
   FROM leads l
  WHERE (l.stage <> ALL (ARRAY['visita'::lead_stage, 'visita_realizada'::lead_stage]))
    AND NOT (EXISTS (SELECT 1 FROM agenda_appointments a WHERE a.lead_id = l.id))
UNION ALL
 SELECT ('agenda:'::text || a.id) || ':agendado'::text AS id,
    NULL::uuid AS lead_id,
    a.cliente_nome AS nome, a.cliente_telefone AS telefone,
    NULL::text AS email, a.empreendimento AS imovel,
    CASE WHEN COALESCE(al.valor,0) > 0 THEN al.valor
         ELSE COALESCE(public.valor_projeto(a.empreendimento), 0) END AS valor,
    COALESCE(al.entrada, 0::numeric) AS entrada,
    'visita'::text AS stage,
    a.corretor_id,
    'Agenda'::text AS origem,
    a.motivo AS observacoes,
    COALESCE(a.agenda_atualizado_em, a.visita_em) AS ultima_interacao,
    COALESCE(a.agenda_criado_em, a.created_at) AS data_entrada,
    COALESCE(a.agenda_criado_em, a.created_at) AS data_c2s,
    a.created_at,
    COALESCE(a.agenda_atualizado_em, a.created_at) AS stage_since,
    al.finalidade, al.estagio_imovel,
    COALESCE(al.documentacao_ok, false) AS documentacao_ok,
    a.visita_em,
    a.status = 'realizado'::text AS visita_realizada,
    a.status AS visita_status, a.motivo AS visita_motivo,
    a.empreendimento AS visita_projeto,
    a.lead_id::text AS c2s_contact_id,
    true AS agenda_record, a.encontrado_c2s,
    a.corretor_nome AS corretor_agenda_nome,
    a.visita_em AS ordem
   FROM agenda_appointments a
   LEFT JOIN leads al ON al.id = a.lead_id
UNION ALL
 SELECT ('agenda:'::text || a.id) || ':realizado'::text AS id,
    NULL::uuid AS lead_id,
    a.cliente_nome AS nome, a.cliente_telefone AS telefone,
    NULL::text AS email, a.empreendimento AS imovel,
    CASE WHEN COALESCE(al.valor,0) > 0 THEN al.valor
         ELSE COALESCE(public.valor_projeto(a.empreendimento), 0) END AS valor,
    COALESCE(al.entrada, 0::numeric) AS entrada,
    'visita_realizada'::text AS stage,
    a.corretor_id,
    'Agenda'::text AS origem,
    a.motivo AS observacoes,
    COALESCE(a.agenda_atualizado_em, a.visita_em) AS ultima_interacao,
    COALESCE(a.visita_em, a.agenda_atualizado_em, a.created_at) AS data_entrada,
    COALESCE(a.visita_em, a.agenda_atualizado_em, a.created_at) AS data_c2s,
    a.created_at,
    COALESCE(a.agenda_atualizado_em, a.created_at) AS stage_since,
    al.finalidade, al.estagio_imovel,
    COALESCE(al.documentacao_ok, false) AS documentacao_ok,
    a.visita_em,
    true AS visita_realizada,
    a.status AS visita_status, a.motivo AS visita_motivo,
    a.empreendimento AS visita_projeto,
    a.lead_id::text AS c2s_contact_id,
    true AS agenda_record, a.encontrado_c2s,
    a.corretor_nome AS corretor_agenda_nome,
    a.visita_em AS ordem
   FROM agenda_appointments a
   LEFT JOIN leads al ON al.id = a.lead_id
  WHERE a.status = 'realizado'::text;