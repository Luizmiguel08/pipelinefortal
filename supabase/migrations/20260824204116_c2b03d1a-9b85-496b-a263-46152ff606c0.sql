CREATE TABLE public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'sucesso',
  origem text NOT NULL DEFAULT 'manual',
  total int NOT NULL DEFAULT 0,
  criados int NOT NULL DEFAULT 0,
  atualizados int NOT NULL DEFAULT 0,
  movidos int NOT NULL DEFAULT 0,
  corretores_criados int NOT NULL DEFAULT 0,
  duracao_ms int,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_runs_select_gestor ON public.sync_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE INDEX sync_runs_started_at_idx ON public.sync_runs (started_at DESC);