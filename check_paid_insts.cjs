const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: insts } = await supabase.from('invoice_installments').select('invoice_id, status').eq('status', 'PAID').limit(5);
  for (const inst of insts) {
    const { data: inv } = await supabase.from('invoices').select('display_id, status').eq('id', inst.invoice_id).single();
    console.log(`Invoice ${inv?.display_id} (${inv?.status}): has PAID installment`);
  }
}
run();
