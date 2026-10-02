-- Migration para adicionar as colunas de desconto na tabela de Orçamentos (quotes) e Ordens (orders)
-- Executar no SQL Editor do Supabase Dashboard

-- Tabela de Orçamentos (quotes)
ALTER TABLE IF EXISTS public.quotes 
ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'fixed';

-- Tabela de Ordens de Serviço (orders)
ALTER TABLE IF EXISTS public.orders 
ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'fixed';

-- Atualiza o schema_cache para que a API REST (postgrest) reconheça as novas colunas
NOTIFY pgrst, 'reload schema';
