
import { CacheManager } from '../lib/cache';
import { adminAuthProxy, supabase, publicSupabase, ensureValidSession } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { User, UserGroup, UserRole, AppScope, ADMIN_PERMISSIONS, DEFAULT_PERMISSIONS, normalizeUserPermissions } from '../types';
import type { DbTenant, DbTenantInsert, DbTenantStats, DbUser, DbUserGroup } from '../types/database';
import { StorageService } from './storageService';
import { generateUniqueUnifiedCode, formatUserCode, formatTechCode } from './technicianService';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);



export const TenantService = {

    // --- TENANT MANAGEMENT (SUPER ADMIN / MASTER) ---

    getTenants: async (): Promise<DbTenantStats[]> => {
        if (isCloudEnabled) {
            try {
                const cacheKey = 'master_tenants_list';
                const cached = CacheManager.get<DbTenantStats[]>(cacheKey);
                if (cached) return cached;

                return CacheManager.deduplicate(cacheKey, async () => {
                    // Strategy 0: RPC get_admin_tenants_list (Security Definer - Padrão Big Tech)
                    try {
                        const { data: rpcData, error: rpcErr } = await supabase
                            .rpc('get_admin_tenants_list');
                        if (!rpcErr && rpcData && rpcData.length > 0) {
                            console.log('[TenantService] ✅ Loaded tenants via RPC get_admin_tenants_list:', rpcData.length);
                            rpcData.forEach((t: any) => {
                                StorageService.registerTenantMetadata(t.id, {
                                    companyName: t.company_name,
                                    tradeName: t.trading_name || t.trade_name,
                                    name: t.name,
                                    cnpj: t.cnpj,
                                    document: t.document
                                });
                            });
                            CacheManager.set(cacheKey, rpcData, CacheManager.TTL.SHORT);
                            return rpcData as DbTenantStats[];
                        }
                        if (rpcErr) console.warn('[TenantService] RPC get_admin_tenants_list failed:', rpcErr.message);
                    } catch (e) { /* continue */ }

                    // Strategy 1: Try view with authenticated client
                    try {
                        const { data, error } = await supabase
                            .from('vw_tenant_stats')
                            .select('*')
                            .order('name');
                        if (!error && data && data.length > 0) {
                            console.log('[TenantService] ✅ Loaded tenants via view (auth):', data.length);
                            data.forEach((t: any) => {
                                StorageService.registerTenantMetadata(t.id, {
                                    companyName: t.company_name,
                                    tradeName: t.trading_name || t.trade_name,
                                    name: t.name,
                                    cnpj: t.cnpj,
                                    document: t.document
                                });
                            });
                            CacheManager.set(cacheKey, data, CacheManager.TTL.SHORT);
                            return data as DbTenantStats[];
                        }
                        if (error) console.warn('[TenantService] View (auth) failed:', error.message);
                    } catch (e) { /* continue */ }

                    // Estratégia 2 (anon view) removida por motivos de segurança

                    // Strategy 3: Direct table query (authenticated)
                    try {
                        const { data, error } = await supabase
                            .from('tenants')
                            .select('*')
                            .order('name');
                        if (!error && data && data.length > 0) {
                            console.log('[TenantService] ✅ Loaded tenants via table (auth):', data.length);
                            data.forEach((t: any) => {
                                StorageService.registerTenantMetadata(t.id, {
                                    companyName: t.company_name,
                                    tradeName: t.trading_name || t.trade_name,
                                    name: t.name,
                                    cnpj: t.cnpj,
                                    document: t.document
                                });
                            });
                            CacheManager.set(cacheKey, data, CacheManager.TTL.SHORT);
                            return data as DbTenantStats[];
                        }
                        if (error) console.warn('[TenantService] Table (auth) failed:', error.message);
                    } catch (e) { /* continue */ }

                    // Estratégia 4 (anon table) removida por motivos de segurança

                    console.error('[TenantService] ❌ All strategies failed. RLS is blocking all reads. You need to run this SQL in Supabase:\n' +
                        'GRANT SELECT ON vw_tenant_stats TO anon;\n' +
                        'CREATE POLICY "tenants_anon_read" ON public.tenants FOR SELECT TO anon USING (true);');
                    return [];
                });

            } catch (e) {
                console.error('[TenantService] Critical error:', e);
                return [];
            }
        }
        return [];
    },

    getTenantById: async (id?: string | null, signal?: AbortSignal): Promise<DbTenant | null> => {
        if (isCloudEnabled) {
            const tid = id || getCurrentTenantId();

            // Se não houver ID ou for 'default', tenta buscar a primeira empresa cadastrada
            if (!tid || tid === 'default' || tid === 'null') {
                try {
                    // Tenta primeiro com cliente logado
                    const { data, error } = await supabase
                        .from('tenants')
                        .select('*')
                        .limit(1)
                        .abortSignal(signal)
                        .maybeSingle();

                    if (error) {
                        console.error('[TenantService] Erro ao buscar primeiro tenant:', error);
                        return null;
                    }
                    return data;
                } catch (e) {
                    console.error('[TenantService] Erro crítico ao buscar tenant:', e);
                    return null;
                }
            }

            // Busca tenant específico
            try {
                // Tenta primeiro com cliente AUTENTICADO
                const { data, error } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('id', tid)
                    .abortSignal(signal)
                    .maybeSingle();

                if (!error && data) {
                    console.log('[TenantService] ✅ Tenant carregado (auth):', data?.name || data?.company_name);
                    StorageService.registerTenantMetadata(data.id, {
                        companyName: data.company_name,
                        tradeName: data.trading_name || data.trade_name,
                        name: data.name,
                        cnpj: data.cnpj,
                        document: data.document
                    });
                    return data;
                }

                // Fallback: Tenta com cliente PÚBLICO via RPC (Fase 1.2 do plano de segurança)
                const { data: publicData, error: publicError } = await publicSupabase
                    .rpc('get_public_tenant_info', { p_tenant_id: tid });

                if (publicError) {
                    console.error('[TenantService] Erro ao buscar tenant publicamente:', publicError);
                    return null;
                }

                if (publicData) {
                    console.log('[TenantService] ✅ Tenant carregado (public):', publicData?.name || publicData?.company_name);
                    StorageService.registerTenantMetadata(tid, {
                        companyName: publicData.company_name,
                        tradeName: publicData.trading_name || publicData.trade_name,
                        name: publicData.name,
                        cnpj: publicData.cnpj,
                        document: publicData.document
                    });
                }
                return publicData;
            } catch (e) {
                console.error('[TenantService] Erro crítico ao buscar tenant por ID:', e);
                return null;
            }
        }
        return null;
    },

    createTenant: async (tenant: Partial<DbTenantInsert> & { initialPassword?: string; adminEmail?: string; adminName?: string }): Promise<DbTenant> => {
        if (isCloudEnabled) {
            const { initialPassword, ...tenantData } = tenant;
            const initialPass = initialPassword || (Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + '!1aA');

            // 🛠️ Nexus Schema Cleaner: Remove campos camelCase
            const processedTenant: Partial<DbTenantInsert> & Record<string, unknown> = {};
            Object.keys(tenantData).forEach(key => {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                if (key !== snakeKey && (tenantData as Record<string, unknown>)[snakeKey] !== undefined) return;
                processedTenant[snakeKey] = (tenantData as Record<string, unknown>)[key];
            });

            if (processedTenant.company_name && !processedTenant.name) {
                processedTenant.name = processedTenant.company_name as string;
            }

            // 🛡️ Sincronização obrigatória de e-mail (admin_email + email)
            const rawAdminEmail = processedTenant.admin_email || (tenantData as any).adminEmail || processedTenant.email || (tenant as any).adminEmail;
            if (rawAdminEmail) {
                const cleanEmail = (rawAdminEmail as string).trim().toLowerCase();
                processedTenant.admin_email = cleanEmail;
                processedTenant.email = cleanEmail;
            }

            // 🛡️ Safely store max_ai_manuals inside metadata (JSONB) to prevent schema cache error
            if (processedTenant.max_ai_manuals !== undefined) {
                const currentMeta = (processedTenant.metadata as Record<string, any>) || {};
                processedTenant.metadata = { ...currentMeta, max_ai_manuals: processedTenant.max_ai_manuals };
                delete processedTenant.max_ai_manuals;
            }
            if ((processedTenant as any).video_quality !== undefined) {
                const currentMeta = (processedTenant.metadata as Record<string, any>) || {};
                processedTenant.metadata = { ...currentMeta, video_quality: (processedTenant as any).video_quality };
                delete (processedTenant as any).video_quality;
            }

            if (processedTenant.logo_url && processedTenant.logo_url.startsWith('data:image')) {
                processedTenant.logo_url = await StorageService.uploadFile(processedTenant.logo_url, `tenants/new/logo`);
            }

            console.log("🚀 Provisionando Nexus Tenant:", processedTenant);

            // 1. Criar a empresa no Banco — supabase (anon) com RLS
            const { data, error } = await supabase.from('tenants').insert([processedTenant as DbTenantInsert]).select().single();

            if (error) {
                console.error("❌ Nexus Tenant Create Error:", error);
                if (error.code === '23505' || error.message?.includes('tenants_slug_key')) {
                    throw new Error(`O identificador (Slug) "${processedTenant.slug || processedTenant.id}" já está cadastrado no sistema. Escolha outro identificador.`);
                }
                throw new Error(`Erro ao criar empresa: ${error.message} (Código: ${error.code})`);
            }

            const tenantId = data.id;

            // 🛡️ Inicializa no Cloudflare R2 a estrutura mestre e pastas de módulos oficiais da nova empresa
            try {
                await StorageService.initializeTenantMasterFolder(data);
            } catch (r2Err) {
                console.warn('[TenantService] Aviso ao provisionar pastas R2 para a empresa:', r2Err);
            }

            // 2. Criar grupos padrão e admin
            await TenantService._provisionGroups(tenantId, processedTenant, initialPass);

            CacheManager.invalidate('master_tenants_list');
            return data as any;
        }
        return tenant as any;
    },

    _provisionGroups: async (tenantId: string, processedTenant: any, initialPass: string) => {
        const adminEmail = (processedTenant.admin_email || processedTenant.adminEmail) as string | undefined;
        if (!adminEmail) {
            console.warn("[TenantService] ⚠️ Nenhum e-mail de administrador fornecido para o tenant:", tenantId);
            return;
        }

        const targetEmail = adminEmail.toLowerCase().trim();
        const companyName = processedTenant.name || processedTenant.company_name || 'Admin';
        console.log(`[TenantService] 🚀 Provisionando usuário Admin inicial: ${targetEmail} (Tenant: ${tenantId})`);

        let newUserId: string | null = null;
        let userCode: string | null = null;

        try {
            userCode = await generateUniqueUnifiedCode(tenantId).catch(() => null);
        } catch {
            userCode = null;
        }

        // 1. Cria ou sincroniza o usuário no Supabase Auth via Edge Function (adminAuthProxy)
        try {
            const { data: authUser, error: authErr } = await adminAuthProxy.admin.createUser({
                email: targetEmail,
                password: initialPass,
                user_metadata: {
                    name: companyName,
                    role: UserRole.ADMIN,
                    tenantId: tenantId,
                    appScope: AppScope.WEB,
                    userCode: userCode || undefined,
                    avatar: ''
                },
                email_confirm: true
            });

            if (authUser?.user?.id) {
                newUserId = authUser.user.id;
            } else if (authErr) {
                console.warn("[TenantService] ⚠️ adminAuthProxy.createUser warning:", authErr.message || authErr);
            }

            // Se o e-mail já existia no Auth, localiza o UID e atualiza a senha e metadata
            if (!newUserId) {
                try {
                    const { data: listData } = await adminAuthProxy.admin.listUsers();
                    const existing = (listData?.users || []).find((u: any) => u.email?.toLowerCase() === targetEmail);
                    if (existing) {
                        newUserId = existing.id;
                        await adminAuthProxy.admin.updateUserById(newUserId, {
                            password: initialPass,
                            user_metadata: {
                                ...existing.user_metadata,
                                name: companyName,
                                role: UserRole.ADMIN,
                                tenantId: tenantId,
                                appScope: AppScope.WEB,
                                userCode: userCode || existing.user_metadata?.userCode
                            }
                        }).catch(e => console.warn('[TenantService] Aviso ao atualizar user Auth existente:', e));
                    }
                } catch (e) {
                    console.warn("[TenantService] ⚠️ List users fallback warning:", e);
                }
            }
        } catch (err) {
            console.error("[TenantService] ❌ Erro ao criar conta de autenticação:", err);
        }

        if (!newUserId) {
            console.error("[TenantService] ❌ Não foi possível gerar/localizar UID para o e-mail admin:", targetEmail);
            return;
        }

        // 2. Provisionamento atômico no Banco via RPC SECURITY DEFINER (Bypass RLS nativo e seguro)
        let rpcSuccess = false;
        try {
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('provision_tenant_initial_admin', {
                p_tenant_id: tenantId,
                p_user_id: newUserId,
                p_email: targetEmail,
                p_name: companyName,
                p_user_code: userCode
            });

            if (!rpcErr && (rpcRes as any)?.success) {
                rpcSuccess = true;
                console.log(`[TenantService] ✅ Grupos e Usuário Admin provisionados com sucesso via RPC!`, rpcRes);
            } else {
                console.warn("[TenantService] ⚠️ RPC provision_tenant_initial_admin notice:", rpcErr || rpcRes);
            }
        } catch (rpcCatch) {
            console.warn("[TenantService] ⚠️ Falha ao chamar RPC provision_tenant_initial_admin:", rpcCatch);
        }

        // 3. Fallback via Edge Function (Service Role Key tem bypass total de RLS) se a RPC falhar
        if (!rpcSuccess) {
            try {
                console.log("[TenantService] 🔄 Executando fallback de provisionamento via adminAuthProxy...");
                const { data: edgeRes, error: edgeErr } = await adminAuthProxy.admin.provisionTenantAdmin({
                    tenantId,
                    userId: newUserId,
                    email: targetEmail,
                    name: companyName,
                    userCode: userCode || undefined
                });

                if (!edgeErr && edgeRes?.success) {
                    rpcSuccess = true;
                    console.log("[TenantService] ✅ Provisionamento concluído com sucesso via Edge Function fallback!");
                } else {
                    console.warn("[TenantService] ⚠️ Edge Function provision notice:", edgeErr || edgeRes);
                }
            } catch (edgeCatch) {
                console.warn("[TenantService] ⚠️ Falha no fallback Edge Function:", edgeCatch);
            }
        }

        // 4. Fallback direto no client (para ambientes locais ou sem RLS restritivo)
        if (!rpcSuccess) {
            try {
                let adminGroupId: string | null = null;
                const { data: groupData } = await supabase.from('user_groups').insert([{
                    tenant_id: tenantId,
                    name: 'Administradores',
                    description: 'Grupo com permissões completas de administração do sistema',
                    is_system: true,
                    permissions: ADMIN_PERMISSIONS
                }]).select().single();
                if (groupData) adminGroupId = groupData.id;

                await supabase.from('user_groups').insert([{
                    tenant_id: tenantId,
                    name: 'Operadores',
                    description: 'Acesso completo aos módulos operacionais (OS, Orçamentos, Clientes, Ativos)',
                    is_system: false,
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
                        financial: { read: true, update: false, invoice: false, discounts: false }
                    }
                }]);

                const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(companyName)}&background=1c2d4f&color=fff&bold=true`;
                await supabase.from('users').upsert([{
                    id: newUserId,
                    name: companyName,
                    email: targetEmail,
                    role: UserRole.ADMIN,
                    active: true,
                    tenant_id: tenantId,
                    group_id: adminGroupId,
                    group_ids: adminGroupId ? [adminGroupId] : [],
                    avatar: defaultAvatar,
                    permissions: {},
                    app_scope: AppScope.WEB,
                    user_code: userCode
                }]);

                await supabase.from('tenants').update({
                    admin_email: targetEmail,
                    email: targetEmail
                }).eq('id', tenantId);

                console.log(`[TenantService] ✅ Usuário admin e grupos provisionados via client direct!`);
            } catch (directErr) {
                console.error("[TenantService] ❌ Erro no fallback direto:", directErr);
            }
        }
    },

    updateTenant: async (tenant: Partial<DbTenant> & { id: string; logoUrl?: string }): Promise<DbTenant> => {
        let { id, ...rest } = tenant;
        if (isCloudEnabled) {
            if (rest.logo_url && rest.logo_url.startsWith('data:image')) {
                rest.logo_url = await StorageService.uploadFile(rest.logo_url, `tenants/${id}/logo`);
            }
            if (rest.logoUrl && (rest.logoUrl as string).startsWith('data:image')) {
                rest.logo_url = await StorageService.uploadFile(rest.logoUrl as string, `tenants/${id}/logo`);
            }

            // 🛠️ Nexus Schema Cleaner
            const processedUpdate: Partial<DbTenantInsert> & Record<string, unknown> = {};
            Object.keys(rest).forEach(key => {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                if (key !== snakeKey && (rest as Record<string, unknown>)[snakeKey] !== undefined) return;
                processedUpdate[snakeKey] = (rest as Record<string, unknown>)[key];
            });

            // 🛡️ Sincronização obrigatória de e-mail (admin_email + email)
            const rawAdminEmail = processedUpdate.admin_email || (rest as any).adminEmail || processedUpdate.email;
            let normalizedAdminEmail: string | null = null;
            if (rawAdminEmail) {
                normalizedAdminEmail = (rawAdminEmail as string).trim().toLowerCase();
                processedUpdate.admin_email = normalizedAdminEmail;
                processedUpdate.email = normalizedAdminEmail;
            }

            // 🛡️ Safely store max_ai_manuals inside metadata (JSONB) to prevent schema cache error
            if (processedUpdate.max_ai_manuals !== undefined) {
                const currentMeta = (processedUpdate.metadata as Record<string, any>) || {};
                processedUpdate.metadata = { ...currentMeta, max_ai_manuals: processedUpdate.max_ai_manuals };
                delete processedUpdate.max_ai_manuals;
            }
            if ((processedUpdate as any).video_quality !== undefined) {
                const currentMeta = (processedUpdate.metadata as Record<string, any>) || {};
                processedUpdate.metadata = { ...currentMeta, video_quality: (processedUpdate as any).video_quality };
                delete (processedUpdate as any).video_quality;
            }

            // 🛡️ Se for alteração exclusiva de status, prioriza RPC atômica Master
            if (processedUpdate.status !== undefined && Object.keys(processedUpdate).filter(k => k !== 'id' && k !== 'status').length === 0) {
                try {
                    const { data: rpcRes, error: rpcErr } = await supabase
                        .rpc('toggle_tenant_status_master', { p_tenant_id: id });
                    if (!rpcErr && rpcRes && rpcRes.success) {
                        CacheManager.invalidate('master_tenants_list');
                        CacheManager.clearAll();
                        return { id, status: rpcRes.new_status } as any;
                    }
                } catch (rpcEx) {
                    console.warn('[TenantService] RPC toggle fallback to direct update:', rpcEx);
                }
            }

            const { data, error } = await supabase
                .from('tenants')
                .update(processedUpdate as Partial<DbTenantInsert>)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                // Se o erro foi por RLS ou select restrito, tenta via RPC se tiver status
                if (processedUpdate.status !== undefined) {
                    try {
                        const { data: rpcRes, error: rpcErr } = await supabase
                            .rpc('toggle_tenant_status_master', { p_tenant_id: id });
                        if (!rpcErr && rpcRes && rpcRes.success) {
                            CacheManager.invalidate('master_tenants_list');
                            CacheManager.clearAll();
                            return { id, status: rpcRes.new_status } as any;
                        }
                    } catch (_) {}
                }
                throw error;
            }
            if (!data) {
                // Tenta fallback via RPC
                if (processedUpdate.status !== undefined) {
                    try {
                        const { data: rpcRes, error: rpcErr } = await supabase
                            .rpc('toggle_tenant_status_master', { p_tenant_id: id });
                        if (!rpcErr && rpcRes && rpcRes.success) {
                            CacheManager.invalidate('master_tenants_list');
                            CacheManager.clearAll();
                            return { id, status: rpcRes.new_status } as any;
                        }
                    } catch (_) {}
                }
                throw new Error("Não foi possível localizar o registro da empresa para atualização.");
            }

            // 🛡️ Propagação de Suspensão / Reativação para App Móvel e Usuários
            if (processedUpdate.status !== undefined) {
                const isActivating = processedUpdate.status === 'active';
                try {
                    // 1. Atualiza status dos técnicos (derruba o acesso do app se suspenso)
                    await supabase
                        .from('technicians')
                        .update({ active: isActivating })
                        .eq('tenant_id', id);

                    // 2. Atualiza status dos usuários da empresa (preserva Master Admin)
                    await supabase
                        .from('users')
                        .update({ active: isActivating })
                        .eq('tenant_id', id)
                        .not('role', 'in', '("SUPER_ADMIN","moros_admin")');
                } catch (cascadeErr) {
                    console.warn('[TenantService] Erro ao sincronizar status de técnicos/usuários:', cascadeErr);
                }
            }

            // 🛡️ Sincronização do usuário ADMIN da empresa na tabela users e no Auth
            if (normalizedAdminEmail) {
                try {
                    const { data: adminUsers } = await supabase
                        .from('users')
                        .select('id, email')
                        .eq('tenant_id', id)
                        .eq('role', 'ADMIN')
                        .limit(1);

                    if (adminUsers && adminUsers.length > 0) {
                        const adminUser = adminUsers[0];
                        if (adminUser.email.toLowerCase() !== normalizedAdminEmail) {
                            await supabase
                                .from('users')
                                .update({ email: normalizedAdminEmail, updated_at: new Date().toISOString() })
                                .eq('id', adminUser.id);

                            await adminAuthProxy.admin.updateUserById(adminUser.id, {
                                email: normalizedAdminEmail,
                                user_metadata: { email: normalizedAdminEmail }
                            }).catch(() => {});
                            console.log(`[TenantService] ✅ Usuário ADMIN da empresa sincronizado para: ${normalizedAdminEmail}`);
                        }
                    }
                } catch (syncErr) {
                    console.warn('[TenantService] Aviso ao sincronizar usuário admin:', syncErr);
                }
            }

            CacheManager.invalidate('master_tenants_list');
            CacheManager.clearAll(); // Limpa cache global para forçar reload de dados se módulos foram alterados
            return data as any;
        }
        return tenant as any;
    },

    deleteTenant: async (tenantId: string): Promise<void> => {
        if (!isCloudEnabled) return;

        console.log(`💀 Iniciando exclusão total da empresa: ${tenantId}`);

        try {
            // 1. Obter todos os usuários vinculados à empresa e deletar do Auth
            const { data: users } = await supabase.from('users').select('id').eq('tenant_id', tenantId);

            if (users && users.length > 0) {
                console.log(`👤 Removendo ${users.length} usuários do Supabase Auth...`);
                for (const user of users) {
                    // Deleta do Auth via Edge Function
                    await adminAuthProxy.admin.deleteUser(user.id).catch(() => { });
                }
            }

            // 2. Tenta exclusão atômica via RPC Master (Transacional, RLS-Safe e blindada contra audit_logs)
            try {
                const { data: rpcRes, error: rpcErr } = await supabase
                    .rpc('delete_tenant_master', { p_tenant_id: tenantId });
                if (!rpcErr && rpcRes && rpcRes.success) {
                    console.log(`✅ [TenantService] Empresa ${tenantId} excluída atomicamente via delete_tenant_master.`);
                    CacheManager.invalidate('master_tenants_list');
                    CacheManager.clearAll();
                    return;
                }
                if (rpcErr) {
                    console.warn('[TenantService] RPC delete_tenant_master aviso/indisponível, usando fallback manual:', rpcErr);
                }
            } catch (rpcEx) {
                console.warn('[TenantService] RPC delete_tenant_master exceção, usando fallback manual:', rpcEx);
            }

            // 3. Fallback: Limpeza manual em cascata defensiva
            // Nota: audit_logs é limpo antes e depois para evitar que triggers de DELETE em orders/quotes travem a chave estrangeira
            const tables = [
                'audit_logs',
                'ai_knowledge_base',
                'service_order_equipments',
                'service_visits',
                'order_items',
                'orders',
                'quotes',
                'invoice_installments',
                'invoice_items',
                'invoices',
                'accounts_payable',
                'cash_flow',
                'stock_movements',
                'stock_items',
                'stock_categories',
                'customers',
                'equipments',
                'form_templates',
                'contracts',
                'defect_types',
                'technicians',
                'technician_gps_pings',
                'whatsapp_messages',
                'whatsapp_conversations',
                'users',
                'user_groups',
                'audit_logs' // Segunda passagem indispensável devido a triggers AFTER DELETE em orders/quotes
            ];

            for (const table of tables) {
                try {
                    await supabase.from(table).delete().eq('tenant_id', tenantId);
                } catch { /* ignora erros de tabelas inexistentes */ }
            }

            // 4. Por fim, deletar o registro da empresa
            const { error: tenantDeleteError } = await supabase.from('tenants').delete().eq('id', tenantId);
            if (tenantDeleteError) throw tenantDeleteError;

            CacheManager.invalidate('master_tenants_list');
            CacheManager.clearAll();

        } catch (err: any) {
            console.error("❌ Falha crítica ao excluir empresa:", err.message);
            throw err;
        }
    },

    toggleTenantStatus: async (tenantId: string, currentStatus: string): Promise<void> => {
        if (!isCloudEnabled) return;

        // 1. Tenta RPC Security Definer (mais rápido e à prova de RLS)
        try {
            const { data: rpcRes, error: rpcErr } = await supabase
                .rpc('toggle_tenant_status_master', { p_tenant_id: tenantId });
            if (!rpcErr && rpcRes && rpcRes.success) {
                CacheManager.invalidate('master_tenants_list');
                return;
            }
        } catch (_) {}

        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        const isActivating = newStatus === 'active';
        
        const { error } = await supabase
            .from('tenants')
            .update({ status: newStatus })
            .eq('id', tenantId);
            
        if (error) {
            console.error("❌ Erro ao alterar status da empresa:", error);
            throw new Error(`Falha ao alterar status: ${error.message}`);
        }

        try {
            // 1. Atualiza status dos técnicos (derruba o acesso do app se suspenso)
            await supabase
                .from('technicians')
                .update({ active: isActivating })
                .eq('tenant_id', tenantId);

            // 2. Atualiza status dos usuários da empresa (preserva Master Admin)
            await supabase
                .from('users')
                .update({ active: isActivating })
                .eq('tenant_id', tenantId)
                .not('role', 'in', '("SUPER_ADMIN","moros_admin")');
        } catch (cascadeErr) {
            console.warn('[TenantService] Erro ao sincronizar status de técnicos/usuários:', cascadeErr);
        }
        
        CacheManager.invalidate('master_tenants_list');
    },

    // --- USER MANAGEMENT (TENANT LEVEL) ---

    getTenantUsers: async (tenantId: string, signal?: AbortSignal): Promise<User[]> => {
        if (!tenantId) return [];
        if (isCloudEnabled) {
            let query = supabase
                .from('users')
                .select('id, name, email, role, avatar, tenant_id, active, created_at, phone, group_id, group_ids, permissions, app_scope, user_code')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (signal) {
                query = query.abortSignal(signal);
            }

            let { data, error } = await query;

            // 🛡️ SEGURANÇA: NÃO usar fallback de listUsers() do Auth Admin aqui!
            // O listUsers() retorna TODOS os usuários de TODOS os tenants do Supabase Auth,
            // e a filtragem por user_metadata é fraca, causando vazamento de dados cross-tenant
            // especialmente durante impersonation via Super Admin (onde o JWT não corresponde ao tenant).
            // Se RLS bloqueou a query, a resposta correta é retornar vazio — não contornar a segurança.

            if (error && (!data || data.length === 0)) {
                console.error("Error fetching tenant users:", error);
                return [];
            }

            return ((data || []) as DbUser[]).map(u => {
                let parsedGroupIds: string[] = [];
                if (u.group_ids) {
                    if (typeof u.group_ids === 'string') {
                        try { parsedGroupIds = JSON.parse(u.group_ids); }
                        catch (e) { parsedGroupIds = [u.group_ids]; }
                    } else if (Array.isArray(u.group_ids)) {
                        parsedGroupIds = u.group_ids;
                    }
                }
                
                const rawRole = (u.role || '').toUpperCase();
                const normalizedRole = (rawRole === 'ADMIN' || rawRole === 'SUPER_ADMIN') ? UserRole.ADMIN : (rawRole as UserRole);

                return {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: normalizedRole,
                    active: u.active,
                    avatar: u.avatar,
                    groupId: u.group_id as string,
                    groupIds: parsedGroupIds.length > 0 ? parsedGroupIds : (u.group_id ? [u.group_id] : []),
                    tenantId: u.tenant_id as string,
                    permissions: u.permissions as any,
                    appScope: (u.app_scope as AppScope) || (normalizedRole === UserRole.TECHNICIAN ? AppScope.MOBILE : AppScope.WEB),
                    userCode: formatUserCode(u.user_code),
                    user_code: formatUserCode(u.user_code)
                };
            });
        }
        return [];
    },

    getUserGroups: async (tenantId?: string, signal?: AbortSignal): Promise<UserGroup[]> => {
        const tid = tenantId || getCurrentTenantId() || '';
        if (!tid) return [];
        if (isCloudEnabled) {
            let query = supabase
                .from('user_groups')
                .select('*')
                .eq('tenant_id', tid)
                .order('name');

            if (signal) {
                query = query.abortSignal(signal);
            }

            let { data, error } = await query;

            // Fallback publicSupabase - REMOVIDO POR SEGURANÇA

            if (!data || data.length === 0) {
                const defaultGroups: UserGroup[] = [
                    {
                        id: `sys-admin-${tid}`,
                        name: 'Administradores',
                        description: 'Controle total do sistema e gestão de permissões',
                        permissions: ADMIN_PERMISSIONS,
                        isSystem: true,
                        active: true
                    },
                    {
                        id: `sys-op-${tid}`,
                        name: 'Operadores / Atendimento',
                        description: 'Acesso às rotas operacionais, ordens de serviço e clientes',
                        permissions: DEFAULT_PERMISSIONS,
                        isSystem: false,
                        active: true
                    }
                ];
                return defaultGroups;
            }

            return ((data || []) as DbUserGroup[]).map(g => ({
                id: g.id,
                name: g.name || 'Sem Nome',
                description: g.description || '',
                permissions: (g.name && g.name.toLowerCase() === 'administradores') ? ADMIN_PERMISSIONS : normalizeUserPermissions(g.permissions),
                isSystem: !!g.is_system,
                active: true
            }));
        }
        return [];
    },

    createUserGroup: async (groupData: Omit<UserGroup, 'id'>): Promise<UserGroup> => {
        if (isCloudEnabled) {
            const isMaster = groupData.name?.toLowerCase() === 'administradores';
            const finalPerms = isMaster ? ADMIN_PERMISSIONS : normalizeUserPermissions(groupData.permissions);
            const dbGroup: any = {
                name: groupData.name,
                description: groupData.description,
                permissions: finalPerms,
                is_system: groupData.isSystem ?? false,
                tenant_id: groupData.tenantId ?? ''
            };

            const { data, error } = await supabase
                .from('user_groups')
                .insert([dbGroup])
                .select()
                .single();

            if (error) throw error;
            return {
                id: data.id,
                name: data.name,
                description: data.description,
                permissions: isMaster ? ADMIN_PERMISSIONS : normalizeUserPermissions(data.permissions),
                isSystem: data.is_system,
                active: true
            };
        }
        return groupData;
    },

    updateUserGroup: async (groupData: Pick<UserGroup, 'id' | 'name' | 'description' | 'permissions'>): Promise<UserGroup> => {
        const isMaster = groupData.name?.toLowerCase() === 'administradores';
        const finalPerms = isMaster ? ADMIN_PERMISSIONS : normalizeUserPermissions(groupData.permissions);

        if (isCloudEnabled) {
            const dbGroup: any = {
                name: groupData.name,
                description: groupData.description,
                permissions: finalPerms
            };

            const { data, error } = await supabase
                .from('user_groups')
                .update(dbGroup)
                .eq('id', groupData.id)
                .select()
                .single();

            if (error) throw error;
            return {
                id: data.id,
                name: data.name,
                description: data.description,
                permissions: isMaster ? ADMIN_PERMISSIONS : normalizeUserPermissions(data.permissions),
                isSystem: data.is_system,
                active: true
            };
        }
        return groupData;
    },

    deleteUserGroup: async (groupId: string): Promise<void> => {
        if (isCloudEnabled) {
            const { error } = await supabase
                .from('user_groups')
                .delete()
                .eq('id', groupId);
            if (error) throw error;
        }
    },

    checkTechnicianLicenseLimit: async (tenantId: string, targetUserId?: string): Promise<void> => {
        if (!isCloudEnabled || !tenantId) return;

        const { data: tenantRow } = await supabase
            .from('tenants')
            .select('max_technicians, name, company_name')
            .eq('id', tenantId)
            .maybeSingle();

        const limit = tenantRow?.max_technicians ?? 0;
        if (limit <= 0) return; // 0 = sem restrição

        const { TechnicianService } = await import('./technicianService');
        const techs = await TechnicianService.getAllTechnicians(tenantId, undefined, true);
        const activeTechsCount = techs.filter(t => t.active && t.id !== targetUserId).length;

        if (activeTechsCount >= limit) {
            const companyName = tenantRow?.name || tenantRow?.company_name || 'sua empresa';
            throw new Error(
                `🔒 Limite de licenças atingido: A empresa ${companyName} possui plano para no máximo ${limit} técnico(s) ativo(s). ` +
                `Para habilitar este usuário no aplicativo, desative um técnico existente na tela de Técnicos ou contate o suporte DUNO para upgrade.`
            );
        }
    },

    createUser: async (userData: Omit<User, 'id'> & { password?: string; tenantId: string; groupId?: string }): Promise<DbUser> => {
        if (isCloudEnabled) {
            // 🔒 LICENSE GUARD: Se o novo usuário for habilitado para o aplicativo, verifica o limite
            const isTechUser = userData.appScope === AppScope.HYBRID || userData.appScope === AppScope.MOBILE || userData.role === UserRole.TECHNICIAN;
            if (isTechUser && userData.active !== false) {
                await TenantService.checkTechnicianLicenseLimit(userData.tenantId);
            }

            let userId: string | null = null;
            const targetEmail = userData.email.toLowerCase().trim();

            // 🔑 Gera código único de 6 dígitos para o usuário (compartilhado com técnico se tiver acesso ao app)
            const userCode = (userData.userCode && userData.userCode.length <= 10 && userData.userCode !== '— gerado ao salvar —' && userData.userCode !== '---')
                ? userData.userCode
                : (userData.user_code && userData.user_code.length <= 10 && userData.user_code !== '— gerado ao salvar —' && userData.user_code !== '---')
                    ? userData.user_code
                    : await generateUniqueUnifiedCode(userData.tenantId);

            // 1. Tenta criar no Auth via adminAuthProxy
            const { data: authUser, error: authError } = await adminAuthProxy.admin.createUser({
                email: targetEmail,
                password: userData.password,
                email_confirm: true,
                user_metadata: {
                    name: userData.name,
                    role: userData.role,
                    tenantId: userData.tenantId,
                    avatar: userData.avatar,
                    appScope: userData.appScope || AppScope.WEB,
                    userCode: userCode,
                    user_code: userCode,
                    techCode: isTechUser ? userCode : undefined,
                    tech_code: isTechUser ? userCode : undefined
                }
            });

            if (!authError && authUser?.user) {
                userId = authUser.user.id;
            } else {
                console.warn("⚠️ adminAuthProxy.createUser notice:", authError?.message || authError);

                if (authError) {
                    const errText = (authError.message || '').toLowerCase();
                    if (errText.includes('unable to validate email') || errText.includes('invalid format') || errText.includes('email address is invalid')) {
                        throw new Error("Formato de e-mail inválido. Por favor, verifique se digitou o endereço de e-mail corretamente.");
                    }
                }

                // 2. Se o e-mail já existir no Auth, verifica se pertence ao mesmo tenant e reutiliza
                try {
                    const { data: listData } = await adminAuthProxy.admin.listUsers();
                    const existing = (listData?.users || []).find((u: any) => u.email?.toLowerCase() === targetEmail);
                    if (existing) {
                        const existingTenantId = existing.user_metadata?.tenantId || existing.user_metadata?.tenant_id;
                        
                        if (existingTenantId && existingTenantId !== userData.tenantId) {
                            throw new Error("Este e-mail já está em uso por outra empresa. Para evitar conflitos de acesso, é necessário usar um outro e-mail.");
                        }

                        userId = existing.id;
                        
                        // Verifica se já tem cadastro de usuário do sistema
                        const { data: existingDbUser } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
                        if (existingDbUser) {
                            throw new Error("Este usuário já está cadastrado no sistema. Para editar, utilize o botão de edição na lista de usuários.");
                        }

                        console.log(`🔗 E-mail já existe no mesmo tenant (possivelmente um técnico). Reutilizando conta Auth ${userId} para cadastro de usuário.`);
                        
                        await adminAuthProxy.admin.updateUserById(userId, {
                            user_metadata: {
                                ...existing.user_metadata,
                                name: userData.name,
                                role: userData.role,
                                tenantId: userData.tenantId,
                                appScope: userData.appScope || AppScope.WEB,
                                userCode: userCode,
                                user_code: userCode
                            }
                        }).catch(() => {});
                    } else if (authError) {
                        const errText = (authError.message || '').toLowerCase();
                        if (errText.includes('unable to validate email') || errText.includes('invalid format') || errText.includes('email address is invalid')) {
                            throw new Error("Formato de e-mail inválido. Por favor, verifique se digitou o endereço de e-mail corretamente.");
                        }
                        throw authError;
                    }
                } catch (e: any) {
                    if (e.message?.includes("já está em uso") || e.message?.includes("já está cadastrado")) throw e;
                    if (authError) {
                        const errText = (authError.message || '').toLowerCase();
                        if (errText.includes('unable to validate email') || errText.includes('invalid format') || errText.includes('email address is invalid')) {
                            throw new Error("Formato de e-mail inválido. Por favor, verifique se digitou o endereço de e-mail corretamente.");
                        }
                        throw authError;
                    }
                    throw e;
                }
            }

            if (!userId) throw new Error("Falha ao gerar UID para o novo usuário.");

            const generatedAvatar = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}&background=random&color=fff&bold=true`;

            const validGroupId = (userData.groupId && userData.groupId.trim() !== '' && /^[0-9a-fA-F-]{36}$/.test(userData.groupId)) 
                ? userData.groupId 
                : null;

            // 2. Create/Update DB User Entry
            const dbUser: any = {
                id: userId,
                name: userData.name,
                email: userData.email,
                role: userData.role,
                active: userData.active,
                tenant_id: userData.tenantId,
                group_id: validGroupId,
                group_ids: userData.groupIds,
                avatar: generatedAvatar,
                permissions: userData.permissions,
                app_scope: userData.appScope || AppScope.WEB,
                user_code: userCode
            };

            // 🛡️ Tenta upsert direto (mais rápido — funciona quando RLS permite)
            const { data, error } = await supabase
                .from('users')
                .upsert([dbUser])
                .select()
                .single();

            if (error) {
                const errMsg = (error.message || '').toLowerCase();
                // Se RLS bloqueou (ex: impersonation via Super Admin), usa RPC SECURITY DEFINER
                if (errMsg.includes('permission denied') || errMsg.includes('row-level security') || errMsg.includes('new row violates')) {
                    console.warn('[TenantService] ⚠️ RLS bloqueou upsert direto em users. Tentando via RPC upsert_user_record...');
                    const { data: rpcResult, error: rpcError } = await supabase.rpc('upsert_user_record', {
                        p_id: userId,
                        p_name: userData.name,
                        p_email: userData.email,
                        p_role: userData.role || 'ADMIN',
                        p_active: userData.active !== false,
                        p_tenant_id: userData.tenantId,
                        p_group_id: validGroupId || null,
                        p_group_ids: userData.groupIds || [],
                        p_avatar: generatedAvatar,
                        p_permissions: userData.permissions || {},
                        p_app_scope: userData.appScope || AppScope.WEB,
                        p_user_code: userCode || null,
                        p_phone: (userData as any).phone || null
                    });

                    if (rpcError || (rpcResult && rpcResult.success === false)) {
                        throw new Error(rpcResult?.error || rpcError?.message || 'Falha ao criar usuário via RPC');
                    }

                    // Retorna o dbUser montado (RPC não retorna o row completo)
                    return dbUser as any;
                }
                throw error;
            }

            // Cadastro de usuário isolado: NÃO sincroniza com tabela `technicians`
            // Se o usuário desejar acesso ao app, deve ser cadastrado manualmente na tela de técnicos

            return data as any;
        }
        return userData as any;
    },

    updateUser: async (userData: Partial<User> & { id: string; password?: string; groupId?: string }): Promise<DbUser> => {
        if (isCloudEnabled) {
            // 🔒 LICENSE GUARD na edição: Se o usuário passou a ter acesso de técnico/app e estiver ativo
            const { data: existingUser } = await supabase
                .from('users')
                .select('user_code, app_scope, role, active, tenant_id, email, name')
                .eq('id', userData.id)
                .maybeSingle();

            const tid = existingUser?.tenant_id || getCurrentTenantId();

            let userCode = existingUser?.user_code || (userData as any).userCode || (userData as any).user_code;
            if (!userCode || userCode.length > 10 || userCode === '---') {
                // Checa se existe código na tabela de técnicos
                if (tid) {
                    const { data: techRow } = await supabase.from('technicians').select('tech_code').eq('id', userData.id).maybeSingle();
                    if (techRow?.tech_code && techRow.tech_code.length <= 10 && techRow.tech_code !== '---') {
                        userCode = techRow.tech_code;
                    }
                }
                if (!userCode && tid) {
                    userCode = await generateUniqueUnifiedCode(tid);
                }
            }

            if (existingUser) {
                const oldScope = existingUser.app_scope || AppScope.WEB;
                const oldRole = existingUser.role;
                const oldWasTech = (oldScope === AppScope.HYBRID || oldScope === AppScope.MOBILE || oldRole === UserRole.TECHNICIAN) && existingUser.active !== false;

                const newScope = userData.appScope !== undefined ? userData.appScope : oldScope;
                const newRole = userData.role !== undefined ? userData.role : oldRole;
                const newIsActive = userData.active !== undefined ? userData.active : existingUser.active;
                const newWillBeTech = (newScope === AppScope.HYBRID || newScope === AppScope.MOBILE || newRole === UserRole.TECHNICIAN) && newIsActive !== false;

                if (!oldWasTech && newWillBeTech) {
                    if (tid) {
                        await TenantService.checkTechnicianLicenseLimit(tid, userData.id);
                    }
                }
            }

            const validGroupId = (userData.groupId && userData.groupId.trim() !== '' && /^[0-9a-fA-F-]{36}$/.test(userData.groupId)) 
                ? userData.groupId 
                : null;

            const dbUser: any = {
                name: userData.name,
                active: userData.active,
                group_id: validGroupId,
                group_ids: userData.groupIds,
                avatar: userData.avatar,
                permissions: userData.permissions,
                app_scope: userData.appScope || undefined,
                user_code: userCode || undefined
            };

            const { data, error } = await supabase
                .from('users')
                .update(dbUser)
                .eq('id', userData.id)
                .select()
                .single();

            if (error) {
                const errMsg = (error.message || '').toLowerCase();
                if (errMsg.includes('permission denied') || errMsg.includes('row-level security')) {
                    console.warn('[TenantService] ⚠️ RLS bloqueou update direto em users. Tentando via RPC upsert_user_record...');
                    const tid = existingUser?.tenant_id || getCurrentTenantId();
                    const { data: rpcResult, error: rpcError } = await supabase.rpc('upsert_user_record', {
                        p_id: userData.id,
                        p_name: userData.name || existingUser?.name || '',
                        p_email: existingUser?.email || '',
                        p_role: (userData.role || existingUser?.role || 'ADMIN') as string,
                        p_active: userData.active !== undefined ? userData.active : (existingUser?.active !== false),
                        p_tenant_id: tid,
                        p_group_id: validGroupId || null,
                        p_group_ids: userData.groupIds || [],
                        p_avatar: userData.avatar || '',
                        p_permissions: userData.permissions || {},
                        p_app_scope: (userData.appScope || existingUser?.app_scope || AppScope.WEB) as string,
                        p_user_code: userCode || null,
                        p_phone: (userData as any).phone || null
                    });
                    if (rpcError || (rpcResult && rpcResult.success === false)) {
                        throw new Error(rpcResult?.error || rpcError?.message || 'Falha ao atualizar usuário via RPC');
                    }
                    // Retorna o dbUser como proxy (RPC não retorna row completo)
                    return { ...existingUser, ...dbUser, id: userData.id } as any;
                }
                throw error;
            }

            // Sync Auth status / metadata e appScope / userCode
            const updateMeta: any = {};
            if (userData.active === true) updateMeta.ban_duration = 'none';
            else if (userData.active === false) updateMeta.ban_duration = '876000h';
            if (userData.password) updateMeta.password = userData.password;
            if (userData.appScope || userData.name || userData.role || userCode) {
                updateMeta.user_metadata = {
                    ...(userData.appScope ? { appScope: userData.appScope } : {}),
                    ...(userData.name ? { name: userData.name } : {}),
                    ...(userData.role ? { role: userData.role } : {}),
                    ...(userCode ? { userCode: userCode } : {})
                };
            }
            if (Object.keys(updateMeta).length > 0) {
                await adminAuthProxy.admin.updateUserById(userData.id, updateMeta).catch(() => {});
            }

            // Atualização de usuário isolada: NÃO sincroniza com tabela `technicians`
            // Se o usuário desejar acesso ao app, deve ser cadastrado/atualizado manualmente na tela de técnicos

            return data;
        }
        return userData;
    },

    /**
     * 🔄 Backfill Engine — Sincroniza códigos únicos de 6 dígitos para TODOS os usuários e técnicos.
     * Garante que usuários com acesso ao App mantenham o MESMO código em ambas as tabelas (users e technicians).
     */
    backfillMissingUserCodes: async (tenantIdOverride?: string): Promise<number> => {
        let tid = tenantIdOverride || getCurrentTenantId();
        if (!tid || tid === 'default' || tid === 'null') {
            tid = SessionStorage.get('current_tenant') || localStorage.getItem('nexus_current_tenant') || localStorage.getItem('nexus_tenant_id') || localStorage.getItem('tenant_id') || '';
        }
        if (!tid || tid === 'default' || tid === 'null') {
            try {
                const sessionRes = await supabase.auth.getSession();
                const session = sessionRes?.data?.session;
                tid = session?.user?.user_metadata?.tenantId || session?.user?.user_metadata?.tenant_id || '';
                if (!tid && session?.user?.id) {
                    const { data: dbUser } = await supabase.from('users').select('tenant_id').eq('id', session.user.id).maybeSingle();
                    if (dbUser?.tenant_id) tid = dbUser.tenant_id;
                }
            } catch (e) {}
        }
        if (!isCloudEnabled || !tid || tid === 'default' || tid === 'null') return 0;

        try {
            const [usersRes, techsRes] = await Promise.all([
                supabase.from('users').select('id, user_code, role, app_scope, email, name').eq('tenant_id', tid),
                supabase.from('technicians').select('id, tech_code, email, name').eq('tenant_id', tid)
            ]);

            const usersList = usersRes.data || [];
            const techsList = techsRes.data || [];

            const techCodeMap = new Map<string, string>();
            techsList.forEach((t: any) => {
                if (t.tech_code && t.tech_code.length <= 10 && t.tech_code !== '---') {
                    techCodeMap.set(t.id, t.tech_code);
                }
            });

            const userCodeMap = new Map<string, string>();
            usersList.forEach((u: any) => {
                if (u.user_code && u.user_code.length <= 10 && u.user_code !== '---') {
                    userCodeMap.set(u.id, u.user_code);
                }
            });

            let updatedCount = 0;

            for (const u of usersList) {
                let code = userCodeMap.get(u.id) || techCodeMap.get(u.id);
                if (!code || code === '---' || code.length > 10) {
                    code = await generateUniqueUnifiedCode(tid);
                }

                // Sincroniza user_code na tabela users
                if (!u.user_code || u.user_code === '---' || u.user_code.length > 10 || u.user_code !== code) {
                    await supabase.from('users').update({ user_code: code }).eq('id', u.id).eq('tenant_id', tid);
                    userCodeMap.set(u.id, code);
                    updatedCount++;

                    // Sincroniza Auth user_metadata
                    try {
                        await adminAuthProxy.admin.updateUserById(u.id, {
                            user_metadata: { userCode: code, user_code: code }
                        });
                    } catch (e) {}
                }

                // Se o usuário tiver acesso ao App móvel, sincroniza com o MESMO código na tabela technicians
                const isTech = (u.app_scope === 'HYBRID' || u.app_scope === 'MOBILE' || u.role === 'TECHNICIAN' || u.role === 'TECNICO');
                const currentTechCode = techCodeMap.get(u.id);

                if (isTech && (!currentTechCode || currentTechCode === '---' || currentTechCode.length > 10 || currentTechCode !== code)) {
                    try {
                        await supabase.from('technicians').upsert([{
                            id: u.id,
                            name: u.name || 'Técnico',
                            email: u.email || '',
                            active: true,
                            tech_code: code,
                            tenant_id: tid
                        }], { onConflict: 'id' });
                        techCodeMap.set(u.id, code);
                        updatedCount++;
                    } catch (e) {
                        console.warn(`Backfill tech code error for ${u.id}:`, e);
                    }
                }
            }

            // Sincroniza qualquer técnico da tabela technicians que não possua código válido
            for (const t of techsList) {
                if (!t.tech_code || t.tech_code.length > 10 || t.tech_code === '---') {
                    let code = userCodeMap.get(t.id);
                    if (!code || code === '---' || code.length > 10) {
                        code = await generateUniqueUnifiedCode(tid);
                    }
                    try {
                        await supabase.from('technicians').update({ tech_code: code }).eq('id', t.id).eq('tenant_id', tid);
                        techCodeMap.set(t.id, code);
                        // Também atualiza na tabela users se existir registro
                        await supabase.from('users').update({ user_code: code }).eq('id', t.id).eq('tenant_id', tid);
                        userCodeMap.set(t.id, code);
                        updatedCount++;
                    } catch (e) {}
                }
            }

            if (updatedCount > 0) {
                CacheManager.invalidate(`techs_${tid}`);
                CacheManager.invalidate(`users_${tid}`);
                console.log(`✅ [TenantService] Backfill: ${updatedCount} usuários/técnicos sincronizados com código único de 6 dígitos.`);
            }
            return updatedCount;
        } catch (e) {
            console.warn("⚠️ Backfill error:", e);
            return 0;
        }
    },

    deleteUser: async (userId: string): Promise<void> => {
        if (isCloudEnabled) {
            // Verifica se o usuário também tem cadastro de técnico
            const { data: techRecord } = await supabase.from('technicians').select('id').eq('id', userId).maybeSingle();
            const hasTechnicianRecord = !!techRecord;

            if (hasTechnicianRecord) {
                // Tem técnico vinculado: remove SOMENTE da tabela users (mantém auth + technicians)
                const { error: dbErr } = await supabase.from('users').delete().eq('id', userId);
                // Se RLS bloqueou (0 rows afetadas sem erro), tenta via RPC
                if (dbErr) {
                    console.warn('⚠️ RLS bloqueou delete direto em users, tentando via RPC parcial...');
                    // Fallback: delete direto na tabela via service_role
                    const { error: rpcErr } = await supabase.rpc('delete_user_cascade', { p_user_id: userId });
                    if (rpcErr) {
                        // Último recurso: admin proxy
                        await adminAuthProxy.admin.deleteUser(userId);
                    }
                }
                // Atualiza app_scope de volta para MOBILE se técnico ficar órfão
                await supabase.from('technicians').select('id').eq('id', userId).maybeSingle().then(({ data }) => {
                    if (data) {
                        supabase.from('users').update({ app_scope: 'MOBILE' }).eq('id', userId).then(() => {});
                    }
                });
            } else {
                // Sem técnico vinculado: exclusão total (users + auth)
                // Usa RPC cascade como caminho primário (SECURITY DEFINER = bypass RLS)
                try {
                    const { data, error } = await supabase.rpc('delete_user_cascade', { p_user_id: userId });
                    if (error || (data && data.success === false)) {
                        const rpcError = data?.error || error?.message || 'Falha na RPC';
                        console.warn('⚠️ RPC delete_user_cascade falhou:', rpcError, '— tentando via admin proxy...');
                        // Fallback 1: delete direto na tabela
                        await supabase.from('users').delete().eq('id', userId).then(() => {});
                        // Fallback 2: remove do auth via admin proxy (service_role)
                        await adminAuthProxy.admin.deleteUser(userId).catch(() => {});
                    }
                } catch (e) {
                    console.warn('⚠️ Exceção no delete cascade:', e, '— tentando fallbacks...');
                    await supabase.from('users').delete().eq('id', userId).then(() => {});
                    await adminAuthProxy.admin.deleteUser(userId).catch(() => {});
                }
            }
        }
    },

    deleteTechnician: async (techId: string): Promise<void> => {
        if (isCloudEnabled) {
            // Verifica se o técnico também tem cadastro de usuário do sistema
            const { data: userRecord } = await supabase.from('users').select('id').eq('id', techId).maybeSingle();
            const hasUserRecord = !!userRecord;

            if (hasUserRecord) {
                // Tem usuário vinculado: remove SOMENTE da tabela technicians (mantém auth + users)
                const { error: dbErr } = await supabase.from('technicians').delete().eq('id', techId);
                if (dbErr) {
                    console.warn('⚠️ RLS bloqueou delete direto em technicians:', dbErr.message);
                    // Fallback via RPC (mas como o user existe, vamos só deletar technicians via admin)
                    throw new Error('Falha ao remover técnico: ' + dbErr.message);
                }
                // Reverte app_scope para WEB já que não é mais técnico
                await supabase.from('users').update({ app_scope: 'WEB' }).eq('id', techId).then(() => {
                    console.log('✅ app_scope revertido para WEB após remoção do técnico.');
                });
            } else {
                // Sem usuário vinculado: exclusão total (technicians + auth)
                // Usa RPC cascade como caminho primário (SECURITY DEFINER = bypass RLS)
                try {
                    const { data, error } = await supabase.rpc('delete_user_cascade', { p_user_id: techId });
                    if (error || (data && data.success === false)) {
                        const rpcError = data?.error || error?.message || 'Falha na RPC';
                        console.warn('⚠️ RPC delete_user_cascade falhou:', rpcError, '— tentando via admin proxy...');
                        // Fallback 1: delete direto na tabela
                        await supabase.from('technicians').delete().eq('id', techId).then(() => {});
                        // Fallback 2: remove do auth via admin proxy (service_role)
                        await adminAuthProxy.admin.deleteUser(techId).catch(() => {});
                    }
                } catch (e) {
                    console.warn('⚠️ Exceção no delete cascade:', e, '— tentando fallbacks...');
                    await supabase.from('technicians').delete().eq('id', techId).then(() => {});
                    await adminAuthProxy.admin.deleteUser(techId).catch(() => {});
                }
            }
        }
    },


    // 📢 Nexus Global Notifications

    createSystemNotification: async (notification: {
        title: string;
        content: string;
        type: 'broadcast' | 'targeted';
        targetTenants?: string[];
        targetRoles?: string[];
        priority: string;
        actionLabel?: string;
        actionUrl?: string;
        expiresAt?: string;
    }) => {
        if (isCloudEnabled) {
            // Incorpora metadados estruturados de fallback no campo content para resiliência total de colunas
            const metaPayload = {
                type: notification.type,
                priority: notification.priority,
                targetTenants: notification.targetTenants || [],
                targetRoles: notification.targetRoles || [],
                actionLabel: notification.actionLabel?.trim() || null,
                actionUrl: notification.actionUrl?.trim() || null,
                expiresAt: notification.expiresAt || null
            };

            let storedContent = notification.content.trim();
            if (notification.actionLabel || notification.actionUrl || (notification.targetTenants && notification.targetTenants.length > 0) || (notification.targetRoles && notification.targetRoles.length > 0)) {
                storedContent = `${storedContent}\n\n<!--NEXUS_NOTIF_META:${JSON.stringify(metaPayload)}-->`;
            }

            const fullPayload: Record<string, any> = {
                title: notification.title,
                content: storedContent,
                type: notification.type,
                priority: notification.priority,
                target_tenants: notification.targetTenants && notification.targetTenants.length > 0 ? notification.targetTenants : null,
                target_roles: notification.targetRoles && notification.targetRoles.length > 0 ? notification.targetRoles : null,
                action_label: notification.actionLabel ? notification.actionLabel.trim() : null,
                action_url: notification.actionUrl ? notification.actionUrl.trim() : null
                // Note: expires_at column does not exist in the database schema
            };

            // Remove null/undefined optional properties so we don't send columns that might not exist
            Object.keys(fullPayload).forEach(key => {
                if (fullPayload[key] === null || fullPayload[key] === undefined) {
                    delete fullPayload[key];
                }
            });

            console.log('[TenantService] 🚀 Inserting system notification:', fullPayload);

            try {
                const { data, error } = await supabase
                    .from('system_notifications')
                    .insert([fullPayload])
                    .select()
                    .single();

                if (!error && data) {
                    console.log('[TenantService] ✅ Notification inserted via authenticated client:', data.id);
                    return data;
                }

                // If error is missing column (schema cache mismatch), strip non-core columns and retry
                if (error && error.message?.includes('Could not find')) {
                    console.warn('[TenantService] ⚠️ Schema mismatch in system_notifications. Retrying with core columns:', error.message);
                    const corePayload: Record<string, any> = {
                        title: notification.title,
                        content: storedContent,
                        type: notification.type,
                        priority: notification.priority
                    };
                    if (notification.targetTenants && notification.targetTenants.length > 0) {
                        corePayload.target_tenants = notification.targetTenants;
                    }

                    const { data: fallbackData, error: fallbackError } = await supabase
                        .from('system_notifications')
                        .insert([corePayload])
                        .select()
                        .single();

                    if (!fallbackError && fallbackData) return fallbackData;
                    if (fallbackError) throw fallbackError;
                }
                if (error) throw error;
            } catch (e: any) {
                console.error('[TenantService] ❌ Notification insert failed:', e.message || e);
                throw e;
            }
        }
        return null;
    },

    getSystemNotifications: async (userId: string, tenantId?: string, userRole?: string): Promise<any[]> => {
        if (isCloudEnabled) {
            try {
                // Wait for the session to be ready before querying authenticated endpoints
                const sessionOk = await ensureValidSession();
                if (!sessionOk) {
                    console.warn('[TenantService] ⚠️ Cannot fetch notifications: session invalid.');
                    return [];
                }
                let dbReadIds: string[] = [];
                try {
                    const { data: readRecords } = await supabase.from('system_notification_reads').select('notification_id').eq('user_id', userId);
                    if (readRecords) dbReadIds = readRecords.map(r => r.notification_id);
                } catch (e) { /* fallback */ }

                // Big Tech Resilience: Combine DB read state with LocalStorage cache
                let localReadIds: string[] = [];
                try {
                    const localKey = `nexus_dismissed_notif_${userId}`;
                    localReadIds = JSON.parse(localStorage.getItem(localKey) || '[]');
                } catch(e) {}

                const allReadIds = Array.from(new Set([...dbReadIds, ...localReadIds]));
                const nowIso = new Date().toISOString();

                let rawNotifications: any[] = [];

                // Attempt: Authenticated select query
                try {
                    const { data, error } = await supabase
                        .from('system_notifications')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(50);

                    if (!error && data) {
                        rawNotifications = data;
                    } else if (error) {
                        console.warn('[TenantService] ⚠️ System notifications query error:', error.message);
                    }
                } catch (e) { /* fallback */ }

                // Helper para parsear arrays de forma resiliente
                const parseArray = (field: any): string[] => {
                    if (!field) return [];
                    if (Array.isArray(field)) return field.map(String);
                    if (typeof field === 'string') {
                        const trimmed = field.trim();
                        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                            try {
                                const parsed = JSON.parse(trimmed);
                                if (Array.isArray(parsed)) return parsed.map(String);
                            } catch (e) { /* fallback */ }
                        }
                        return [trimmed];
                    }
                    return [];
                };

                // Decodificador de Metadados Nexus incorporados no content
                const notifications = (rawNotifications || []).map(n => {
                    let content = n.content || '';
                    let actionLabel = n.action_label || n.actionLabel;
                    let actionUrl = n.action_url || n.actionUrl;
                    let targetTenants = n.target_tenants || n.targetTenants;
                    let targetRoles = n.target_roles || n.targetRoles;
                    let expiresAt = n.expires_at || n.expiresAt;

                    if (typeof content === 'string' && content.includes('<!--NEXUS_NOTIF_META:')) {
                        try {
                            const match = content.match(/<!--NEXUS_NOTIF_META:(.*?)-->/s);
                            if (match && match[1]) {
                                const meta = JSON.parse(match[1]);
                                if (meta.actionLabel && !actionLabel) actionLabel = meta.actionLabel;
                                if (meta.actionUrl && !actionUrl) actionUrl = meta.actionUrl;
                                if (meta.targetTenants && (!targetTenants || targetTenants.length === 0)) targetTenants = meta.targetTenants;
                                if (meta.targetRoles && (!targetRoles || targetRoles.length === 0)) targetRoles = meta.targetRoles;
                                if (meta.expiresAt && !expiresAt) expiresAt = meta.expiresAt;
                            }
                            content = content.replace(/<!--NEXUS_NOTIF_META:.*?-->/g, '').trim();
                        } catch (e) { /* continue */ }
                    }

                    return {
                        ...n,
                        content,
                        actionLabel,
                        actionUrl,
                        targetTenants,
                        targetRoles,
                        expiresAt
                    };
                });

                // Attach isRead flag based on the combined readIds and filter by targetTenants, targetRoles, and strict expiration
                const nowMs = Date.now();

                return notifications
                    .filter(n => {
                        // 🛡️ Filtro Rigoroso de Expiração (se expirou, NUNCA exibir)
                        const expStr = n.expiresAt || n.expires_at;
                        if (expStr) {
                            const expMs = new Date(expStr).getTime();
                            if (!isNaN(expMs) && expMs <= nowMs) {
                                return false; // Expirou! Excluir da resposta
                            }
                        }

                        const notifType = String(n.type || 'broadcast').toLowerCase().trim();

                        // 1. Filtro por Tenant
                        if (notifType === 'targeted' && tenantId) {
                            const targets = parseArray(n.targetTenants || n.target_tenants);
                            if (targets.length > 0) {
                                const cleanTenantId = String(tenantId).toLowerCase().trim();
                                const hasTenantMatch = targets.some(t => String(t).toLowerCase().trim() === cleanTenantId);
                                if (!hasTenantMatch) return false;
                            }
                        }

                        // 2. Filtro por Cargo (Role)
                        if (userRole) {
                            const targetRoles = parseArray(n.targetRoles || n.target_roles);
                            if (targetRoles.length > 0) {
                                const cleanUserRole = String(userRole).toUpperCase().trim();
                                const hasRoleMatch = targetRoles.some(r => {
                                    const cleanTargetRole = String(r).toUpperCase().trim();
                                    if (cleanTargetRole === cleanUserRole) return true;
                                    if ((cleanUserRole === 'ADMIN' || cleanUserRole === 'SUPER_ADMIN' || cleanUserRole === 'MASTER') && (cleanTargetRole === 'ADMIN' || cleanTargetRole === 'GESTÃO' || cleanTargetRole === 'ADMINISTRADOR')) return true;
                                    if ((cleanUserRole === 'TECHNICIAN' || cleanUserRole === 'TECH') && (cleanTargetRole === 'TECHNICIAN' || cleanTargetRole === 'TÉCNICO')) return true;
                                    return false;
                                });
                                if (!hasRoleMatch) return false;
                            }
                        }

                        return true;
                    })
                    .map(n => ({
                        ...n,
                        targetRoles: parseArray(n.targetRoles || n.target_roles),
                        targetTenants: parseArray(n.targetTenants || n.target_tenants),
                        actionLabel: n.actionLabel || n.action_label,
                        actionUrl: n.actionUrl || n.action_url,
                        expiresAt: n.expiresAt || n.expires_at,
                        isRead: allReadIds.includes(n.id)
                    }));
            } catch (err) {
                console.error('[TenantService] Failed to load system notifications:', err);
                return [];
            }
        }
        return [];
    },

    getMasterNotificationStats: async (): Promise<any[]> => {
        if (isCloudEnabled) {
            try {
                const sessionOk = await ensureValidSession();
                if (!sessionOk) return [];

                const { data: notifications, error } = await supabase
                    .from('system_notifications')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                if (!notifications || notifications.length === 0) return [];

                const notificationIds = notifications.map(n => n.id);
                const { data: readsData } = await supabase
                    .from('system_notification_reads')
                    .select('notification_id')
                    .in('notification_id', notificationIds);

                const readsCountMap: Record<string, number> = {};
                (readsData || []).forEach(r => {
                    readsCountMap[r.notification_id] = (readsCountMap[r.notification_id] || 0) + 1;
                });

                return notifications.map(n => ({
                    ...n,
                    targetRoles: n.target_roles || n.targetRoles,
                    targetTenants: n.target_tenants || n.targetTenants,
                    actionLabel: n.action_label || n.actionLabel,
                    actionUrl: n.action_url || n.actionUrl,
                    expiresAt: n.expires_at || n.expiresAt,
                    readCount: readsCountMap[n.id] || 0
                }));
            } catch (err) {
                console.error('[TenantService] Failed to load master notification stats:', err);
                return [];
            }
        }
        return [];
    },

    getNotificationReadDetails: async (notificationId: string): Promise<Array<{
        userId: string;
        userName: string;
        userEmail: string;
        userRole: string;
        tenantId: string;
        tenantName: string;
        readAt: string;
    }>> => {
        if (!isCloudEnabled || !notificationId) return [];

        try {
            const sessionOk = await ensureValidSession();
            if (!sessionOk) return [];

            const { data: rawReads, error } = await supabase
                .from('system_notification_reads')
                .select('user_id, read_at')
                .eq('notification_id', notificationId)
                .order('read_at', { ascending: false });

            if (error || !rawReads || rawReads.length === 0) return [];

            const userIds = rawReads.map(r => r.user_id);
            const { data: usersData } = await supabase
                .from('users')
                .select('id, name, email, role, tenant_id')
                .in('id', userIds);

            const tenantIds = Array.from(new Set((usersData || []).map(u => u.tenant_id).filter(Boolean)));
            let tenantMap: Record<string, string> = {};
            if (tenantIds.length > 0) {
                const { data: tenantsData } = await supabase
                    .from('tenants')
                    .select('id, name, company_name')
                    .in('id', tenantIds);

                (tenantsData || []).forEach((t: any) => {
                    tenantMap[t.id] = t.company_name || t.name || t.id;
                });
            }

            const userMap: Record<string, any> = {};
            (usersData || []).forEach((u: any) => {
                userMap[u.id] = u;
            });

            return rawReads.map((r: any) => {
                const u = userMap[r.user_id] || {};
                return {
                    userId: r.user_id,
                    userName: u.name || 'Usuário',
                    userEmail: u.email || 'N/A',
                    userRole: u.role || 'USER',
                    tenantId: u.tenant_id || 'N/A',
                    tenantName: tenantMap[u.tenant_id] || u.tenant_id || 'Instância Global',
                    readAt: r.read_at || new Date().toISOString()
                };
            });
        } catch (err) {
            console.error('[TenantService] Failed to load notification read details:', err);
            return [];
        }
    },

    revokeSystemNotification: async (notificationId: string): Promise<void> => {
        if (isCloudEnabled) {
            const sessionOk = await ensureValidSession();
            if (!sessionOk) throw new Error('Sessão inválida para revogar comunicado');

            // 1. Tenta via RPC com SECURITY DEFINER (para bypassar RLS do Master)
            try {
                const { error: rpcError } = await supabase.rpc('revoke_system_notification', {
                    p_notification_id: notificationId
                });

                if (!rpcError) {
                    console.log(`[TenantService] ✅ Comunicado ${notificationId} revogado via RPC com sucesso.`);
                    return;
                }
            } catch (_e) {
                // silencioso para tentar fallback
            }

            try {
                await supabase
                    .from('system_notification_reads')
                    .delete()
                    .eq('notification_id', notificationId);
            } catch (_e) {}

            // 3. Apaga a notificação física no Supabase
            const { error } = await supabase
                .from('system_notifications')
                .delete()
                .eq('id', notificationId);

            if (error) {
                console.error('[TenantService] Failed to revoke notification:', error);
                throw new Error(`Não foi possível revogar o comunicado: ${error.message}`);
            }
        }
    },

    markSystemNotificationAsRead: async (userId: string, notificationId: string) => {
        // 1. Immediate Local Persistence (Big Tech UX standard: never flash again on this device)
        try {
            const localKey = `nexus_dismissed_notif_${userId}`;
            const dismissed = JSON.parse(localStorage.getItem(localKey) || '[]');
            if (!dismissed.includes(notificationId)) {
                dismissed.push(notificationId);
                localStorage.setItem(localKey, JSON.stringify(dismissed));
            }
        } catch (e) {
            console.error('[TenantService] Failed to cache dismissed notification locally:', e);
        }

        // 2. Cloud Synchronization
        if (isCloudEnabled) {
            try {
                const payload = {
                    user_id: userId,
                    notification_id: notificationId,
                    read_at: new Date().toISOString()
                };

                // Tenta insert direto primeiro (mais seguro se não houver unique index explícito mapeado no postgrest)
                const { error: insertError } = await supabase.from('system_notification_reads').insert([payload]);
                
                if (insertError) {
                    // Se falhar (ex: violação de constraint), tenta upsert
                    const { error: upsertError } = await supabase.from('system_notification_reads').upsert(
                        [payload], 
                        { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
                    );
                    
                    if (upsertError && upsertError.code !== '23505') { // ignora erro de duplicidade
                        console.error('[TenantService] Supabase erro ao sync notificação lida:', upsertError);
                    }
                }
            } catch (err) {
                console.error('[TenantService] Falha ao marcar notificação como lida no DB:', err);
            }
        }
    }
};
