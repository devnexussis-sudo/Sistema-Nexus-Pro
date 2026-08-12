import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  console.log("Fetching an order that is CONCLUÍDO...");
  const { data: orders, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, form_data')
    .eq('status', 'CONCLUÍDO')
    .limit(1);

  if (fetchErr || !orders || orders.length === 0) {
    console.error("No CONCLUÍDO order found or error:", fetchErr);
    return;
  }

  const order = orders[0];
  console.log(`Found order ID: ${order.id}`);

  console.log("Attempting to update form_data._internalNotes...");
  const newNotes = [...(order.form_data?._internalNotes || []), { text: "TEST NOTE", user: "system", date: new Date().toISOString() }];
  
  const { error: updateErr } = await supabase
    .from('orders')
    .update({ form_data: { ...order.form_data, _internalNotes: newNotes } })
    .eq('id', order.id);

  if (updateErr) {
    console.error("❌ Update failed! RLS or Trigger blocked it?", updateErr);
  } else {
    console.log("✅ Update succeeded!");
  }
}

testUpdate();
