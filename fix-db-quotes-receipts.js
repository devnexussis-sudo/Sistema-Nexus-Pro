import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function fix() {
  const { data: qData, error: qError } = await supabase
    .from('quotes')
    .select('id, approval_metadata')
    .order('created_at', { ascending: false })
    .limit(50)
    
  if (qData) {
      for (const quote of qData) {
          if (quote.approval_metadata && quote.approval_metadata._receiptUrl && quote.approval_metadata._receiptUrl.includes('.webp/')) {
              const parts = quote.approval_metadata._receiptUrl.split('.webp/')
              const newUrl = parts[0] + '.webp'
              console.log(`Fixing quote receipt ${quote.id}...`)
              quote.approval_metadata._receiptUrl = newUrl
              await supabase.from('quotes').update({ approval_metadata: quote.approval_metadata }).eq('id', quote.id)
          }
      }
  }
  console.log("Done fixing quotes receipts!")
}
fix()
