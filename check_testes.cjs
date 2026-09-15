const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: qts } = await supabase.from('quotes').select('id, display_id, title, total_value, created_at').in('display_id', ['ORC-112609006', 'ORC-532609007']);
  console.log("Testes quotes:", qts);
}
run();
