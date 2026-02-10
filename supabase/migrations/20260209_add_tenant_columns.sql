-- Adiciona colunas faltantes na tabela 'tenants' para suportar configurações completas da empresa
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS "admin_email" TEXT,
ADD COLUMN IF NOT EXISTS "company_name" TEXT,
ADD COLUMN IF NOT EXISTS "trading_name" TEXT,
ADD COLUMN IF NOT EXISTS "website" TEXT, 
ADD COLUMN IF NOT EXISTS "state_registration" TEXT,
ADD COLUMN IF NOT EXISTS "os_prefix" TEXT DEFAULT 'OS-',
ADD COLUMN IF NOT EXISTS "os_start_number" BIGINT DEFAULT 1000,
ADD COLUMN IF NOT EXISTS "street" TEXT,
ADD COLUMN IF NOT EXISTS "number" TEXT,
ADD COLUMN IF NOT EXISTS "complement" TEXT,
ADD COLUMN IF NOT EXISTS "neighborhood" TEXT,
ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "state" TEXT,
ADD COLUMN IF NOT EXISTS "cep" TEXT;
