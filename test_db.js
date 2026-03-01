const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const key = process.env.VITE_SUPABASE_ANON_KEY;
if(!key) {
  console.log("No key"); process.exit(1);
}
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('customers').select('*').limit(1);
  console.log(error ? error : "Fields: " + Object.keys(data[0] || {}).join(', '));
}
run();
