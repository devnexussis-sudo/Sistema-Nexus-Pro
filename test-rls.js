import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data: tenants } = await supabase.from('tenants').select('id, enabled_modules').limit(1);
  console.log("Tenant:", tenants[0]);
}
test();
