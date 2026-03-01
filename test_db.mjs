import { createClient } from '@supabase/supabase-js';
const url = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';
const supabase = createClient(url, key);

async function run() {
    const { data, error } = await supabase.from('customers').select('*').limit(1);
    if (error) {
        console.error("ERRO customers:", error);
    } else {
        console.log("Campos customers:", data[0] ? Object.keys(data[0]).join(', ') : "vazio");
    }
}
run();
