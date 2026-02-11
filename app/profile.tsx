
import React, { useState } from 'react';
import { StyleSheet, View, Text, Image, Pressable, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { authService } from '@/services/auth-service';

export default function ProfileScreen() {
    const router = useRouter();
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [user, setUser] = useState({
        name: 'Técnico Exemplo',
        email: 'tecnico@nexus.com.br',
        id: 'TEC-2026'
    });

    const pickImage = async () => {
        // No permissions request is necessary for launching the image library
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            setProfileImage(result.assets[0].uri);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={pickImage} style={styles.imageContainer}>
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
                <Text style={styles.idText}>ID: {user.id}</Text>
            </View>

            <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Email</Text>
                    <Text style={styles.value}>{user.email}</Text>
                </View>
                <View style={styles.separator} />
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Cargo</Text>
                    <Text style={styles.value}>Técnico de Campo</Text>
                </View>
                <View style={styles.separator} />
                <View style={styles.infoRow}>
                    <Text style={styles.label}>Filial</Text>
                    <Text style={styles.value}>São Paulo - SP</Text>
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
                                // TODO: Implement Auth Context to handle logout
                                console.log('User logged out');
                                await authService.logout();
                                router.replace('/login'); // Just resets for now
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
    },
    placeholderImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e0e0e0',
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
