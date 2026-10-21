-- ============================================================================
-- Migration: upsert_user_record & upsert_technician_record
-- RPCs SECURITY DEFINER para criar/atualizar usuário e técnico no banco
-- Necessário para contornar bloqueios de RLS quando o Super Admin opera
-- em tenant impersonado (onde o JWT do auth não bate com o tenant_id alvo).
-- ============================================================================

BEGIN;

-- 1. Remove qualquer versão anterior das funções para evitar erro de ambiguidade/overload
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'upsert_user_record'
          AND pronamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;

    FOR r IN (
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'upsert_technician_record'
          AND pronamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;

-- 2. Criação da RPC upsert_user_record com suporte a enum user_role e text[] para group_ids
CREATE OR REPLACE FUNCTION public.upsert_user_record(
    p_id UUID,
    p_name TEXT,
    p_email TEXT,
    p_role TEXT,
    p_active BOOLEAN,
    p_tenant_id UUID,
    p_group_id UUID DEFAULT NULL,
    p_group_ids TEXT[] DEFAULT '{}'::TEXT[],
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
    v_clean_role public.user_role;
    v_clean_group_ids TEXT[];
BEGIN
    -- Validação e conversão segura para o enum public.user_role
    BEGIN
        v_clean_role := UPPER(COALESCE(p_role, 'ADMIN'))::public.user_role;
    EXCEPTION WHEN OTHERS THEN
        v_clean_role := 'ADMIN'::public.user_role;
    END;

    -- Tratamento seguro de group_ids (TEXT[])
    v_clean_group_ids := COALESCE(p_group_ids, '{}'::TEXT[]);
    IF p_group_id IS NOT NULL AND NOT (p_group_id::TEXT = ANY(v_clean_group_ids)) THEN
        v_clean_group_ids := array_append(v_clean_group_ids, p_group_id::TEXT);
    END IF;

    -- Inserção / Atualização em public.users
    INSERT INTO public.users (
        id, 
        name, 
        email, 
        role, 
        active, 
        tenant_id, 
        group_id, 
        group_ids, 
        avatar, 
        permissions, 
        app_scope, 
        user_code, 
        phone
    )
    VALUES (
        p_id, 
        p_name, 
        p_email, 
        v_clean_role, 
        COALESCE(p_active, true), 
        p_tenant_id, 
        p_group_id, 
        v_clean_group_ids, 
        COALESCE(p_avatar, ''), 
        COALESCE(p_permissions, '{}'::JSONB), 
        COALESCE(p_app_scope, 'WEB'), 
        p_user_code, 
        p_phone
    )
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

GRANT EXECUTE ON FUNCTION public.upsert_user_record(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, UUID, TEXT[], TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_record(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, UUID, TEXT[], TEXT, JSONB, TEXT, TEXT, TEXT) TO service_role;

-- 3. Criação da RPC upsert_technician_record
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
    VALUES (p_id, p_name, p_email, COALESCE(p_active, true), p_tenant_id, p_phone, p_avatar, p_job_title, p_tech_code)
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
