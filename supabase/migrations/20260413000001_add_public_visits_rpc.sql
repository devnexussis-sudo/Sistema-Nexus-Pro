-- ============================================================
-- Nexus Line - Add Public Visits RPC
-- Objetivo: Permitir a visualização pública das visitas de uma OS
-- ============================================================

CREATE OR REPLACE FUNCTION get_public_order_visits(search_term text)
RETURNS TABLE (
  id UUID,
  order_id TEXT,
  technician_id UUID,
  technician_name TEXT,
  status visit_status,
  pause_reason TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  notes TEXT,
  form_data JSONB,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_order_id TEXT;
  v_tenant_id UUID;
BEGIN
  -- 1. Verifica se a OS existe e obtém o ID interno/Tenant
  SELECT o.id, o.tenant_id INTO v_order_id, v_tenant_id
  FROM orders o
  WHERE o.public_token::text = search_term
     OR (o.id = search_term AND o.public_token IS NOT NULL)
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Retorna as visitas vinculadas
  RETURN QUERY
  SELECT 
    v.id,
    v.order_id,
    v.technician_id,
    u.name AS technician_name,
    v.status,
    v.pause_reason,
    v.scheduled_date,
    v.scheduled_time,
    v.arrival_time,
    v.departure_time,
    v.notes,
    v.form_data,
    v.created_at
  FROM service_visits v
  LEFT JOIN users u ON u.id = v.technician_id
  WHERE v.order_id = v_order_id
    AND v.tenant_id = v_tenant_id
  ORDER BY v.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_public_order_visits(text) TO anon, authenticated, service_role;
