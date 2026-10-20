-- ==============================================================================
-- MIGRATION: TENANT SUSPENSION CASCADE GUARD (BLOQUEIO AUTOMÁTICO DO APP)
-- ==============================================================================
-- Quando uma empresa é suspensa no Super Admin:
-- 1. Atualiza public.technicians.active = false
-- 2. Atualiza public.users.active = false (preservando Super Admins)
-- 3. Bane os usuários no auth.users para derrubar sessões JWT imediatamente
--
-- Quando a empresa é reativada, restabelece o acesso automaticamente.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_cascade_tenant_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- 1. Se a empresa foi SUSPENSA
    IF NEW.status = 'suspended' AND (OLD.status IS DISTINCT FROM 'suspended') THEN
        -- Desativa todos os técnicos vinculados à empresa no app móvel
        UPDATE public.technicians
        SET active = false
        WHERE tenant_id = NEW.id;

        -- Desativa todos os usuários da empresa (preserva SUPER_ADMIN)
        UPDATE public.users
        SET active = false
        WHERE tenant_id = NEW.id
          AND UPPER(role::text) NOT IN ('SUPER_ADMIN', 'MOROS_ADMIN');

        -- Bane no auth.users para rejeitar qualquer chamada de API/JWT em andamento
        UPDATE auth.users
        SET banned_until = '2999-12-31 23:59:59+00'::timestamptz
        WHERE id IN (
            SELECT id FROM public.users
            WHERE tenant_id = NEW.id
              AND UPPER(role::text) NOT IN ('SUPER_ADMIN', 'MOROS_ADMIN')
        );

    -- 2. Se a empresa foi REATIVADA
    ELSIF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
        -- Reativa técnicos
        UPDATE public.technicians
        SET active = true
        WHERE tenant_id = NEW.id;

        -- Reativa usuários
        UPDATE public.users
        SET active = true
        WHERE tenant_id = NEW.id;

        -- Remove banimento no auth.users
        UPDATE auth.users
        SET banned_until = NULL
        WHERE id IN (
            SELECT id FROM public.users
            WHERE tenant_id = NEW.id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_tenant_status_change ON public.tenants;

CREATE TRIGGER trg_cascade_tenant_status_change
AFTER UPDATE OF status ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.fn_cascade_tenant_status_change();

-- 3. BACKFILL DE SINCRONIZAÇÃO IMEDIATA (Caso já existam empresas suspensas)
UPDATE public.technicians
SET active = false
WHERE tenant_id IN (SELECT id FROM public.tenants WHERE status = 'suspended');

UPDATE public.users
SET active = false
WHERE tenant_id IN (SELECT id FROM public.tenants WHERE status = 'suspended')
  AND UPPER(role::text) NOT IN ('SUPER_ADMIN', 'MOROS_ADMIN');

UPDATE auth.users
SET banned_until = '2999-12-31 23:59:59+00'::timestamptz
WHERE id IN (
    SELECT id FROM public.users
    WHERE tenant_id IN (SELECT id FROM public.tenants WHERE status = 'suspended')
      AND UPPER(role::text) NOT IN ('SUPER_ADMIN', 'MOROS_ADMIN')
);

COMMIT;
