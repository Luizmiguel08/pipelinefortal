INSERT INTO public.user_roles (user_id, role)
SELECT id, 'gestor'::app_role FROM auth.users WHERE lower(email) = 'trabalhosluizmiguel@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.corretores c
SET user_id = u.id
FROM auth.users u
WHERE lower(c.email) = lower(u.email) AND lower(u.email) = 'trabalhosluizmiguel@gmail.com' AND c.user_id IS NULL;

INSERT INTO public.corretores (user_id, nome, email)
SELECT u.id, COALESCE(p.nome, split_part(u.email, '@', 1)), u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = 'trabalhosluizmiguel@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.corretores c WHERE c.user_id = u.id);