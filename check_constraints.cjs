const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) process.env[k] = envConfig[k];

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log('UPDATING...');
    // We try to fetch the table constraints
    const { data: vdata, error: verror } = await supabase.rpc('get_table_constraints', {table_name: 'orders'});
    console.log('Result Constraint:', vdata, verror);
}
check();
