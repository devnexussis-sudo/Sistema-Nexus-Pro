-- Migration: Create Tenant Statistics View
-- Description: View otimizada para estatísticas globais de empresas

CREATE OR REPLACE VIEW vw_tenant_stats AS
SELECT 
  t.id,
  t.slug,
  t.name,
  t.company_name,
  t.trading_name,
  t.cnpj,
  t.document,
  t.admin_email,
  t.email,
  t.phone,
  t.logo_url,
  t.street,
  t.number,
  t.complement,
  t.neighborhood,
  t.city,
  t.state,
  t.cep,
  t.website,
  t.state_registration,
  t.os_prefix,
  t.os_start_number,
  t.created_at,
  t.updated_at,
  t.status,
  
  -- Estatísticas calculadas
  COALESCE((SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND role = 'TECHNICIAN' AND active = true), 0) AS active_techs,
  COALESCE((SELECT COUNT(*) FROM orders WHERE tenant_id = t.id), 0) AS os_count,
  COALESCE((SELECT COUNT(*) FROM equipments WHERE tenant_id = t.id), 0) AS equipment_count,
  COALESCE((SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND active = true), 0) AS user_count
  
FROM tenants t
ORDER BY t.name;

-- Grant permissions
GRANT SELECT ON vw_tenant_stats TO service_role;
GRANT SELECT ON vw_tenant_stats TO authenticated;
