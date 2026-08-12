import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testCardLink() {
  const { data: settings } = await supabase
    .from('tenant_mercadopago_settings')
    .select('mp_access_token')
    .eq('tenant_id', '2c5a36fd-a5de-4637-9c32-3d153d45dfb7')
    .single();

  const token = settings.mp_access_token;
  console.log("Token present?:", !!token);

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: [
        {
          title: 'Teste Cartao Credit',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: 10
        }
      ],
      payment_methods: {
        default_payment_type_id: 'credit_card',
        default_installments: 1,
        max_installments: 12,
        excluded_payment_types: [
          { id: 'ticket' }
        ]
      },
      external_reference: 'test-item-123'
    })
  });

  console.log("MP Response Status:", mpRes.status);
  const data = await mpRes.json();
  if (mpRes.ok) {
    console.log("SUCCESS! Init Point URL:", data.init_point);
  } else {
    console.error("ERROR:", data);
  }
}

testCardLink();
