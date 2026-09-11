const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// try to find .env file
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('invoices').select('id, display_id, status').eq('display_id', 'FAT-0010');
  console.log(data);
  const { data: insts } = await supabase.from('invoice_installments').select('id, status, gateway_payment_id').eq('invoice_id', data[0].id);
  console.log(insts);
}
run();
