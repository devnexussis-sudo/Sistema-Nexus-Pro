import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface NexusAlertProps {
    visible: boolean;
    title: string;
    message: string;
    buttons?: AlertButton[];
    onDismiss?: () => void;
    icon?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
}

export const NexusAlert = ({
    visible,
    title,
    message,
    buttons = [{ text: 'OK' }],
    onDismiss,
    icon = 'information-circle-outline',
    iconColor = '#1c2d4f'
}: NexusAlertProps) => {
    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onDismiss}
        >
            <View style={styles.overlay}>
                <View style={styles.alertBox}>
                    <View style={styles.iconContainer}>
                        <Ionicons name={icon} size={40} color={iconColor} />
                    </View>
                    
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>
                    
                    <View style={styles.buttonContainer}>
                        {buttons.map((btn, index) => {
                            const isDestructive = btn.style === 'destructive';
                            const isCancel = btn.style === 'cancel';
                            
                            return (
                                <Pressable
                                    key={index}
                                    style={({ pressed }) => [
                                        styles.button,
                                        isCancel ? styles.buttonCancel : styles.buttonPrimary,
                                        isDestructive && styles.buttonDestructive,
                                        pressed && styles.buttonPressed,
                                        buttons.length > 1 && { flex: 1, marginHorizontal: 4 }
                                    ]}
                                    onPress={() => {
                                        if (btn.onPress) btn.onPress();
                                        if (onDismiss) onDismiss();
                                    }}
                                >
                                    <Text style={[
                                        styles.buttonText,
                                        isCancel ? styles.buttonTextCancel : styles.buttonTextPrimary,
                                        isDestructive && styles.buttonTextDestructive
                                    ]}>
                                        {btn.text}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    alertBox: {
        width: Math.min(width - 48, 340),
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    iconContainer: {
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1c2d4f',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        width: '100%',
    },
    button: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 100,
    },
    buttonPrimary: {
        backgroundColor: '#1c2d4f',
    },
    buttonCancel: {
        backgroundColor: '#f5f7fa',
        borderWidth: 1,
        borderColor: '#e8eaed',
    },
    buttonDestructive: {
        backgroundColor: '#ff3b30',
    },
    buttonPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    buttonTextPrimary: {
        color: '#ffffff',
    },
    buttonTextCancel: {
        color: '#666666',
    },
    buttonTextDestructive: {
        color: '#ffffff',
    },
});
