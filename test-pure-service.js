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

async function testUpdateDirect() {
  const itemId = 'f1564160-d818-484e-a0e3-2a8192f719dd';
  const realPaymentId = '172099672935';
  const paidAt = new Date().toISOString();

  const updateObj = {
    billing_status: 'PAID',
    payment_method: 'Pix',
    paid_at: paidAt,
    gateway_status: 'approved',
    gateway_payment_id: realPaymentId,
    total_value: 1
  };

  console.log("Updating quote in DB directly...");
  const res = await supabase
    .from('quotes')
    .update(updateObj)
    .eq('id', itemId)
    .eq('tenant_id', '2c5a36fd-a5de-4637-9c32-3d153d45dfb7');

  console.log("Update response error:", res.error);
  console.log("Update response status:", res.status, res.statusText);

  const { data: checkData } = await supabase
    .from('quotes')
    .select('billing_status')
    .eq('id', itemId)
    .single();

  console.log("Check billing_status after update:", checkData?.billing_status);
}

testUpdateDirect();
