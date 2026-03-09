-- Migration: Remove Duplicate User Groups
-- Description: Remove grupos duplicados mantendo apenas o mais antigo de cada tipo por tenant
-- Execute este script SOMENTE se confirmar que há duplicatas via verify_duplicate_groups.sql

-- Função temporária para remover duplicatas
DO $$
DECLARE
  duplicate_record RECORD;
  ids_to_delete UUID[];
BEGIN
  -- Para cada conjunto de grupos duplicados
  FOR duplicate_record IN
    SELECT 
      tenant_id,
      name,
      ARRAY_AGG(id ORDER BY created_at DESC) as all_ids -- Ordena por created_at DESC
    FROM user_groups
    WHERE is_system = true
    GROUP BY tenant_id, name
    HAVING COUNT(*) > 1
  LOOP
    -- Pega todos os IDs exceto o primeiro (mais antigo)
    ids_to_delete := duplicate_record.all_ids[2:]; -- Remove o primeiro elemento (mais antigo)
    
    IF array_length(ids_to_delete, 1) > 0 THEN
      -- Primeiro, remove a associação de usuários aos grupos duplicados
      UPDATE users 
      SET group_id = NULL 
      WHERE group_id = ANY(ids_to_delete);
      
      -- Depois deleta os grupos duplicados
      DELETE FROM user_groups 
      WHERE id = ANY(ids_to_delete);
      
      RAISE NOTICE 'Removidos % grupos duplicados de "%" para tenant "%"', 
        array_length(ids_to_delete, 1),
        duplicate_record.name, 
        duplicate_record.tenant_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Limpeza de grupos duplicados concluída!';
END $$;

-- Revincula usuários ao grupo correto após limpeza
DO $$
DECLARE
  user_record RECORD;
  admin_group_id UUID;
BEGIN
  -- Para cada usuário ADMIN sem grupo
  FOR user_record IN
    SELECT id, tenant_id, role
    FROM users
    WHERE role = 'ADMIN' AND group_id IS NULL AND active = true
  LOOP
    -- Busca o grupo "Administradores" do tenant
    SELECT id INTO admin_group_id
    FROM user_groups
    WHERE tenant_id = user_record.tenant_id
      AND name = 'Administradores'
      AND is_system = true
    LIMIT 1;
    
    -- Se encontrou o grupo, vincula o usuário
    IF admin_group_id IS NOT NULL THEN
      UPDATE users
      SET group_id = admin_group_id
      WHERE id = user_record.id;
      
      RAISE NOTICE 'Usuário % vinculado ao grupo Administradores (ID: %)', 
        user_record.id, admin_group_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Revinculação de usuários aos grupos concluída!';
END $$;
