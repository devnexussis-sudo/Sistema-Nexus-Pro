-- Adiciona colunas faltantes na tabela 'tenants' que estão causando erro no Settings
-- Usando múltiplos ALTER TABLE para evitar erros de sintaxe e garantir idempotência

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "admin_email" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "company_name" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "trading_name" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "state_registration" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "os_prefix" TEXT DEFAULT 'OS-';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "os_start_number" BIGINT DEFAULT 1000;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "street" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "complement" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "neighborhood" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "cep" TEXT;

-- Opcional: Força recarga do cache schema do PostgREST
NOTIFY pgrst, 'reload schema';
