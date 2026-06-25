import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envRaw = fs.readFileSync('.env', 'utf-8')
const env = {}
envRaw.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) env[line.slice(0,idx).trim()] = line.slice(idx+1).trim()
})

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY'])

// We can't fetch edge function logs easily without personal access token.
// So let's write a mock that EXACTLY matches the query and test it using the SERVICE ROLE.
