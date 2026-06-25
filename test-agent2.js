import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envRaw = fs.readFileSync('.env', 'utf-8')
const env = {}
envRaw.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) env[line.slice(0,idx).trim()] = line.slice(idx+1).trim()
})

const supabaseUrl = env['VITE_SUPABASE_URL']
// The AI agent uses SUPABASE_SERVICE_ROLE_KEY
// But I can't read it from .env. I'll just use anon key for this local test of the edge function code itself if I mock it.

// Let's call the edge function!
async function run() {
  const res = await fetch(supabaseUrl + "/functions/v1/whatsapp-ai-agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Since it requires a valid JWT, I'll pass anon key just to see if the edge function crashes
      "Authorization": `Bearer ${env['VITE_SUPABASE_ANON_KEY']}`
    },
    body: JSON.stringify({
      tenant_id: "2c5a36fd-a5de-4637-9c32-3d153d45dfb7",
      tenant_name: "Nexus",
      settings: {},
      conversation: {
        customer_id: null,
        state: "CUSTOMER_FOUND",
        history: []
      },
      user_message: "quero ver a OS 1007"
    })
  });
  const t = await res.text()
  console.log("Response:", t)
}
run()
