GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_corretor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_lead(uuid) TO authenticated;