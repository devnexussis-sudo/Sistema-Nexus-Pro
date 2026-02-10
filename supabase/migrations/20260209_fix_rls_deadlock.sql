-- ==============================================================================
-- CORREÇÃO DE DEADLOCK E LOOP DE RLS (SEGURANÇA OTIMIZADA)
-- ==============================================================================

-- 1. Função OTIMIZADA para obter Role (Admin Check) - SEM RECURSÃO (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_check text;
BEGIN
  -- 1. Tenta pegar do JWT (Rápido)
  role_check := current_setting('request.jwt.claims', true)::json->>'user_role';
  
  IF role_check = 'admin' OR role_check = 'ADMIN' THEN
    RETURN true;
  END IF;
  
  -- 2. Tenta pegar do Banco (Bypass RLS via Security Definer)
  SELECT role INTO role_check
  FROM public.users
  WHERE id = auth.uid();
  
  RETURN (role_check = 'admin' OR role_check = 'ADMIN');
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- 2. Função OTIMIZADA para obter Tenant - SEM RECURSÃO (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_uuid uuid;
BEGIN
  -- 1. Tenta pegar do JWT (Rápido)
  tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'metaTenant', '')::uuid;
  
  IF tenant_uuid IS NULL THEN
    tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid;
  END IF;

  IF tenant_uuid IS NOT NULL THEN
    RETURN tenant_uuid;
  END IF;

  -- 2. Fallback Seguro no Banco (Bypass RLS)
  SELECT tenant_id INTO tenant_uuid
  FROM public.users
  WHERE id = auth.uid();
  
  RETURN tenant_uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;


-- 3. Recria a Policy de Leitura de Usuários de forma SIMPLIFICADA
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "Users can view users in same tenant" ON public.users;

CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    -- Regra 1: Eu sempre posso ver meu próprio usuário (Curto-circuito)
    id = auth.uid() 
    OR 
    -- Regra 2: Posso ver usuários do mesmo tenant (Chama func segura)
    tenant_id = public.get_user_tenant_id()
    OR
    -- Regra 3: Admins podem ver tudo (Chama func segura)
    public.is_admin()
  );

-- 4. Notifica PostgREST
NOTIFY pgrst, 'reload schema';
