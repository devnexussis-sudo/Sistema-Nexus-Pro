const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);
async function check() {
  const { data, error } = await supabase.from('orders').select('id, start_date, status').limit(1);
  console.log('Result:', data, error);
}
check();
