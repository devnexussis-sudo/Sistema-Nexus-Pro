-- Migração para separar campos de endereço em colunas individuais na tabela tenants
-- Isso permite maior controle e filtros sobre os dados de localização.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS number TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS complement TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cep TEXT;

-- Mantendo as colunas de configuração de OS
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS os_prefix TEXT DEFAULT 'OS-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS os_start_number INTEGER DEFAULT 1000;
