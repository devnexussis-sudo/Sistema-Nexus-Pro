
import { CacheManager } from '../lib/cache';
import { adminAuthProxy, supabase, publicSupabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { User, UserGroup, UserRole } from '../types';
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
                    const { data: viewData, error: viewError } = await supabase
                        .from('vw_tenant_stats')
                        .select('*')
                        .order('name');

                    if (viewError) {
                        throw viewError;
                    }

                    if (viewData) {
                        CacheManager.set(cacheKey, viewData, CacheManager.TTL.SHORT);
                        return viewData as DbTenantStats[];
                    }
                    return [];
                });

            } catch (e) {
                console.error(e);
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
                permissions: {
                    orders: { create: true, read: true, update: true, delete: true },
                    customers: { create: true, read: true, update: true, delete: true },
                    equipments: { create: true, read: true, update: true, delete: true },
                    technicians: { create: true, read: true, update: true, delete: true },
                    quotes: { create: true, read: true, update: true, delete: true },
                    contracts: { create: true, read: true, update: true, delete: true },
                    stock: { create: true, read: true, update: true, delete: true },
                    forms: { create: true, read: true, update: true, delete: true },
                    settings: true,
                    manageUsers: true,
                    accessSuperAdmin: false,
                    financial: { read: true, update: true }
                }
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
                    accessSuperAdmin: false,
                    financial: { read: true, update: false }
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
                // Cria usuário Auth via adminAuthProxy (Edge Function)
                const { data: authUser } = await adminAuthProxy.admin.createUser({
                    email: adminEmail.toLowerCase(),
                    password: initialPass,
                    user_metadata: {
                        name: processedTenant.name || 'Admin',
                        role: UserRole.ADMIN,
                        tenantId: tenantId,
                        avatar: ''
                    },
                    email_confirm: true
                });

                if (authUser?.user) {
                    const dbUser = {
                        id: authUser.user.id,
                        name: `Admin - ${processedTenant.name || 'Nova Empresa'}`,
                        email: adminEmail.toLowerCase(),
                        role: UserRole.ADMIN,
                        active: true,
                        tenant_id: tenantId,
                        group_id: adminGroupId,
                        avatar: '',
                        permissions: {}
                    };
                    await supabase.from('users').upsert([dbUser]);
                }
            } catch (err) {
                console.error("Failed to create initial admin user:", err);
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

            const { data, error } = await supabase
                .from('tenants')
                .update(processedUpdate as Partial<DbTenantInsert>)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Não foi possível localizar o registro da empresa para atualização.");

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

        } catch (err: any) {
            console.error("❌ Falha crítica ao excluir empresa:", err.message);
            throw err;
        }
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

            return (data as DbUser[]).map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role as UserRole,
                active: u.active,
                avatar: u.avatar,
                groupId: u.group_id as string,
                tenantId: u.tenant_id as string,
                permissions: u.permissions as any
            }));
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
                permissions: g.permissions,
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
                permissions: data.permissions,
                isSystem: data.is_system,
                active: true
            };
        }
        return groupData;
    },

    updateUserGroup: async (groupData: Pick<UserGroup, 'id' | 'name' | 'description' | 'permissions'>): Promise<UserGroup> => {
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
                permissions: data.permissions,
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
            // 🛡️ Discovery Layer: Provisionamento Inteligente de Administradores
            let userId: string | null = null;
            let existingAuthUser: any = null;

            try {
                const { data: listData } = await adminAuthProxy.admin.listUsers();
                existingAuthUser = (listData.users || []).find(u => u.email?.toLowerCase() === userData.email.toLowerCase());

                if (existingAuthUser) {
                    userId = existingAuthUser.id;
                    console.log("📍 Identidade detectada no Auth. Promovendo usuário a Gestor:", userId);

                    // Atualiza metadados para refletir o novo papel administrativo
                    await adminAuthProxy.admin.updateUserById(userId, {
                        user_metadata: {
                            ...existingAuthUser.user_metadata,
                            role: userData.role,
                            tenantId: userData.tenantId,
                            name: userData.name || existingAuthUser.user_metadata.name
                        }
                    });
                }
            } catch (e) {
                console.warn("⚠️ Falha na busca prévia (Discovery):", e);
            }

            if (!userId) {
                // 1. Cria usuário Auth via adminAuthProxy (Edge Function)
                const { data: authUser, error: authError } = await adminAuthProxy.admin.createUser({
                    email: userData.email.toLowerCase(),
                    password: userData.password,
                    email_confirm: true,
                    user_metadata: {
                        name: userData.name,
                        role: userData.role,
                        tenantId: userData.tenantId,
                        avatar: userData.avatar
                    }
                });

                if (authError) throw authError;
                userId = authUser.user?.id || null;
            }

            if (!userId) throw new Error("Falha ao gerar UID para o novo gestor.");

            // 2. Create/Update DB User Entry (Promove para o papel definido na aba de usuários)
            const dbUser: any = {
                id: userId,
                name: userData.name,
                email: userData.email,
                role: userData.role, // Aqui será ADMIN ou SUPER_ADMIN vindo da aba de usuários
                active: userData.active,
                tenant_id: userData.tenantId,
                group_id: userData.groupId,
                avatar: userData.avatar,
                permissions: userData.permissions
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
                avatar: userData.avatar,
                permissions: userData.permissions
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

    createSystemNotification: async (notification: { title: string, content: string, type: 'broadcast' | 'targeted', targetTenants?: string[], priority: string }) => {
        if (isCloudEnabled) {
            const { data, error } = await supabase.from('system_notifications').insert([{
                title: notification.title,
                content: notification.content,
                type: notification.type,
                target_tenants: notification.targetTenants,
                priority: notification.priority
            }]).select().single();
            if (error) throw error;
            return data;
        }
        return null;
    },

    getUnreadSystemNotifications: async (userId: string): Promise<any[]> => {
        if (isCloudEnabled) {
            try {
                const { data: readRecords } = await supabase.from('system_notification_reads').select('notification_id').eq('user_id', userId);
                const readIds = (readRecords || []).map(r => r.notification_id);

                let query = supabase.from('system_notifications')
                    .select('*')
                    .order('created_at', { ascending: false });

                const { data: notifications, error } = await query;
                if (error) throw error;

                return (notifications || []).filter(n => !readIds.includes(n.id));
            } catch (err) {
                return [];
            }
        }
        return [];
    },

    markSystemNotificationAsRead: async (userId: string, notificationId: string) => {
        if (isCloudEnabled) {
            await supabase.from('system_notification_reads').upsert([{
                user_id: userId,
                notification_id: notificationId,
                read_at: new Date().toISOString()
            }]);
        }
    }
};
