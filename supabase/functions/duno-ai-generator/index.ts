import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: users } = await supabase.auth.admin.listUsers();
  
  return new Response(JSON.stringify(users.users.map(u => ({ id: u.id, app: u.app_metadata, user: u.user_metadata }))), {
    headers: { "Content-Type": "application/json" },
  });
});
