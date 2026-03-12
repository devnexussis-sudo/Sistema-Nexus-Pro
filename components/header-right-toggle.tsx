import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

export function HeaderRightToggle() {
    const [isOfflineMode, setIsOfflineMode] = useState(syncService.isOfflineModeEnabled());
    const [isConnected, setIsConnected] = useState(true);
    const [isSyncing, setIsSyncing] = useState(syncService.getSyncingState());
    const [isLoading, setIsLoading] = useState(false);
    const [label, setLabel] = useState('');

    useEffect(() => {
        const unNet = NetInfo.addEventListener(s => setIsConnected(!!s.isConnected));
        // Monitora mudança de fila (para atualizar isOfflineMode)
        const unQueue = syncService.subscribe(() => {
            setIsOfflineMode(syncService.isOfflineModeEnabled());
        });
        // Monitora isSyncing diretamente
        const unSync = syncService.subscribeSyncing((syncing) => {
            setIsSyncing(syncing);
            if (syncing) {
                setLabel('Sincronizando...');
            } else {
                setLabel('');
            }
        });
        return () => { unNet(); unQueue(); unSync(); };
    }, []);

    const isBusy = isLoading || isSyncing;
    const busyLabel = isSyncing ? 'Sincronizando...' : label;

    const handleToggle = async () => {
        if (isBusy) return;
        const goingOffline = !isOfflineMode;

        if (goingOffline) {
            if (!isConnected) {
                await syncService.toggleOfflineMode(true);
                setIsOfflineMode(true);
                Alert.alert('Modo Offline', 'Sem conexão — usando dados em cache.');
                return;
            }
            setIsLoading(true);
            setLabel('Carregando...');
            try {
                await syncService.toggleOfflineMode(true);
                setIsOfflineMode(true);
                const count = await syncService.prefetchTodayOrders();
                Alert.alert('📶 Modo Offline', count > 0 ? `${count} OS carregadas.` : 'Nenhuma OS aberta hoje.');
            } catch (_) {
                Alert.alert('Aviso', 'Erro ao carregar OS.');
            } finally {
                setIsLoading(false);
                setLabel('');
            }
        } else {
            // Volta online: toggleOfflineMode chama triggerSync internamente
            // O spinner aparece via subscribeSyncing — não precisa de estado local
            setIsOfflineMode(false);
            await syncService.toggleOfflineMode(false);
            Alert.alert('✅ Online', 'Conectado. Dados sincronizados!');
        }
    };

    const isEffectivelyOffline = isOfflineMode || !isConnected;
    const color = isBusy ? '#f59e0b' : isEffectivelyOffline ? '#ef4444' : '#10b981';

    return (
        <Pressable style={styles.container} onPress={handleToggle} disabled={isBusy}>
            <View style={[styles.badge, { backgroundColor: color }]}>
                {isBusy ? (
                    <>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.text}>{busyLabel}</Text>
                    </>
                ) : (
                    <>
                        <Ionicons name={isEffectivelyOffline ? 'cloud-offline' : 'cloud-done'} size={14} color="#fff" />
                        <Text style={styles.text}>{isEffectivelyOffline ? 'Offline' : 'Online'}</Text>
                    </>
                )}
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: { marginRight: 15, justifyContent: 'center', alignItems: 'center' },
    badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 4 },
    text: { color: '#fff', fontSize: 12, fontWeight: 'bold' }
});
