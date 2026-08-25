
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

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        // 4. Verificar se o operador é Master / Global Admin
        const isMasterRole = operator.user_metadata?.role === 'moros_admin' ||
                             operator.user_metadata?.role === 'SUPER_ADMIN' ||
                             operator.app_metadata?.role === 'moros_admin';

        let isGlobalAdmin = isMasterRole;

        if (!isGlobalAdmin) {
            const { data: globalAdminRow } = await adminClient
                .from('global_admins')
                .select('user_id')
                .eq('user_id', operator.id)
                .maybeSingle();
            if (globalAdminRow) isGlobalAdmin = true;
        }

        let operatorTenantId: string | null = null;
        let isAuthorized = false;

        if (isGlobalAdmin) {
            isAuthorized = true;
        } else {
            const { data: operatorData } = await adminClient
                .from('users')
                .select('tenant_id, role')
                .eq('id', operator.id)
                .maybeSingle();

            if (operatorData && (operatorData.role === 'ADMIN' || operatorData.role === 'SUPER_ADMIN' || operatorData.role === 'moros_admin')) {
                isAuthorized = true;
                operatorTenantId = operatorData.tenant_id;
            }
        }

        if (!isAuthorized) {
            throw new Error("Acesso negado: Somente administradores podem realizar esta ação.");
        }

        // 5. Processar o JSON
        const body = await req.json().catch(() => ({}));
        const { action, payload } = body;

        console.log(`[Admin] Action: ${action} | Operator: ${operator.email} | IsGlobalAdmin: ${isGlobalAdmin} | Tenant: ${operatorTenantId}`);

        let result;

        switch (action) {
            case 'create_user': {
                const { email, password, user_metadata } = payload;
                if (!email) throw new Error("E-mail é obrigatório.");

                // Se o operador for Global Admin (Master), respeita o tenantId enviado no user_metadata/payload.
                // Se for admin comum de empresa, força o tenantId da empresa do operador.
                const targetTenantId = isGlobalAdmin
                    ? (user_metadata?.tenantId || payload.tenantId || operatorTenantId)
                    : operatorTenantId;

                const finalMetadata = {
                    ...user_metadata,
                    tenantId: targetTenantId,
                    created_by: operator.id
                };

                const { data, error } = await adminClient.auth.admin.createUser({
                    email: email.toLowerCase().trim(),
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

                if (!isGlobalAdmin) {
                    const { data: targetUser, error: targetError } = await adminClient
                        .from('users')
                        .select('tenant_id')
                        .eq('id', userId)
                        .maybeSingle();

                    if (targetError || !targetUser || targetUser.tenant_id !== operatorTenantId) {
                        throw new Error("Acesso negado: Você não tem permissão para editar usuários de outra empresa.");
                    }
                }

                const { data, error } = await adminClient.auth.admin.updateUserById(userId, updates);
                if (error) throw error;
                result = { user: data.user };
                break;
            }

            case 'delete_user': {
                const { userId } = payload;
                if (!userId) throw new Error("ID do usuário é obrigatório.");

                if (!isGlobalAdmin) {
                    const { data: targetUser, error: targetError } = await adminClient
                        .from('users')
                        .select('tenant_id')
                        .eq('id', userId)
                        .maybeSingle();

                    if (targetError || !targetUser || targetUser.tenant_id !== operatorTenantId) {
                        throw new Error("Acesso negado: Você não tem permissão para excluir usuários de outra empresa.");
                    }
                }

                const { error } = await adminClient.auth.admin.deleteUser(userId);
                if (error) throw error;
                result = { success: true };
                break;
            }

            case 'list_users': {
                const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
                if (error) throw error;
                const tenantUsers = isGlobalAdmin
                    ? data.users
                    : data.users.filter(u => u.user_metadata?.tenantId === operatorTenantId);
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
