import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
console.log("Service key present?:", !!serviceKey);

if (!serviceKey) {
  console.log("No service key in .env, checking fallback...");
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, serviceKey || process.env.VITE_SUPABASE_ANON_KEY);

async function testServiceUpdate() {
  const updateObj = {
    billing_status: 'PAID',
    payment_method: 'Pix',
    paid_at: new Date().toISOString(),
    gateway_status: 'approved',
    gateway_payment_id: '172099672935',
    total_value: 1
  };

  const { data, error } = await supabase
    .from('quotes')
    .update(updateObj)
    .eq('id', 'f1564160-d818-484e-a0e3-2a8192f719dd')
    .select();

  console.log("Service Update Data:", data);
  console.log("Service Update Error:", error);
}

testServiceUpdate();
