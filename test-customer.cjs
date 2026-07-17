const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data } = await supabase.from('orders').select('id, display_id, customer_id, customer_name').order('created_at', { ascending: false }).limit(3);
  console.log(data);
}
run();
