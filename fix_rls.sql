CREATE OR REPLACE FUNCTION public.is_module_enabled_for_auth(module_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT true;
$$;
