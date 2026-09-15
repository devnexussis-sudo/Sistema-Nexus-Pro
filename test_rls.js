import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const publicSupabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await publicSupabase.from('invoice_items').select('*').limit(1);
  console.log("Anon invoice_items:", { data, error });

  const { data: data2, error: error2 } = await publicSupabase.from('invoices').select('*').limit(1);
  console.log("Anon invoices:", { data: data2, error: error2 });
}
run();
