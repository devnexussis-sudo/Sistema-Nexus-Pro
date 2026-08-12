import { supabase } from './src/lib/supabase';

async function test() {
  const { data, error } = await supabase.from('tenants').select('id, name, max_technicians').limit(5);
  console.log('Tenants:', data, error);
}

test();
