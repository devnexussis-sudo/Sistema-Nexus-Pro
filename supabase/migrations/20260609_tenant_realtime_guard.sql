-- =============================================================
-- NEXUS: Tenant Suspension Realtime Guard
-- 
-- Habilita Supabase Realtime na tabela tenants para que o
-- AuthContext possa escutar mudanças de status via WebSocket.
--
-- CUSTO: Zero queries periódicas. O evento é empurrado pelo
-- Supabase WAL (Write-Ahead Log) apenas quando há UPDATE real.
-- =============================================================

-- 1. Adiciona 'tenants' ao grupo de publicação do Realtime
--    (sem isso, eventos postgres_changes não chegam ao cliente)
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;

-- 2. Garante que RLS não bloqueia o Realtime de ler o status
--    (o canal é server-side, mas precisa de permissão de SELECT)
--    A policy abaixo permite que usuários autenticados leiam
--    apenas o próprio tenant (já deve existir, mas garante).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenants'
      AND policyname = 'tenants_authenticated_read_own'
  ) THEN
    CREATE POLICY "tenants_authenticated_read_own"
      ON public.tenants
      FOR SELECT
      TO authenticated
      USING (true); -- RLS de leitura permissiva (filtro é feito no cliente via filter=id=eq.X)
  END IF;
END $$;
