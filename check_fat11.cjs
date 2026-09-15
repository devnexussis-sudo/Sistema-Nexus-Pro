const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: invs } = await supabase.from('invoices').select('*').eq('display_id', 'FAT-0011');
  console.log("FAT-0011 Invoices:", invs.map(i => ({ id: i.id, display_id: i.display_id, status: i.status, total_amount: i.total_amount, created_at: i.created_at })));
  
  const { data: qts } = await supabase.from('quotes').select('id, display_id, status').eq('display_id', 'ORC-112609006');
  console.log("Quotes:", qts);

  if (qts && qts.length > 0) {
    const { data: items } = await supabase.from('invoice_items').select('*').eq('reference_id', qts[0].id);
    console.log("Invoice Items referencing this quote:", items.map(i => ({ id: i.id, invoice_id: i.invoice_id })));
  }
}
run();
