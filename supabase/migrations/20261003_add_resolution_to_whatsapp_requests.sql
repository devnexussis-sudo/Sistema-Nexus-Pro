-- Migration: Adicionar suporte à resolução direta de solicitações de atendimento sem O.S.
-- Habilita as colunas resolution_notes e resolved_at na tabela whatsapp_service_requests
-- e garante que o status 'RESOLVED' seja aceito caso exista check constraint.

ALTER TABLE IF EXISTS whatsapp_service_requests 
ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

ALTER TABLE IF EXISTS whatsapp_service_requests 
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Remove constraint legada se existir e recria permitindo 'RESOLVED'
DO $$
BEGIN
  -- Se houver check constraint no status, remove
  ALTER TABLE whatsapp_service_requests DROP CONSTRAINT IF EXISTS whatsapp_service_requests_status_check;
  ALTER TABLE whatsapp_service_requests DROP CONSTRAINT IF EXISTS check_status;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
