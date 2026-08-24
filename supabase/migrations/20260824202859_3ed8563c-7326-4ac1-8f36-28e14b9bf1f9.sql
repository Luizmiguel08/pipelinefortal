-- ROLES
CREATE TYPE public.app_role AS ENUM ('gestor', 'corretor');
CREATE TYPE public.lead_stage AS ENUM ('novo', 'atendimento', 'negociacao', 'documentacao', 'fechamento');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE TABLE public.corretores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL,
  email text,
  telefone text,
  c2s_agent_id text UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretores TO authenticated;
GRANT ALL ON public.corretores TO service_role;
ALTER TABLE public.corretores ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  c2s_contact_id text UNIQUE,
  nome text NOT NULL,
  telefone text,
  email text,
  imovel text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  stage public.lead_stage NOT NULL DEFAULT 'novo',
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  origem text,
  observacoes text,
  ultima_interacao timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_corretor_idx ON public.leads(corretor_id);
CREATE INDEX leads_stage_idx ON public.leads(stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  de public.lead_stage,
  para public.lead_stage NOT NULL,
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_events_lead_idx ON public.lead_events(lead_id);
GRANT SELECT, INSERT ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

-- helper: lead pertence ao usuario logado
CREATE OR REPLACE FUNCTION public.owns_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.corretores c ON c.id = l.corretor_id
    WHERE l.id = _lead_id AND c.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_my_corretor(_corretor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.corretores c WHERE c.id = _corretor_id AND c.user_id = auth.uid());
$$;

-- POLICIES
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "corretores_select" ON public.corretores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR user_id = auth.uid());
CREATE POLICY "corretores_write_gestor" ON public.corretores FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "corretores_update_gestor" ON public.corretores FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor')) WITH CHECK (public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "corretores_delete_gestor" ON public.corretores FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR public.is_my_corretor(corretor_id));
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor') OR public.is_my_corretor(corretor_id));
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR public.is_my_corretor(corretor_id))
  WITH CHECK (public.has_role(auth.uid(), 'gestor') OR public.is_my_corretor(corretor_id));
CREATE POLICY "leads_delete_gestor" ON public.leads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "lead_events_select" ON public.lead_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor') OR public.owns_lead(lead_id));
CREATE POLICY "lead_events_insert" ON public.lead_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor') OR public.owns_lead(lead_id));

-- triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER corretores_touch BEFORE UPDATE ON public.corretores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.log_stage_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.lead_events (lead_id, de, para) VALUES (NEW.id, OLD.stage, NEW.stage);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER leads_stage_log AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_stage_change();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'corretor') ON CONFLICT DO NOTHING;
  UPDATE public.corretores SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND user_id IS NULL;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED
INSERT INTO public.corretores (id, nome, email, telefone, c2s_agent_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Miguel Saraiva', 'miguel@imob.com.br', '(11) 99111-1111', 'c2s-miguel'),
  ('22222222-2222-4222-8222-222222222222', 'Ana Beatriz', 'ana@imob.com.br', '(11) 99222-2222', 'c2s-ana'),
  ('33333333-3333-4333-8333-333333333333', 'Rafael Lima', 'rafael@imob.com.br', '(11) 99333-3333', 'c2s-rafael');

INSERT INTO public.leads (nome, telefone, email, imovel, valor, stage, corretor_id, origem, ultima_interacao, c2s_contact_id) VALUES
  ('Erick Fontes', '(11) 98111-0001', 'erick@email.com', 'Apto 2 dorm - Vila Mariana', 300000, 'atendimento', '11111111-1111-4111-8111-111111111111', 'C2S / Portal', now() - interval '2 hours', 'c2s-1001'),
  ('Isaac Moreira', '(11) 98111-0002', 'isaac@email.com', 'Apto 2 dorm - Ipiranga', 300000, 'atendimento', '11111111-1111-4111-8111-111111111111', 'C2S / Facebook', now() - interval '5 hours', 'c2s-1002'),
  ('Camila Duarte', '(11) 98111-0003', 'camila@email.com', 'Studio - Pinheiros', 450000, 'novo', '11111111-1111-4111-8111-111111111111', 'C2S / Site', now() - interval '30 minutes', 'c2s-1003'),
  ('Bruno Tavares', '(11) 98111-0004', 'bruno@email.com', 'Cobertura - Moema', 1250000, 'negociacao', '11111111-1111-4111-8111-111111111111', 'C2S / Indicação', now() - interval '1 day', 'c2s-1004'),
  ('Luana Prado', '(11) 98111-0005', 'luana@email.com', 'Apto 3 dorm - Tatuapé', 680000, 'documentacao', '11111111-1111-4111-8111-111111111111', 'C2S / Portal', now() - interval '3 days', 'c2s-1005'),
  ('Fernanda Reis', '(11) 98111-0006', 'fernanda@email.com', 'Apto 1 dorm - Consolação', 390000, 'novo', '22222222-2222-4222-8222-222222222222', 'C2S / Portal', now() - interval '1 hour', 'c2s-1006'),
  ('Otávio Nunes', '(11) 98111-0007', 'otavio@email.com', 'Casa - Granja Viana', 890000, 'negociacao', '22222222-2222-4222-8222-222222222222', 'C2S / Site', now() - interval '6 hours', 'c2s-1007'),
  ('Patrícia Gomes', '(11) 98111-0008', 'patricia@email.com', 'Apto 2 dorm - Santana', 520000, 'fechamento', '22222222-2222-4222-8222-222222222222', 'C2S / Indicação', now() - interval '8 days', 'c2s-1008'),
  ('Diego Martins', '(11) 98111-0009', 'diego@email.com', 'Apto garden - Butantã', 740000, 'atendimento', '33333333-3333-4333-8333-333333333333', 'C2S / Portal', now() - interval '4 hours', 'c2s-1009'),
  ('Sabrina Lopes', '(11) 98111-0010', 'sabrina@email.com', 'Studio - Bela Vista', 320000, 'novo', '33333333-3333-4333-8333-333333333333', 'C2S / Facebook', now() - interval '20 minutes', 'c2s-1010'),
  ('Marcelo Antunes', '(11) 98111-0011', 'marcelo@email.com', 'Apto 3 dorm - Perdizes', 980000, 'documentacao', '33333333-3333-4333-8333-333333333333', 'C2S / Site', now() - interval '2 days', 'c2s-1011');