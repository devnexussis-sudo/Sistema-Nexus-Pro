import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: invs } = await supabase.from('invoices').select('id, display_id, created_at').limit(1);
  console.log("Invoice:", invs);
  
  if (invs && invs.length > 0) {
     const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', invs[0].id);
     console.log("Items:", items);
  }
}
run();
