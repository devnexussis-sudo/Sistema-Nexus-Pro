import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * 🔒 Nexus Pro - Secure Admin Operations Edge Function
 * 
 * Esta função processa operações administrativas sensíveis de forma segura.
 * Usa Service Role Key APENAS no backend, nunca exposta ao cliente.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminRequest {
    action: 'create_user' | 'delete_user' | 'update_user' | 'list_users';
    payload?: any;
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Verificar autenticação do usuário
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Criar cliente com token do usuário para validação
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        );

        // 3. Validar se usuário está autenticado e é super admin
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Verificar se usuário tem permissão de super admin
        const { data: userData, error: dbError } = await supabaseClient
            .from('users')
            .select('permissions')
            .eq('id', user.id)
            .single();

        if (dbError || !userData?.permissions?.accessSuperAdmin) {
            return new Response(
                JSON.stringify({ error: 'Forbidden - Super admin access required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Criar cliente admin (Service Role) - APENAS AQUI, NUNCA NO CLIENTE
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 6. Processar requisição
        const { action, payload }: AdminRequest = await req.json();

        switch (action) {
            case 'create_user': {
                const { email, password, user_metadata } = payload;

                const { data, error } = await adminClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata,
                });

                if (error) throw error;

                return new Response(
                    JSON.stringify({ user: data.user }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            case 'delete_user': {
                const { userId } = payload;

                const { error } = await adminClient.auth.admin.deleteUser(userId);

                if (error) throw error;

                return new Response(
                    JSON.stringify({ success: true }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            case 'update_user': {
                const { userId, updates } = payload;

                const { data, error } = await adminClient.auth.admin.updateUserById(
                    userId,
                    updates
                );

                if (error) throw error;

                return new Response(
                    JSON.stringify({ user: data.user }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            case 'list_users': {
                const { data, error } = await adminClient.auth.admin.listUsers();

                if (error) throw error;

                return new Response(
                    JSON.stringify({ users: data.users }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            default:
                return new Response(
                    JSON.stringify({ error: 'Invalid action' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
        }
    } catch (error) {
        console.error('Admin operation error:', error);

        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
