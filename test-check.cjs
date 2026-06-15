const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: tenant } = await supabase.from('tenants').select('id, max_technicians').limit(1).single();
  const res = await supabase.from('technicians').select('id, active').eq('tenant_id', tenant.id);
  const techs = res.data || [];
  const activeCount = techs.filter(t => t.active).length;
  console.log(`Tenant limit: ${tenant.max_technicians}`);
  console.log(`Total techs: ${techs.length}`);
  console.log(`Active techs: ${activeCount}`);
  console.log("Will it allow a new active technician?", activeCount < tenant.max_technicians);
}
run();
