import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY // Use service role for agent

async function run() {
  const payload = {
    tenant_id: "0d35eab4-5cb8-4b77-80be-140b6167856b", // Need to get a valid tenant_id
    tenant_name: "Test",
    settings: {},
    conversation: {
      customer_id: null,
      state: "CUSTOMER_FOUND",
      history: []
    },
    user_message: "Quero ver a OS 1007"
  };

  // First, fetch a valid tenant_id from the DB
  const supabase = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: tenants } = await supabase.from('tenants').select('id').limit(1)
  if (tenants && tenants.length > 0) {
    payload.tenant_id = tenants[0].id
  }

  console.log("Calling agent with tenant_id:", payload.tenant_id)

  const res = await fetch(supabaseUrl + "/functions/v1/whatsapp-ai-agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json()
  console.log("Response:", JSON.stringify(json, null, 2))
}

run()
