-- 🔥 Nexus Global Stats Alignment: Garante que os números do Super Admin batam com os painéis dos clientes
-- Atualizando a view para usar as tabelas oficiais de cada módulo

DROP VIEW IF EXISTS vw_tenant_stats;
CREATE OR REPLACE VIEW vw_tenant_stats AS
SELECT 
  t.*,
  -- Técnicos Ativos (Cálculo real para o Master)
  COALESCE((SELECT COUNT(*) FROM technicians WHERE tenant_id = t.id AND active = true), 0) AS real_active_techs,
  
  -- Ordens de Serviço (Cálculo real para o Master)
  COALESCE((SELECT COUNT(*) FROM orders WHERE tenant_id = t.id), 0) AS real_os_count,
  
  -- Equipamentos (Cálculo real para o Master)
  COALESCE((SELECT COUNT(*) FROM equipments WHERE tenant_id = t.id), 0) AS real_equipment_count,
  
  -- Usuários (Cálculo real para o Master)
  COALESCE((SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND active = true), 0) AS real_user_count
FROM tenants t
ORDER BY t.name;
