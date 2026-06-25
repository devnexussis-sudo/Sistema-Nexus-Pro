import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envRaw = fs.readFileSync('.env', 'utf-8')
const env = {}
envRaw.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) env[line.slice(0,idx).trim()] = line.slice(idx+1).trim()
})

// Hardcode a known valid url and look for service_role key in env
// But the env doesn't have the service_role exported.
// I will just read it via supabase cli using secrets! No, I'm local.
