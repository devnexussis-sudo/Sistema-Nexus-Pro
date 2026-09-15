const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: invs } = await supabase.from('invoices').select('id, display_id, status, payment_gateway_id, gateway_payment_id').ilike('display_id', '%001').limit(1);
  console.log("FAT-001 Invoices:", invs);
}
run();
