import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export interface SystemAnnouncement {
    id: string;
    title: string;
    content: string;
    priority: 'urgent' | 'warning' | 'info';
    type: 'broadcast' | 'targeted';
    targetTenants?: string[];
    targetRoles?: string[];
    actionLabel?: string;
    actionUrl?: string;
    expiresAt?: string;
    createdAt: string;
    isRead?: boolean;
}

const DISMISSED_KEY_PREFIX = '@nexus_dismissed_announcements_';

function parseArray(field: any): string[] {
    if (!field) return [];
    if (Array.isArray(field)) return field.map(String);
    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(String);
            } catch (_) {}
        }
        return [trimmed];
    }
    return [];
}

function parseAnnouncement(n: any): SystemAnnouncement {
    let content = n.content || '';
    let actionLabel = n.action_label || n.actionLabel || '';
    let actionUrl = n.action_url || n.actionUrl || '';
    let targetTenants = n.target_tenants || n.targetTenants || [];
    let targetRoles = n.target_roles || n.targetRoles || [];
    let expiresAt = n.expires_at || n.expiresAt || null;

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
        } catch (_) {}
    }

    return {
        id: n.id,
        title: n.title || 'Aviso do Sistema',
        content: content || '',
        priority: (n.priority || 'info').toLowerCase() as any,
        type: (n.type || 'broadcast').toLowerCase() as any,
        targetTenants: parseArray(targetTenants),
        targetRoles: parseArray(targetRoles),
        actionLabel: actionLabel?.trim() || undefined,
        actionUrl: actionUrl?.trim() || undefined,
        expiresAt: expiresAt || undefined,
        createdAt: n.created_at || new Date().toISOString(),
    };
}

class SystemAnnouncementService {
    private realtimeChannel: any = null;

