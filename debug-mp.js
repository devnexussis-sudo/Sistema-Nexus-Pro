import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log("--- Checking tenant_mercadopago_settings ---");
  const { data: mpData, error: mpErr } = await supabase
    .from('tenant_mercadopago_settings')
    .select('*');
    
  if (mpErr) {
    console.error("mpErr:", mpErr);
  } else {
    console.log("MP Rows:", mpData);
  }

  console.log("\n--- Checking recent orders ---");
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, tenant_id, title, total_value, gateway_provider, gateway_status')
    .order('created_at', { ascending: false })
    .limit(5);

  if (oErr) {
    console.error("oErr:", oErr);
  } else {
    console.log("Orders:", orders);
  }
}

main();
