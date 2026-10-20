-- ==============================================================================
-- 🚀 MIGRATION: 20261020_provision_tenant_initial_admin.sql
-- DESCRIÇÃO:
-- 1. Garante a existência de colunas essenciais em `user_groups` (como `active`, `is_system`, `permissions`)
--    e em `users` (como `group_id`, `group_ids`, `app_scope`, `user_code`, `active`).
-- 2. Cria a RPC SECURITY DEFINER `provision_tenant_initial_admin` para que todo
--    provisionamento de nova empresa cadastre atomicamente o admin no grupo 'Administradores'
--    e na tabela de usuários públicos, contornando bloqueios de RLS cross-tenant.
-- 3. Executa BACKFILL imediato para garantir que todas as empresas existentes no banco
--    tenham seus grupos 'Administradores' e 'Operadores' criados e seus usuários admin
--    devidamente vinculados e visíveis na página de usuários.
-- ==============================================================================

-- 0. GARANTIR COLUNAS NAS TABELAS ENVOLVIDAS
ALTER TABLE public.user_groups ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE public.user_groups ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
ALTER TABLE public.user_groups ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.user_groups ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS group_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS group_ids TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_code VARCHAR(10);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS app_scope VARCHAR(20) DEFAULT 'WEB';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- 1. CRIAR A RPC ATÔMICA COM SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.provision_tenant_initial_admin(
    p_tenant_id uuid,
    p_user_id uuid,
    p_email text,
    p_name text,
    p_user_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_admin_group_id uuid;
    v_op_group_id uuid;
    v_user_code text;
    v_clean_email text;
    v_display_name text;
    v_avatar text;
    v_admin_perms jsonb;
    v_op_perms jsonb;
BEGIN
    v_clean_email := lower(trim(p_email));
    v_display_name := coalesce(nullif(trim(p_name), ''), 'Administrador');
    v_avatar := 'https://ui-avatars.com/api/?name=' || replace(v_display_name, ' ', '+') || '&background=1c2d4f&color=fff&bold=true';
    v_user_code := coalesce(nullif(trim(p_user_code), ''), substring(upper(md5(random()::text)) from 1 for 6));

    -- Matriz de permissões padrão para Administradores
    v_admin_perms := '{
        "orders": {"create": true, "read": true, "update": true, "delete": true},
        "customers": {"create": true, "read": true, "update": true, "delete": true},
        "equipments": {"create": true, "read": true, "update": true, "delete": true},
        "technicians": {"create": true, "read": true, "update": true, "delete": true},
        "quotes": {"create": true, "read": true, "update": true, "delete": true},
        "sales_orders": {"create": true, "read": true, "update": true, "delete": true},
        "contracts": {"create": true, "read": true, "update": true, "delete": true},
        "stock": {"create": true, "read": true, "update": true, "delete": true},
        "forms": {"create": true, "read": true, "update": true, "delete": true},
        "whatsapp": {"create": true, "read": true, "update": true, "delete": true},
        "solicitacoes": {"create": true, "read": true, "update": true, "delete": true},
        "regions": {"create": true, "read": true, "update": true, "delete": true},
        "integrations": {"create": true, "read": true, "update": true, "delete": true},
        "settings": true,
        "settingsTabs": {"company": true, "system": true, "app": true, "dashboard": true},
        "manageUsers": true,
        "manageGroups": true,
        "accessSuperAdmin": false,
        "financial": {"read": true, "update": true, "invoice": true, "discounts": true},
        "menuAccess": {
            "dashboard": true, "orders": true, "calendar": true, "map": true, "financial": true,
            "quotes": true, "sales_orders": true, "stock": true, "contracts": true,
            "customers": true, "equipments": true, "forms": true, "technicians": true,
            "users": true, "settings": true
        }
    }'::jsonb;

    -- Matriz de permissões padrão para Operadores
    v_op_perms := '{
        "orders": {"create": true, "read": true, "update": true, "delete": false},
        "customers": {"create": true, "read": true, "update": true, "delete": false},
        "equipments": {"create": true, "read": true, "update": true, "delete": false},
        "technicians": {"create": false, "read": true, "update": false, "delete": false},
        "quotes": {"create": true, "read": true, "update": true, "delete": false},
        "sales_orders": {"create": true, "read": true, "update": true, "delete": false},
        "contracts": {"create": true, "read": true, "update": true, "delete": false},
        "stock": {"create": true, "read": true, "update": true, "delete": false},
        "forms": {"create": true, "read": true, "update": true, "delete": false},
        "settings": false, "manageUsers": false, "manageGroups": false, "accessSuperAdmin": false,
        "financial": {"read": true, "update": false, "invoice": false, "discounts": false},
        "menuAccess": {
            "dashboard": true, "orders": true, "calendar": true, "map": true, "financial": false,
            "quotes": true, "sales_orders": true, "stock": true, "contracts": true,
            "customers": true, "equipments": true, "forms": true, "technicians": true,
            "users": false, "settings": false
        }
    }'::jsonb;

    -- 1. Garantir Grupo Administradores
    SELECT id INTO v_admin_group_id
    FROM public.user_groups
    WHERE tenant_id = p_tenant_id AND (lower(name) = 'administradores' OR is_system = true)
    ORDER BY is_system DESC, created_at ASC
    LIMIT 1;

    IF v_admin_group_id IS NULL THEN
        INSERT INTO public.user_groups (
            tenant_id,
            name,
            description,
            is_system,
            active,
            permissions
        ) VALUES (
            p_tenant_id,
            'Administradores',
            'Grupo com permissões completas de administração do sistema',
            true,
            true,
            v_admin_perms
        )
        RETURNING id INTO v_admin_group_id;
    ELSE
        UPDATE public.user_groups
        SET is_system = true,
            active = true,
            permissions = v_admin_perms
        WHERE id = v_admin_group_id;
    END IF;

    -- 2. Garantir Grupo Operadores
    SELECT id INTO v_op_group_id
    FROM public.user_groups
    WHERE tenant_id = p_tenant_id AND lower(name) = 'operadores'
    LIMIT 1;

    IF v_op_group_id IS NULL THEN
        INSERT INTO public.user_groups (
            tenant_id,
            name,
            description,
            is_system,
            active,
            permissions
        ) VALUES (
            p_tenant_id,
            'Operadores',
            'Acesso completo aos módulos operacionais (OS, Orçamentos, Clientes, Ativos)',
            true,
            true,
            v_op_perms
        )
        RETURNING id INTO v_op_group_id;
    END IF;

    -- 3. Upsert no public.users com group_id e group_ids (ARRAY de TEXT)
    INSERT INTO public.users (
        id,
        tenant_id,
        email,
        name,
        role,
        active,
        group_id,
        group_ids,
        app_scope,
        user_code,
        avatar
    ) VALUES (
        p_user_id,
        p_tenant_id,
        v_clean_email,
        v_display_name,
        'ADMIN',
        true,
        v_admin_group_id,
        ARRAY[v_admin_group_id::text],
        'WEB',
        v_user_code,
        v_avatar
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        email = EXCLUDED.email,
        name = COALESCE(NULLIF(EXCLUDED.name, ''), public.users.name),
        role = 'ADMIN',
        active = true,
        group_id = v_admin_group_id,
        group_ids = ARRAY[v_admin_group_id::text],
        app_scope = COALESCE(public.users.app_scope, 'WEB'),
        user_code = COALESCE(public.users.user_code, EXCLUDED.user_code),
        updated_at = now();

    -- 4. Atualizar registro do tenant
    UPDATE public.tenants
    SET admin_email = v_clean_email
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'user_id', p_user_id,
        'email', v_clean_email,
        'admin_group_id', v_admin_group_id,
        'op_group_id', v_op_group_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_tenant_initial_admin(uuid, uuid, text, text, text) TO authenticated, service_role, anon;

-- 2. EXECUTAR BACKFILL AUTOMÁTICO PARA AS EMPRESAS EXISTENTES
DO $$
DECLARE
    t RECORD;
    v_auth_user RECORD;
    v_admin_grp_id UUID;
    v_res JSONB;
BEGIN
    FOR t IN 
        SELECT id, name, company_name, admin_email 
        FROM public.tenants
    LOOP
        -- Procura o usuário correspondente no auth.users
        SELECT id, email, raw_user_meta_data
        INTO v_auth_user
        FROM auth.users
        WHERE (t.admin_email IS NOT NULL AND lower(email) = lower(trim(t.admin_email)))
           OR (raw_user_meta_data->>'tenantId' = t.id::text)
           OR (raw_user_meta_data->>'tenant_id' = t.id::text)
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_auth_user.id IS NOT NULL THEN
            -- Se encontrou o usuário no Auth, executa a RPC de provisionamento
            v_res := public.provision_tenant_initial_admin(
                t.id,
                v_auth_user.id,
                v_auth_user.email,
                coalesce(t.name, t.company_name, 'Admin')
            );
            RAISE NOTICE 'Tenant % (%) provisionado com sucesso para user %', t.name, t.id, v_auth_user.email;
        ELSE
            -- Se ainda não houver usuário no Auth, garante pelo menos os grupos criados
            SELECT id INTO v_admin_grp_id
            FROM public.user_groups
            WHERE tenant_id = t.id AND (lower(name) = 'administradores' OR is_system = true)
            LIMIT 1;

            IF v_admin_grp_id IS NULL THEN
                INSERT INTO public.user_groups (tenant_id, name, description, is_system, active)
                VALUES (t.id, 'Administradores', 'Grupo com permissões completas de administração do sistema', true, true);
            END IF;

            IF NOT EXISTS (SELECT 1 FROM public.user_groups WHERE tenant_id = t.id AND lower(name) = 'operadores') THEN
                INSERT INTO public.user_groups (tenant_id, name, description, is_system, active)
                VALUES (t.id, 'Operadores', 'Acesso completo aos módulos operacionais', true, true);
            END IF;
        END IF;
    END LOOP;
END;
$$;
