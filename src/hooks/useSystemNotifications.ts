import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { TenantService } from '../services/tenantService';
import { SystemNotification } from '../types';

export interface ToastItem {
    id: string;
    title: string;
    content: string;
    priority: 'info' | 'warning' | 'urgent';
    actionLabel?: string;
    actionUrl?: string;
    createdAt: string;
}

export function useSystemNotifications(userId?: string, tenantId?: string, userRole?: string) {
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [activeToast, setActiveToast] = useState<ToastItem | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const isMounted = useRef<boolean>(true);

    // Carregamento Inicial das Notificações do Banco
    const loadNotifications = useCallback(async () => {
        if (!userId) {
            setNotifications([]);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const data = await TenantService.getSystemNotifications(userId, tenantId, userRole);
            if (isMounted.current) {
                setNotifications(data || []);
            }
        } catch (err) {
            console.error('[useSystemNotifications] Erro ao carregar notificações:', err);
        } finally {
            if (isMounted.current) {
                setIsLoading(false);
            }
        }
    }, [userId, tenantId, userRole]);

    // Marcar como lida
    const markAsRead = useCallback(async (notificationId: string) => {
        if (!userId) return;

        // Atualização Otimista local
        setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));

        // Se a toast ativa for essa notificação, limpa a toast
        if (activeToast?.id === notificationId) {
            setActiveToast(null);
        }

        try {
            await TenantService.markSystemNotificationAsRead(userId, notificationId);
        } catch (err) {
            console.error('[useSystemNotifications] Erro ao marcar como lida:', err);
        }
    }, [userId, activeToast]);

    // Dispensar Toast temporário sem marcar como lida no DB (ou marcando)
    const dismissToast = useCallback(() => {
        setActiveToast(null);
    }, []);

    // 📡 1. Efeito de Carga Inicial
    useEffect(() => {
        isMounted.current = true;
        loadNotifications();
        return () => {
            isMounted.current = false;
        };
    }, [loadNotifications]);

    // 📡 2. Efeito Supabase Realtime (WebSocket Push & Delete Revocation)
    useEffect(() => {
        if (!userId) return;

        const channelName = `nexus_sys_notif_${userId}_${tenantId || 'global'}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'system_notifications'
                },
                (payload) => {
                    const newNotif = payload.new as any;
                    if (!newNotif || !newNotif.id) return;

                    // 🛡️ 1. Filtro Temporal de Expiração
                    if (newNotif.expires_at || newNotif.expiresAt) {
                        const expStr = newNotif.expires_at || newNotif.expiresAt;
                        const exp = new Date(expStr).getTime();
                        if (exp <= Date.now()) return; // Ignora expiradas
                    }

                    const notifType = String(newNotif.type || 'broadcast').toLowerCase().trim();

                    // Helper para parsear arrays (seja JS Array, JSON string ou string simples)
                    const parseArray = (field: any): string[] => {
                        if (!field) return [];
                        if (Array.isArray(field)) return field.map(String);
                        if (typeof field === 'string') {
                            const trimmed = field.trim();
                            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    if (Array.isArray(parsed)) return parsed.map(String);
                                } catch (e) { /* fallback abaixo */ }
                            }
                            return [trimmed];
                        }
                        return [];
                    };

                    const targetList = parseArray(newNotif.target_tenants || newNotif.targetTenants);
                    const targetRoles = parseArray(newNotif.target_roles || newNotif.targetRoles);

                    // 🛡️ 2. Filtro de Instância Target (Tenant)
                    const isBroadcast = notifType === 'broadcast';
                    let isTargetedToMe = false;
                    if (tenantId && targetList.length > 0) {
                        const cleanTenantId = String(tenantId).toLowerCase().trim();
                        isTargetedToMe = targetList.some(t => String(t).toLowerCase().trim() === cleanTenantId);
                    }

                    if (!isBroadcast && !isTargetedToMe) {
                        return; // Notificação direcionada para outro tenant
                    }

                    // 🛡️ 3. Filtro de Cargos Target (Role)
                    if (userRole && targetRoles.length > 0) {
                        const cleanUserRole = String(userRole).toUpperCase().trim();
                        const hasRoleMatch = targetRoles.some(r => {
                            const cleanTargetRole = String(r).toUpperCase().trim();
                            if (cleanTargetRole === cleanUserRole) return true;
                            if ((cleanUserRole === 'ADMIN' || cleanUserRole === 'SUPER_ADMIN' || cleanUserRole === 'MASTER') && (cleanTargetRole === 'ADMIN' || cleanTargetRole === 'GESTÃO' || cleanTargetRole === 'ADMINISTRADOR')) return true;
                            if ((cleanUserRole === 'TECHNICIAN' || cleanUserRole === 'TECH') && (cleanTargetRole === 'TECHNICIAN' || cleanTargetRole === 'TÉCNICO')) return true;
                            return false;
                        });
                        if (!hasRoleMatch) {
                            return; // Notificação direcionada para outro cargo
                        }
                    }

                    let displayContent = newNotif.content || '';
                    let actionLabel = newNotif.action_label || newNotif.actionLabel;
                    let actionUrl = newNotif.action_url || newNotif.actionUrl;

                    if (typeof displayContent === 'string' && displayContent.includes('<!--NEXUS_NOTIF_META:')) {
                        try {
                            const match = displayContent.match(/<!--NEXUS_NOTIF_META:(.*?)-->/s);
                            if (match && match[1]) {
                                const meta = JSON.parse(match[1]);
                                if (meta.actionLabel && !actionLabel) actionLabel = meta.actionLabel;
                                if (meta.actionUrl && !actionUrl) actionUrl = meta.actionUrl;
                            }
                            displayContent = displayContent.replace(/<!--NEXUS_NOTIF_META:.*?-->/g, '').trim();
                        } catch (e) { /* continue */ }
                    }

                    const normalizedNotif: SystemNotification = {
                        id: newNotif.id,
                        title: newNotif.title,
                        content: displayContent,
                        type: newNotif.type,
                        priority: newNotif.priority || 'info',
                        targetTenants: targetList,
                        targetRoles: targetRoles,
                        actionLabel: actionLabel,
                        actionUrl: actionUrl,
                        expiresAt: newNotif.expires_at || newNotif.expiresAt,
                        createdAt: newNotif.created_at || new Date().toISOString(),
                        isRead: false
                    };

                    console.log('[useSystemNotifications] ⚡ Nova notificação recebida via Realtime:', normalizedNotif.title);

                    if (isMounted.current) {
                        // Prepend na lista local para reatividade instantânea
                        setNotifications(prev => {
                            if (prev.some(n => n.id === normalizedNotif.id)) return prev;
                            return [normalizedNotif, ...prev];
                        });

                        // 🔔 Se for 'info' ou 'warning', dispara Toast flutuante não-bloqueante
                        if (normalizedNotif.priority === 'info' || normalizedNotif.priority === 'warning') {
                            setActiveToast({
                                id: normalizedNotif.id,
                                title: normalizedNotif.title,
                                content: normalizedNotif.content,
                                priority: normalizedNotif.priority,
                                actionLabel: normalizedNotif.actionLabel,
                                actionUrl: normalizedNotif.actionUrl,
                                createdAt: normalizedNotif.createdAt
                            });
                        }
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'system_notifications'
                },
                (payload) => {
                    const deletedId = payload.old?.id;
                    if (!deletedId) return;

                    console.log('[useSystemNotifications] 🗑️ Notificação revogada pelo Master via Realtime:', deletedId);

                    if (isMounted.current) {
                        setNotifications(prev => prev.filter(n => n.id !== deletedId));
                        setActiveToast(prev => (prev?.id === deletedId ? null : prev));
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[useSystemNotifications] 📡 Conectado ao canal Supabase Realtime.');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, tenantId, userRole]);

    const unreadCount = notifications.filter(n => !n.isRead).length;
    const warningNotifications = notifications.filter(n => !n.isRead && n.priority === 'warning');
    const urgentNotifications = notifications.filter(n => !n.isRead && n.priority === 'urgent');
    const infoNotifications = notifications.filter(n => !n.isRead && n.priority === 'info');

    return {
        notifications,
        unreadCount,
        warningNotifications,
        urgentNotifications,
        infoNotifications,
        activeToast,
        isLoading,
        markAsRead,
        dismissToast,
        refetch: loadNotifications
    };
}
