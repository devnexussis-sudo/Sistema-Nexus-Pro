const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
  const anonMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
  const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  
  const supabase = createClient(
    urlMatch[1], 
    serviceMatch ? serviceMatch[1] : anonMatch[1],
    { auth: { persistSession: false } }
  );

  const { data } = await supabase.from('mercadopago_settings').select('*');
  console.log(data);
}

run().catch(console.error);
