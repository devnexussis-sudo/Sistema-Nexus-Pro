const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '...'; // I will get the anon key from .env

const fs = require('fs');
const envContent = fs.readFileSync('.env', 'utf-8');
const anonKeyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const anonKey = anonKeyMatch ? anonKeyMatch[1] : '';

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  const { data, error } = await supabase.from('service_visits').select('id, status, form_data').eq('status', 'blocked').order('created_at', { ascending: false }).limit(1);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
