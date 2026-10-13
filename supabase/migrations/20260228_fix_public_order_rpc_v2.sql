-- ============================================================
-- Nexus Line - Fix Public Order RPC v2
-- Objetivo: Retornar endereço ATUALIZADO do cliente (JOIN customers)
--           e garantir que signature_name / signature_doc cheguem corretamente
-- ============================================================

CREATE OR REPLACE FUNCTION get_public_order(search_term text)
RETURNS SETOF orders AS $$
BEGIN
  RETURN QUERY
  SELECT o.*
  FROM orders o
  WHERE o.public_token = search_term
     OR (o.id::text = search_term AND o.public_token IS NOT NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Função auxiliar: retorna a OS com endereço FRESCO do cliente
-- (usa SECURITY DEFINER para bypassar RLS na tabela customers)
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_order_full(search_term text)
RETURNS TABLE (
  -- Todos os campos da OS
  id                  uuid,
  tenant_id           uuid,
  display_id          text,
  public_token        uuid,
  title               text,
  description         text,
  status              text,
  priority            text,
  operation_type      text,
  customer_name       text,
  -- Endereço: JOIN com customers para pegar o mais atualizado
  customer_address    text,
  equipment_name      text,
  equipment_model     text,
  equipment_serial    text,
  assigned_to         uuid,
  form_id             uuid,
  form_data           jsonb,
  items               jsonb,
  notes               text,
  created_at          timestamptz,
  updated_at          timestamptz,
  scheduled_date      date,
  scheduled_time      text,
  start_date          timestamptz,
  end_date            timestamptz,
  show_value_to_client boolean,
  billing_status      text,
  payment_method      text,
  paid_at             timestamptz,
  billing_notes       text,
  timeline            jsonb,
  checkin_location    jsonb,
  checkout_location   jsonb,
  pause_reason        text,
  -- Assinatura do responsável (coletada no encerramento pelo técnico)
  signature           text,
  signature_name      text,
  signature_doc       text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.tenant_id,
    o.display_id,
    o.public_token,
    o.title,
    o.description,
    o.status,
    o.priority,
    o.operation_type,
    o.customer_name,
    -- Prefere endereço atual do cadastro; fallback para o da OS
    COALESCE(
      NULLIF(TRIM(
        CONCAT_WS(', ',
          NULLIF(TRIM(c.address), ''),
          NULLIF(TRIM(c.number::text), ''),
          NULLIF(TRIM(c.complement), ''),
          NULLIF(TRIM(c.neighborhood), ''),
          NULLIF(TRIM(c.city), '')
        )
      ), ''),
      NULLIF(o.customer_address, 'null'),
      o.customer_address
    ) AS customer_address,
    o.equipment_name,
    o.equipment_model,
    o.equipment_serial,
    o.assigned_to,
    o.form_id,
    o.form_data,
    o.items,
    o.notes,
    o.created_at,
    o.updated_at,
    o.scheduled_date,
    o.scheduled_time,
    o.start_date,
    o.end_date,
    o.show_value_to_client,
    o.billing_status,
    o.payment_method,
    o.paid_at,
    o.billing_notes,
    o.timeline,
    o.checkin_location,
    o.checkout_location,
    o.pause_reason,
    o.signature,
    o.signature_name,
    o.signature_doc
  FROM orders o
  LEFT JOIN customers c
    ON  LOWER(TRIM(c.name)) = LOWER(TRIM(o.customer_name))
    AND c.tenant_id = o.tenant_id
  WHERE o.public_token = search_term::uuid
     OR (o.id::text = search_term AND o.public_token IS NOT NULL)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões públicas
GRANT EXECUTE ON FUNCTION get_public_order(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_public_order_full(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION get_public_order_full(text) IS
  'OS pública com endereço fresco do cadastro de clientes e campos de assinatura. SECURITY DEFINER.';
