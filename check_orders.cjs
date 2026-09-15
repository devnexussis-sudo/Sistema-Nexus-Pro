const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envPath = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/.env';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: orders } = await supabase.from('orders').select('id, display_id, status').contains('linkedQuotes', ['77dc3bbc-e39b-4473-adb1-45058d8a9989']);
  console.log("Orders linked to ORC-532609007:", orders);
}
run();
