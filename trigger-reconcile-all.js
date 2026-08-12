import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;

async function triggerReconcileAll() {
  const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;
  console.log("Triggering Reconcile All on Edge Function:", webhookUrl);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reconcile_all' })
  });

  console.log("Response Status:", res.status);
  const json = await res.json().catch(() => ({}));
  console.log("Response JSON:", json);
}

triggerReconcileAll();
