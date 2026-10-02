BEGIN;

-- 1. Fix infinite recursion in global_admins
DROP POLICY IF EXISTS "global_admins_manage" ON public.global_admins;
DROP POLICY IF EXISTS "system_read_global_admins" ON public.global_admins;

CREATE POLICY "system_read_global_admins" ON public.global_admins
FOR SELECT TO authenticated USING (true);

CREATE POLICY "global_admins_insert" ON public.global_admins
FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));

CREATE POLICY "global_admins_update" ON public.global_admins
FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));

CREATE POLICY "global_admins_delete" ON public.global_admins
FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));

-- 2. Optimize is_master_admin to prevent any recursive lock
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT 
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'master@dunoup.com.br' 
    OR 
    EXISTS (
      SELECT 1 FROM public.global_admins 
      WHERE user_id = auth.uid()
    );
$$;

COMMIT;
