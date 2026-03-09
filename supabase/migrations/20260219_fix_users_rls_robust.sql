
-- 🛡️ Nexus Pro - Reforço Final de Segurança RLS (Users)
-- Este script garante que Admins possam gerenciar usuários do próprio tenant sem erros de case ou chaves.

BEGIN;

-- 1. Limpeza de policies antigas para evitar conflitos
DROP POLICY IF EXISTS "users_read_policy" ON public.users;
DROP POLICY IF EXISTS "users_write_policy" ON public.users;
DROP POLICY IF EXISTS "users_write_access" ON public.users;

-- 2. Política de LEITURA (SELECT)
-- Usuário vê a si mesmo OU alguém do mesmo tenantId (via JWT para performance)
CREATE POLICY "users_read_policy" ON public.users
FOR SELECT
USING (
  auth.uid() = id
  OR
  (
    COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
      (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
    )::uuid = tenant_id
  )
);

-- 3. Política de ESCRITA (INSERT, UPDATE, DELETE)
-- Somente Admins do mesmo tenant
CREATE POLICY "users_write_policy" ON public.users
FOR ALL
USING (
  (
    LOWER(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR
    LOWER(auth.jwt() -> 'user_metadata' ->> 'role') = 'moros_admin'
  )
  AND
  (
    COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
      (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
    )::uuid = tenant_id
  )
);

COMMIT;

-- 💡 Dica: Se o erro "nada acontece" persistir, verifique se o Admin que está logado
-- possui as chaves 'role' e 'tenantId' (ou tenant_id) no seu metadado de usuário no Supabase Auth.
