const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: qts } = await supabase.from('quotes').select('id, display_id, tenant_id').eq('id', '2e8aded0-8cd0-4f33-9744-341ac1bc8188');
  console.log("ORC-112609006:", qts);
}
run();
