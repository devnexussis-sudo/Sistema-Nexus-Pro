-- Migration: Módulo Financeiro - Nexus Pro
-- Objetivo: Preparar tabelas de ordens e orçamentos para gestão de cobrança

-- 1. Alterar Tabela de Ordens (Service Orders)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'PENDING' CHECK (billing_status IN ('PENDING', 'PAID'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT; -- Dinheiro, Cartão à vista, Cartão Parcelado
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- 2. Alterar Tabela de Orçamentos (Quotes)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'PENDING' CHECK (billing_status IN ('PENDING', 'PAID'));
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- 3. Garantir que as tabelas tenham public_token para compartilhamento (caso não existam)
-- Estes tokens são gerados na inserção ou via RPC
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE DEFAULT uuid_generate_v4()::text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE DEFAULT uuid_generate_v4()::text;

-- 4. Criar Índices para filtros de performance no Dash Financeiro
CREATE INDEX IF NOT EXISTS idx_orders_billing_status ON orders(billing_status);
CREATE INDEX IF NOT EXISTS idx_quotes_billing_status ON quotes(billing_status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);

-- 5. Comentários para documentação
COMMENT ON COLUMN orders.billing_status IS 'Status financeiro da O.S. (PENDING ou PAID)';
COMMENT ON COLUMN quotes.billing_status IS 'Status financeiro do Orçamento (PENDING ou PAID)';
