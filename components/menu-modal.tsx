
import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { syncService } from '@/services/sync-service';
import { useRouter } from 'expo-router';
import { authService } from '@/services/auth-service';

interface MenuModalProps {
    visible: boolean;
    onClose: () => void;
}

export function MenuModal({ visible, onClose }: MenuModalProps) {
    const router = useRouter();

    const handleForceSync = async () => {
        onClose();
        await syncService.forceSync();
    };

    const handleLogout = () => {
        onClose();
        Alert.alert('Logoff', 'Deseja realmente sair do aplicativo?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Sair',
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
            title: 'Configurações',
            icon: 'gear',
            action: () => {
                onClose();
                router.push('/settings');
            }
        },
        {
            title: 'Perfil',
            icon: 'iphone', // Using 'iphone' as placeholder for profile icon if 'person' not available in mapping. 
            // Actually mapping has 'iphone' mapped to 'phone-iphone'.
            // User request was "definicoes do app" -> "perfil".
            // I should probably map 'person.circle' or similar. 
            // But I'll stick to 'iphone' or change to 'house.fill' temporarily or add 'person' to mapping.
            // 'house.fill' -> 'home'.
            // Let's use 'gear' for settings.
            // I'll check my MAPPING in icon-symbol.tsx.
            action: () => {
                onClose();
                router.push('/profile');
            }
        },
        {
            title: 'Forçar Carregamento',
            icon: 'arrow.clockwise.icloud',
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
            <Pressable style={styles.overlay} onPress={onClose}>
                <View style={styles.menuContainer} onStartShouldSetResponder={() => true}>
                    <View style={styles.header}>
                        <ThemedText style={styles.title}>Menu</ThemedText>
                        <Pressable onPress={onClose} hitSlop={20}>
                            <IconSymbol name="xmark" size={24} color="#666" />
                        </Pressable>
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
                            <IconSymbol name="xmark" size={20} color="#ef4444" />
                            <Text style={styles.logoutText}>Fazer Logoff</Text>
                        </Pressable>
                        <Text style={styles.versionText}>Versão 1.0.0</Text>
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 40, // Top Safe Area
    },
    title: {
        fontSize: 28, // Larger title
        fontWeight: 'bold',
        color: '#1c2d4f',
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
    },
    footer: {
        marginTop: 'auto',
        marginBottom: 20,
        gap: 20,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
    },
    logoutButtonPressed: {
        opacity: 0.7,
    },
    logoutText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: '600',
    },
    versionText: {
        color: '#999',
        fontSize: 12,
        textAlign: 'center',
    }
});
