import { createClient } from '@supabase/supabase-js';

async function test() {
  const supabaseUrl = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const testPayload = [
    {
      tenant_id: '00000000-0000-0000-0000-000000000000',
      source_name: 'test.pdf',
      source_type: 'pdf',
      chunk_index: 0,
      content: 'test content',
      keywords: ['test'],
      metadata: { totalChunks: 1 }
    }
  ];

  console.log("Testing with Object Array...");
  let res = await supabase.rpc('ingest_ai_knowledge_batch', { chunks: testPayload });
  console.log("Result (Object):", res.error ? res.error.message : "Success");

  console.log("Testing with Stringified Array...");
  res = await supabase.rpc('ingest_ai_knowledge_batch', { chunks: JSON.stringify(testPayload) });
  console.log("Result (String):", res.error ? res.error.message : "Success");
}
test();
