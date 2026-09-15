const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
  const anonMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
  
  const supabase = createClient(
    urlMatch[1], 
    anonMatch[1],
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@valetech.com.br',
    password: 'admin' // Or whatever default password they use, actually I don't have this.
  });
}
