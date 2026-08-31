
import { CacheManager } from '../lib/cache';
import { adminAuthProxy, supabase, publicSupabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { User, UserGroup, UserRole, AppScope, ADMIN_PERMISSIONS } from '../types';
import type { DbTenant, DbTenantInsert, DbTenantStats, DbUser, DbUserGroup } from '../types/database';
import { StorageService } from './storageService';

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
                    // Strategy 1: Try view with authenticated client
                    try {
                        const { data, error } = await supabase
                            .from('vw_tenant_stats')
                            .select('*')
                            .order('name');
                        if (!error && data && data.length > 0) {
                            console.log('[TenantService] ✅ Loaded tenants via view (auth):', data.length);
                            CacheManager.set(cacheKey, data, CacheManager.TTL.SHORT);
                            return data as DbTenantStats[];
                        }
                        if (error) console.warn('[TenantService] View (auth) failed:', error.message);
                    } catch (e) { /* continue */ }

                    // Strategy 2: Try view with public/anon client
                    try {
                        const { data, error } = await publicSupabase
                            .from('vw_tenant_stats')
                            .select('*')
                            .order('name');
                        if (!error && data && data.length > 0) {
                            console.log('[TenantService] ✅ Loaded tenants via view (anon):', data.length);
                            CacheManager.set(cacheKey, data, CacheManager.TTL.SHORT);
                            return data as DbTenantStats[];
                        }
                        if (error) console.warn('[TenantService] View (anon) failed:', error.message);
                    } catch (e) { /* continue */ }

                    // Strategy 3: Direct table query (authenticated)
                    try {
                        const { data, error } = await supabase
                            .from('tenants')
                            .select('*')
                            .order('name');
                        if (!error && data && data.length > 0) {
                            console.log('[TenantService] ✅ Loaded tenants via table (auth):', data.length);
                            CacheManager.set(cacheKey, data, CacheManager.TTL.SHORT);
                            return data as DbTenantStats[];
                        }
                        if (error) console.warn('[TenantService] Table (auth) failed:', error.message);
                    } catch (e) { /* continue */ }

                    // Strategy 4: Direct table query (anon/public)
                    try {
                        const { data, error } = await publicSupabase
                            .from('tenants')
                            .select('*')
                            .order('name');
                        if (!error && data && data.length > 0) {
                            console.log('[TenantService] ✅ Loaded tenants via table (anon):', data.length);
                            CacheManager.set(cacheKey, data, CacheManager.TTL.SHORT);
                            return data as DbTenantStats[];
                        }
                        if (error) console.warn('[TenantService] Table (anon) failed:', error.message);
                    } catch (e) { /* continue */ }

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
                    return data;
                }

                // Fallback: Tenta com cliente PÚBLICO (anon) se o acima falhar por RLS/Sessão
                const { data: publicData, error: publicError } = await publicSupabase
                    .from('tenants')
                    .select('*')
                    .eq('id', tid)
                    .maybeSingle();

                if (publicError) {
                    console.error('[TenantService] Erro ao buscar tenant publicamente:', publicError);
                    return null;
                }

                if (publicData) {
                    console.log('[TenantService] ✅ Tenant carregado (public):', publicData?.name || publicData?.company_name);
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
            const initialPass = initialPassword || 'Nexus2025!';

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
                throw new Error(`Erro ao criar empresa: ${error.message} (Código: ${error.code})`);
            }

            const tenantId = data.id;

            // 2. Criar grupos padrão e admin
            await TenantService._provisionGroups(tenantId, processedTenant, initialPass);

            CacheManager.invalidate('master_tenants_list');
            return data as any;
        }
        return tenant as any;
    },

    _provisionGroups: async (tenantId: string, processedTenant: any, initialPass: string) => {
        // Logic for group creation extracted for readability

        let adminGroupId = null;
        try {
            const adminGroupData = {
                tenant_id: tenantId,
                name: 'Administradores',
                description: 'Grupo com permissões completas de administração do sistema',
                is_system: true,
                permissions: ADMIN_PERMISSIONS
            };

            const { data: groupData } = await supabase.from('user_groups').insert([adminGroupData]).select().single();
            if (groupData) adminGroupId = groupData.id;

            // Operadores
            const opGroup = {
                tenant_id: tenantId,
                name: 'Operadores',
                description: 'Acesso completo aos módulos operacionais (OS, Orçamentos, Clientes, Ativos)',
                is_system: true,
                permissions: {
                    orders: { create: true, read: true, update: true, delete: false },
                    customers: { create: true, read: true, update: true, delete: false },
                    equipments: { create: true, read: true, update: true, delete: false },
                    technicians: { create: false, read: true, update: false, delete: false },
                    quotes: { create: true, read: true, update: true, delete: false },
                    contracts: { create: true, read: true, update: true, delete: false },
                    stock: { create: true, read: true, update: true, delete: false },
                    forms: { create: true, read: true, update: true, delete: false },
                    settings: false,
                    manageUsers: false,
                    manageGroups: false,
                    accessSuperAdmin: false,
                    financial: { read: true, update: false, invoice: false, discounts: false },
                    menuAccess: {
                        dashboard: true,
                        orders: true,
                        calendar: true,
                        map: true,
                        financial: false,
                        quotes: true,
                        stock: true,
                        contracts: true,
                        customers: true,
                        equipments: true,
                        forms: true,
                        technicians: true,
                        users: false,
                        settings: false,
                    }
                }
            };
            await supabase.from('user_groups').insert([opGroup]);
        } catch (e) {
            console.warn("Groups provision error:", e);
        }

        // Criar usuário ADMIN inicial
        const adminEmail = (processedTenant.admin_email || processedTenant.adminEmail) as string | undefined;
        if (adminEmail) {
            try {
                const targetEmail = adminEmail.toLowerCase().trim();
                console.log(`[TenantService] 🚀 Provisionando usuário Admin inicial: ${targetEmail} (Tenant: ${tenantId})`);

                // 1. Tenta criar no Auth via Edge Function
                const { data: authUser, error: authErr } = await adminAuthProxy.admin.createUser({
                    email: targetEmail,
                    password: initialPass,
                    user_metadata: {
                        name: processedTenant.name || processedTenant.company_name || 'Admin',
                        role: UserRole.ADMIN,
                        tenantId: tenantId,
                        avatar: ''
                    },
                    email_confirm: true
                });

                let newUserId = authUser?.user?.id;

                if (authErr) {
                    console.warn("[TenantService] ⚠️ adminAuthProxy.createUser warning:", authErr.message || authErr);
                }

                // 2. Se o e-mail já existia no Auth (ex: reutilizado), busca o ID do usuário
                if (!newUserId) {
                    try {
                        const { data: listData } = await adminAuthProxy.admin.listUsers();
                        const existing = (listData?.users || []).find((u: any) => u.email?.toLowerCase() === targetEmail);
                        if (existing) {
                            newUserId = existing.id;
                            // Atualiza os metadados do Auth
                            await adminAuthProxy.admin.updateUserById(newUserId, {
                                user_metadata: {
                                    name: processedTenant.name || processedTenant.company_name || 'Admin',
                                    role: UserRole.ADMIN,
                                    tenantId: tenantId
                                }
                            }).catch(() => {});
                        }
                    } catch (e) {
                        console.warn("[TenantService] ⚠️ List users fallback warning:", e);
                    }
                }

                // 3. Garante o registro na tabela users
                if (newUserId) {
                    const dbUser = {
                        id: newUserId,
                        name: `Admin - ${processedTenant.name || processedTenant.company_name || 'Nova Empresa'}`,
                        email: targetEmail,
                        role: UserRole.ADMIN,
                        active: true,
                        tenant_id: tenantId,
                        group_id: adminGroupId,
                        avatar: '',
                        permissions: {}
                    };
                    const { error: dbErr } = await supabase.from('users').upsert([dbUser]);
                    if (dbErr) {
                        console.error("[TenantService] ❌ Erro ao salvar usuário admin no banco:", dbErr);
                    } else {
                        console.log(`[TenantService] ✅ Usuário admin ${targetEmail} provisionado com sucesso no banco (UID: ${newUserId})!`);
                    }
                } else {
                    console.error("[TenantService] ❌ Não foi possível gerar/localizar UID para o e-mail admin:", targetEmail);
                }
            } catch (err) {
                console.error("[TenantService] ❌ Falha crítica ao criar usuário admin inicial:", err);
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

            const { data, error } = await supabase
                .from('tenants')
                .update(processedUpdate as Partial<DbTenantInsert>)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Não foi possível localizar o registro da empresa para atualização.");

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
            // 1. Obter todos os usuários vinculados à empresa
            const { data: users } = await supabase.from('users').select('id').eq('tenant_id', tenantId);

            if (users && users.length > 0) {
                console.log(`👤 Removendo ${users.length} usuários do Supabase Auth...`);
                for (const user of users) {
                    // Deleta do Auth via Edge Function
                    await adminAuthProxy.admin.deleteUser(user.id).catch(() => { });
                }
            }

            // 2. Remover todos os dados operacionais (cascade manual)
            const tables = ['orders', 'customers', 'equipments', 'stock_items', 'form_templates', 'contracts', 'quotes', 'technicians', 'users', 'user_groups'];

            for (const table of tables) {
                try {
                    await supabase.from(table).delete().eq('tenant_id', tenantId);
                } catch { /* ignora erros de tabelas inexistentes */ }
            }

            // 3. Por fim, deletar o registro da empresa
            const { error: tenantDeleteError } = await supabase.from('tenants').delete().eq('id', tenantId);
            if (tenantDeleteError) throw tenantDeleteError;

            CacheManager.invalidate('master_tenants_list');

        } catch (err: any) {
            console.error("❌ Falha crítica ao excluir empresa:", err.message);
            throw err;
        }
    },

    toggleTenantStatus: async (tenantId: string, currentStatus: string): Promise<void> => {
        if (!isCloudEnabled) return;
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        
        const { error } = await supabase
            .from('tenants')
            .update({ status: newStatus })
            .eq('id', tenantId);
            
        if (error) {
            console.error("❌ Erro ao alterar status da empresa:", error);
            throw new Error(`Falha ao alterar status: ${error.message}`);
        }
        
        CacheManager.invalidate('master_tenants_list');
    },

    // --- USER MANAGEMENT (TENANT LEVEL) ---

    getTenantUsers: async (tenantId: string, signal?: AbortSignal): Promise<User[]> => {
        if (!tenantId) return [];
        if (isCloudEnabled) {
            let query = supabase
                .from('users')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (signal) {
                query = query.abortSignal(signal);
            }

            const { data, error } = await query;

            if (error) {
                console.error("Error fetching tenant users:", error);
                throw error;
            }

            return (data as DbUser[]).map(u => {
                let parsedGroupIds: string[] = [];
                if (u.group_ids) {
                    if (typeof u.group_ids === 'string') {
                        try { parsedGroupIds = JSON.parse(u.group_ids); }
                        catch (e) { parsedGroupIds = [u.group_ids]; }
                    } else if (Array.isArray(u.group_ids)) {
                        parsedGroupIds = u.group_ids;
                    }
                }
                
                return {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role as UserRole,
                    active: u.active,
                    avatar: u.avatar,
                    groupId: u.group_id as string,
                    groupIds: parsedGroupIds.length > 0 ? parsedGroupIds : (u.group_id ? [u.group_id] : []),
                    tenantId: u.tenant_id as string,
                    permissions: u.permissions as any,
                    appScope: (u.app_scope as AppScope) || AppScope.WEB
                };
            });
        }
        return [];
    },

    getUserGroups: async (tenantId: string, signal?: AbortSignal): Promise<UserGroup[]> => {
        if (!tenantId) return [];
        if (isCloudEnabled) {
            let query = supabase
                .from('user_groups')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('name');

            if (signal) {
                query = query.abortSignal(signal);
            }

            const { data, error } = await query;

            if (error) {
                console.error("Error fetching user groups:", error);
                throw error;
            }
            return (data as DbUserGroup[]).map(g => ({
                id: g.id,
                name: g.name,
                description: g.description,
                permissions: g.name.toLowerCase() === 'administradores' ? ADMIN_PERMISSIONS : g.permissions,
                isSystem: g.is_system,
                active: true
            }));
        }
        return [];
    },

    createUserGroup: async (groupData: Omit<UserGroup, 'id'>): Promise<UserGroup> => {
        if (isCloudEnabled) {
            const dbGroup: any = {
                name: groupData.name,
                description: groupData.description,
                permissions: groupData.permissions,
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
                permissions: data.name.toLowerCase() === 'administradores' ? ADMIN_PERMISSIONS : data.permissions,
                isSystem: data.is_system,
                active: true
            };
        }
        return groupData;
    },

    updateUserGroup: async (groupData: Pick<UserGroup, 'id' | 'name' | 'description' | 'permissions'>): Promise<UserGroup> => {
        if (groupData.name.toLowerCase() === 'administradores') {
            groupData.permissions = ADMIN_PERMISSIONS; // Força permissão máxima
        }

        if (isCloudEnabled) {
            const dbGroup: any = {
                name: groupData.name,
                description: groupData.description,
                permissions: groupData.permissions
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
                permissions: data.name.toLowerCase() === 'administradores' ? ADMIN_PERMISSIONS : data.permissions,
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

    createUser: async (userData: Omit<User, 'id'> & { password?: string; tenantId: string; groupId?: string }): Promise<DbUser> => {
        if (isCloudEnabled) {
            let userId: string | null = null;
            const targetEmail = userData.email.toLowerCase().trim();

            // 1. Tenta criar no Auth via adminAuthProxy
            const { data: authUser, error: authError } = await adminAuthProxy.admin.createUser({
                email: targetEmail,
                password: userData.password,
                email_confirm: true,
                user_metadata: {
                    name: userData.name,
                    role: userData.role,
                    tenantId: userData.tenantId,
                    avatar: userData.avatar
                }
            });

            if (!authError && authUser?.user) {
                userId = authUser.user.id;
            } else {
                console.warn("⚠️ adminAuthProxy.createUser notice:", authError?.message || authError);

                // 2. Se o e-mail já existir no Auth, recupera o UID e atualiza o metadata
                try {
                    const { data: listData } = await adminAuthProxy.admin.listUsers();
                    const existing = (listData?.users || []).find((u: any) => u.email?.toLowerCase() === targetEmail);
                    if (existing) {
                        userId = existing.id;
                        await adminAuthProxy.admin.updateUserById(userId, {
                            user_metadata: {
                                ...existing.user_metadata,
                                name: userData.name,
                                role: userData.role,
                                tenantId: userData.tenantId,
                            }
                        }).catch(() => {});
                    } else if (authError) {
                        throw authError;
                    }
                } catch (e: any) {
                    if (authError) throw authError;
                    throw e;
                }
            }

            if (!userId) throw new Error("Falha ao gerar UID para o novo usuário.");

            const generatedAvatar = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}&background=random&color=fff&bold=true`;

            // 2. Create/Update DB User Entry (Promove para o papel definido na aba de usuários)
            const dbUser: any = {
                id: userId,
                name: userData.name,
                email: userData.email,
                role: userData.role, // Aqui será ADMIN ou SUPER_ADMIN vindo da aba de usuários
                active: userData.active,
                tenant_id: userData.tenantId,
                group_id: userData.groupId,
                group_ids: userData.groupIds,
                avatar: generatedAvatar,
                permissions: userData.permissions,
                app_scope: userData.appScope || AppScope.WEB
            };

            const { data, error } = await supabase
                .from('users')
                .upsert([dbUser]) // Usamos upsert para garantir que se ele já era técnico na tabela users com outro role, ele agora seja promovido
                .select()
                .single();

            if (error) throw error;
            return data as any;
        }
        return userData as any;
    },

    updateUser: async (userData: Partial<User> & { id: string; password?: string; groupId?: string }): Promise<DbUser> => {
        if (isCloudEnabled) {
            const dbUser: any = {
                name: userData.name,
                active: userData.active,
                group_id: userData.groupId,
                group_ids: userData.groupIds,
                avatar: userData.avatar,
                permissions: userData.permissions,
                app_scope: userData.appScope || undefined
            };

            const { data, error } = await supabase
                .from('users')
                .update(dbUser)
                .eq('id', userData.id)
                .select()
                .single();

            if (error) throw error;

            // Optionally update Auth Metadata if needed
            if (userData.password) {
                await adminAuthProxy.admin.updateUserById(userData.id, { password: userData.password });
            }

            return data;
        }
        return userData;
    },

    deleteUser: async (userId: string): Promise<void> => {
        if (isCloudEnabled) {
            // Deleta do Auth via Edge Function
            await adminAuthProxy.admin.deleteUser(userId);
            // Deleta do banco — RLS garante que só admin do próprio tenant pode deletar
            await supabase.from('users').delete().eq('id', userId);
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
                action_url: notification.actionUrl ? notification.actionUrl.trim() : null,
                expires_at: notification.expiresAt ? new Date(notification.expiresAt).toISOString() : null
            };

            // Remove null/undefined optional properties so we don't send columns that might not exist
            Object.keys(fullPayload).forEach(key => {
                if (fullPayload[key] === null || fullPayload[key] === undefined) {
                    delete fullPayload[key];
                }
            });

            console.log('[TenantService] 🚀 Inserting system notification:', fullPayload);

            // Strategy 1: Direct table insert with authenticated client (supabase)
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
                if (error) console.warn('[TenantService] Insert via authenticated client warning:', error.message);
            } catch (e) { /* fallback */ }

            // Strategy 2: Direct table insert with anon client (publicSupabase)
            try {
                const { data, error } = await publicSupabase
                    .from('system_notifications')
                    .insert([fullPayload])
                    .select()
                    .single();

                if (!error && data) {
                    console.log('[TenantService] ✅ Notification inserted via anon client:', data.id);
                    return data;
                }

                // If error is missing column (schema cache mismatch), strip non-core columns and insert
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

                    const { data: fallbackData, error: fallbackError } = await publicSupabase
                        .from('system_notifications')
                        .insert([corePayload])
                        .select()
                        .single();

                    if (!fallbackError && fallbackData) return fallbackData;
                    if (fallbackError) throw fallbackError;
                }
                if (error) throw error;
            } catch (e: any) {
                console.error('[TenantService] ❌ Insert failed on both clients:', e.message || e);
                throw e;
            }
        }
        return null;
    },

    getSystemNotifications: async (userId: string, tenantId?: string, userRole?: string): Promise<any[]> => {
        if (isCloudEnabled) {
            try {
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

                // Attempt 1: Query with expires_at filter on authenticated client
                try {
                    const { data, error } = await supabase
                        .from('system_notifications')
                        .select('*')
                        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
                        .order('created_at', { ascending: false })
                        .limit(50);

                    if (!error && data && data.length > 0) {
                        rawNotifications = data;
                    } else if (error) {
                        console.warn('[TenantService] ⚠️ Query auth with expires_at warning:', error.message);
                    }
                } catch (e) { /* fallback */ }

                // Attempt 2: Simple select without expires_at filter (in case column is missing or PostgREST error)
                if (rawNotifications.length === 0) {
                    try {
                        const { data, error } = await supabase
                            .from('system_notifications')
                            .select('*')
                            .order('created_at', { ascending: false })
                            .limit(50);

                        if (!error && data && data.length > 0) {
                            rawNotifications = data;
                        } else if (error) {
                            console.warn('[TenantService] ⚠️ Query auth simple warning:', error.message);
                        }
                    } catch (e) { /* fallback */ }
                }

                // Attempt 3: PublicSupabase (anon client) fallback if authenticated client returned empty or failed due to RLS
                if (rawNotifications.length === 0) {
                    try {
                        const { data, error } = await publicSupabase
                            .from('system_notifications')
                            .select('*')
                            .order('created_at', { ascending: false })
                            .limit(50);

                        if (!error && data) {
                            console.log('[TenantService] ✅ Loaded notifications via publicSupabase (anon):', data.length);
                            rawNotifications = data;
                        }
                    } catch (e) { /* fallback */ }
                }

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

                // Attach isRead flag based on the combined readIds and filter by targetTenants and targetRoles
                return notifications
                    .filter(n => {
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
                const { data: notifications, error } = await publicSupabase
                    .from('system_notifications')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                if (!notifications || notifications.length === 0) return [];

                const notificationIds = notifications.map(n => n.id);
                const { data: readsData } = await publicSupabase
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

    revokeSystemNotification: async (notificationId: string): Promise<void> => {
        if (isCloudEnabled) {
            // 1. Tenta via RPC com SECURITY DEFINER (para bypassar RLS do Master)
            try {
                const { error: rpcError } = await publicSupabase.rpc('revoke_system_notification', {
                    p_notification_id: notificationId
                });

                if (!rpcError) {
                    console.log(`[TenantService] ✅ Comunicado ${notificationId} revogado via RPC com sucesso.`);
                    return;
                }
            } catch (_e) {
                // silencioso para tentar fallback
            }

            // 2. Apaga confirmações de leitura associadas
            await publicSupabase
                .from('system_notification_reads')
                .delete()
                .eq('notification_id', notificationId)
                .catch(() => {});

            // 3. Apaga a notificação física no Supabase
            const { error } = await publicSupabase
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
