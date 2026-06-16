import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Consulta pg_policies para ver as politicas da tabela
  const { data, error } = await supabase.rpc('get_policies'); // Nao existe rpc get_policies. Vou usar SQL direto se puder. Mas nao posso.

  // Usando a tabela pg_policies pelo REST:
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/pg_policies?tablename=eq.whatsapp_conversations`, {
    headers: {
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`
    }
  });
  const policies = await res.json();

  return new Response(JSON.stringify(policies), { headers: { "Content-Type": "application/json" }});
});
