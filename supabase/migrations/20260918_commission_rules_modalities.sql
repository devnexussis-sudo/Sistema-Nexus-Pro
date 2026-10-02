-- ============================================================================
-- Migration: commission_rules_modalities
-- Adiciona a coluna modalities (JSONB) para suporte a múltiplas modalidades
-- ============================================================================

-- 1. Adicionar a coluna modalities com fallback array vazio
ALTER TABLE commission_rules 
ADD COLUMN IF NOT EXISTS modalities JSONB DEFAULT '[]'::jsonb;

-- A estrutura do JSON dentro do array será:
-- [
--   {
--     "operationType": "Instalação",
--     "completedType": "percent",
--     "completedValue": 10,
--     "blockedType": "fixed",
--     "blockedValue": 50
--   }
-- ]
