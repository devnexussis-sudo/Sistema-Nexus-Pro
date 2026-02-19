-- Migration: Financial & Stock Advanced Architecture - Nexus Pro
-- Objetivo: Implementar Fluxo de Caixa, Estoque Técnico e Auditabilidade

-- 1. Tabela de Fluxo de Caixa (Empresa)
CREATE TABLE IF NOT EXISTS cash_flow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')), -- Entrada ou Saída
    category TEXT NOT NULL, -- Vendas, Serviço, Compra de Peças, etc.
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    reference_id TEXT, -- ID da OS ou Orçamento
    reference_type TEXT, -- 'ORDER' ou 'QUOTE'
    payment_method TEXT,
    entry_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- 2. Tabela de Estoque Descentralizado (Técnicos)
CREATE TABLE IF NOT EXISTS tech_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID REFERENCES users(id), -- Técnico
    stock_item_id UUID REFERENCES stock_items(id),
    quantity DECIMAL(12,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, stock_item_id)
);

-- 3. Tabela de Movimentações e Auditoria de Estoque
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    item_id UUID REFERENCES stock_items(id),
    user_id UUID REFERENCES users(id), -- Técnico envolvido (opcional se for estoque geral)
    type TEXT NOT NULL CHECK (type IN ('TRANSFER', 'CONSUMPTION', 'RESTOCK', 'ADJUSTMENT')),
    quantity DECIMAL(12,2) NOT NULL,
    source TEXT, -- 'GENERAL', 'TECH', etc.
    destination TEXT, -- 'TECH', 'ORDER', etc.
    reference_id TEXT, -- ID da OS onde foi usado (se CONSUMPTION)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- 4. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_cash_flow_tenant ON cash_flow(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tech_stock_user ON tech_stock(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);

-- 5. Enable RLS
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (assuming standard isolation by tenant_id)
-- These will need to be adapted if using get_current_tenant_id() function
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view cash_flow in same tenant') THEN
        CREATE POLICY "Users can view cash_flow in same tenant" ON cash_flow FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id::text = auth.uid()::text));
    END IF;
END $$;

-- (Repetir lógica para tech_stock e stock_movements conforme necessário)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS linked_quotes TEXT[] DEFAULT '{}';
