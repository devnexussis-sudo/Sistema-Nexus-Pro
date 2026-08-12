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

async function debugFlow() {
  const itemId = 'f1564160-d818-484e-a0e3-2a8192f719dd';
  const itemType = 'QUOTE';

  console.log("--- Step 0: Check DB ---");
  const { data: dbRecord, error: dbErr } = await supabase
    .from('quotes')
    .select('billing_status, paid_at, gateway_status, gateway_payment_id, tenant_id')
    .eq('id', itemId)
    .maybeSingle();

  console.log("DB Record:", dbRecord, "DB Error:", dbErr);

  const tenantId = dbRecord.tenant_id;
  console.log("Tenant ID:", tenantId);

  console.log("--- Step 1: Get MP Token ---");
  const { data: settings, error: setErr } = await supabase
    .from('tenant_mercadopago_settings')
    .select('mp_access_token')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  console.log("Settings error:", setErr);
  const accessToken = settings?.mp_access_token;
  console.log("Access Token found?:", !!accessToken);

  if (!accessToken) {
    console.error("NO ACCESS TOKEN!");
    return;
  }

  const gtwId = String(dbRecord.gateway_payment_id || '').trim();
  console.log("Gateway Payment ID:", gtwId);

  let mpData = null;
  if (gtwId && /^\d+$/.test(gtwId)) {
    console.log("Fetching direct MP payment:", gtwId);
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${gtwId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    console.log("MP Fetch Status:", mpRes.status);
    if (mpRes.ok) {
      mpData = await mpRes.json();
    }
  }

  console.log("MP Data status:", mpData?.status, "status_detail:", mpData?.status_detail);
  const isPaid = mpData?.status === 'approved' || mpData?.status === 'accredited';
  console.log("Is Paid?:", isPaid);

  if (isPaid) {
    const updateObj = {
      billing_status: 'PAID',
      payment_method: 'Pix',
      paid_at: mpData.date_approved || new Date().toISOString(),
      gateway_status: 'approved',
      gateway_payment_id: gtwId,
      total_value: Number(mpData.transaction_amount || 1)
    };

    console.log("--- Step 2: Attempt DB Update ---");
    console.log("Update object:", updateObj);

    const { data: updData, error: updateError } = await supabase
      .from('quotes')
      .update(updateObj)
      .eq('id', itemId)
      .select();

    console.log("Update Data:", updData);
    console.log("Update Error:", updateError);
  }
}

debugFlow();
