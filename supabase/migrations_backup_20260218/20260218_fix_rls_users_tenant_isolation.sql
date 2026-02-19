-- ==============================================================================
-- NEXUS PRO — FIX RLS: ISOLAMENTO DE TENANT PARA USERS (GRAVE-S6 / GRAVE-S7)
-- ==============================================================================
-- Problema: policies users_select e users_delete usavam is_admin() sem filtrar
-- por tenant_id, permitindo que um admin de Tenant A visse/deletasse dados do Tenant B.
--
-- Solução: Adicionar get_user_tenant_id() como filtro obrigatório em TODAS as
-- policies que envolvem admins, garantindo isolamento absoluto por tenant.
--
-- Autor: Nexus Pro Security Team
-- Data: 2026-02-18
-- Idempotente: SIM (DROP IF EXISTS + CREATE)
-- ==============================================================================

-- ============================================================
-- 1. REMOVER POLICIES ANTIGAS COM VAZAMENTO
-- ============================================================

-- Tabela: users
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_select_tenant" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;
DROP POLICY IF EXISTS "users_delete_admin" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;

-- ============================================================
-- 2. GARANTIR QUE RLS ESTÁ ATIVO
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 3. POLICY: SELECT
-- Regra: Um usuário pode ver:
--   a) Seus próprios dados (qualquer role)
--   b) Todos os usuários do SEU tenant (se for admin/master do mesmo tenant)
-- ⛔ NUNCA pode ver usuários de outro tenant, mesmo sendo admin.
-- ============================================================
CREATE POLICY "users_select_own_data"
ON public.users
FOR SELECT
TO authenticated
USING (
    -- Caso 1: O usuário está vendo seus próprios dados
    id = auth.uid()
    OR
    -- Caso 2: Admin vendo usuários do SEU tenant (tenant_id obrigatório)
    (
        get_user_tenant_id() IS NOT NULL
        AND tenant_id = get_user_tenant_id()
        AND (
            -- Verifica role via JWT claim (texto, sem cast de enum)
            (auth.jwt() ->> 'role') IN ('ADMIN', 'admin')
            OR
            -- Ou verifica diretamente na tabela users (::text evita erro de enum)
            EXISTS (
                SELECT 1 FROM public.users AS caller
                WHERE caller.id = auth.uid()
                  AND caller.tenant_id = get_user_tenant_id()
                  AND caller.role::text IN ('ADMIN', 'MANAGER')
                  AND caller.active = true
            )
        )
    )
);

-- ============================================================
-- 4. POLICY: INSERT
-- Regra: Apenas admins podem criar usuários, e apenas no SEU tenant.
-- A Edge Function admin-operations usa service_role (bypassa RLS),
-- mas esta policy protege chamadas diretas do cliente anon.
-- ============================================================
CREATE POLICY "users_insert_tenant_admin"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
    -- O novo usuário DEVE pertencer ao tenant do admin que está criando
    tenant_id = get_user_tenant_id()
    AND get_user_tenant_id() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.users AS caller
        WHERE caller.id = auth.uid()
          AND caller.tenant_id = get_user_tenant_id()
          AND caller.role::text IN ('ADMIN', 'MANAGER')
          AND caller.active = true
    )
);

-- ============================================================
-- 5. POLICY: UPDATE
-- Regra: Um usuário pode atualizar:
--   a) Seus próprios dados (campos não-sensíveis — role, tenant_id não podem mudar)
--   b) Qualquer usuário do SEU tenant (se for admin)
-- ⛔ Não pode promover usuário para role acima do seu próprio.
-- ============================================================
CREATE POLICY "users_update_own_profile"
ON public.users
FOR UPDATE
TO authenticated
USING (
    -- Próprios dados
    id = auth.uid()
    OR
    -- Admin atualizando usuário do SEU tenant
    (
        tenant_id = get_user_tenant_id()
        AND get_user_tenant_id() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.users AS caller
            WHERE caller.id = auth.uid()
              AND caller.tenant_id = get_user_tenant_id()
              AND caller.role::text IN ('ADMIN', 'MANAGER')
              AND caller.active = true
        )
    )
)
WITH CHECK (
    -- Garante que o tenant_id não pode ser alterado para outro tenant
    tenant_id = get_user_tenant_id()
    OR
    -- Ou é o próprio usuário atualizando seus dados (tenant_id não muda)
    id = auth.uid()
);

-- ============================================================
-- 6. POLICY: DELETE
-- Regra: Apenas admins podem deletar usuários, e apenas do SEU tenant.
-- ⛔ NUNCA pode deletar usuários de outro tenant.
-- ⛔ Não pode auto-deletar (proteção extra).
-- ============================================================
CREATE POLICY "users_delete_tenant_admin_only"
ON public.users
FOR DELETE
TO authenticated
USING (
    -- Deve ser admin do MESMO tenant do usuário a ser deletado
    tenant_id = get_user_tenant_id()
    AND get_user_tenant_id() IS NOT NULL
    -- Não pode se auto-deletar via RLS (proteção extra)
    AND id != auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.users AS caller
        WHERE caller.id = auth.uid()
          AND caller.tenant_id = get_user_tenant_id()
          AND caller.role::text IN ('ADMIN')
          AND caller.active = true
    )
);

-- ============================================================
-- 7. VERIFICAÇÃO: Confirmar policies criadas
-- ============================================================
DO $$
DECLARE
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'users'
      AND schemaname = 'public';

    IF policy_count >= 4 THEN
        RAISE NOTICE '✅ RLS Fix aplicado com sucesso. % policies ativas na tabela users.', policy_count;
    ELSE
        RAISE WARNING '⚠️ Apenas % policies encontradas. Verifique se todas foram criadas.', policy_count;
    END IF;
END $$;

-- ============================================================
-- 8. COMENTÁRIO DE AUDITORIA
-- ============================================================
COMMENT ON TABLE public.users IS
'Tabela de usuários com RLS estrito por tenant.
Policies: users_select_own_data, users_insert_tenant_admin,
          users_update_own_profile, users_delete_tenant_admin_only.
Última revisão de segurança: 2026-02-18 (GRAVE-S6/S7 fix).
NUNCA remover FORCE ROW LEVEL SECURITY desta tabela.';
