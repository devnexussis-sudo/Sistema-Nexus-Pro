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
  const { data: quotes, error } = await supabase.from('quotes').select('id, status, billing_status').neq('status', 'FATURADO');
  if (error) {
    console.error("Fetch error:", error);
    return;
  }
  let toUpdate = [];
  for (let q of quotes) {
    if (q.billing_status === 'PAID') {
      toUpdate.push(q.id);
    } else {
      const { data: itm } = await supabase.from('invoice_items').select('id').eq('reference_id', q.id).maybeSingle();
      if (itm) {
        toUpdate.push(q.id);
      }
    }
  }
  console.log(`Found ${toUpdate.length} old quotes to migrate to FATURADO.`);
  
  if (toUpdate.length > 0) {
    const { error: updErr } = await supabase.from('quotes').update({ status: 'FATURADO' }).in('id', toUpdate);
    if (updErr) console.error("Error updating:", updErr);
    else console.log("Successfully migrated!");
  }
}
run();
