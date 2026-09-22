import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NexusAlert } from '@/components/nexus-alert';
import { authService } from '@/services/auth-service';
import { ImageService } from '@/services/image-service';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync-service';
import { OrderService } from '@/services/order-service';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import NexusCamera from '@/components/nexus-camera';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View, TextInput, KeyboardAvoidingView, ScrollView, Modal } from 'react-native';
import { useI18n } from '@/services/i18n';

export default function ProfileScreen() {
    const router = useRouter();
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [isAvatarModalVisible, setAvatarModalVisible] = useState(false);
    const [isNexusCameraVisible, setIsNexusCameraVisible] = useState(false);
    const [loading, setLoading] = useState(true);
    const { t } = useI18n();
    const [user, setUser] = useState({
        name: t('menuLoading'),
        email: '...',
        id: '...',
        techId: '',
        role: '...',
        jobTitle: '...'
    });
    
    const [isSendingReset, setIsSendingReset] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ 
        visible: false, title: '', message: '', icon: 'warning-outline' as any, iconColor: '#ff3b30', buttons: [{ text: 'OK' }] as any[] 
    });

    const showAlert = (title: string, message: string, buttons = [{ text: 'OK' }], icon = 'warning-outline' as any, iconColor = '#ff3b30') => {
        setAlertConfig({ visible: true, title, message, buttons, icon, iconColor });
    };

    const handleSendPasswordReset = async () => {
        if (!user.email || user.email === '...') {
            showAlert(t('alertAttention'), t('profileNotAuthenticated'));
            return;
        }
        setIsSendingReset(true);
        try {
            const success = await authService.resetPassword(user.email);
            if (!success) throw new Error('Falha ao enviar e-mail');
            showAlert(t('alertSuccess'), t('menuResetPasswordSuccess'), [
                { text: 'OK' }
            ], 'checkmark-circle-outline', '#34c759');
        } catch (error: any) {
            showAlert(t('alertError'), t('menuResetPasswordError'));
        } finally {
            setIsSendingReset(false);
        }
    };

    useEffect(() => {
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        const startTime = Date.now();
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                showAlert(t('alertError'), t('profileNotAuthenticated'));
                return;
            }

            console.log('[Profile] Authenticated User ID:', session.user.id);

            // Multi-strategy search (id, user_id, email, users table)
            let techData: any = null;
            const { data: byId } = await supabase.from('technicians').select('*').eq('id', session.user.id).maybeSingle();
            techData = byId;

            if (!techData) {
                const { data: byUserId } = await supabase.from('technicians').select('*').eq('user_id', session.user.id).maybeSingle();
                if (byUserId) techData = byUserId;
            }

            if (!techData && session.user.email) {
                const { data: byEmail } = await supabase.from('technicians').select('*').eq('email', session.user.email.toLowerCase()).maybeSingle();
                if (byEmail) techData = byEmail;
            }

            if (!techData) {
                const { data: userData } = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
                if (userData) {
                    techData = {
                        name: userData.name,
                        job_title: userData.role,
                        avatar: userData.avatar || userData.avatar_url,
                    };
                }
            }

            if (techData) {
                console.log('[Profile] Technician Record Found:', techData);
                setUser({
                    name: techData.name || session.user.email?.split('@')[0] || t('profileTech'),
                    email: session.user.email || '',
                    id: session.user.id,
                    techId: techData.id || '',
                    role: techData.job_title || t('profileTechRole'),
                    jobTitle: techData.job_title || ''
                });

                const avatar = techData.avatar || techData.avatar_url;
                if (avatar) setProfileImage(avatar);
            } else {
                console.warn('[Profile] Using auth fallback profile for ID:', session.user.id);
                setUser({
                    name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || t('profileUser'),
                    email: session.user.email || '',
                    id: session.user.id,
                    techId: '',
                    role: t('profileUserRole'),
                    jobTitle: ''
                });
            }

        } catch (error) {
            console.error('[Profile] Error fetching profile:', error);
        } finally {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1000 - elapsed);
            if (remaining > 0) {
                await new Promise(resolve => setTimeout(resolve, remaining));
            }
            setLoading(false);
        }
    };

    const handleAvatarUpload = async () => {
        setAvatarModalVisible(true);
    };

    const processAvatarUri = async (originalUri: string) => {
        try {
            setLoading(true);

            // Obter um nome seguro para a pasta
            const safeName = user.name ? user.name.replace(/[^a-zA-Z0-9\s]/g, '').trim() || user.id.substring(0, 8) : user.id.substring(0, 8);
            const folder = `technicians/${safeName}`;

            // Usar OrderService.uploadFile que já tem compressão embutida, streaming otimizado para Android/iOS e proteção contra OOM
            const publicUrl = await OrderService.uploadFile(originalUri, folder, undefined, 'image/webp');
            
            if (!publicUrl) throw new Error('Falha no upload da imagem para a nuvem.');

            const finalUrl = `${publicUrl}?t=${Date.now()}`;

            // 1. Tentar atualizar a tabela technicians
            if (user.techId) {
                await supabase.from('technicians').update({ avatar: finalUrl }).eq('id', user.techId);
            } else {
                await supabase.from('technicians').update({ avatar: finalUrl }).eq('id', user.id);
            }

            // 2. Garantia dupla: atualizar a tabela users (fallback importante)
            await supabase.from('users').update({ avatar: finalUrl, avatar_url: finalUrl }).eq('id', user.id);

            // 3. Garantia tripla: atualizar os metadados do auth
            await supabase.auth.updateUser({ data: { avatar: finalUrl } });

            setProfileImage(finalUrl);
            showAlert(t('alertSuccess'), t('profilePhotoSuccess'), [{ text: 'OK' }], 'checkmark-circle-outline', '#34c759');
            
        } catch (error: any) {
            const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            console.error("Avatar upload error details: " + errorMsg);
            showAlert(t('alertError'), `${t('profilePhotoError')}\n${errorMsg.slice(0, 150)}`);
        } finally {
            setLoading(false);
        }
    };

    const takeOrPickImage = async (isCamera: boolean) => {
        setAvatarModalVisible(false);
        try {
            if (isCamera) {
                const permission = await ImagePicker.requestCameraPermissionsAsync();
                if (permission.status !== "granted") {
                    showAlert(t('alertPermission'), t('profilePhotoPermission'));
                    return;
                }
                // Abre NexusCamera customizada com botões 100% em Português
                setIsNexusCameraVisible(true);
                return;
            } else {
                const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (permission.status !== "granted") {
                    showAlert(t('alertPermission'), t('profilePhotoPermission') || 'Precisamos de permissão para acessar a galeria.');
                    return;
                }
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 1,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await processAvatarUri(result.assets[0].uri);
            }
        } catch (error: any) {
            // Log with a simple string to avoid crashing native console if it's cyclic
            const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            console.error("Avatar upload error details: " + errorMsg);
            showAlert(t('alertError'), `${t('profilePhotoError')}\n${errorMsg.slice(0, 150)}`);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }]}>
                <ActivityIndicator size="large" color="#1c2d4f" />
                <Text style={{ marginTop: 10, color: '#1c2d4f', fontWeight: '500' }}>{t('profileLoading')}</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView 
            style={{ flex: 1, backgroundColor: '#f5f7fa' }} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        >
            <ScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={{ flexGrow: 1 }} 
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <ThemedView style={styles.container}>
                    <View style={styles.header}>
                <Pressable onPress={handleAvatarUpload} style={styles.imageContainer}>
                    {profileImage ? (
                        <Image source={{ uri: profileImage }} style={styles.profileImage} />
                    ) : (
                        <View style={styles.placeholderImage}>
                            <Ionicons name="person" size={40} color="#ccc" />
                        </View>
                    )}
                    <View style={styles.editIconBadge}>
                        <Ionicons name="camera" size={14} color="#fff" />
                    </View>
                </Pressable>
                <ThemedText type="title" style={{ color: '#0f172a', fontWeight: '900' }}>{user.name}</ThemedText>
                {user.jobTitle ? (
                    <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '600', marginTop: 4 }}>{user.jobTitle}</Text>
                ) : null}
            </View>

            <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>{t('profileEmail')}</Text>
                    <Text style={[styles.value, { fontSize: 14 }]}>{user.email}</Text>
                </View>
                <View style={styles.separator} />
                <View style={styles.infoRow}>
                    <Text style={styles.label}>{t('profileRole')}</Text>
                    <Text style={styles.value}>{user.role}</Text>
                </View>
            </View>

            <Pressable
                style={[styles.infoSection, { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: isSendingReset ? 0.5 : 1 }]}
                onPress={handleSendPasswordReset}
                disabled={isSendingReset}
            >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 10 }}>
                    <Ionicons name="mail-outline" size={22} color="#1c2d4f" />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.value, { fontSize: 15, fontWeight: '600', color: '#1c2d4f' }]}>{t('profileChangePassword')}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 15 }}>{t('menuResetPasswordDesc')}</Text>
                    </View>
                </View>
                {isSendingReset ? (
                    <ActivityIndicator size="small" color="#1c2d4f" />
                ) : (
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                )}
            </Pressable>

            <Pressable
                style={styles.logoutButton}
                onPress={() => {
                    showAlert(t('profileLogout'), t('profileLogoutConfirm'), [
                        { text: t('menuCancel'), style: 'cancel' },
                        {
                            text: t('profileLogout'), style: 'destructive',
                            onPress: async () => {
                                console.log('User logging out...');
                                await syncService.clearAllData();
                                await authService.logout();
                                router.replace('/login');
                            }
                        }
                    ], 'exit-outline', '#ff3b30');
                }}
            >
                <Ionicons name="log-out-outline" size={20} color="#fff" />
                <Text style={styles.logoutText}>{t('profileLogout')}</Text>
            </Pressable>

            {/* Modal de Escolha de Foto */}
            <Modal
                visible={isAvatarModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setAvatarModalVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setAvatarModalVisible(false)}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Atualizar Foto</Text>
                        <Text style={styles.modalSubtitle}>Escolha a origem da imagem</Text>
                        
                        <Pressable style={styles.modalOption} onPress={() => takeOrPickImage(true)}>
                            <Ionicons name="camera" size={24} color="#ffffff" />
                            <Text style={styles.modalOptionText}>Câmera</Text>
                        </Pressable>
                        
                        <View style={styles.modalSeparator} />
                        
                        <Pressable style={styles.modalOption} onPress={() => takeOrPickImage(false)}>
                            <Ionicons name="images" size={24} color="#ffffff" />
                            <Text style={styles.modalOptionText}>Galeria</Text>
                        </Pressable>
                        
                        <Pressable style={styles.modalCancelButton} onPress={() => setAvatarModalVisible(false)}>
                            <Text style={styles.modalCancelText}>Cancelar</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>
            
            {/* NexusCamera Modal — Câmera customizada 100% em Português */}
            {isNexusCameraVisible && (
                <Modal visible={true} transparent={false} animationType="slide" onRequestClose={() => setIsNexusCameraVisible(false)}>
                    <NexusCamera 
                        mode="photo"
                        onClose={() => setIsNexusCameraVisible(false)} 
                        onPhotoCaptured={(uri) => {
                            setIsNexusCameraVisible(false);
                            processAvatarUri(uri);
                        }} 
                    />
                </Modal>
            )}

            <NexusAlert 
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                icon={alertConfig.icon}
                iconColor={alertConfig.iconColor}
                onDismiss={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
            />
                </ThemedView>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        backgroundColor: '#f5f7fa',
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 20,
    },
    imageContainer: {
        marginBottom: 16,
        position: 'relative',
    },
    profileImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: '#1c2d4f', // Adding border to stand out
        backgroundColor: '#f0f4ff',
    },
    placeholderImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#e2e8f0', // Darker gray/blue to contrast with the #f5f7fa background
        borderWidth: 2,
        borderColor: '#1c2d4f', // Adding border
        alignItems: 'center',
        justifyContent: 'center',
    },
    editIconBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#1c2d4f',
        padding: 6,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#f5f7fa',
    },
    idText: {
        color: '#666',
        marginTop: 4,
        fontSize: 10,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
    },
    infoSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    infoRow: {
        paddingVertical: 12,
    },
    label: {
        fontSize: 12,
        color: '#666',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    value: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
    },
    separator: {
        height: 1,
        backgroundColor: '#f0f0f0',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        backgroundColor: '#ef4444',
        borderRadius: 12,
    },
    logoutText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 16,
    },
    passwordInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        marginBottom: 12,
    },
    passwordInputFlexible: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        color: '#0f172a',
    },
    eyeIconPressable: {
        padding: 10,
    },
    savePasswordBtn: {
        backgroundColor: '#1c2d4f',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1c2d4f',
        marginBottom: 8,
        textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 24,
        textAlign: 'center',
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: '#1c2d4f',
        justifyContent: 'center',
        gap: 8,
    },
    modalOptionText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    modalSeparator: {
        height: 1,
        backgroundColor: '#e2e8f0',
        marginVertical: 8,
    },
    modalCancelButton: {
        marginTop: 24,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
    },
    modalCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#64748b',
    }
});
