
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

serve(async (req: Request) => {
    // 1. Resposta IMEDIATA para OPTIONS (Resolve o CORS do navegador)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // 2. Resposta para GET (Sanity Check)
    if (req.method === 'GET') {
        return new Response(JSON.stringify({ status: "online", message: "Nexus Pro Admin API is active" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Variáveis de ambiente (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) não configuradas.");
        }

        // 3. Verificar quem está chamando (Autenticação do Operador)
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Cabeçalho de autorização ausente.');

        const operatorClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user: operator }, error: authError } = await operatorClient.auth.getUser();
        if (authError || !operator) throw new Error("Operador não autenticado.");

        // 4. Obter o TenantId do Operador (Fonte da Verdade)
        const { data: operatorData, error: operatorDbError } = await operatorClient
            .from('users')
            .select('tenant_id, role')
            .eq('id', operator.id)
            .single();

        if (operatorDbError || !operatorData) throw new Error("Não foi possível validar as permissões do operador.");

        // Apenas ADMIN pode realizar estas operações
        if (operatorData.role !== 'ADMIN' && operatorData.role !== 'moros_admin') {
            throw new Error("Acesso negado: Somente administradores podem realizar esta ação.");
        }

        const operatorTenantId = operatorData.tenant_id;

        // 5. Processar o JSON
        const body = await req.json().catch(() => ({}));
        const { action, payload } = body;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        console.log(`[Admin] Action: ${action} | Operator: ${operator.email} | Tenant: ${operatorTenantId}`);

        let result;

        switch (action) {
            case 'create_user': {
                const { email, password, user_metadata } = payload;

                // 🛡️ Segurança: Força o tenant_id do operador no novo usuário
                const finalMetadata = {
                    ...user_metadata,
                    tenantId: operatorTenantId,
                    created_by: operator.id
                };

                const { data, error } = await adminClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: finalMetadata
                });
                if (error) throw error;
                result = { user: data.user };
                break;
            }

            case 'update_user': {
                const { userId, updates } = payload;
                if (!userId) throw new Error("ID do usuário é obrigatório.");

                // 🛡️ Segurança: Verifica se o usuário a ser editado pertence ao mesmo tenant
                const { data: targetUser, error: targetError } = await adminClient
                    .from('users')
                    .select('tenant_id')
                    .eq('id', userId)
                    .single();

                if (targetError || !targetUser || targetUser.tenant_id !== operatorTenantId) {
                    throw new Error("Acesso negado: Você não tem permissão para editar usuários de outra empresa.");
                }

                const { data, error } = await adminClient.auth.admin.updateUserById(userId, updates);
                if (error) throw error;
                result = { user: data.user };
                break;
            }

            case 'delete_user': {
                const { userId } = payload;
                if (!userId) throw new Error("ID do usuário é obrigatório.");

                // 🛡️ Segurança: Verifica se o usuário pertence ao mesmo tenant
                const { data: targetUser, error: targetError } = await adminClient
                    .from('users')
                    .select('tenant_id')
                    .eq('id', userId)
                    .single();

                if (targetError || !targetUser || targetUser.tenant_id !== operatorTenantId) {
                    throw new Error("Acesso negado: Você não tem permissão para excluir usuários de outra empresa.");
                }

                const { error } = await adminClient.auth.admin.deleteUser(userId);
                if (error) throw error;
                result = { success: true };
                break;
            }

            case 'list_users': {
                // Embora list_users retorne todos os usuários do Auth, 
                // o nosso frontend usa o getTenantUsers do TenantService para filtrar via DB.
                // Mas vamos implementar com segurança se houver necessidade.
                const { data, error } = await adminClient.auth.admin.listUsers();
                if (error) throw error;
                // Filtra apenas os usuários do tenant do operador
                const tenantUsers = data.users.filter(u => u.user_metadata?.tenantId === operatorTenantId);
                result = { users: tenantUsers };
                break;
            }

            default:
                throw new Error(`Ação desconhecida: ${action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Admin Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
