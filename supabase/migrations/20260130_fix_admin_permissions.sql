-- Migration: Fix Admin Users Permissions
-- Description: Atualiza usuários administradores existentes que não têm permissões configuradas

UPDATE users
SET permissions = jsonb_build_object(
  'orders', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'customers', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'equipments', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'technicians', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'quotes', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'contracts', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'stock', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'forms', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'settings', true,
  'manageUsers', true,
  'accessSuperAdmin', false,
  'financial', jsonb_build_object('read', true, 'update', true)
)
WHERE role = 'ADMIN' 
  AND (permissions IS NULL OR permissions = 'null'::jsonb OR permissions = '{}'::jsonb);
