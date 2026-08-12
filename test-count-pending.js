import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkCounts() {
  const { count: pendingQuotes } = await supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('billing_status', 'PENDING');
  const { count: paidQuotes } = await supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('billing_status', 'PAID');
  const { count: pendingOrders } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('billing_status', 'PENDING');
  const { count: paidOrders } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('billing_status', 'PAID');

  console.log(`Quotes -> PENDING: ${pendingQuotes}, PAID: ${paidQuotes}`);
  console.log(`Orders -> PENDING: ${pendingOrders}, PAID: ${paidOrders}`);
}

checkCounts();
