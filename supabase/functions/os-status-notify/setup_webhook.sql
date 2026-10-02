-- =========================================================================
-- SCRIPT PARA CRIAR O WEBHOOK (GATILHO) NO SUPABASE
-- Cole este código no SQL Editor do Supabase e clique em RUN
-- =========================================================================

-- 1. Remove o gatilho caso ele já exista (para evitar duplicação)
DROP TRIGGER IF EXISTS "os_status_notify_webhook" ON "public"."orders";

-- 2. Cria o novo gatilho que avisa a Edge Function sempre que o status mudar
CREATE TRIGGER "os_status_notify_webhook"
AFTER INSERT OR UPDATE OF "status" ON "public"."orders"
FOR EACH ROW
EXECUTE FUNCTION "supabase_functions"."http_request"(
  'https://esrwwaoirlhcptbxtlsu.supabase.co/functions/v1/os-status-notify',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '2000'
);

-- Sucesso! Agora o banco de dados enviará as mudanças de status para a nova função automaticamente.
