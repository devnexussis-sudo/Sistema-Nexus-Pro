const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: insts } = await supabase.from('invoice_installments').select('status');
  const statuses = new Set(insts?.map(i => i.status));
  console.log("Distinct statuses:", Array.from(statuses));
}
run();
