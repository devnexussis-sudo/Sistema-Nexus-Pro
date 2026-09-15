const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', '6fd6ee00-861a-462e-abc1-c4205c594d93');
  console.log("Invoice Items for new FAT-0011:", items);
  const { data: items2 } = await supabase.from('invoice_items').select('*').eq('invoice_id', '7d1c587b-4f8d-497c-9e45-3467607486b0');
  console.log("Invoice Items for old FAT-0011:", items2);
}
run();
