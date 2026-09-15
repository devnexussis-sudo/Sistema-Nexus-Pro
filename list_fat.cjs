const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: qts } = await supabase.from('quotes').select('id, display_id, status, title, total_value').eq('display_id', 'ORC-112609006');
  console.log("Found Quote ORC-112609006:", qts);

  if (qts && qts.length > 0) {
    const { data: orders } = await supabase.from('orders').select('id, display_id, status').contains('linkedQuotes', [qts[0].id]);
    console.log("Orders linked to this quote:", orders);
    
    // Maybe they invoiced the ORDER?
    if (orders && orders.length > 0) {
        const { data: invItems } = await supabase.from('invoice_items').select('*').eq('reference_id', orders[0].id);
        console.log("Invoice Items referencing the ORDER:", invItems);
        if (invItems && invItems.length > 0) {
            const { data: inv } = await supabase.from('invoices').select('display_id, status').eq('id', invItems[0].invoice_id);
            console.log("Invoice for the ORDER:", inv);
        }
    }
  }
}
run();
