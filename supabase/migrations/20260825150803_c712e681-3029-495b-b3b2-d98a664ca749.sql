CREATE INDEX IF NOT EXISTS leads_updated_at_idx ON public.leads (updated_at DESC);
CREATE INDEX IF NOT EXISTS leads_corretor_stage_idx ON public.leads (corretor_id, stage);
CREATE INDEX IF NOT EXISTS corretores_user_id_idx ON public.corretores (user_id);
CREATE INDEX IF NOT EXISTS sync_runs_status_started_idx ON public.sync_runs (status, started_at DESC);

CREATE OR REPLACE FUNCTION public.try_lock_sync(_ttl_seconds integer DEFAULT 300)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_xact_lock(918273645)
     AND NOT EXISTS (
       SELECT 1 FROM public.sync_runs
       WHERE finished_at IS NULL
         AND started_at > now() - make_interval(secs => _ttl_seconds)
     );
$$;

REVOKE ALL ON FUNCTION public.try_lock_sync(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_lock_sync(integer) TO service_role;