
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
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        checkGpsStatus();
        loadLogs();

        // Refresh logs periodically for demo purposes
        const interval = setInterval(loadLogs, 2000);
        return () => clearInterval(interval);
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
                // Logging is handled inside service
            } else {
                await startBackgroundLocation();
                setIsGpsEnabled(true);
            }
        } catch (error) {
            // Logging handled inside service
        }
    };

    const loadLogs = () => {
        setLogs([...logger.getLogs()]);
    };

    const handleShareLogs = async () => {
        await logger.shareLogs();
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
                            Permite rastreamento para auditoria de rotas.
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

            {/* Logs Section */}
            <View style={styles.section}>
                <View style={styles.logsHeader}>
                    <ThemedText type="subtitle">Logs do Sistema</ThemedText>
                    <Pressable onPress={handleShareLogs} style={styles.shareButton}>
                        <Ionicons name="share-outline" size={20} color="#1c2d4f" />
                        <Text style={styles.shareButtonText}>Enviar por Email</Text>
                    </Pressable>
                </View>

                <View style={styles.logsContainer}>
                    <FlatList
                        data={logs}
                        keyExtractor={(item, index) => index.toString()}
                        renderItem={({ item }) => (
                            <Text style={styles.logText}>{item}</Text>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>Nenhum log registrado.</Text>}
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
    logsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#f0f4ff',
    },
    shareButtonText: {
        fontSize: 12,
        color: '#1c2d4f',
        fontWeight: '600',
    },
    logsContainer: {
        backgroundColor: '#1e1e1e', // Terminal-like background
        borderRadius: 8,
        padding: 10,
        height: 300,
    },
    logText: {
        fontFamily: 'monospace', // Ensure monospaced font if available or rely on system
        color: '#00ff00', // Classic terminal green
        fontSize: 10,
        marginBottom: 4,
    },
    emptyText: {
        color: '#666',
        textAlign: 'center',
        marginTop: 20,
    },
});
