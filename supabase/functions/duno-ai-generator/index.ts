import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: customer } = await supabase.from("customers").select("*").eq("document", "78.989.659/7980-80");

  return new Response(JSON.stringify({ customer }), {
    headers: { "Content-Type": "application/json" },
  });
});
