import { createClient } from '@supabase/supabase-js';
const url = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';
const supabase = createClient(url, key);

async function run() {
    const { data, error } = await supabase.rpc('get_public_order_full', { search_term: '0da249bd-821f-4fcf-b671-b8479e0debe2' }); // I will put the token
    if (error) {
        console.error("ERRO RPC FULL:", error);
    } else {
        console.log("SUCESSO RPC FULL:", JSON.stringify(data[0] || {}, null, 2));
    }
}

async function run2() {
    const { data, error } = await supabase.rpc('get_public_order', { search_term: '0da249bd-821f-4fcf-b671-b8479e0debe2' }); // I will put the token
    if (error) {
        console.error("ERRO RPC NORMAL:", error);
    } else {
        console.log("SUCESSO RPC NORMAL:", JSON.stringify(data[0] || {}, null, 2));
    }
}
run();
run2();
