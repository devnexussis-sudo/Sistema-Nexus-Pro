
import { supabase, adminAuthProxy } from '../lib/supabase';
import { User, UserRole, UserWithPassword } from '../types';
import { SessionStorage, GlobalStorage } from '../lib/sessionStorage';
import { logger } from '../lib/logger';
import { getCurrentTenantId as _getTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const MOCK_USERS_POOL = []; // Removing mock data dependency for clean separation, assuming cloud first

export const AuthService = {

    // Retrieve current tenant ID — delegado ao singleton centralizado
    getCurrentTenantId: (): string | undefined => _getTenantId(),

    getCurrentUser: async (): Promise<User | undefined> => {
        if (isCloudEnabled) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return undefined;

            const user = session.user;

            // Tenta recuperar do storage primeiro para velocidade
            const stored = SessionStorage.get('user');
            if (stored) {
                if (typeof stored === 'string') return JSON.parse(stored);
                return stored;
            }

            // Se não tiver local, busca full do banco
            return await AuthService._fetchFullUser(user.id, user.email || '', user.user_metadata);
        }
        const stored = SessionStorage.get('user');
        return stored ? (typeof stored === 'string' ? JSON.parse(stored) : stored) : undefined;
    },

    login: async (email: string, password?: string): Promise<User | undefined> => {
        if (isCloudEnabled) {
            logger.info('authenticating_user', { email });

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.toLowerCase(),
                password: password || ''
            });

            if (error) {
                console.error("❌ Erro no Login Supabase:", error.message);
                throw new Error(error.message === 'Invalid login credentials' ? 'Credenciais inválidas' : error.message);
            }

            if (data.user) {
                logger.info('auth_success_loading_profile');
                const fullUser = await AuthService._fetchFullUser(data.user.id, email, data.user.user_metadata);

                if (!fullUser) throw new Error("Usuário autenticado mas sem registro na tabela users.");
                if (fullUser.active === false) throw new Error("Sua conta foi desativada. Contate o administrador.");

                // Persistência
                SessionStorage.set('user', fullUser);
                GlobalStorage.set('persistent_user', fullUser);

                // Define current tenant na sessão
                if (fullUser.tenantId) {
                    SessionStorage.set('current_tenant', fullUser.tenantId);
                }

                return fullUser;
            }
        }
        return undefined;
    },

    logout: async (): Promise<void> => {
        if (isCloudEnabled) {
            try {
                await supabase.auth.signOut();
            } catch (err) {
                console.error('[AuthService] Error during signOut:', err);
            }
        }
        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');

        // Clear all potential auth keys
        const keys = [
            'nexus_shared_auth',
            'nexus_tech_session_v2',
            'nexus_tech_cache_v2',
            'persistent_user'
        ];
        keys.forEach(k => {
            localStorage.removeItem(k);
            localStorage.removeItem(`nexus_global_${k}`);
            sessionStorage.removeItem(k);
        });

        // Force reload to clear memory states and redirect
        window.location.href = '/login';
    },

    checkEmailExists: async (email: string): Promise<{ exists: boolean, tenantName?: string }> => {
        if (!isCloudEnabled) return { exists: false };
        try {
            // Usa adminAuthProxy (Edge Function) para listar users no Auth — operação legítima de admin
            const { data: authData } = await adminAuthProxy.admin.listUsers();
            const existingUser = (authData.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());

            if (existingUser) {
                const tenantId = (existingUser as any).user_metadata?.tenantId;
                if (tenantId) {
                    // Busca nome do tenant via supabase (anon) — RLS permite leitura do próprio tenant
                    const { data: tenant } = await supabase
                        .from('tenants')
                        .select('name')
                        .eq('id', tenantId)
                        .single();

                    return { exists: true, tenantName: tenant?.name || 'outra empresa' };
                }
                return { exists: true, tenantName: 'outra empresa' };
            }

            return { exists: false };
        } catch (error) {
            console.error('[Email Check] Erro:', error);
            return { exists: false };
        }
    },

    // Busca dados enriquecidos do usuário (Role, Permissions, Tenant)
    _fetchFullUser: async (authId: string, email: string, metadata: any): Promise<User | undefined> => {
        // 1. Busca na tabela 'users' — RLS garante que só retorna dados do próprio usuário
        const { data: dbUser, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', authId)
            .single();

        if (error) {
            // PGRST116 is the standard PostgREST code for single() returning exactly 0 rows.
            if (error.code === 'PGRST116') {
                logger.warn('Acesso Negado: Usuário autenticado mas não autorizado (sem registro na tabela users).', { authId, email });
                return undefined;
            }
            // If it's a network error or 5xx, we MUST throw. 
            // Returning undefined would cause AuthContext to forcefully signOut() the user!
            throw new Error(`Falha transitória ao buscar usuário: ${error.message}`);
        }

        if (!dbUser) {
            return undefined;
        }

        // 2. Se tiver grupo, busca as permissões do grupo
        let permissions = dbUser.permissions || {};
        let groupName = '';

        if (dbUser.group_id) {
            const { data: group } = await supabase
                .from('user_groups')
                .select('permissions, name')
                .eq('id', dbUser.group_id)
                .single();

            if (group) {
                permissions = { ...group.permissions, ...permissions }; // Permissões diretas sobrescrevem grupo? Ou merge? Geralmente merge.
                groupName = group.name;
            }
        }

        return {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role as UserRole,
            tenantId: dbUser.tenant_id,
            avatar: dbUser.avatar,
            active: dbUser.active,
            groupId: dbUser.group_id,
            groupName: groupName,
            permissions: permissions
        };
    },

    refreshUser: async (): Promise<User | undefined> => {
        const currentUser = await AuthService.getCurrentUser();
        if (currentUser) {
            const fresh = await AuthService._fetchFullUser(currentUser.id, currentUser.email, {});
            if (fresh) {
                SessionStorage.set('user', fresh);
                GlobalStorage.set('persistent_user', fresh);
                return fresh;
            }
        }
        return undefined;
    },

    resetPasswordForEmail: async (email: string): Promise<void> => {
        if (isCloudEnabled) {
            const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
                redirectTo: `${window.location.origin}/#/reset-password`,
            });
            if (error) throw error;
        }
    },

    signInWithGoogle: async (): Promise<void> => {
        if (isCloudEnabled) {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'select_account'
                    }
                }
            });
            if (error) throw error;
        }
    }
};
