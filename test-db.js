import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data } = await supabase.from('orders').select('id, form_data').order('updated_at', { ascending: false }).limit(3);
    console.log(JSON.stringify(data, null, 2));
}

check();
