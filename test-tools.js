import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function testQuery(name, queryFn) {
  try {
    const { data, error } = await queryFn();
    console.log(`\n--- ${name} ---`)
    if (error) {
      console.error("ERROR:", error)
    } else {
      console.log("SUCCESS:", data)
    }
  } catch (err) {
    console.error(`\n--- ${name} EXCEPTION ---`, err)
  }
}

async function runAll() {
  const tenant_id = "2c5a36fd-a5de-4637-9c32-3d153d45dfb7"; // We will fetch a real one if needed.
  
  // Let's first get a valid tenant
  const { data: tenants } = await supabase.from('tenants').select('id').limit(1)
  const t_id = tenants?.[0]?.id;
  if (!t_id) {
    console.log("No tenant found!")
    return;
  }
  console.log("Using Tenant:", t_id)

  // 1. Get order details by sequence
  await testQuery("get_order_details (1007)", () => 
    supabase
      .from("orders")
      .select("id, display_id, status, description, scheduled_at, equipment_name, equipment_model, equipment_serial, customer_name, assigned_to")
      .eq("tenant_id", t_id)
      .ilike("display_id", `%1007%`)
      .limit(1)
      .single()
  )

  // 2. List orders by serial
  const testSerial = "1230010"; // known serial
  await testQuery(`list_orders by serial (${testSerial})`, () => 
    supabase
      .from("orders")
      .select("id, display_id, status, priority, description, scheduled_at, equipment_name, equipment_model, equipment_serial, customer_name, assigned_to")
      .eq("tenant_id", t_id)
      .ilike("equipment_serial", `%${testSerial}%`)
      .order("created_at", { ascending: false })
      .limit(10)
  )

  // 3. Find customer by CNPJ
  const rawCnpj = "12345678901234";
  await testQuery("find_customer by CNPJ", () => 
    supabase
      .from("customers")
      .select("id, name, document, email, phone, whatsapp")
      .eq("tenant_id", t_id)
      .in("document", [rawCnpj, "12.345.678/9012-34"])
      .limit(1)
      .single()
  )
}

runAll();
