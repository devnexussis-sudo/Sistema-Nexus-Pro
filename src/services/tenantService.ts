
import { adminSupabase, supabase } from '../lib/supabase';
import { CacheManager } from '../lib/cache';
import { UserRole } from '../types';
import { StorageService } from './storageService';
import { SessionStorage, GlobalStorage } from '../lib/sessionStorage';
import { logger } from '../lib/logger';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// Helper para obter tenant ID (DRY)
const getCurrentTenantId = (): string | undefined => {
    try {
        const techSession = localStorage.getItem('nexus_tech_session_v2') || localStorage.getItem('nexus_tech_session');
        if (techSession) {
            const user = JSON.parse(techSession);
            const tid = user.tenantId || user.tenant_id;
            if (tid) return tid;
        }

        const userStr = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
        if (userStr) {
            const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
            const tid = user.tenantId || user.tenant_id;
            if (tid) return tid;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const urlTid = urlParams.get('tid') || SessionStorage.get('current_tenant');
        if (urlTid) return urlTid;

        return undefined;
    } catch (e) {
        return undefined;
    }
};

export const TenantService = {

    // --- TENANT MANAGEMENT (SUPER ADMIN / MASTER) ---

    getTenants: async (): Promise<any[]> => {
        if (isCloudEnabled) {
            try {
                const cacheKey = 'master_tenants_list';
                const cached = CacheManager.get<any[]>(cacheKey);
                if (cached) return cached;

                return CacheManager.deduplicate(cacheKey, async () => {
                    // 1. Tenta buscar da View (Alta Performance)
                    const { data: viewData, error: viewError } = await adminSupabase.from('vw_tenant_stats').select('*').order('name');

                    if (!viewError && viewData) {
                        CacheManager.set(cacheKey, viewData, CacheManager.TTL.SHORT);
                        return viewData;
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

    getTenantById: async (id?: string | null): Promise<any> => {
        if (isCloudEnabled) {
            const tid = id || getCurrentTenantId();

            // Se não houver ID ou for 'default', tenta buscar a primeira empresa cadastrada
            if (!tid || tid === 'default' || tid === 'null') {
                try {
                    // Tenta primeiro com cliente normal
                    const { data, error } = await supabase
                        .from('tenants')
                        .select('*')
                        .limit(1)
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
                const { data, error } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('id', tid)
                    .single();

                if (error) {
                    console.error('[TenantService] Erro ao buscar tenant por ID:', error);
                    return null;
                }

                console.log('[TenantService] ✅ Tenant carregado:', data?.name || data?.company_name);
                return data;
            } catch (e) {
                console.error('[TenantService] Erro crítico ao buscar tenant por ID:', e);
                return null;
            }
        }
        return null;
    },

    createTenant: async (tenant: any): Promise<any> => {
        if (isCloudEnabled) {
            const { initialPassword, ...tenantData } = tenant;
            const initialPass = initialPassword || 'Nexus2025!';

            // 🛠️ Nexus Schema Cleaner: Remove campos camelCase
            const processedTenant: any = {};
            Object.keys(tenantData).forEach(key => {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                if (key !== snakeKey && tenantData[snakeKey] !== undefined) return;
                processedTenant[snakeKey] = tenantData[key];
            });

            if (processedTenant.company_name && !processedTenant.name) {
                processedTenant.name = processedTenant.company_name;
            }

            if (processedTenant.logo_url && processedTenant.logo_url.startsWith('data:image')) {
                processedTenant.logo_url = await StorageService.uploadFile(processedTenant.logo_url, `tenants/new/logo`);
            }

            console.log("🚀 Provisionando Nexus Tenant:", processedTenant);

            // 1. Criar a empresa no Banco
            const { data, error } = await adminSupabase.from('tenants').insert([processedTenant]).select().single();

            if (error) {
                console.error("❌ Nexus Tenant Create Error:", error);
                throw new Error(`Erro ao criar empresa: ${error.message} (Código: ${error.code})`);
            }

            const tenantId = data.id;

            // 2. Criar grupos padrão e admin
            await TenantService._provisionGroups(tenantId, processedTenant, initialPass);

            return data;
        }
        return tenant;
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

            const { data: groupData } = await adminSupabase.from('user_groups').insert([adminGroupData]).select().single();
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
            await adminSupabase.from('user_groups').insert([opGroup]);
        } catch (e) {
            console.warn("Groups provision error:", e);
        }

        // Criar usuário ADMIN inicial
        const adminEmail = processedTenant.admin_email || (processedTenant as any).adminEmail;
        if (adminEmail) {
            try {
                // Create Auth user
                const { data: authUser } = await adminSupabase.auth.admin.createUser({
                    email: adminEmail.toLowerCase(),
                    password: initialPass,
                    user_metadata: {
                        name: processedTenant.name || 'Admin',
                        role: UserRole.ADMIN,
                        tenantId: tenantId,
                        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(processedTenant.admin_name || 'Admin')}&backgroundColor=4f46e5`
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
                        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(adminEmail || 'Admin')}&backgroundColor=4f46e5`,
                        permissions: {}
                    };
                    await adminSupabase.from('users').upsert([dbUser]);
                }
            } catch (err) {
                console.error("Failed to create initial admin user:", err);
            }
        }
    },

    updateTenant: async (tenant: any): Promise<any> => {
        let { id, ...rest } = tenant;
        if (isCloudEnabled) {
            if (rest.logo_url && rest.logo_url.startsWith('data:image')) {
                rest.logo_url = await StorageService.uploadFile(rest.logo_url, `tenants/${id}/logo`);
            }
            if (rest.logoUrl && rest.logoUrl.startsWith('data:image')) {
                rest.logoUrl = await StorageService.uploadFile(rest.logoUrl, `tenants/${id}/logo`);
            }

            // 🛠️ Nexus Schema Cleaner
            const processedUpdate: any = {};
            Object.keys(rest).forEach(key => {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                if (key !== snakeKey && rest[snakeKey] !== undefined) return;
                processedUpdate[snakeKey] = rest[key];
            });

            const { data, error } = await adminSupabase
                .from('tenants')
                .update(processedUpdate)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Não foi possível localizar o registro da empresa para atualização.");

            return data;
        }
        return tenant;
    },

    deleteTenant: async (tenantId: string): Promise<void> => {
        if (!isCloudEnabled) return;

        console.log(`💀 Iniciando exclusão total da empresa: ${tenantId}`);

        try {
            // 1. Obter todos os usuários vinculados à empresa
            const { data: users } = await adminSupabase.from('users').select('id').eq('tenant_id', tenantId);

            if (users && users.length > 0) {
                console.log(`👤 Removendo ${users.length} usuários do Supabase Auth...`);
                for (const user of users) {
                    await adminSupabase.auth.admin.deleteUser(user.id).catch(() => { });
                }
            }

            // 2. Remover todos os dados operacionais em paralelo (Cascade manual se FKs não estiverem setadas com cascade delete)
            const tables = ['orders', 'customers', 'equipments', 'stock_items', 'form_templates', 'contracts', 'quotes', 'technicians', 'users', 'user_groups'];

            for (const table of tables) {
                await adminSupabase.from(table).delete().eq('tenant_id', tenantId).catch(() => { });
            }

            // 3. Por fim, deletar o registro da empresa
            const { error: tenantDeleteError } = await adminSupabase.from('tenants').delete().eq('id', tenantId);
            if (tenantDeleteError) throw tenantDeleteError;

        } catch (err: any) {
            console.error("❌ Falha crítica ao excluir empresa:", err.message);
            throw err;
        }
    },

    // --- USER MANAGEMENT (TENANT LEVEL) ---

    getTenantUsers: async (tenantId: string): Promise<any[]> => {
        if (!tenantId) return [];
        if (isCloudEnabled) {
            const { data, error } = await adminSupabase
                .from('users')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error fetching tenant users:", error);
                return [];
            }

            // Map to frontend User model if needed (though component handles raw data well, standardizing is better)
            return data.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                active: u.active,
                avatar: u.avatar,
                groupId: u.group_id,
                tenantId: u.tenant_id,
                permissions: u.permissions
            }));
        }
        return [];
    },

    getUserGroups: async (tenantId: string): Promise<any[]> => {
        if (!tenantId) return [];
        if (isCloudEnabled) {
            const { data, error } = await adminSupabase
                .from('user_groups')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('name');

            if (error) {
                console.error("Error fetching user groups:", error);
                return [];
            }
            return data.map(g => ({
                id: g.id,
                name: g.name,
                description: g.description,
                permissions: g.permissions,
                isSystem: g.is_system,
                active: true // Groups usually don't have active status in DB yet, default to true
            }));
        }
        return [];
    },

    createUserGroup: async (groupData: any): Promise<any> => {
        if (isCloudEnabled) {
            const dbGroup = {
                name: groupData.name,
                description: groupData.description,
                permissions: groupData.permissions,
                is_system: groupData.isSystem || false,
                tenant_id: groupData.tenantId
            };

            const { data, error } = await adminSupabase
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

    updateUserGroup: async (groupData: any): Promise<any> => {
        if (isCloudEnabled) {
            const dbGroup = {
                name: groupData.name,
                description: groupData.description,
                permissions: groupData.permissions
            };

            const { data, error } = await adminSupabase
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
            const { error } = await adminSupabase
                .from('user_groups')
                .delete()
                .eq('id', groupId);
            if (error) throw error;
        }
    },

    createUser: async (userData: any): Promise<any> => {
        // This usually involves creating Auth User + DB User
        // For simplicity and security, we often use a server function, but here using adminSupabase
        if (isCloudEnabled) {
            // 1. Create Auth User
            const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
                email: userData.email,
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
            if (!authUser.user) throw new Error("Falha ao criar usuário de autenticação.");

            // 2. Create DB User Entry
            const dbUser = {
                id: authUser.user.id,
                name: userData.name,
                email: userData.email,
                role: userData.role,
                active: userData.active,
                tenant_id: userData.tenantId,
                group_id: userData.groupId,
                avatar: userData.avatar,
                permissions: userData.permissions
            };

            const { data, error } = await adminSupabase
                .from('users')
                .insert([dbUser])
                .select()
                .single();

            if (error) throw error;
            return data;
        }
        return userData;
    },

    updateUser: async (userData: any): Promise<any> => {
        if (isCloudEnabled) {
            const dbUser = {
                name: userData.name,
                active: userData.active,
                group_id: userData.groupId,
                avatar: userData.avatar,
                permissions: userData.permissions
            };

            const { data, error } = await adminSupabase
                .from('users')
                .update(dbUser)
                .eq('id', userData.id)
                .select()
                .single();

            if (error) throw error;

            // Optionally update Auth Metadata if needed
            if (userData.password) {
                await adminSupabase.auth.admin.updateUserById(userData.id, { password: userData.password });
            }

            return data;
        }
        return userData;
    },

    deleteUser: async (userId: string): Promise<void> => {
        if (isCloudEnabled) {
            // Delete from Auth (Cascade should handle DB, but we do manual just in case or if cascade missing)
            await adminSupabase.auth.admin.deleteUser(userId);
            // Verify DB deletion
            await adminSupabase.from('users').delete().eq('id', userId);
        }
    },

    // 📢 Nexus Global Notifications

    createSystemNotification: async (notification: { title: string, content: string, type: 'broadcast' | 'targeted', targetTenants?: string[], priority: string }) => {
        if (isCloudEnabled) {
            const { data, error } = await adminSupabase.from('system_notifications').insert([{
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
