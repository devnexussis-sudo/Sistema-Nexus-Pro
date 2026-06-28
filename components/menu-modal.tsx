
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Alert, Image, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { syncService } from '@/services/sync-service';
import { useRouter } from 'expo-router';
import { authService } from '@/services/auth-service';
import { supabase } from '@/services/supabase';
import { useI18n } from '@/services/i18n';
import Constants from 'expo-constants';

interface MenuModalProps {
    visible: boolean;
    onClose: () => void;
    hasUnread?: boolean;
}

export function MenuModal({ visible, onClose, hasUnread }: MenuModalProps) {
    const router = useRouter();
    const { t } = useI18n();
    const [userProfile, setUserProfile] = useState<any>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            // First load from sync cache immediately
            const syncProfile = authService.getProfileSync();
            if (syncProfile) {
                setUserProfile(syncProfile);
            }

            // Fallback se não tiver no cache ainda
            if (!syncProfile) {
                const { data } = await supabase.auth.getUser();
                if (data?.user?.id) {
                    const { data: techProfile } = await supabase.from('technicians').select('name, avatar').eq('id', data.user.id).single();
                    if (techProfile) {
                        setUserProfile({
                            name: techProfile.name || data.user.email?.split('@')[0] || 'Técnico',
                            avatar: techProfile.avatar
                        });
                    } else {
                        setUserProfile({
                            name: data.user.email?.split('@')[0] || 'Usuário',
                            avatar: null
                        });
                    }
                }
            }
        };
        fetchProfile();
    }, [visible]); // Recarrega sempre que o modal abrir

    const handleForceSync = async () => {
        setIsSyncing(true);
        try {
            await syncService.triggerSync(true);
            Alert.alert(t('menuSync'), 'Sincronização forçada concluída com sucesso!');
        } catch (error) {
            Alert.alert(t('menuSync'), 'Ocorreu um erro durante a sincronização.');
        } finally {
            setIsSyncing(false);
            onClose();
        }
    };

    const handleLogout = () => {
        onClose();
        Alert.alert(t('menuLogout'), t('menuLogoutConfirm'), [
            { text: t('menuCancel'), style: 'cancel' },
            {
                text: t('menuLogout'),
                style: 'destructive',
                onPress: async () => {
                    console.log('User logged out via Menu');
                    await authService.logout();
                    // Reset or navigate to login
                    router.replace('/login');
                }
            }
        ]);
    };

    const menuItems = [
        {
            title: t('menuProfile'),
            icon: 'person.circle',
            action: () => {
                onClose();
                router.push('/profile');
            }
        },
        {
            title: 'Notificações',
            icon: 'bell.fill',
            action: () => {
                onClose();
                router.push('/notifications');
            },
            badge: hasUnread
        },
        {
            title: t('menuSettings'),
            icon: 'gear',
            action: () => {
                onClose();
                router.push('/settings');
            }
        },
        {
            title: t('menuSync'),
            icon: 'arrow.triangle.2.circlepath',
            action: handleForceSync
        },
    ];

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={!isSyncing ? onClose : null}>
                <View style={styles.menuContainer} onStartShouldSetResponder={() => true}>
                    {isSyncing && (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center' }]}>
                            <ActivityIndicator size="large" color="#1c2d4f" />
                            <Text style={{ marginTop: 10, color: '#1c2d4f', fontWeight: 'bold' }}>{t('menuLoading')}</Text>
                        </View>
                    )}
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginBottom: 12 }}>
                            <Pressable onPress={onClose} hitSlop={20} style={styles.closeButton} disabled={isSyncing}>
                                <IconSymbol name="xmark" size={20} color="#64748b" />
                            </Pressable>
                        </View>
                        
                        <View style={styles.profileHeader}>
                            {userProfile?.avatar ? (
                                <Image source={{ uri: userProfile.avatar }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <IconSymbol name="person.fill" size={36} color="#94a3b8" />
                                </View>
                            )}
                            <View style={styles.profileInfo}>
                                <Text style={styles.userName} numberOfLines={1}>{userProfile?.name || t('menuLoading')}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.menuItemsContainer}>
                        {menuItems.map((item, index) => (
                            <Pressable
                                key={index}
                                style={({ pressed }) => [
                                    styles.menuItem,
                                    pressed && styles.menuItemPressed
                                ]}
                                onPress={item.action}
                            >
                                {/* @ts-ignore: Dynamic icon name */}
                                <IconSymbol name={item.icon} size={24} color="#1c2d4f" />
                                <Text style={styles.menuItemText}>{item.title}</Text>
                                {item.badge && (
                                    <View style={styles.badgeDot} />
                                )}
                            </Pressable>
                        ))}
                    </View>

                    <View style={styles.footer}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.logoutButton,
                                pressed && styles.logoutButtonPressed
                            ]}
                            onPress={handleLogout}
                        >
                            <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color="#fff" />
                            <Text style={styles.logoutText}>{t('menuLogout')}</Text>
                        </Pressable>
                        <Text style={styles.versionText}>{t('menuVersion')} {Constants.expoConfig?.version || '03.01.26'}</Text>
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-start',
    },
    menuContainer: {
        backgroundColor: '#fff',
        width: '80%', // Slightly wider
        height: '100%',
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        marginBottom: 30,
        marginTop: 40, // Top Safe Area
    },
    closeButton: {
        padding: 4,
        backgroundColor: '#f1f5f9',
        borderRadius: 20,
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#f1f5f9',
        borderWidth: 2,
        borderColor: '#e2e8f0',
    },
    avatarPlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#e2e8f0',
    },
    profileInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    userName: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1e293b',
        marginBottom: 2,
    },
    userRole: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6366f1',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    menuItemsContainer: {
        flex: 1,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        gap: 16,
    },
    menuItemPressed: {
        opacity: 0.7,
        backgroundColor: '#f9f9f9',
    },
    menuItemText: {
        fontSize: 18,
        color: '#333',
        fontWeight: '500',
        flex: 1,
    },
    badgeDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ef4444',
    },
    footer: {
        marginTop: 'auto',
        marginBottom: 20,
        gap: 20,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ef4444',
        borderRadius: 12,
        gap: 12,
        paddingVertical: 14,
    },
    logoutButtonPressed: {
        opacity: 0.8,
    },
    logoutText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    versionText: {
        color: '#999',
        fontSize: 12,
        textAlign: 'center',
    }
});
