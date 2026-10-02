BEGIN;

DROP POLICY IF EXISTS "global_admins_manage" ON public.global_admins;

-- Separar SELECT dos comandos de escrita para evitar recursão infinita
CREATE POLICY "global_admins_manage_write" ON public.global_admins
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));

CREATE POLICY "global_admins_manage_update" ON public.global_admins
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));

CREATE POLICY "global_admins_manage_delete" ON public.global_admins
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));

COMMIT;
