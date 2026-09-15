import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://esrwwaoirlhcptbxtlsu.supabase.co'; // using the URL from earlier console logs
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', '9c5c392f-c500-422d-8812-6b8b2169107e');
  console.log(JSON.stringify({ data, error }, null, 2));
}

run();
