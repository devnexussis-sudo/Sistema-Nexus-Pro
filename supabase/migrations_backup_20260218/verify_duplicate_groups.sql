-- Script de Verificação de Grupos Duplicados
-- Execute no SQL Editor do Supabase

-- 1. Verificar grupos duplicados por tenant
SELECT 
  tenant_id,
  name,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY created_at) as group_ids,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM user_groups
WHERE is_system = true
GROUP BY tenant_id, name
HAVING COUNT(*) > 1
ORDER BY tenant_id, name;

-- 2. Ver todos os grupos do sistema
SELECT 
  ug.id,
  ug.tenant_id,
  t.name as tenant_name,
  ug.name as group_name,
  ug.description,
  ug.created_at,
  ug.is_system
FROM user_groups ug
LEFT JOIN tenants t ON t.id = ug.tenant_id
WHERE is_system = true
ORDER BY tenant_id, ug.name;

-- 3. Contar grupos por tenant
SELECT 
  t.name as tenant_name,
  t.id as tenant_id,
  COUNT(ug.id) as total_groups,
  COUNT(CASE WHEN ug.name = 'Administradores' THEN 1 END) as admin_groups,
  COUNT(CASE WHEN ug.name = 'Operadores' THEN 1 END) as operator_groups,
  COUNT(CASE WHEN ug.name = 'Técnicos de Campo' THEN 1 END) as tech_groups
FROM tenants t
LEFT JOIN user_groups ug ON ug.tenant_id = t.id AND ug.is_system = true
GROUP BY t.id, t.name
ORDER BY t.name;
