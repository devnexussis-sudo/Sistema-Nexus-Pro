
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LOCATION_TASK_NAME, startBackgroundLocation, stopBackgroundLocation } from '@/services/location-service';
import { logger } from '@/services/logger';
import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

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

            <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionHeader}>Diagnóstico</ThemedText>

                <Pressable style={styles.logButton} onPress={() => logger.shareLogs()}>
                    <Ionicons name="bug-outline" size={20} color="#fff" />
                    <Text style={styles.logButtonText}>Compartilhar Logs do App</Text>
                </Pressable>
                <Text style={styles.logDescription}>
                    Envie o histórico interno de erros via WhatsApp ou E-mail para facilitar o suporte em caso de falhas.
                </Text>
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
    logButton: {
        backgroundColor: '#1c2d4f',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 10,
        marginTop: 5,
        gap: 8
    },
    logButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    logDescription: {
        color: '#64748b',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center'
    },
});
