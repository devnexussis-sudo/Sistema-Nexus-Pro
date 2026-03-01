-- ============================================================
-- Nexus Line - Fix Public Order RPC (Correção do Tipo do ID)
-- Objetivo: Retornar endereço ATUALIZADO do cliente (JOIN customers)
-- ============================================================

DROP FUNCTION IF EXISTS get_public_order_full(text);

CREATE OR REPLACE FUNCTION get_public_order_full(search_term text)
RETURNS TABLE (
  id                  text,
  tenant_id           uuid,
  display_id          text,
  public_token        uuid,
  title               text,
  description         text,
  status              text,
  priority            text,
  operation_type      text,
  customer_name       text,
  customer_address    text,
  equipment_name      text,
  equipment_model     text,
  equipment_serial    text,
  assigned_to         uuid,
  form_id             uuid,
  form_data           jsonb,
  items               jsonb,
  created_at          timestamptz,
  updated_at          timestamptz,
  scheduled_date      date,
  scheduled_time      time,
  start_date          timestamptz,
  end_date            timestamptz,
  show_value_to_client boolean,
  timeline            jsonb,
  checkin_location    jsonb,
  checkout_location   jsonb,
  pause_reason        text,
  client_signature_url text,
  client_signature_name text
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
    o.status::text,
    o.priority::text,
    o.operation_type,
    o.customer_name,
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
      CASE WHEN o.customer_address = 'null' OR o.customer_address = '' THEN NULL ELSE o.customer_address END
    ) AS customer_address,
    o.equipment_name,
    o.equipment_model,
    o.equipment_serial,
    o.assigned_to,
    o.form_id,
    o.form_data,
    o.items,
    o.created_at,
    o.updated_at,
    o.scheduled_date,
    o.scheduled_time,
    o.start_date,
    o.end_date,
    o.show_value_to_client,
    o.timeline,
    o.checkin_location,
    o.checkout_location,
    o.pause_reason,
    o.client_signature_url,
    o.client_signature_name
  FROM orders o
  LEFT JOIN customers c
    ON  LOWER(TRIM(c.name)) = LOWER(TRIM(o.customer_name))
    AND c.tenant_id = o.tenant_id
  WHERE o.public_token::text = search_term
     OR (o.id = search_term AND o.public_token IS NOT NULL)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_public_order_full(text) TO anon, authenticated, service_role;
