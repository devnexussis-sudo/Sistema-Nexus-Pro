const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c'; // Anon key from video-worker

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // Find a recent order
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('*, customers(phone, whatsapp, name), tenants(whatsapp_settings)')
    .order('created_at', { ascending: false })
    .limit(1);

  if (ordersErr || !orders || orders.length === 0) {
    console.error('Error fetching orders:', ordersErr);
    return;
  }

  const order = orders[0];
  console.log('--- RECENT ORDER ---');
  console.log('ID:', order.id);
  console.log('Status:', order.status);
  console.log('Customer:', order.customers);
  console.log('Tenant Settings:', order.tenants?.whatsapp_settings);

  // Validate what the Edge function would do
  if (!order.customers) {
    console.log('❌ Error: OS missing customer');
  } else {
    let rawPhone = order.customers.whatsapp || order.customers.phone || '';
    rawPhone = String(rawPhone).replace(/[^0-9]/g, '');
    if (!rawPhone || rawPhone.length < 10) {
      console.log('❌ Error: Invalid phone number length for customer:', rawPhone);
    } else {
      console.log('✅ Phone valid:', rawPhone);
    }
  }

  if (!order.tenants?.whatsapp_settings) {
    console.log('❌ Error: Tenant has no whatsapp_settings');
  } else {
    const settings = order.tenants.whatsapp_settings;
    if (!settings.uazapi_token && !settings.zapi_instance_token) {
      console.log('❌ Error: Settings missing tokens');
    } else {
      console.log('✅ WhatsApp Config is present');
    }
  }
}

run();
