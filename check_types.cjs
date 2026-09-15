const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: q } = await supabase.from('quotes').select('id').limit(1);
  const { data: i } = await supabase.from('invoice_items').select('reference_id').limit(1);
  console.log("Quotes ID typeof:", typeof q[0].id);
  console.log("Invoice Items ref typeof:", typeof i[0].reference_id);
}
run();
