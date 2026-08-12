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

async function reconcileAllPaid() {
  console.log("=== RECONCILING ALL PAID QUOTES AND ORDERS ===");

  // 1. Get access token for tenant
  const { data: tenantSettings } = await supabase
    .from('tenant_mercadopago_settings')
    .select('mp_access_token, tenant_id')
    .limit(10);

  const tokenMap = new Map();
  (tenantSettings || []).forEach(s => {
    if (s.mp_access_token) tokenMap.set(s.tenant_id, s.mp_access_token);
  });

  // 2. Scan Quotes with billing_status = 'PAID'
  const { data: paidQuotes } = await supabase
    .from('quotes')
    .select('*')
    .eq('billing_status', 'PAID');

  console.log(`Found ${paidQuotes?.length || 0} quotes with billing_status = PAID`);

  for (const q of (paidQuotes || [])) {
    const token = tokenMap.get(q.tenant_id);
    console.log(`Checking Quote #${q.id} (Display: ${q.display_id || q.id.slice(0,8)}), gtwId: ${q.gateway_payment_id}`);

    let isActuallyPaid = false;

    if (token) {
      const gtwId = String(q.gateway_payment_id || '').trim();
      if (gtwId && /^\d+$/.test(gtwId)) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${gtwId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (mpRes.ok) {
          const mpData = await mpRes.json();
          if (mpData.status === 'approved' || mpData.status === 'accredited') {
            isActuallyPaid = true;
          }
        }
      }

      if (!isActuallyPaid && q.id) {
        const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(q.id)}&sort=date_created&criteria=desc`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const approved = (searchJson.results || []).find(p => p.status === 'approved' || p.status === 'accredited');
          if (approved) isActuallyPaid = true;
        }
      }
    }

    if (!isActuallyPaid) {
      console.log(`❌ Quote #${q.id} is NOT actually paid on Mercado Pago! Reverting to PENDING...`);
      // Update directly or via script
      const { error: updErr } = await supabase
        .from('quotes')
        .update({
          billing_status: 'PENDING',
          gateway_status: 'pending',
          paid_at: null,
          payment_method: null
        })
        .eq('id', q.id);

      console.log(`Revert Quote #${q.id} error:`, updErr);

      // Clean up cash_flow entry if created by mistake
      await supabase.from('cash_flow').delete().eq('reference_id', q.id);
    } else {
      console.log(`✅ Quote #${q.id} is CONFIRMED PAID on Mercado Pago.`);
    }
  }

  // 3. Scan Orders with billing_status = 'PAID'
  const { data: paidOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('billing_status', 'PAID');

  console.log(`Found ${paidOrders?.length || 0} orders with billing_status = PAID`);

  for (const o of (paidOrders || [])) {
    const token = tokenMap.get(o.tenant_id);
    console.log(`Checking Order #${o.id} (Display: ${o.display_id || o.id.slice(0,8)}), gtwId: ${o.gateway_payment_id}`);

    let isActuallyPaid = false;

    if (token) {
      const gtwId = String(o.gateway_payment_id || '').trim();
      if (gtwId && /^\d+$/.test(gtwId)) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${gtwId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (mpRes.ok) {
          const mpData = await mpRes.json();
          if (mpData.status === 'approved' || mpData.status === 'accredited') {
            isActuallyPaid = true;
          }
        }
      }

      if (!isActuallyPaid && o.id) {
        const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(o.id)}&sort=date_created&criteria=desc`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const approved = (searchJson.results || []).find(p => p.status === 'approved' || p.status === 'accredited');
          if (approved) isActuallyPaid = true;
        }
      }
    }

    if (!isActuallyPaid) {
      console.log(`❌ Order #${o.id} is NOT actually paid on Mercado Pago! Reverting to PENDING...`);
      const { error: updErr } = await supabase
        .from('orders')
        .update({
          billing_status: 'PENDING',
          gateway_status: 'pending',
          paid_at: null,
          payment_method: null
        })
        .eq('id', o.id);

      console.log(`Revert Order #${o.id} error:`, updErr);
      await supabase.from('cash_flow').delete().eq('reference_id', o.id);
    } else {
      console.log(`✅ Order #${o.id} is CONFIRMED PAID on Mercado Pago.`);
    }
  }

  console.log("=== RECONCILIATION COMPLETED ===");
}

reconcileAllPaid();
