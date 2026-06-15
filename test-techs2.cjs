const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: tenant } = await supabase.from('tenants').select('id, max_technicians').limit(1).single();
  const res = await supabase.from('technicians').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('active', true);
  console.log("Count Error:", res.error);
  console.log("Count Data:", res.data);
  console.log("Count:", res.count);
}
run();
