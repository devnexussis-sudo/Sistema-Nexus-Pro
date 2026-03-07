const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) process.env[k] = envConfig[k];

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    console.log('UPDATING...');
    const { data: vdata, error: verror } = await supabase.from('orders').update({status: 'EM DESLOCAMENTO'}).eq('display_id', 'NEX-1051').select();
    console.log('Result:', vdata, verror);
}
run();
