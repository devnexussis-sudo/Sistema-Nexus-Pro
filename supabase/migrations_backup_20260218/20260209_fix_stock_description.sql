-- =====================================================================================
-- NEXUS PRO - FIX STOCK ITEMS SCHEMA
-- =====================================================================================
-- Data: 2026-02-09
-- Descrição: Adiciona coluna 'description' à tabela stock_items para corrigir erro de ordenação do frontend.

-- 1. Adicionar coluna description
ALTER TABLE public.stock_items 
ADD COLUMN IF NOT EXISTS description text;

-- 2. Migração de dados: Preenche description com o valor de name para registros existentes
UPDATE public.stock_items 
SET description = name 
WHERE description IS NULL OR description = '';

-- 3. Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
