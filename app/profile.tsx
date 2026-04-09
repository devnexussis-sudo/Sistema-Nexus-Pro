
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { authService } from '@/services/auth-service';
import { ImageService } from '@/services/image-service';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View, TextInput, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useI18n } from '@/services/i18n';

export default function ProfileScreen() {
    const router = useRouter();
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const { t } = useI18n();
    const [user, setUser] = useState({
        name: t('menuLoading'),
        email: '...',
        id: '...',
        role: '...'
    });
    
    // Password update state
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [showPasswords, setShowPasswords] = useState(false);

    const handleUpdatePassword = async () => {
        if (!oldPassword) {
            Alert.alert(t('alertAttention'), t('profilePasswordOldRequired'));
            return;
        }
        if (newPassword !== confirmNewPassword) {
            Alert.alert(t('alertAttention'), t('profilePasswordMismatch'));
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&+=!.?_\-]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            Alert.alert(t('alertAttention'), t('profilePasswordValidation'));
            return;
        }
        setIsUpdatingPassword(true);
        try {
            // Re-authenticate to ensure old password is correct
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: oldPassword
            });
            if (signInError) throw new Error(t('profilePasswordOldIncorrect'));

            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            Alert.alert(t('alertSuccess'), t('profilePasswordSuccess'), [
                {
                    text: 'OK', 
                    onPress: async () => {
                        await syncService.clearAllData();
                        await authService.logout();
                        router.replace('/login');
                    }
                }
            ]);
        } catch (error: any) {
            Alert.alert(t('alertError'), t('profilePasswordError') + error.message);
        } finally {
            setIsUpdatingPassword(false);
            setOldPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        }
    };

    useEffect(() => {
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                Alert.alert(t('alertError'), t('profileNotAuthenticated'));
                return;
            }

            console.log('[Profile] Authenticated User ID:', session.user.id);

            // 1. Try fetching from technicians table
            const { data: techData, error: techError } = await supabase
                .from('technicians')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (techData) {
                console.log('[Profile] Technician Record Found:', techData);
                setUser({
                    name: techData.name || session.user.email?.split('@')[0] || t('profileTech'),
                    email: session.user.email || '',
                    id: session.user.id,
                    role: t('profileTechRole')
                });

                const avatar = techData.avatar || techData.avatar_url;
                if (avatar) setProfileImage(avatar);
            } else {
                console.warn('[Profile] No technician record found for this ID:', session.user.id);
                // Fallback to basic auth data
                setUser({
                    name: session.user.user_metadata?.name || t('profileUser'),
                    email: session.user.email || '',
                    id: session.user.id, // SHOW THE REAL ID so user can debug
                    role: t('profileUserRole')
                });
            }

        } catch (error) {
            console.error('[Profile] Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async () => {
        Alert.alert(
            t('profilePhotoTitle'),
            "Escolha a origem da imagem:",
            [
                { text: t('profilePhotoCamera'), onPress: async () => await takeOrPickImage(true) },
                { text: t('profilePhotoGallery'), onPress: async () => await takeOrPickImage(false) },
                { text: t('profilePhotoCancel'), style: "cancel" }
            ]
        );
    };

    const takeOrPickImage = async (isCamera: boolean) => {
        try {
            let result;
            if (isCamera) {
                const permission = await ImagePicker.requestCameraPermissionsAsync();
                if (permission.status !== "granted") {
                    Alert.alert(t('alertPermission'), t('profilePhotoPermission'));
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 1, // Let ImageService compress it
                });
            } else {
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 1,
                });
            }

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setLoading(true);
                const originalUri = result.assets[0].uri;

                // Compress to WebP < 100KB
                const compressedUri = await ImageService.compressAvatar(originalUri);
                const fileUri = (compressedUri.startsWith('/') && !compressedUri.startsWith('file://')) ? `file://${compressedUri}` : compressedUri;
                const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });

                if (!base64) throw new Error("Base64 string was empty");
                const arrayBuffer = decode(base64);

                // Using technicians/ folder which aligns with the web panel and avoids RLS lockouts
                const fileName = `technicians/${user.id}/avatar_${Date.now()}.webp`;

                const { error: uploadError } = await supabase.storage
                    .from('nexus-files')
                    .upload(fileName, arrayBuffer, {
                        contentType: 'image/webp',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('nexus-files')
                    .getPublicUrl(fileName);

                // Appended timestamp to bust cache when updating
                const finalUrl = `${publicUrl}?t=${Date.now()}`;

                // The panel explicitly expects 'avatar'. The 'avatar_url' column doesn't exist.
                const { error: updateError } = await supabase
                    .from('technicians')
                    .update({
                        avatar: finalUrl
                    })
                    .eq('id', user.id);

                if (updateError) throw updateError;

                setProfileImage(finalUrl);
                Alert.alert(t('alertSuccess'), t('profilePhotoSuccess'));
            }
        } catch (error: any) {
            // Log with a simple string to avoid crashing native console if it's cyclic
            const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            console.error("Avatar upload error details: " + errorMsg);
            Alert.alert(t('alertError'), `${t('profilePhotoError')}\n${errorMsg.slice(0, 150)}`);
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

            <View style={[styles.infoSection, { padding: 0, overflow: 'hidden' }]}>
                <Pressable
                    style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => setIsChangingPassword(!isChangingPassword)}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="lock-closed" size={20} color="#1c2d4f" />
                        <Text style={[styles.value, { fontSize: 16 }]}>{t('profileChangePassword')}</Text>
                    </View>
                    <Ionicons name={isChangingPassword ? "chevron-up" : "chevron-down"} size={20} color="#1c2d4f" />
                </Pressable>
                
                {isChangingPassword && (
                    <View style={{ padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                        <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{t('profilePasswordDisclaimer')}</Text>
                        <View style={styles.passwordInputContainer}>
                            <TextInput
                                style={styles.passwordInputFlexible}
                                placeholder={t('profileCurrentPassword')}
                                placeholderTextColor="#94a3b8"
                                secureTextEntry={!showPasswords}
                                value={oldPassword}
                                onChangeText={setOldPassword}
                            />
                        </View>
                        <View style={styles.passwordInputContainer}>
                            <TextInput
                                style={styles.passwordInputFlexible}
                                placeholder={t('profileNewPassword')}
                                placeholderTextColor="#94a3b8"
                                secureTextEntry={!showPasswords}
                                value={newPassword}
                                onChangeText={setNewPassword}
                            />
                            <Pressable onPress={() => setShowPasswords(!showPasswords)} style={styles.eyeIconPressable}>
                                <Ionicons name={showPasswords ? "eye-off" : "eye"} size={20} color="#94a3b8" />
                            </Pressable>
                        </View>
                        <View style={styles.passwordInputContainer}>
                            <TextInput
                                style={styles.passwordInputFlexible}
                                placeholder={t('profileConfirmPassword')}
                                placeholderTextColor="#94a3b8"
                                secureTextEntry={!showPasswords}
                                value={confirmNewPassword}
                                onChangeText={setConfirmNewPassword}
                            />
                        </View>
                        <Pressable 
                            style={[styles.savePasswordBtn, (!oldPassword || !newPassword || !confirmNewPassword || newPassword.length < 8 || isUpdatingPassword) && { opacity: 0.5 }]} 
                            onPress={handleUpdatePassword}
                            disabled={!oldPassword || !newPassword || !confirmNewPassword || newPassword.length < 8 || isUpdatingPassword}
                        >
                            {isUpdatingPassword ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('profileSavePassword')}</Text>
                            )}
                        </Pressable>
                    </View>
                )}
            </View>

            <Pressable
                style={styles.logoutButton}
                onPress={() => {
                    Alert.alert(t('profileLogout'), t('profileLogoutConfirm'), [
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
                    ])
                }}
            >
                <Ionicons name="log-out-outline" size={20} color="#fff" />
                <Text style={styles.logoutText}>{t('profileLogout')}</Text>
            </Pressable>
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
    }
});
