const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || 'https://sb-esrwwaoirlhcptbxtlsu.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzgwMTQ1MiwiZXhwIjoyMDczNTc3NDUyfQ...');

async function run() {
  const id = 'c5ef5895-25fe-40fd-8380-d2d13a7ffbb0';
  const { data, error } = await supabase.from('orders').select('form_data').eq('id', id).single();
  if (data) {
    const fd = typeof data.form_data === 'object' ? data.form_data : {};
    fd.mpInstallments = 4;
    fd.installments = 4;
    await supabase.from('orders').update({ form_data: fd }).eq('id', id);
    console.log('Patched order!');
  } else {
    console.log('Order not found', error);
  }
}
run();
