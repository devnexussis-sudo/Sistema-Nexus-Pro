import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, approval_signature, approval_metadata')
    .order('created_at', { ascending: false })
    .limit(5)
  console.log("Quotes Data:", JSON.stringify(data, null, 2))
  console.log("Error:", error)
}
test()
