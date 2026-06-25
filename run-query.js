import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envRaw = fs.readFileSync('.env', 'utf-8')
const env = {}
envRaw.split('\n').forEach(line => {
  const [k, v] = line.split('=')
  if (k && v) env[k.trim()] = v.trim()
})

const supabaseUrl = env['VITE_SUPABASE_URL']
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'] // Use anon key to test, or we can use service role if we find it.

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log("Fetching orders...")
  const { data: orders, error: errOrders } = await supabase.from('orders').select('display_id, equipment_serial, customer_name').limit(10)
  console.log("Orders:", orders, errOrders)

  console.log("Fetching equipments...")
  const { data: equips, error: errEquips } = await supabase.from('equipments').select('serial_number, name').limit(10)
  console.log("Equipments:", equips, errEquips)

  console.log("Fetching customers...")
  const { data: custs, error: errCusts } = await supabase.from('customers').select('name, document').limit(10)
  console.log("Customers:", custs, errCusts)
}

run()
