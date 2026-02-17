
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload, masterKey } = await req.json();

        // 🛡️ Security Check: Validate Master Key (Backend-to-Backend or trusted client)
        // In production, this should ideally be an Authorization headerBearer token
        const storedMasterKey = Deno.env.get('MASTER_SECRET_KEY');
        if (!storedMasterKey || masterKey !== storedMasterKey) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid Master Key' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }


        // Initialize Supabase Admin Client (Service Role)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        let result;

        switch (action) {
            case 'create_user':
                // Payload: { email, password, user_metadata, email_confirm }
                const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
                    email: payload.email,
                    password: payload.password,
                    email_confirm: true,
                    user_metadata: payload.metadata
                });
                if (userError) throw userError;
                result = { user: userData.user };
                break;

            case 'delete_user':
                const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(payload.userId);
                if (delError) throw delError;
                result = { success: true };
                break;

            case 'list_users':
                const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
                if (listError) throw listError;
                result = { users: users.users };
                break;

            case 'update_user':
                const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
                    payload.userId,
                    payload.updates
                );
                if (updateError) throw updateError;
                result = { user: updatedUser.user };
                break;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
