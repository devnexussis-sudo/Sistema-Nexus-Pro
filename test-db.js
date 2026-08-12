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

async function check() {
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, gateway_payment_id, tenant_id, billing_status, total_value')
    .eq('id', 'f1564160-d818-484e-a0e3-2a8192f719dd')
    .single();

  console.log("DB Quote:", quote);
}

check();
