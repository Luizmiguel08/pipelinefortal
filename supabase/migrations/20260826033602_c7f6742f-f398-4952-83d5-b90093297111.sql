CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION private.is_my_corretor(_corretor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.corretores
    WHERE id = _corretor_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.owns_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.corretores c ON c.id = l.corretor_id
    WHERE l.id = _lead_id AND c.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_my_corretor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.owns_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_my_corretor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_lead(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.has_role(_user_id, _role); $$;

CREATE OR REPLACE FUNCTION public.is_my_corretor(_corretor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.is_my_corretor(_corretor_id); $$;

CREATE OR REPLACE FUNCTION public.owns_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.owns_lead(_lead_id); $$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_my_corretor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_my_corretor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_lead(uuid) TO authenticated, service_role;