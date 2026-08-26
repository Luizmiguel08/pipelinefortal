CREATE POLICY "integration_settings_block_authenticated"
ON public.integration_settings FOR ALL TO authenticated
USING (false) WITH CHECK (false);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_my_corretor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_my_corretor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.owns_lead(uuid) TO service_role;