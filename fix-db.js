import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function fix() {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, approval_signature')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error(error)
    return
  }

  for (const quote of data) {
    if (quote.approval_signature && quote.approval_signature.includes('7957af838d7ca711d19701db745074f5.r2.cloudflarestorage.com/nexus-public-dropzone')) {
      const newUrl = quote.approval_signature.replace(
        'https://7957af838d7ca711d19701db745074f5.r2.cloudflarestorage.com/nexus-public-dropzone',
        'https://pub-4cf13c9b58ea42038881f5e6fef98e17.r2.dev'
      )
      console.log(`Fixing ${quote.id}...`)
      await supabase.from('quotes').update({ approval_signature: newUrl }).eq('id', quote.id)
    }
  }
  console.log("Done fixing!")
}
fix()
