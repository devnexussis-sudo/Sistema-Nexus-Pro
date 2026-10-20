
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

        // 3. Ler Body antecipadamente para capturar tokens ou payloads
        const body = await req.json().catch(() => ({}));
        const { action, payload } = body;

        const authHeader = req.headers.get('Authorization') || '';
        const xMasterToken = (req.headers.get('x-master-token') || '').trim();
        const bodyMasterToken = (body?.master_token || payload?.master_token || '').trim();
        const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

        const masterSecretToken = (Deno.env.get('MASTER_SESSION_TOKEN') || '').trim();
        const masterEmail = (Deno.env.get('MASTER_EMAIL') || 'master@duno.com.br').trim();
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        let operator: any = null;
        let isGlobalAdmin = false;

        // 🛡️ A: Autenticação direta via MASTER_SESSION_TOKEN (Header, x-master-token ou payload)
        const isMasterTokenMatch = masterSecretToken && (
            rawToken === masterSecretToken ||
            xMasterToken === masterSecretToken ||
            bodyMasterToken === masterSecretToken
        );

        if (isMasterTokenMatch) {
            isGlobalAdmin = true;
            operator = {
                id: 'master-superadmin',
                email: masterEmail,
                user_metadata: { role: 'SUPER_ADMIN' },
                app_metadata: { role: 'SUPER_ADMIN' }
            };
            console.log(`[Admin Operations] 🛡️ Acesso autorizado diretamente via MASTER_SESSION_TOKEN`);
        } else {
            // 🛡️ B: Autenticação via JWT padrão do Supabase Auth
            if (!authHeader) throw new Error('Cabeçalho de autorização ausente.');

            const operatorClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
                global: { headers: { Authorization: authHeader } }
            });

            const { data: { user: authUser }, error: authError } = await operatorClient.auth.getUser();
            if (authError || !authUser) throw new Error("Operador não autenticado.");
            operator = authUser;

            // 4. Verificar se o operador é Master / Global Admin
            const isMasterRole = operator.user_metadata?.role === 'moros_admin' ||
                                 operator.user_metadata?.role === 'SUPER_ADMIN' ||
                                 operator.app_metadata?.role === 'moros_admin' ||
                                 (operator.email && operator.email.toLowerCase() === masterEmail.toLowerCase());

            isGlobalAdmin = isMasterRole;

            if (!isGlobalAdmin) {
                const { data: globalAdminRow } = await adminClient
                    .from('global_admins')
                    .select('user_id')
                    .eq('user_id', operator.id)
                    .maybeSingle();
                if (globalAdminRow) isGlobalAdmin = true;
            }
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

            if (operatorData) {
                operatorTenantId = operatorData.tenant_id;
                if (operatorData.role === 'ADMIN' || operatorData.role === 'SUPER_ADMIN' || operatorData.role === 'moros_admin') {
                    isAuthorized = true;
                }
            } else {
                operatorTenantId = operator.user_metadata?.tenantId || operator.user_metadata?.tenant_id || null;
            }
        }

        // Permissão: Ações de edição/criação/exclusão exigem perfil de Admin. Ação 'list_users' permite qualquer usuário autenticado do tenant.
        const canPerformAction = isGlobalAdmin || isAuthorized || (action === 'list_users' && !!operatorTenantId);

        if (!canPerformAction) {
            throw new Error("Acesso negado: Permissão insuficiente para realizar esta ação.");
        }

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

                const cleanEmail = email.toLowerCase().trim();
                let userRecord = null;

                const { data, error } = await adminClient.auth.admin.createUser({
                    email: cleanEmail,
                    password,
                    email_confirm: true,
                    user_metadata: finalMetadata
                });

                if (error) {
                    // Se o usuário já existir no Auth, recupera e atualiza a senha e metadata
                    if (error.message?.includes('already') || (error as any).status === 422) {
                        const { data: listData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
                        const existing = (listData?.users || []).find((u: any) => u.email?.toLowerCase() === cleanEmail);
                        if (existing) {
                            const updateFields: any = {
                                user_metadata: {
                                    ...existing.user_metadata,
                                    ...finalMetadata
                                }
                            };
                            if (password) updateFields.password = password;
                            const { data: updatedData, error: updateErr } = await adminClient.auth.admin.updateUserById(existing.id, updateFields);
                            if (updateErr) throw updateErr;
                            userRecord = updatedData.user;
                        } else {
                            throw error;
                        }
                    } else {
                        throw error;
                    }
                } else {
                    userRecord = data.user;
                }

                result = { user: userRecord };
                break;
            }

            case 'provision_tenant_admin': {
                const { tenantId, userId, email, name, userCode } = payload;
                if (!tenantId || !userId || !email) {
                    throw new Error("tenantId, userId e email são obrigatórios.");
                }

                if (!isGlobalAdmin) {
                    throw new Error("Apenas administradores globais podem provisionar novos tenants.");
                }

                const cleanEmail = email.toLowerCase().trim();
                const displayName = name || 'Administrador';

                // 1. Tenta chamar a RPC provision_tenant_initial_admin
                const { data: rpcData, error: rpcErr } = await adminClient.rpc('provision_tenant_initial_admin', {
                    p_tenant_id: tenantId,
                    p_user_id: userId,
                    p_email: cleanEmail,
                    p_name: displayName,
                    p_user_code: userCode || null
                });

                if (!rpcErr && rpcData?.success) {
                    result = rpcData;
                    break;
                }

                console.warn("[admin-operations] RPC failed, using service_role fallback:", rpcErr?.message || rpcErr);

                // 2. Fallback via adminClient (Service Role Key bypassa RLS)
                let adminGroupId: string | null = null;
                const { data: existingGroup } = await adminClient
                    .from('user_groups')
                    .select('id')
                    .eq('tenant_id', tenantId)
                    .ilike('name', 'Administradores')
                    .maybeSingle();

                if (existingGroup) {
                    adminGroupId = existingGroup.id;
                } else {
                    const { data: newGroup } = await adminClient
                        .from('user_groups')
                        .insert([{
                            tenant_id: tenantId,
                            name: 'Administradores',
                            description: 'Grupo com permissões completas de administração do sistema',
                            is_system: true,
                            active: true,
                            permissions: {
                                orders: { create: true, read: true, update: true, delete: true },
                                customers: { create: true, read: true, update: true, delete: true },
                                equipments: { create: true, read: true, update: true, delete: true },
                                technicians: { create: true, read: true, update: true, delete: true },
                                quotes: { create: true, read: true, update: true, delete: true },
                                sales_orders: { create: true, read: true, update: true, delete: true },
                                contracts: { create: true, read: true, update: true, delete: true },
                                stock: { create: true, read: true, update: true, delete: true },
                                forms: { create: true, read: true, update: true, delete: true },
                                whatsapp: { create: true, read: true, update: true, delete: true },
                                solicitacoes: { create: true, read: true, update: true, delete: true },
                                regions: { create: true, read: true, update: true, delete: true },
                                integrations: { create: true, read: true, update: true, delete: true },
                                settings: true,
                                settingsTabs: { company: true, system: true, app: true, dashboard: true },
                                manageUsers: true,
                                manageGroups: true,
                                accessSuperAdmin: false,
                                financial: { read: true, update: true, invoice: true, discounts: true },
                                menuAccess: {
                                    dashboard: true, orders: true, calendar: true, map: true, financial: true,
                                    quotes: true, sales_orders: true, stock: true, contracts: true,
                                    customers: true, equipments: true, forms: true, technicians: true,
                                    users: true, settings: true
                                }
                            }
                        }])
                        .select('id')
                        .single();

                    if (newGroup) adminGroupId = newGroup.id;
                }

                // Grupo Operadores
                const { data: existingOp } = await adminClient
                    .from('user_groups')
                    .select('id')
                    .eq('tenant_id', tenantId)
                    .ilike('name', 'Operadores')
                    .maybeSingle();

                if (!existingOp) {
                    await adminClient
                        .from('user_groups')
                        .insert([{
                            tenant_id: tenantId,
                            name: 'Operadores',
                            description: 'Acesso completo aos módulos operacionais (OS, Orçamentos, Clientes, Ativos)',
                            is_system: false,
                            active: true,
                            permissions: {
                                orders: { create: true, read: true, update: true, delete: false },
                                customers: { create: true, read: true, update: true, delete: false },
                                equipments: { create: true, read: true, update: true, delete: false },
                                technicians: { create: false, read: true, update: false, delete: false },
                                quotes: { create: true, read: true, update: true, delete: false },
                                sales_orders: { create: true, read: true, update: true, delete: false },
                                contracts: { create: true, read: true, update: true, delete: false },
                                stock: { create: true, read: true, update: true, delete: false },
                                forms: { create: true, read: true, update: true, delete: false },
                                settings: false, manageUsers: false, manageGroups: false, accessSuperAdmin: false,
                                financial: { read: true, update: false, invoice: false, discounts: false },
                                menuAccess: {
                                    dashboard: true, orders: true, calendar: true, map: true, financial: false,
                                    quotes: true, sales_orders: true, stock: true, contracts: true,
                                    customers: true, equipments: true, forms: true, technicians: true,
                                    users: false, settings: false
                                }
                            }
                        }]);
                }

                // Inserir / atualizar em public.users
                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1c2d4f&color=fff&bold=true`;
                const finalUserCode = userCode || Math.random().toString(36).slice(-6).toUpperCase();

                const { data: savedUser, error: userErr } = await adminClient
                    .from('users')
                    .upsert([{
                        id: userId,
                        tenant_id: tenantId,
                        email: cleanEmail,
                        name: displayName,
                        role: 'ADMIN',
                        active: true,
                        group_id: adminGroupId,
                        group_ids: adminGroupId ? [adminGroupId] : [],
                        avatar: defaultAvatar,
                        app_scope: 'WEB',
                        user_code: finalUserCode
                    }])
                    .select()
                    .single();

                if (userErr) throw userErr;

                // Atualizar tenants
                await adminClient
                    .from('tenants')
                    .update({ admin_email: cleanEmail })
                    .eq('id', tenantId);

                result = { success: true, user: savedUser, adminGroupId };
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
                    : data.users.filter(u => {
                        const tid = u.user_metadata?.tenantId || u.user_metadata?.tenant_id || u.tenantId || u.tenant_id;
                        return tid === operatorTenantId;
                    });
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
