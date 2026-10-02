import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestPayment() {
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, gateway_payment_id, tenant_id, billing_status')
    .not('gateway_payment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!quote) return console.log("No quote found");
  console.log("Quote:", quote.id, quote.gateway_payment_id);

  const { data: ts } = await supabase.from('tenant_mercadopago_settings').select('mp_access_token').eq('tenant_id', quote.tenant_id).single();
  const token = ts?.mp_access_token;
  
  if (/^\d+$/.test(quote.gateway_payment_id)) {
     const r = await fetch(`https://api.mercadopago.com/v1/payments/${quote.gateway_payment_id}`, { headers: { Authorization: `Bearer ${token}` }});
     console.log("Direct status:", await r.json());
  } else {
     const r = await fetch(`https://api.mercadopago.com/merchant_orders/search?preference_id=${quote.gateway_payment_id}`, { headers: { Authorization: `Bearer ${token}` }});
     console.log("MO Data:", JSON.stringify(await r.json(), null, 2));

     const s = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${quote.id}`, { headers: { Authorization: `Bearer ${token}` }});
     console.log("Search Data:", JSON.stringify(await s.json(), null, 2));
  }
}

checkLatestPayment();
