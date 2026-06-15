import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: customers } = await supabase.from("customers").select("document, name").limit(20);
  const { data: convs } = await supabase.from("whatsapp_conversations").select("*").limit(20);

  return new Response(JSON.stringify({ customers, convs }), {
    headers: { "Content-Type": "application/json" },
  });
});
