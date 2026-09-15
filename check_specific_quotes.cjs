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
  const ids = ['ORC-532609005', 'ORC-532609004', 'ORC-182609003', 'ORC-112609002', 'ORC-122609001'];
  for (const did of ids) {
    const { data: q } = await supabase.from('quotes').select('id, display_id, status, billing_status').eq('display_id', did).maybeSingle();
    if (q) {
       const { data: itm } = await supabase.from('invoice_items').select('*').eq('reference_id', q.id);
       console.log(`Quote ${did}: status=${q.status}, billing_status=${q.billing_status}, invoice_items=${itm.length}`);
    } else {
       console.log(`Quote ${did} not found`);
    }
  }
}
run();
