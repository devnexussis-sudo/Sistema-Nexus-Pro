const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'APP Nexus/nexus-mobile/.env' });
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('stock_movements').select('*, orders:reference_id(id)').limit(1);
  console.log(error);
}
run();