    /**
     * Busca os comunicados ativos direcionados ao app / técnico
     */
    async fetchAnnouncements(): Promise<SystemAnnouncement[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            let tenantId: string | null = session?.user?.user_metadata?.tenantId || session?.user?.user_metadata?.tenant_id || null;

            if (userId && !tenantId) {
                try {
                    const { data: userData } = await supabase
                        .from('users')
                        .select('tenant_id')
                        .eq('id', userId)
                        .single();
                    if (userData?.tenant_id) tenantId = userData.tenant_id;
                } catch (_) {}
            }

            // 1. IDs dispensados localmente
            let localDismissed: string[] = [];
            if (userId) {
                try {
                    const raw = await AsyncStorage.getItem(DISMISSED_KEY_PREFIX + userId);
                    if (raw) localDismissed = JSON.parse(raw);
                } catch (_) {}
            }

            // 2. IDs lidos no banco
            let dbReadIds: string[] = [];
            if (userId) {
                try {
                    const { data: reads } = await supabase
                        .from('system_notification_reads')
                        .select('notification_id')
                        .eq('user_id', userId);
                    if (reads) dbReadIds = reads.map((r: any) => r.notification_id);
                } catch (_) {}
            }

            const allReadIds = new Set([...localDismissed, ...dbReadIds]);

            // 3. Consulta as notificações no Supabase
            const { data, error } = await supabase
                .from('system_notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (error || !data) {
                console.warn('[SystemAnnouncementService] Query error:', error?.message);
                return [];
            }

            const now = Date.now();

            return data
                .map(parseAnnouncement)
                .filter(item => {
                    // Ignora expiradas
                    if (item.expiresAt) {
                        const expMs = new Date(item.expiresAt).getTime();
                        if (!isNaN(expMs) && expMs <= now) return false;
                    }

                    // Filtro de Roles: Se especificado, deve incluir TECHNICIAN ou ALL
                    if (item.targetRoles && item.targetRoles.length > 0) {
                        const isForApp = item.targetRoles.some(r => {
                            const upper = r.toUpperCase().trim();
                            return upper === 'TECHNICIAN' || upper === 'TECH' || upper === 'TÉCNICO' || upper === 'ALL';
                        });
                        if (!isForApp) return false;
                    }

                    // Filtro de Tenants: Se targeted, o tenant do usuário precisa estar listado
                    if (item.type === 'targeted' && item.targetTenants && item.targetTenants.length > 0) {
                        if (!tenantId) return false;
                        const cleanTid = String(tenantId).toLowerCase().trim();
                        const matches = item.targetTenants.some(t => String(t).toLowerCase().trim() === cleanTid);
                        if (!matches) return false;
                    }

                    return true;
                })
                .map(item => ({
                    ...item,
                    isRead: allReadIds.has(item.id),
                }));
        } catch (e) {
            console.warn('[SystemAnnouncementService] fetchAnnouncements failed:', e);
            return [];
        }
    }

    /**
     * Retorna apenas os comunicados não lidos/não dispensados
     */
    async getUnreadAnnouncements(): Promise<SystemAnnouncement[]> {
        const all = await this.fetchAnnouncements();
        return all.filter(a => !a.isRead);
    }

    /**
     * Verifica rapidamente se há algum comunicado pendente de leitura
     */
    async hasUnread(): Promise<boolean> {
        const unread = await this.getUnreadAnnouncements();
        return unread.length > 0;
    }

    /**
     * Marca o comunicado como lido/dispensado
     */
    async markAsRead(notificationId: string): Promise<void> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;

            // 1. Gravação local em AsyncStorage (imediata)
            if (userId) {
                const storageKey = DISMISSED_KEY_PREFIX + userId;
                try {
                    const raw = await AsyncStorage.getItem(storageKey);
                    const list: string[] = raw ? JSON.parse(raw) : [];
                    if (!list.includes(notificationId)) {
                        list.push(notificationId);
                        await AsyncStorage.setItem(storageKey, JSON.stringify(list));
                    }
                } catch (_) {}

                // 2. Sincronização em nuvem com system_notification_reads
                try {
                    await supabase.from('system_notification_reads').insert([{
                        user_id: userId,
                        notification_id: notificationId,
                        read_at: new Date().toISOString()
                    }]);
                } catch (_) {}
            }

            // Notifica listeners locais (sino, modal, etc.)
            DeviceEventEmitter.emit('refreshNotifications');
            DeviceEventEmitter.emit('systemAnnouncementUpdated');
        } catch (e) {
            console.warn('[SystemAnnouncementService] markAsRead error:', e);
        }
    }

    /**
     * Inicia escuta Realtime para avisos criados ou revogados em tempo real
     */
    startRealtimeListener(): void {
        if (this.realtimeChannel) return;

        try {
            this.realtimeChannel = supabase
                .channel('mobile_system_announcements_' + Date.now())
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'system_notifications'
                    },
                    (payload) => {
                        console.log('[SystemAnnouncementService] ⚡ Realtime notification event:', payload.eventType);
                        DeviceEventEmitter.emit('refreshNotifications');
                        DeviceEventEmitter.emit('systemAnnouncementUpdated');
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('[SystemAnnouncementService] 📡 Conectado ao canal de comunicados.');
                    }
                });
        } catch (e) {
            console.warn('[SystemAnnouncementService] Realtime subscription error:', e);
        }
    }

    /**
     * Encerra a escuta Realtime
     */
    stopRealtimeListener(): void {
        if (this.realtimeChannel) {
            try {
                supabase.removeChannel(this.realtimeChannel);
            } catch (_) {}
            this.realtimeChannel = null;
        }
    }

    /**
     * Permite que componentes assinem atualizações de comunicados (novos avisos, lidos, etc.)
     */
    subscribe(callback: () => void): () => void {
        const sub = DeviceEventEmitter.addListener('systemAnnouncementUpdated', callback);
        return () => {
            sub.remove();
        };
    }
}

export const systemAnnouncementService = new SystemAnnouncementService();
