CREATE OR REPLACE FUNCTION public.escalate_stale_leads()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  passo record;
BEGIN
  UPDATE public.leads
     SET stage = 'nao_respondeu'::public.lead_stage
   WHERE stage = 'novo'::public.lead_stage
     AND GREATEST(stage_since, COALESCE(ultima_interacao, stage_since)) < now() - interval '5 minutes';

  FOR passo IN
    SELECT * FROM (VALUES
      ('nao_respondeu','dia1'),
      ('dia1','dia2'),
      ('dia2','dia3'),
      ('dia3','lista_fria')
    ) AS t(de, para)
  LOOP
    EXECUTE format(
      'UPDATE public.leads SET stage = %L::public.lead_stage
       WHERE stage = %L::public.lead_stage
         AND GREATEST(stage_since, COALESCE(ultima_interacao, stage_since)) < now() - interval ''1 day''',
      passo.para, passo.de);
  END LOOP;
END; $function$;