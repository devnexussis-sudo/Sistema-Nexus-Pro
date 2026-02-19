
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * 🔒 Nexus Pro - Secure Admin Operations Edge Function (Production Grade)
 * 
 * Correções L7:
 * - Tratamento Robust de CORS (Preflight e Errors).
 * - Logs estruturados.
 * - Validação estrita de input.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Interface estrita para a requisição
interface AdminRequest {
    action: 'create_user' | 'delete_user' | 'update_user' | 'list_users';
    payload?: any;
}

serve(async (req) => {
    // 1. Handle CORS Preflight (OPTIONS) - Critical for Browser Access
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Validação básica do método
        if (req.method !== 'POST') {
            throw new Error(`Method ${req.method} not allowed`);
        }

        // 2. Verificar autenticação do usuário (Authorization Header)
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Missing Authorization header');
        }

        // 3. Criar cliente Supabase com contexto do usuário (Anon Key + Token)
        // Isso permite verificar quem está chamando
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        );

        // 4. Validar Autenticação e Permissões
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

        if (userError || !user) {
            console.error('[AdminOps] Auth Error:', userError);
            return new Response(
                JSON.stringify({ error: 'Unauthorized', detail: userError?.message }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[AdminOps] User Authenticated: ${user.email} (${user.id})`);

        // Check if user has admin role/permission in public.users
        // Podemos relaxar para 'ADMIN' role ao invés de 'accessSuperAdmin' JSON se quisermos ser práticos,
        // mas vamos manter a segurança alta. O ideal é checar role 'ADMIN'.
        const { data: userData, error: dbError } = await supabaseClient
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        // Permite se for ADMIN (role) OU se tiver flag superadmin.
        // Adaptado para aceitar UserRole.ADMIN do sistema.
        if (dbError || (userData?.role !== 'ADMIN' && userData?.role !== 'moros_admin')) {
            console.error('[AdminOps] Permission Denied:', userData);
            return new Response(
                JSON.stringify({ error: 'Forbidden - Admin access required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Inicializar Cliente Admin (Service Role) - O Poderoso Chefão
        // Se as keys não existirem, vai quebrar aqui.
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            console.error('[AdminOps] Configuration Error: Missing Service Role Key or URL');
            return new Response(
                JSON.stringify({ error: 'Server Configuration Error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        // 6. Processar a Ação
        const { action, payload }: AdminRequest = await req.json();
        console.log(`[AdminOps] Executing Action: ${action}`);

        let result;

        switch (action) {
            case 'create_user': {
                const { email, password, user_metadata } = payload;
                if (!email || !password) throw new Error("Email and password are required");

                // Auto-confirm email for admin-created users
                const { data, error } = await adminClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: { ...user_metadata, created_via: 'admin_ops' }
                });
                if (error) throw error;
                result = { user: data.user };
                break;
            }

            case 'delete_user': {
                const { userId } = payload;
                if (!userId) throw new Error("UserId required");
                const { error } = await adminClient.auth.admin.deleteUser(userId);
                if (error) throw error;
                result = { success: true };
                break;
            }

            case 'update_user': {
                const { userId, updates } = payload;
                if (!userId) throw new Error("UserId required");
                const { data, error } = await adminClient.auth.admin.updateUserById(userId, updates);
                if (error) throw error;
                result = { user: data.user };
                break;
            }

            case 'list_users': {
                const { data, error } = await adminClient.auth.admin.listUsers();
                if (error) throw error;
                result = { users: data.users };
                break;
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        // 7. Retornar Sucesso
        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error(`[AdminOps] Execution Failed:`, error.message);

        // Retorna erro JSON legível com Headers CORS (evita 'Preflight Missing')
        return new Response(
            JSON.stringify({ error: error.message || 'Internal Server Error' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
