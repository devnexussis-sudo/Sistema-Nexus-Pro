-- ============================================================================
-- Migration: upsert_user_record — RPC para criar/atualizar usuário via SECURITY DEFINER
-- Necessário para Super Admin impersonation onde o JWT não corresponde ao tenant alvo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_user_record(
    p_id UUID,
    p_name TEXT,
    p_email TEXT,
    p_role TEXT,
    p_active BOOLEAN,
    p_tenant_id UUID,
    p_group_id UUID DEFAULT NULL,
    p_group_ids JSONB DEFAULT '[]'::JSONB,
    p_avatar TEXT DEFAULT '',
    p_permissions JSONB DEFAULT '{}'::JSONB,
    p_app_scope TEXT DEFAULT 'WEB',
    p_user_code TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result json;
BEGIN
    INSERT INTO public.users (id, name, email, role, active, tenant_id, group_id, group_ids, avatar, permissions, app_scope, user_code, phone)
    VALUES (p_id, p_name, p_email, p_role::user_role, p_active, p_tenant_id, p_group_id, p_group_ids, p_avatar, p_permissions, p_app_scope, p_user_code, p_phone)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        active = EXCLUDED.active,
        tenant_id = EXCLUDED.tenant_id,
        group_id = EXCLUDED.group_id,
        group_ids = EXCLUDED.group_ids,
        avatar = EXCLUDED.avatar,
        permissions = EXCLUDED.permissions,
        app_scope = EXCLUDED.app_scope,
        user_code = COALESCE(EXCLUDED.user_code, public.users.user_code),
        phone = COALESCE(EXCLUDED.phone, public.users.phone);

    SELECT json_build_object(
        'success', true,
        'id', p_id,
        'name', p_name,
        'email', p_email
    ) INTO v_result;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_record(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, UUID, JSONB, TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_record(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, UUID, JSONB, TEXT, JSONB, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- upsert_technician_record — RPC para criar/atualizar técnico via SECURITY DEFINER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_technician_record(
    p_id UUID,
    p_name TEXT,
    p_email TEXT,
    p_active BOOLEAN,
    p_tenant_id UUID,
    p_phone TEXT DEFAULT '',
    p_avatar TEXT DEFAULT '',
    p_job_title TEXT DEFAULT '',
    p_tech_code TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.technicians (id, name, email, active, tenant_id, phone, avatar, job_title, tech_code)
    VALUES (p_id, p_name, p_email, p_active, p_tenant_id, p_phone, p_avatar, p_job_title, p_tech_code)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        active = EXCLUDED.active,
        tenant_id = EXCLUDED.tenant_id,
        phone = COALESCE(EXCLUDED.phone, public.technicians.phone),
        avatar = COALESCE(EXCLUDED.avatar, public.technicians.avatar),
        job_title = COALESCE(EXCLUDED.job_title, public.technicians.job_title),
        tech_code = COALESCE(EXCLUDED.tech_code, public.technicians.tech_code);

    RETURN json_build_object('success', true, 'id', p_id);

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_technician_record(UUID, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_technician_record(UUID, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
