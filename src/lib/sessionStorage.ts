/**
 * 🔐 Nexus Session Manager
 * Gerenciador de Sessões Isoladas por Aba
 * 
 * Garante que cada aba tenha sua própria sessão independente:
 * - Aba 1: Admin logado
 * - Aba 2: Técnico logado
 * - Aba 3: Master Super Admin
 * 
 * Todas funcionam simultaneamente sem interferência.
 */

// Identificador único para cada aba/sessão
let SESSION_ID: string;

// Checa se já existe um SESSION_ID para esta aba
const initSessionId = () => {
    // Usa sessionStorage para criar um ID único POR ABA
    let sid = sessionStorage.getItem('nexus_session_id');
    if (!sid) {
        sid = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('nexus_session_id', sid);
    }
    SESSION_ID = sid;
    return sid;
};

initSessionId();

/**
 * Storage com isolamento de sessão
 * Cada aba tem seu próprio namespace de dados
 */
export const SessionStorage = {
    /**
     * Salva dados isolados por sessão (aba)
     */
    set: (key: string, value: any): void => {
        try {
            // Dados da sessão atual ficam no sessionStorage (isolado por aba)
            sessionStorage.setItem(`${SESSION_ID}_${key}`, JSON.stringify(value));
        } catch (e) {
            console.error('SessionStorage.set error:', e);
        }
    },

    /**
     * Busca dados isolados da sessão (aba) atual
     */
    get: <T = any>(key: string, defaultValue?: T): T | null => {
        try {
            const data = sessionStorage.getItem(`${SESSION_ID}_${key}`);
            if (data) return JSON.parse(data);
            return defaultValue !== undefined ? defaultValue : null;
        } catch (e) {
            console.error('SessionStorage.get error:', e);
            return defaultValue !== undefined ? defaultValue : null;
        }
    },

    /**
     * Remove dados da sessão atual
     */
    remove: (key: string): void => {
        try {
            sessionStorage.removeItem(`${SESSION_ID}_${key}`);
        } catch (e) {
            console.error('SessionStorage.remove error:', e);
        }
    },

    /**
     * Limpa TODA a sessão atual
     */
    clear: (): void => {
        try {
            const keys = Object.keys(sessionStorage);
            keys.forEach(k => {
                if (k.startsWith(SESSION_ID)) {
                    sessionStorage.removeItem(k);
                }
            });
        } catch (e) {
            console.error('SessionStorage.clear error:', e);
        }
    },

    /**
     * Retorna o ID da sessão atual
     */
    getSessionId: (): string => SESSION_ID
};

/**
 * Storage global (compartilhado entre todas as abas)
 * Use APENAS para dados que DEVEM ser compartilhados
 * Ex: Configurações gerais, tema, idioma
 */
export const GlobalStorage = {
    set: (key: string, value: any): void => {
        try {
            localStorage.setItem(`nexus_global_${key}`, JSON.stringify(value));
        } catch (e) {
            console.error('GlobalStorage.set error:', e);
        }
    },

    get: <T = any>(key: string, defaultValue?: T): T | null => {
        try {
            const data = localStorage.getItem(`nexus_global_${key}`);
            if (data) return JSON.parse(data);
            return defaultValue !== undefined ? defaultValue : null;
        } catch (e) {
            console.error('GlobalStorage.get error:', e);
            return defaultValue !== undefined ? defaultValue : null;
        }
    },

    remove: (key: string): void => {
        try {
            localStorage.removeItem(`nexus_global_${key}`);
        } catch (e) {
            console.error('GlobalStorage.remove error:', e);
        }
    }
};

/**
 * Helper para migração de localStorage antigo
 */
export const migrateToSessionStorage = () => {
    const keysToMigrate = ['nexus_user', 'nexus_current_tenant', 'nexus_is_impersonating'];

    keysToMigrate.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
            try {
                SessionStorage.set(key.replace('nexus_', ''), JSON.parse(value));
                // Não remove do localStorage ainda para manter compatibilidade
                // localStorage.removeItem(key);
            } catch (e) {
                // Se não for JSON, salva como string
                SessionStorage.set(key.replace('nexus_', ''), value);
            }
        }
    });
};

// Executa migração ao importar
migrateToSessionStorage();

export default SessionStorage;
