const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const key = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('stock_movements').select('*').limit(3);
  console.log(data);
}
run();
