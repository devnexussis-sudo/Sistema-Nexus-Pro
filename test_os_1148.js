import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Fetching order 1148...");
  const { data: order, error: orderErr } = await supabase.from('orders').select('id, tenant_id, display_id').ilike('display_id', '%1148%').limit(1).single();
  
  if (orderErr) {
    console.error("Error fetching order:", orderErr);
    process.exit(1);
  }
  
  console.log("Order found:", order);
  
  const { data: visits, error: visitErr } = await supabase.from('service_visits').select('*').eq('order_id', order.id);
  
  if (visitErr) {
    console.error("Error fetching visits:", visitErr);
    process.exit(1);
  }
  
  console.log(`Found ${visits?.length} visits for this order.`);
  if (visits && visits.length > 0) {
     console.log("Visits sample:");
     visits.forEach(v => console.log(`ID: ${v.id}, Tenant: ${v.tenant_id}, Status: ${v.status}, VisitNum: ${v.visit_number}`));
  }
  process.exit(0);
}

run();
