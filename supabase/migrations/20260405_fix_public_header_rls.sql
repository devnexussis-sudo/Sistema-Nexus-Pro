-- 🛡️ Nexus Pro - Fix para Exibição do Cabeçalho em Links Públicos
-- Autor: Antigravity AI
-- Descrição: Permite que usuários não autenticados (anon) visualizem informações básicas da empresa (tenant)
--             e perfis públicos de técnicos, corrigindo a falha onde o logotipo e dados da empresa
--             não aparecem no portal do cliente.

BEGIN;

-- 1. Liberação de Leitura de Tenant para o Público
-- Esta política permite que o client `anon` (sem login) recupere os dados da empresa
-- necessários para o cabeçalho (logo, nome, endereço, etc).
DROP POLICY IF EXISTS "tenants_public_read" ON public.tenants;
CREATE POLICY "tenants_public_read" ON public.tenants
  FOR SELECT TO anon
  USING (true);

-- 2. Liberação de Consulta de Técnicos (Seleção limitada)
-- Permite que o portal público exiba quem realizou o serviço.
DROP POLICY IF EXISTS "technicians_public_read" ON public.technicians;
CREATE POLICY "technicians_public_read" ON public.technicians
  FOR SELECT TO anon
  USING (active = true);

-- 3. Garantia de Acesso a Orçamentos e Ordens via Token Público
-- Embora as funções RPC usem SECURITY DEFINER, garantir políticas de SELECT
-- via token público ajuda na resiliência do frontend.

-- Política para Quotes (Orçamentos)
DROP POLICY IF EXISTS "quotes_public_read" ON public.quotes;
CREATE POLICY "quotes_public_read" ON public.quotes
  FOR SELECT TO anon
  USING (public_token IS NOT NULL);

-- Política para Orders (Ordens de Serviço)
DROP POLICY IF EXISTS "orders_public_read" ON public.orders;
CREATE POLICY "orders_public_read" ON public.orders
  FOR SELECT TO anon
  USING (public_token IS NOT NULL);

-- Notificar PostgREST para recarregar o schema e as permissões
NOTIFY pgrst, 'reload schema';

COMMIT;
