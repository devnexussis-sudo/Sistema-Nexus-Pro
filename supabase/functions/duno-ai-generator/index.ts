import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  const { data } = await supabase.from('customers').select('*').limit(1);
  return new Response(JSON.stringify({ columns: data && data.length > 0 ? Object.keys(data[0]) : [] }));
});
