begin;
  alter publication supabase_realtime add table invoices;
  alter publication supabase_realtime add table invoice_installments;
  alter publication supabase_realtime add table cash_flow;
  alter publication supabase_realtime add table quotes;
  alter publication supabase_realtime add table orders;
commit;
