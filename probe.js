import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envRaw = fs.readFileSync('.env', 'utf-8')
const env = {}
envRaw.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) env[line.slice(0,idx).trim()] = line.slice(idx+1).trim()
})

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY'])

async function probe() {
  const { data: tenants } = await supabase.from('tenants').select('id, trading_name, company_name').limit(3)
  console.log("TENANTS:", JSON.stringify(tenants, null, 2))

  if (!tenants || tenants.length === 0) return
  const tid = tenants[0].id

  // Check real orders columns
  const { data: order, error: oErr } = await supabase.from('orders')
    .select('id, display_id, status, equipment_serial, equipment_name, customer_name, assigned_to, scheduled_date, title')
    .eq('tenant_id', tid).limit(3)
  console.log("ORDERS:", JSON.stringify(order, null, 2), oErr ? "ERR:"+oErr.message : "")

  // Check users table for name lookup
  if (order && order.length > 0 && order[0].assigned_to) {
    const { data: usr } = await supabase.from('users').select('id, name').eq('id', order[0].assigned_to).single()
    console.log("USER (assigned_to):", JSON.stringify(usr))
  }

  // Check if customers table accessible
  const { data: custs, error: cErr } = await supabase.from('customers').select('id, name, document').eq('tenant_id', tid).limit(3)
  console.log("CUSTOMERS:", JSON.stringify(custs), cErr ? "ERR:"+cErr.message : "")

  // Check if equipments table accessible
  const { data: equips, error: eErr } = await supabase.from('equipments').select('id, serial_number, name').eq('tenant_id', tid).limit(3)
  console.log("EQUIPMENTS:", JSON.stringify(equips), eErr ? "ERR:"+eErr.message : "")
}

probe()
