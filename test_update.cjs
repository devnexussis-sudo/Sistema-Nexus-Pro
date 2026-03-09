const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    const { data, error } = await supabase.from('orders').update({ status: 'EM DESLOCAMENTO' }).eq('display_id', 'NEX-1051').select();
    console.log('Result:', data, error);
}
run();
