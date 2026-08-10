DO $$ 
DECLARE
  v_table text;
  mapping_table text[][] := ARRAY[
    ['orders', 'orders'],
    ['customers', 'customers'],
    ['technicians', 'technicians'],
    ['quotes', 'quotes'],
    ['contracts', 'contracts'],
    ['cash_flow', 'financial'],
    ['form_templates', 'forms'],
    ['stock_items', 'stock'],
    ['stock_categories', 'stock'],
    ['equipments', 'equipments'],
    ['whatsapp_service_requests', 'ai']
  ];
  item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY mapping_table
  LOOP
    v_table := item[1];
    EXECUTE format('DROP POLICY IF EXISTS "gating_%s_%s" ON public.%I', v_table, item[2], v_table);
  END LOOP;
END $$;
