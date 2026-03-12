
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { authService } from '@/services/auth-service';
import { ImageService } from '@/services/image-service';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
    const router = useRouter();
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState({
        name: 'Carregando...',
        email: '...',
        id: '...',
        role: '...'
    });

    useEffect(() => {
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                Alert.alert('Erro', 'Usuário não autenticado.');
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
                    name: techData.name || session.user.email?.split('@')[0] || 'Técnico',
                    email: session.user.email || '',
                    id: session.user.id,
                    role: 'Técnico de Campo'
                });

                const avatar = techData.avatar || techData.avatar_url;
                if (avatar) setProfileImage(avatar);
            } else {
                console.warn('[Profile] No technician record found for this ID:', session.user.id);
                // Fallback to basic auth data
                setUser({
                    name: session.user.user_metadata?.name || 'Usuário',
                    email: session.user.email || '',
                    id: session.user.id, // SHOW THE REAL ID so user can debug
                    role: 'Usuário (Sem perfil de técnico)'
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
            "Foto de Perfil",
            "Escolha a origem da imagem:",
            [
                { text: "Câmera", onPress: async () => await takeOrPickImage(true) },
                { text: "Galeria", onPress: async () => await takeOrPickImage(false) },
                { text: "Cancelar", style: "cancel" }
            ]
        );
    };

    const takeOrPickImage = async (isCamera: boolean) => {
        try {
            let result;
            if (isCamera) {
                const permission = await ImagePicker.requestCameraPermissionsAsync();
                if (permission.status !== "granted") {
                    Alert.alert("Permissão", "O aplicativo precisa de acesso à câmera.");
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
                Alert.alert("Sucesso", "Foto de perfil atualizada!");
            }
        } catch (error: any) {
            // Log with a simple string to avoid crashing native console if it's cyclic
            const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            console.error("Avatar upload error details: " + errorMsg);
            Alert.alert("Erro", `Não foi possível enviar a imagem:\n${errorMsg.slice(0, 150)}`);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <ThemedView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#1c2d4f" />
                <ThemedText>Carregando perfil...</ThemedText>
            </ThemedView>
        );
    }

    return (
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
                <ThemedText type="title">{user.name}</ThemedText>
            </View>

            <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Email</Text>
                    <Text style={[styles.value, { fontSize: 14 }]}>{user.email}</Text>
                </View>
                <View style={styles.separator} />
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Cargo / Status</Text>
                    <Text style={styles.value}>{user.role}</Text>
                </View>
            </View>

            <Pressable
                style={styles.logoutButton}
                onPress={() => {
                    Alert.alert('Logoff', 'Deseja realmente sair?', [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                            text: 'Sair', style: 'destructive',
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
                <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                <Text style={styles.logoutText}>Fazer Logoff</Text>
            </Pressable>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f5f7fa',
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
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fee2e2',
    },
    logoutText: {
        color: '#ef4444',
        fontWeight: '600',
        fontSize: 16,
    },
});
