-- Script SQL para adicionar constraints de unicidade no Supabase
-- Execute este script no SQL Editor do painel Supabase

-- 1. CLIENTES: CPF/CNPJ único (apenas para registros ativos)
-- Remove constraint antiga se existir
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_document_unique;

-- Cria índice único parcial (apenas para clientes ativos)
CREATE UNIQUE INDEX IF NOT EXISTS customers_document_active_unique 
ON public.customers (document) 
WHERE active = true AND document IS NOT NULL AND document != '';

-- 2. ORDENS DE SERVIÇO: ID único (já é PK, mas garantindo)
-- O campo 'id' já é chave primária, então já é único por padrão

-- 3. USUÁRIOS/TÉCNICOS: Email único
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE public.users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- 4. EQUIPAMENTOS: Serial Number único (apenas ativos)
CREATE UNIQUE INDEX IF NOT EXISTS equipments_serial_active_unique 
ON public.equipments ("serialNumber") 
WHERE active = true AND "serialNumber" IS NOT NULL AND "serialNumber" != '';

-- Confirmação
SELECT 'Constraints de unicidade criadas com sucesso!' as status;
