
import { createClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger';
import { GlobalStorage, SessionStorage } from '../lib/sessionStorage';
import { adminAuthProxy, supabase, safeUrl, safeKey } from '../lib/supabase';
import { getCurrentTenantId as _getTenantId } from '../lib/tenantContext';
import { User, UserRole, ADMIN_PERMISSIONS, DEFAULT_PERMISSIONS } from '../types';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const MOCK_USERS_POOL = []; // Removing mock data dependency for clean separation, assuming cloud first

// Cliente de autenticação dedicado com flowType implicit para geração de links de recuperação
// que funcionam em qualquer navegador/dispositivo sem depender do code_verifier do PKCE no localStorage
const recoveryAuthClient = createClient(safeUrl, safeKey, {
    auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

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

                // 🔒 TENANT SUSPENSION CHECK — verifica status da empresa ANTES de liberar acesso
                if (fullUser.tenantId) {
                    const { data: tenantRow } = await supabase
                        .from('tenants')
                        .select('status, name, company_name')
                        .eq('id', fullUser.tenantId)
                        .maybeSingle();

                    if (tenantRow?.status === 'suspended') {
                        // Desloga imediatamente para não deixar token ativo
                        await supabase.auth.signOut();
                        const companyName = tenantRow.name || tenantRow.company_name || 'sua empresa';
                        throw new Error(`🔒 Acesso bloqueado: ${companyName} está com o acesso suspenso. Entre em contato com o suporte para regularizar sua situação.`);
                    }
                }

                // Persistência
                SessionStorage.set('user', fullUser);
                if (localStorage.getItem('nexus_ephemeral_login') !== 'true') {
                    GlobalStorage.set('persistent_user', fullUser);
                } else {
                    GlobalStorage.remove('persistent_user');
                }

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

    // 🔒 TENANT SUSPENSION GUARD — chamado periodicamente pelo AuthContext
    // Verifica se a empresa do usuário logado ainda está ativa
    checkTenantSuspended: async (tenantId: string): Promise<boolean> => {
        if (!isCloudEnabled || !tenantId) return false;
        try {
            const { data } = await supabase
                .from('tenants')
                .select('status')
                .eq('id', tenantId)
                .maybeSingle();
            return data?.status === 'suspended';
        } catch {
            return false; // Em caso de erro de rede, não derruba a sessão
        }
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

    // 🛡️ GATEKEEPER: Busca dados enriquecidos do usuário (Role, Permissions, Tenant)
    // Implementa a lógica de permissão MIT/Harvard: Acesso ao PAINEL restrito a registros na tabela 'users'.
    _fetchFullUser: async (authId: string, email: string, metadata: any): Promise<User | undefined> => {

        // 1. Verificação de Identidade na Camada de Gestão (Tabela 'users')
        // Se o usuário não existir nesta tabela, ele pode ser um Técnico, mas NÃO tem acesso ao portal administrativo.
        let dbUser = null;
        let error = null;
        const maxRetries = 3;
        const baseDelayMs = 300; // Base delay for Exponential Backoff
        const maxDelayMs = 2000; // Maximum delay limit

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const res = await supabase
                .from('users')
                .select('*')
                .eq('id', authId)
                .single();
                
            dbUser = res.data;
            error = res.error;

            // Fail fast on success or deterministic errors
            // PGRST116: Not Found (Deterministic)
            if (!error || error.code === 'PGRST116') break;
            
            // Se for o último request e falhou, saia do loop
            if (attempt === maxRetries) break;

            // 🚀 Big Tech Standard: Exponential Backoff with Full Jitter
            // Previne o "Thundering Herd Problem" espalhando requests concorrentes
            const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
            const jitterDelay = Math.floor(Math.random() * exponentialDelay);
            
            console.warn(`[AuthService] Transient error (Attempt ${attempt + 1}/${maxRetries}): ${error.message}. Backoff: ${jitterDelay}ms`);
            
            await new Promise(r => setTimeout(r, jitterDelay));
        }

        if (error) {
            if (error.code === 'PGRST116') {
                // Usuário existe no Auth mas não na 'users' -> Provável Técnico tentando acessar o Painel.
                logger.warn('🔥 Acesso Bloqueado: Usuário autenticado mas sem privilégios de Painel Administrativo.', { authId, email });
                return undefined;
            }

            // Erros críticos de persistência não devem resultar em logout silencioso, mas sim em erro explícito.
            throw new Error(`Falha na verificação de privilégios (Security Layer): ${error.message}`);
        }

        if (!dbUser) {
            return undefined;
        }

        // 2. Validação Exclusiva de Acesso ao Painel (MIT/Harvard Principle)
        // Somente ADMIN e SUPER_ADMIN podem acessar o Portal Administrativo.
        // Usuários com papel exclusivo de TECHNICIAN devem ser barrados aqui.
        const isAuthorizedRole = dbUser.role === UserRole.ADMIN || dbUser.role === 'SUPER_ADMIN' as any;

        if (!isAuthorizedRole) {
            logger.warn('🚫 Acesso Negado: Usuário autenticado como Técnico, mas sem cargo administrativo.', { email: dbUser.email, role: dbUser.role });
            return undefined;
        }

        // 3. Se tiver grupo vinculado, as permissões do GRUPO têm prioridade total
        // O grupo é a fonte de verdade — permissões diretas no usuário são apenas fallback
        let permissions = dbUser.permissions || DEFAULT_PERMISSIONS;
        let groupName = '';

        // Usa group_ids (array) ou group_id (legado) para encontrar o grupo primário
        let parsedGroupIds: string[] = [];
        if (dbUser.group_ids) {
            if (typeof dbUser.group_ids === 'string') {
                try { parsedGroupIds = JSON.parse(dbUser.group_ids); } 
                catch (e) { parsedGroupIds = [dbUser.group_ids]; }
            } else if (Array.isArray(dbUser.group_ids)) {
                parsedGroupIds = dbUser.group_ids;
            }
        }

        const primaryGroupId = parsedGroupIds.length > 0
            ? parsedGroupIds[0]
            : dbUser.group_id;

        if (primaryGroupId) {
            const { data: group, error: groupError } = await supabase
                .from('user_groups')
                .select('permissions, name')
                .eq('id', primaryGroupId)
                .single();

            if (groupError && groupError.code !== 'PGRST116') {
                logger.error('Failed to fetch user group permissions', { error: groupError, primaryGroupId });
                throw new Error(`Falha ao carregar permissões do grupo: ${groupError.message}`);
            }

            if (group) {
                groupName = group.name || '';
                
                if (group.permissions) {
                    // 🔑 GRUPO TEM PRIORIDADE TOTAL:
                    // Se for o grupo Administradores, força as permissões máximas para corrigir JSONs legados
                    if (group.name?.toLowerCase() === 'administradores') {
                        permissions = ADMIN_PERMISSIONS;
                    } else {
                        permissions = group.permissions;
                    }
                }
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
            groupIds: parsedGroupIds.length > 0 ? parsedGroupIds : (dbUser.group_id ? [dbUser.group_id] : []),
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
    resetPasswordForEmail: async (email: string): Promise<void> => {
        if (isCloudEnabled) {
            const redirectUrl = `${window.location.origin}/#/reset-password`;
            const { error } = await recoveryAuthClient.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
                redirectTo: redirectUrl,
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
