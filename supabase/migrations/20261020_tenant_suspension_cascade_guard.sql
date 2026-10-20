-- ==============================================================================
-- MIGRATION: TENANT SUSPENSION CASCADE GUARD (PADRÃO BIG TECH)
-- ==============================================================================
-- 1. Unban geral no auth.users (Big Tech nunca usa banned_until para tenancy de billing)
-- 2. Restaura técnicos e usuários de empresas ATIVAS
-- 3. Bloqueia técnicos e usuários de empresas SUSPENSAS
-- 4. Corrige RLS de public.tenants para que Master Admin / Super Admin liste todas
-- 5. RPC get_admin_tenants_list (Security Definer) para listagem garantida no Super Admin
-- 6. RPC toggle_tenant_status_master (Security Definer) para alternância atômica do cadeado
-- 7. RPC check_tenant_suspended_by_email para consulta segura pré-login e app mobile
-- 8. Trigger fn_cascade_tenant_status_change para sincronização contínua
-- ==============================================================================

BEGIN;

-- 1. REMOVE QUALQUER BANIMENTO RESIDUAL NO auth.users
UPDATE auth.users
SET banned_until = NULL
WHERE banned_until IS NOT NULL;


-- 2. FUNÇÃO RPC PARA CONSULTA DE EMPRESA SUSPENSA POR EMAIL (Web + Mobile)
CREATE OR REPLACE FUNCTION public.check_tenant_suspended_by_email(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_name text;
    v_status text;
BEGIN
    IF p_email IS NULL OR TRIM(p_email) = '' THEN
        RETURN NULL;
    END IF;

    -- Consulta via users
    SELECT COALESCE(t.company_name, t.name, 'sua empresa'), t.status 
    INTO v_company_name, v_status
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE LOWER(u.email) = LOWER(TRIM(p_email))
    LIMIT 1;

    -- Se não achou na users, consulta via technicians
    IF v_status IS NULL THEN
        SELECT COALESCE(t.company_name, t.name, 'sua empresa'), t.status 
        INTO v_company_name, v_status
        FROM public.technicians tech
        JOIN public.tenants t ON t.id = tech.tenant_id
        WHERE LOWER(tech.email) = LOWER(TRIM(p_email))
        LIMIT 1;
    END IF;

    IF v_status = 'suspended' THEN
        RETURN v_company_name;
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_tenant_suspended_by_email(text) TO anon, authenticated, service_role;


-- 3. RPC PARA LISTAGEM GARANTIDA DE EMPRESAS NO PAINEL MASTER ADMIN
CREATE OR REPLACE FUNCTION public.get_admin_tenants_list()
RETURNS SETOF public.tenants
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT * FROM public.tenants ORDER BY name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_tenants_list() TO anon, authenticated, service_role;


-- 4. RPC PARA ALTERNÂNCIA ATÔMICA DO CADEADO NO PAINEL MASTER ADMIN
CREATE OR REPLACE FUNCTION public.toggle_tenant_status_master(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_current_status text;
    v_new_status text;
    v_company_name text;
BEGIN
    SELECT status, COALESCE(company_name, name, 'Empresa')
    INTO v_current_status, v_company_name
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Empresa não encontrada');
    END IF;

    IF v_current_status = 'suspended' THEN
        v_new_status := 'active';
    ELSE
        v_new_status := 'suspended';
    END IF;

    -- Atualiza status da empresa
    UPDATE public.tenants
    SET status = v_new_status, updated_at = now()
    WHERE id = p_tenant_id;

    -- Sincroniza técnicos da empresa
    UPDATE public.technicians
    SET active = (v_new_status = 'active')
    WHERE tenant_id = p_tenant_id;

    -- Sincroniza usuários da empresa (preserva SUPER_ADMIN / MOROS_ADMIN)
    UPDATE public.users
    SET active = (v_new_status = 'active')
    WHERE tenant_id = p_tenant_id
      AND UPPER(role::text) NOT IN ('SUPER_ADMIN', 'MOROS_ADMIN');

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'new_status', v_new_status,
        'company_name', v_company_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_tenant_status_master(uuid) TO anon, authenticated, service_role;


-- 5. TRIGGER DE SINCRONIZAÇÃO EM CASCATA DE STATUS
CREATE OR REPLACE FUNCTION public.fn_cascade_tenant_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.status = 'suspended' AND (OLD.status IS DISTINCT FROM 'suspended') THEN
        -- Desativa técnicos no app
        UPDATE public.technicians
        SET active = false
        WHERE tenant_id = NEW.id;

        -- Desativa usuários web (preservando Super Admin)
        UPDATE public.users
        SET active = false
        WHERE tenant_id = NEW.id
          AND UPPER(role::text) NOT IN ('SUPER_ADMIN', 'MOROS_ADMIN');

    ELSIF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
        -- Reativa técnicos no app
        UPDATE public.technicians
        SET active = true
        WHERE tenant_id = NEW.id;

        -- Reativa usuários web
        UPDATE public.users
        SET active = true
        WHERE tenant_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_tenant_status_change ON public.tenants;

CREATE TRIGGER trg_cascade_tenant_status_change
AFTER UPDATE OF status ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.fn_cascade_tenant_status_change();


-- 6. POLÍTICAS RLS EM public.tenants (Permite isolamento de tenant + acesso total do Master Admin)
DROP POLICY IF EXISTS "tenants_read_isolation" ON public.tenants;
CREATE POLICY "tenants_read_isolation" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id = get_auth_tenant_id()
    OR is_master_admin()
    OR (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') IN ('moros_admin', 'SUPER_ADMIN')
    OR (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1) IN ('SUPER_ADMIN', 'moros_admin')
  );

DROP POLICY IF EXISTS "tenants_update_admin" ON public.tenants;
CREATE POLICY "tenants_update_admin" ON public.tenants
  FOR UPDATE TO authenticated
  USING (
    id = get_auth_tenant_id()
    OR is_master_admin()
    OR (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') IN ('moros_admin', 'SUPER_ADMIN')
    OR (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1) IN ('SUPER_ADMIN', 'moros_admin')
  )
  WITH CHECK (
    id = get_auth_tenant_id()
    OR is_master_admin()
    OR (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') IN ('moros_admin', 'SUPER_ADMIN')
    OR (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1) IN ('SUPER_ADMIN', 'moros_admin')
  );


-- 7. SINCRONIZAÇÃO GERAL IMEDIATA DO ESTADO ATUAL
-- A) Reativa técnicos e usuários de empresas ATIVAS
UPDATE public.technicians
SET active = true
WHERE tenant_id IN (SELECT id FROM public.tenants WHERE status = 'active');

UPDATE public.users
SET active = true
WHERE tenant_id IN (SELECT id FROM public.tenants WHERE status = 'active');

-- B) Garante técnicos e usuários desativados em empresas SUSPENSAS
UPDATE public.technicians
SET active = false
WHERE tenant_id IN (SELECT id FROM public.tenants WHERE status = 'suspended');

UPDATE public.users
SET active = false
WHERE tenant_id IN (SELECT id FROM public.tenants WHERE status = 'suspended')
  AND UPPER(role::text) NOT IN ('SUPER_ADMIN', 'MOROS_ADMIN');

COMMIT;
