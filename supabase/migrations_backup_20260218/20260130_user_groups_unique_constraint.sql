-- Migration: Add unique constraint to user_groups
-- Description: Garante que não haja grupos com o mesmo nome dentro de um tenant

-- Remove duplicatas existentes (mantém o mais recente de cada par)
DELETE FROM user_groups a
USING user_groups b
WHERE a.tenant_id = b.tenant_id 
  AND a.name = b.name 
  AND a.created_at < b.created_at;

-- Adiciona constraint única
ALTER TABLE user_groups 
ADD CONSTRAINT user_groups_tenant_name_unique 
UNIQUE (tenant_id, name);
