const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: tenant } = await supabase.from('tenants').select('id, max_technicians').limit(1).single();
  const { count: countTotal } = await supabase.from('technicians').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
  const { count: countActive } = await supabase.from('technicians').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('active', true);
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`Max techs: ${tenant.max_technicians}`);
  console.log(`Total techs: ${countTotal}`);
  console.log(`Active techs: ${countActive}`);
}
run();
