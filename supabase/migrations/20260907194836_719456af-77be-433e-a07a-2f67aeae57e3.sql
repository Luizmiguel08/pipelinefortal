-- 1. Telefone normalizado
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS telefone_norm text
  GENERATED ALWAYS AS (NULLIF(right(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), 8), '')) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_telefone_norm ON public.leads (telefone_norm);

ALTER TABLE public.agenda_appointments
  ADD COLUMN IF NOT EXISTS telefone_norm text
  GENERATED ALWAYS AS (NULLIF(right(regexp_replace(coalesce(cliente_telefone,''), '\D', '', 'g'), 8), '')) STORED;

CREATE INDEX IF NOT EXISTS idx_agenda_telefone_norm ON public.agenda_appointments (telefone_norm);

-- 2. Tabela de preços por projeto
CREATE TABLE IF NOT EXISTS public.precos_projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto text NOT NULL,
  padroes text[] NOT NULL DEFAULT '{}',
  exato boolean NOT NULL DEFAULT false,
  valor numeric NOT NULL DEFAULT 0,
  ordem integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.precos_projetos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.precos_projetos TO authenticated;
GRANT ALL ON public.precos_projetos TO service_role;

ALTER TABLE public.precos_projetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY precos_select ON public.precos_projetos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY precos_insert_gestor ON public.precos_projetos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY precos_update_gestor ON public.precos_projetos
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY precos_delete_gestor ON public.precos_projetos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER precos_projetos_touch BEFORE UPDATE ON public.precos_projetos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.precos_projetos (projeto, padroes, exato, valor, ordem)
VALUES
  ('RMKT - Guilhermina', ARRAY['RMKT GUILHERMINA'], false, 178000, 10),
  ('RAJ Mendes', ARRAY['RAJ MENDES','ON MENDES','MENDES'], false, 178000, 20),
  ('RAJ Penha', ARRAY['RAJ PENHA','ON PENHA','PENHA'], false, 159000, 30),
  ('Raj Home', ARRAY['RAJ HOME'], false, 136000, 40),
  ('Guilhermina - SP', ARRAY['GUILHERMINA SP'], false, 178000, 50),
  ('Guilhermina - BR', ARRAY['GUILHERMINA BR','RAJ GUILHERMINA','GUILHERMINA'], false, 178000, 60),
  ('Vertice', ARRAY['VERTICE'], false, 211000, 70),
  ('Consolacao', ARRAY['CONSOLACAO'], false, 190000, 80),
  ('Formulario R - II', ARRAY['FORMULARIO R II'], false, 136000, 90),
  ('RAJ', ARRAY['RAJ','RAJ 1','RAJ 2'], true, 136000, 100)
ON CONFLICT DO NOTHING;

-- 3. Regenerador da funcao de preco a partir da tabela (mantem a funcao IMMUTABLE e rapida)
CREATE OR REPLACE FUNCTION public.rebuild_valor_projeto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rb$
DECLARE
  ramos text := '';
  r record;
  p text;
