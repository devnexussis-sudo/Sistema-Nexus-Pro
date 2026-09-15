const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('transactions').select('id').limit(1);
  console.log("transactions error:", error ? error.message : "Success");
  
  const { data: d2, error: e2 } = await supabase.from('cash_flow_entries').select('id').limit(1);
  console.log("cash_flow_entries error:", e2 ? e2.message : "Success");
}
run();
