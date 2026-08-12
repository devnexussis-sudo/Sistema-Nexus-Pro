import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;

async function trigger() {
  const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook?tenant_id=2c5a36fd-a5de-4637-9c32-3d153d45dfb7&id=172099672935`;
  console.log("Triggering Webhook:", webhookUrl);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'payment.updated',
      data: { id: '172099672935' },
      type: 'payment'
    })
  });

  console.log("Webhook Response Status:", res.status);
  const json = await res.json().catch(() => ({}));
  console.log("Webhook Response JSON:", json);
}

trigger();
