import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const cleanCnpj = "78989659798080";
  const formattedCnpj = "78.989.659/7980-80";
  const tenant_id = "2c5a36fd-a5de-4637-9c32-3d153d45dfb7";

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, document")
    .eq("tenant_id", tenant_id)
    .in("document", [cleanCnpj, formattedCnpj])
    .limit(1)
    .single();

  return new Response(JSON.stringify({ data, error }), {
    headers: { "Content-Type": "application/json" },
  });
});
