DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'gestor'))
    OR corretor_id IN (SELECT c.id FROM public.corretores c WHERE c.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "agenda_appointments_select_gestor" ON public.agenda_appointments;
DROP POLICY IF EXISTS "agenda_appointments_select_corretor" ON public.agenda_appointments;
CREATE POLICY "agenda_appointments_select" ON public.agenda_appointments FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'gestor'))
    OR corretor_id IN (SELECT c.id FROM public.corretores c WHERE c.user_id = (SELECT auth.uid()))
  );