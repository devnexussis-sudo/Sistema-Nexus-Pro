const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envVars = fs.readFileSync('.env', 'utf8').split('\n');
let url = '', key = '';
for (const line of envVars) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1];
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1];
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('orders').select('*, customers(*)').limit(1);
  console.log(JSON.stringify({data, error}, null, 2));
}
run();
