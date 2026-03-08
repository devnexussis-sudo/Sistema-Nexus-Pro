
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Switch, FlatList, Pressable, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { startBackgroundLocation, stopBackgroundLocation, LOCATION_TASK_NAME } from '@/services/location-service';
import * as Location from 'expo-location';
import { logger } from '@/services/logger';

export default function SettingsScreen() {
    const [isGpsEnabled, setIsGpsEnabled] = useState(false);

    useEffect(() => {
        checkGpsStatus();
    }, []);

    const checkGpsStatus = async () => {
        try {
            const isStart = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
            setIsGpsEnabled(isStart);
        } catch (e) {
            console.error(e);
            logger.log(`Erro ao verificar status do GPS: ${e}`, 'error');
        }
    };

    const toggleGps = async () => {
        try {
            if (isGpsEnabled) {
                await stopBackgroundLocation();
                setIsGpsEnabled(false);
            } else {
                const success = await startBackgroundLocation();
                if (success) {
                    setIsGpsEnabled(true);
                } else {
                    // Revert UI if permission was denied or error
                    setIsGpsEnabled(false);
                }
            }
        } catch (error) {
            setIsGpsEnabled(false);
        }
    };

    return (
        <ThemedView style={styles.container}>

            {/* Settings Section */}
            <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionHeader}>Geral</ThemedText>

                <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>Habilitar GPS em 2º Plano</Text>
                        <Text style={styles.settingDescription}>
                            ⚠️ Modo 'Sempre Ativo' ativado para auditoria de rotas.
                        </Text>
                    </View>
                    <Switch
                        trackColor={{ false: '#767577', true: '#1c2d4f' }}
                        thumbColor={isGpsEnabled ? '#fff' : '#f4f3f4'}
                        onValueChange={toggleGps}
                        value={isGpsEnabled}
                    />
                </View>
            </View>

        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f7fa',
    },
    section: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    sectionHeader: {
        marginBottom: 16,
        color: '#1c2d4f',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    settingInfo: {
        flex: 1,
        paddingRight: 10,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    settingDescription: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
});
