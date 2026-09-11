const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
  const anonMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
  const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  
  const supabase = createClient(
    urlMatch[1], 
    serviceMatch ? serviceMatch[1] : anonMatch[1],
    { auth: { persistSession: false } }
  );

  const tenantId = 'cecfe5fd-b14c-4359-a28d-549db815d9e6';
  
  // 1. Get MP Token
  const { data: mpSettings } = await supabase
    .from('mercadopago_settings')
    .select('mp_access_token')
    .eq('tenant_id', tenantId)
    .single();
    
  if (!mpSettings || !mpSettings.mp_access_token) {
    console.log("No MP token found");
    return;
  }
  
  const token = mpSettings.mp_access_token;
  
  // 2. Mock a Boleto Request
  const payload = {
    transaction_amount: 100.0,
    description: "Teste",
    payment_method_id: "bolbradesco",
    date_of_expiration: new Date(Date.now() + 86400000 * 30).toISOString(),
    payer: {
      email: "cliente@nexus.com",
      first_name: "Cliente",
      last_name: "Teste",
      identification: {
        type: "CNPJ",
        number: "00000000000191" // Mock valid CNPJ structure
      },
      address: {
        zip_code: "06233200",
        street_name: "Rua Teste",
        street_number: "123",
        neighborhood: "Centro",
        city: "São Paulo",
        federal_unit: "SP"
      }
    }
  };

  console.log("Sending request to MP...");
  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  const json = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", JSON.stringify(json, null, 2));
}

run().catch(console.error);