BEGIN
  FOR r IN SELECT projeto, padroes, exato, valor FROM public.precos_projetos WHERE ativo ORDER BY ordem, projeto LOOP
    FOREACH p IN ARRAY r.padroes LOOP
      IF r.exato THEN
        ramos := ramos || format(' WHEN (SELECT v FROM n) = %L THEN %s', upper(btrim(p)), r.valor);
      ELSE
        ramos := ramos || format(' WHEN (SELECT v FROM n) LIKE %L THEN %s', '%' || upper(btrim(p)) || '%', r.valor);
      END IF;
    END LOOP;
  END LOOP;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.valor_projeto(_imovel text) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $f$ '
    || 'WITH n AS (SELECT btrim(regexp_replace(upper(translate(coalesce(_imovel,''''), '
    || '''áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ'', '
    || '''aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'')), ''[^A-Z0-9]+'', '' '', ''g'')) AS v) '
    || 'SELECT CASE WHEN (SELECT v FROM n) = '''''''' THEN NULL'
    || ramos
    || ' ELSE NULL END::numeric $f$';
END;
$rb$;

REVOKE ALL ON FUNCTION public.rebuild_valor_projeto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_valor_projeto() TO authenticated, service_role;

SELECT public.rebuild_valor_projeto();

-- 4. Historico completo de alteracoes
CREATE TABLE IF NOT EXISTS public.lead_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid,
  campo text NOT NULL,
  de text,
  para text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_audit TO authenticated;
GRANT ALL ON public.lead_audit TO service_role;

ALTER TABLE public.lead_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_audit_select ON public.lead_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR public.owns_lead(lead_id));

CREATE INDEX IF NOT EXISTS idx_lead_audit_lead ON public.lead_audit (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_audit_created ON public.lead_audit (created_at DESC);

CREATE OR REPLACE FUNCTION public.log_lead_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $au$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'etapa', OLD.stage::text, NEW.stage::text);
  END IF;
  IF NEW.valor IS DISTINCT FROM OLD.valor THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'valor', OLD.valor::text, NEW.valor::text);
  END IF;
  IF NEW.entrada IS DISTINCT FROM OLD.entrada THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'entrada', OLD.entrada::text, NEW.entrada::text);
  END IF;
  IF NEW.finalidade IS DISTINCT FROM OLD.finalidade THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'finalidade', OLD.finalidade, NEW.finalidade);
  END IF;
  IF NEW.estagio_imovel IS DISTINCT FROM OLD.estagio_imovel THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'estagio_imovel', OLD.estagio_imovel, NEW.estagio_imovel);
  END IF;
  IF NEW.documentacao_ok IS DISTINCT FROM OLD.documentacao_ok THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'documentacao', OLD.documentacao_ok::text, NEW.documentacao_ok::text);
  END IF;
  IF NEW.corretor_id IS DISTINCT FROM OLD.corretor_id THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'corretor', OLD.corretor_id::text, NEW.corretor_id::text);
  END IF;
  IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
    INSERT INTO public.lead_audit (lead_id, user_id, campo, de, para)
    VALUES (NEW.id, uid, 'telefone', OLD.telefone, NEW.telefone);
  END IF;
  RETURN NEW;
END;
$au$;

DROP TRIGGER IF EXISTS leads_audit ON public.leads;
CREATE TRIGGER leads_audit AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_audit();

-- 5. Metas por corretor
CREATE TABLE IF NOT EXISTS public.metas_corretores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES public.corretores(id) ON DELETE CASCADE,
  mes date NOT NULL,
  meta_leads integer NOT NULL DEFAULT 0,
  meta_valor numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretor_id, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_corretores TO authenticated;
GRANT ALL ON public.metas_corretores TO service_role;

ALTER TABLE public.metas_corretores ENABLE ROW LEVEL SECURITY;

CREATE POLICY metas_select ON public.metas_corretores
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR public.is_my_corretor(corretor_id));
CREATE POLICY metas_insert_gestor ON public.metas_corretores
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY metas_update_gestor ON public.metas_corretores
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY metas_delete_gestor ON public.metas_corretores
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER metas_corretores_touch BEFORE UPDATE ON public.metas_corretores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Painel de saude
CREATE OR REPLACE FUNCTION public.saude_sistema()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $sd$
  SELECT jsonb_build_object(
    'c2s', (SELECT to_jsonb(s) FROM (
        SELECT started_at, finished_at, status, origem, total, criados, atualizados, movidos, erro
        FROM public.sync_runs ORDER BY started_at DESC LIMIT 1) s),
    'c2s_falhas_24h', (SELECT count(*) FROM public.sync_runs
        WHERE status = 'erro' AND started_at > now() - interval '24 hours'),
    'agenda', (SELECT to_jsonb(a) FROM (
        SELECT started_at, finished_at, status, origem, total, criados, atualizados,
               vinculados_c2s, nao_encontrados_c2s, erro
        FROM public.agenda_sync_runs ORDER BY started_at DESC LIMIT 1) a),
    'agenda_falhas_24h', (SELECT count(*) FROM public.agenda_sync_runs
        WHERE status = 'erro' AND started_at > now() - interval '24 hours'),
    'leads_total', (SELECT count(*) FROM public.leads),
    'leads_sem_corretor', (SELECT count(*) FROM public.leads WHERE corretor_id IS NULL),
    'leads_sem_valor', (SELECT count(*) FROM public.leads
        WHERE COALESCE(NULLIF(valor,0), public.valor_projeto(imovel), 0) = 0),
    'leads_sem_telefone', (SELECT count(*) FROM public.leads WHERE telefone_norm IS NULL),
    'leads_novos_parados', (SELECT count(*) FROM public.leads
        WHERE stage = 'novo' AND stage_since < now() - interval '1 day'),
    'telefones_duplicados', (SELECT count(*) FROM (
        SELECT telefone_norm FROM public.leads WHERE telefone_norm IS NOT NULL
        GROUP BY telefone_norm HAVING count(*) > 1) d),
    'movimentacoes_24h', (SELECT count(*) FROM public.lead_events
        WHERE created_at > now() - interval '24 hours')
  );
$sd$;

REVOKE ALL ON FUNCTION public.saude_sistema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saude_sistema() TO authenticated, service_role;