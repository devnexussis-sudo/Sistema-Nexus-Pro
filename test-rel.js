import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envRaw = fs.readFileSync('.env', 'utf-8')
const env = {}
envRaw.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) env[line.slice(0,idx).trim()] = line.slice(idx+1).trim()
})

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY'])

async function test() {
  const { data, error } = await supabase.from('orders').select('id, assigned_to, users!orders_assigned_to_fkey(name)').limit(1)
  console.log(error || data)
  
  const { data: d2, error: e2 } = await supabase.from('orders').select('id, assigned_to, technician:users(name)').limit(1)
  console.log(e2 || d2)
}
test()
