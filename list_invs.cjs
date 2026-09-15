const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: invs } = await supabase.from('invoices').select('id, display_id, status, payment_gateway_id, gateway_payment_id');
  console.log("All Invoices:");
  invs.forEach(inv => {
    console.log(`- ${inv.display_id}: ${inv.status}, pg_id: ${inv.payment_gateway_id}, gp_id: ${inv.gateway_payment_id}`);
  });
}
run();
