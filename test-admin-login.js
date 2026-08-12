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

async function testAdmin() {
  console.log("Checking if we can query public quotes...");
  const { data, error } = await supabase
    .from('quotes')
    .select('id, billing_status, gateway_payment_id, tenant_id')
    .eq('id', 'f1564160-d818-484e-a0e3-2a8192f719dd')
    .maybeSingle();

  console.log("Select result:", data, "Select error:", error);
}

testAdmin();
