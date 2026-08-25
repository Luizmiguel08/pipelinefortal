DROP FUNCTION IF EXISTS public.try_lock_sync(integer);
UPDATE public.sync_runs SET finished_at = now(), status = 'erro', erro = COALESCE(erro, 'interrompida') WHERE finished_at IS NULL;