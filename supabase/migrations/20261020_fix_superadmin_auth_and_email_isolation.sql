-- ==============================================================================
-- MIGRAÇÃO DE ISOLAMENTO DEFINITIVO: AUTH SUPER ADMIN E E-MAILS DE TENANTS
-- Padrão: Missão Crítica / Big Tech IAM / Zero Contaminação Cruzada
-- ==============================================================================

-- 1. Sincronizar colunas de e-mail na tabela tenants (email = admin_email)
UPDATE public.tenants
SET email = admin_email
WHERE admin_email IS NOT NULL AND (email IS NULL OR email <> admin_email);

UPDATE public.tenants
SET admin_email = email
WHERE email IS NOT NULL AND (admin_email IS NULL OR admin_email <> email);

-- 2. Desvincular e-mail de Super Admin global de tenants normais
-- Se alguma empresa de cliente ficou com 'alex.ksc20@gmail.com' como admin_email,
-- busca o verdadeiro usuário ADMIN daquela empresa ou define um e-mail com base no slug.
DO $$
DECLARE
    t RECORD;
    v_correct_email TEXT;
BEGIN
    FOR t IN 
        SELECT id, slug, name, admin_email, email 
        FROM public.tenants
        WHERE lower(coalesce(admin_email, '')) = 'alex.ksc20@gmail.com'
           OR lower(coalesce(email, '')) = 'alex.ksc20@gmail.com'
    LOOP
        -- Procura se existe outro usuário ADMIN associado a este tenant
        SELECT email INTO v_correct_email
        FROM public.users
        WHERE tenant_id = t.id 
          AND lower(email) <> 'alex.ksc20@gmail.com'
          AND role = 'ADMIN'
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_correct_email IS NOT NULL THEN
            UPDATE public.tenants
            SET admin_email = v_correct_email,
                email = v_correct_email,
                updated_at = now()
            WHERE id = t.id;
            RAISE NOTICE 'Tenant % (%) atualizado com email real: %', t.name, t.slug, v_correct_email;
        ELSE
            -- Se não havia outro admin, define provisoriamente o email corporativo do slug
            v_correct_email := 'admin@' || lower(coalesce(t.slug, 'empresa')) || '.duno.pro';
            UPDATE public.tenants
            SET admin_email = v_correct_email,
                email = v_correct_email,
                updated_at = now()
            WHERE id = t.id;
            RAISE NOTICE 'Tenant % (%) atualizado para email padrão: %', t.name, t.slug, v_correct_email;
        END IF;
    END LOOP;
END;
$$;

-- 3. Garantir que alex.ksc20@gmail.com seja Super Admin Global
DO $$
DECLARE
    v_super_user_id UUID;
BEGIN
    SELECT id INTO v_super_user_id
    FROM auth.users
    WHERE lower(email) = 'alex.ksc20@gmail.com'
    LIMIT 1;

    IF v_super_user_id IS NOT NULL THEN
        -- Insere ou garante em global_admins
        INSERT INTO public.global_admins (user_id)
        VALUES (v_super_user_id)
        ON CONFLICT (user_id) DO NOTHING;

        -- Garante role SUPER_ADMIN na tabela public.users
        UPDATE public.users
        SET role = 'SUPER_ADMIN',
            app_scope = 'WEB',
            active = true
        WHERE id = v_super_user_id;

        -- Atualiza metadata no auth.users
        UPDATE auth.users
        SET raw_user_meta_data = raw_user_meta_data || '{"role": "SUPER_ADMIN", "appScope": "WEB"}'::jsonb,
            raw_app_meta_data = raw_app_meta_data || '{"role": "SUPER_ADMIN"}'::jsonb
        WHERE id = v_super_user_id;
    END IF;
END;
$$;

-- 4. Atualizar RPC get_admin_tenants_list para garantir sincronismo de email
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

-- 5. Notificar PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';
