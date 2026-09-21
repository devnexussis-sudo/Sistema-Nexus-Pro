CREATE OR REPLACE FUNCTION public.get_public_invoice_by_reference(p_ref_id uuid, p_ref_type text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_invoice jsonb;
BEGIN
  SELECT to_jsonb(i.*) INTO v_invoice
  FROM public.invoices i
  JOIN public.invoice_items ii ON ii.invoice_id = i.id
  WHERE ii.reference_type = p_ref_type
    AND ii.reference_id = p_ref_id
  ORDER BY i.created_at DESC
  LIMIT 1;

  RETURN v_invoice;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_invoice_by_reference(uuid, text) TO anon, authenticated, service_role;
