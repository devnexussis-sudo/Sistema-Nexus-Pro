BEGIN;

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_admins 
    WHERE user_id = auth.uid()
  ) OR (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'master@dunoup.com.br';
$$;

COMMIT;
