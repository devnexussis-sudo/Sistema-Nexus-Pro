const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: invs } = await supabase.from('invoices').select('id, display_id').eq('display_id', 'FAT-0010').limit(1);
  if (invs && invs.length > 0) {
    const { data: insts } = await supabase.from('invoice_installments').select('*').eq('invoice_id', invs[0].id);
    console.log(`Invoice ${invs[0].display_id}: ${insts ? insts.length : 0} installments -> ${insts?.map(i => i.status).join(', ')}`);
  }
}
run();
