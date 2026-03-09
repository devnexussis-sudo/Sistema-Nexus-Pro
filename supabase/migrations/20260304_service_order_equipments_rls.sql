-- ════════════════════════════════════════════════════════════════════
-- Nexus Pro — RLS para service_order_equipments
-- Problema: tabela criada sem policies → INSERT/SELECT bloqueados
-- Solução: policy universal de isolamento por tenant_id
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- Garantir que RLS está habilitado
ALTER TABLE public.service_order_equipments ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas se existirem (idempotente)
DROP POLICY IF EXISTS service_order_equipments_isolation ON public.service_order_equipments;
DROP POLICY IF EXISTS "service_order_equipments SELECT" ON public.service_order_equipments;
DROP POLICY IF EXISTS "service_order_equipments ALL"   ON public.service_order_equipments;

-- Policy universal: usuário autenticado só acessa registros do seu tenant
-- Cobre SELECT, INSERT, UPDATE, DELETE
CREATE POLICY service_order_equipments_isolation
  ON public.service_order_equipments
  FOR ALL
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

-- Notifica PostgREST para recarregar schema
NOTIFY pgrst, 'reload schema';

COMMIT;
