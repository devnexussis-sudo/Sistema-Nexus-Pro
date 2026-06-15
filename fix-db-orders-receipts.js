import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function fix() {
  const { data: qData, error: qError } = await supabase
    .from('orders')
    .select('id, form_data')
    .order('created_at', { ascending: false })
    .limit(50)
    
  if (qData) {
      for (const order of qData) {
          if (order.form_data && order.form_data._receiptUrl && order.form_data._receiptUrl.includes('.webp/')) {
              const parts = order.form_data._receiptUrl.split('.webp/')
              const newUrl = parts[0] + '.webp'
              console.log(`Fixing order receipt ${order.id}...`)
              order.form_data._receiptUrl = newUrl
              await supabase.from('orders').update({ form_data: order.form_data }).eq('id', order.id)
          }
      }
  }
  console.log("Done fixing orders receipts!")
}
fix()
