import React, { useEffect, useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    Linking,
    DeviceEventEmitter,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { systemAnnouncementService, SystemAnnouncement } from '@/services/system-announcement-service';

export function SystemAnnouncementModal() {
    const [unreadAnnouncements, setUnreadAnnouncements] = useState<SystemAnnouncement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const checkAnnouncements = async () => {
        try {
            const list = await systemAnnouncementService.getUnreadAnnouncements();
            setUnreadAnnouncements(list);
            setCurrentIndex(0);
        } catch (_) {}
    };

    useEffect(() => {
        checkAnnouncements();
        systemAnnouncementService.startRealtimeListener();

        const sub = DeviceEventEmitter.addListener('systemAnnouncementUpdated', checkAnnouncements);
        const subNotif = DeviceEventEmitter.addListener('refreshNotifications', checkAnnouncements);

        return () => {
            sub.remove();
            subNotif.remove();
        };
    }, []);

    const activeAnnouncement: SystemAnnouncement | undefined = unreadAnnouncements[currentIndex];

    if (!activeAnnouncement) {
        return null;
    }

    const isUrgent = activeAnnouncement.priority === 'urgent';
    const isWarning = activeAnnouncement.priority === 'warning';

    const headerBadge = isUrgent
        ? '🚨 ATUALIZAÇÃO / URGENTE'
        : isWarning
        ? '⚠️ AVISO IMPORTANTE'
        : '📢 COMUNICADO DO SISTEMA';

    const accentColor = isUrgent ? '#ef4444' : isWarning ? '#f59e0b' : '#38bdf8';
    const headerBgColor = isUrgent ? 'rgba(239, 68, 68, 0.12)' : isWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(56, 189, 248, 0.12)';
    const iconName = isUrgent ? 'alert-circle' : isWarning ? 'warning' : 'megaphone';

    const handleDismiss = async () => {
        await systemAnnouncementService.markAsRead(activeAnnouncement.id);
        if (currentIndex + 1 < unreadAnnouncements.length) {
            setCurrentIndex(currentIndex + 1);
        } else {
            setUnreadAnnouncements([]);
        }
    };

    const handleActionPress = async () => {
        if (!activeAnnouncement.actionUrl) return;

        let url = activeAnnouncement.actionUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://${url}`;
        }

        try {
            setIsActionLoading(true);
            const canOpen = await Linking.canOpenURL(url);
            if (canOpen) {
                await Linking.openURL(url);
            } else {
                await Linking.openURL(url);
            }
        } catch (err) {
            console.warn('[SystemAnnouncementModal] Failed to open link:', err);
        } finally {
            setIsActionLoading(false);
        }
    };

    return (
        <Modal
            transparent
            visible={!!activeAnnouncement}
            animationType="fade"
            onRequestClose={handleDismiss}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    {/* Header com badge e severidade */}
                    <View style={[styles.cardHeader, { backgroundColor: headerBgColor }]}>
                        <View style={[styles.iconWrapper, { borderColor: accentColor }]}>
                            <Ionicons name={iconName} size={24} color={accentColor} />
                        </View>
                        <View style={styles.headerTextContainer}>
                            <Text style={[styles.badgeText, { color: accentColor }]}>
                                {headerBadge}
                            </Text>
                            <Text style={styles.titleText} numberOfLines={2}>
                                {activeAnnouncement.title}
                            </Text>
                        </View>
                    </View>

                    {/* Corpo da mensagem */}
                    <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
                        <Text style={styles.messageText}>
                            {activeAnnouncement.content}
                        </Text>
                    </ScrollView>

                    {/* Rodapé com Botões de Ação */}
                    <View style={styles.footer}>
                        {activeAnnouncement.actionUrl && (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    pressed && styles.actionButtonPressed,
                                ]}
                                onPress={handleActionPress}
                                disabled={isActionLoading}
                            >
                                {isActionLoading ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <>
                                        <Ionicons
                                            name={
                                                activeAnnouncement.actionLabel?.toLowerCase().includes('baixar')
                                                    ? 'download-outline'
                                                    : 'open-outline'
                                            }
                                            size={18}
                                            color="#ffffff"
                                        />
                                        <Text style={styles.actionButtonText}>
                                            {activeAnnouncement.actionLabel || 'Baixar Atualização'}
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        )}

                        <Pressable
                            style={({ pressed }) => [
                                styles.dismissButton,
                                pressed && styles.dismissButtonPressed,
                            ]}
                            onPress={handleDismiss}
                        >
                            <Text style={styles.dismissButtonText}>
                                Entendido / Fechar
                            </Text>
                        </Pressable>

                        {unreadAnnouncements.length > 1 && (
                            <Text style={styles.paginationText}>
                                Comunicado {currentIndex + 1} de {unreadAnnouncements.length}
                            </Text>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        zIndex: 99999,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '80%',
        backgroundColor: '#1e293b',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#334155',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 15,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        gap: 14,
    },
    iconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTextContainer: {
        flex: 1,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    titleText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    contentScroll: {
        maxHeight: 250,
    },
    contentContainer: {
        padding: 20,
    },
    messageText: {
        fontSize: 14,
        lineHeight: 22,
        color: '#cbd5e1',
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#334155',
        gap: 10,
        backgroundColor: '#0f172a',
    },
    actionButton: {
        backgroundColor: '#2563eb',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 14,
        gap: 8,
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
    },
    actionButtonPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.98 }],
    },
    actionButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 0.3,
    },
    dismissButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    dismissButtonPressed: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    dismissButtonText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
    },
    paginationText: {
        textAlign: 'center',
        fontSize: 11,
        color: '#64748b',
        fontWeight: '500',
        marginTop: 2,
    },
});
