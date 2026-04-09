import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, Switch } from 'react-native';

export function HeaderRightToggle() {
    const [isOfflineMode, setIsOfflineMode] = useState(syncService.isOfflineModeEnabled());
    const [isConnected, setIsConnected] = useState(true);
    const [isSyncing, setIsSyncing] = useState(syncService.getSyncingState());
    const [isLoading, setIsLoading] = useState(false);
    const [label, setLabel] = useState('');

    useEffect(() => {
        const unNet = NetInfo.addEventListener(s => setIsConnected(!!s.isConnected));
        const unQueue = syncService.subscribe(() => {
            setIsOfflineMode(syncService.isOfflineModeEnabled());
        });
        const unSync = syncService.subscribeSyncing((syncing) => {
            setIsSyncing(syncing);
            if (syncing) {
                setLabel('Syncing');
            } else {
                setLabel('');
            }
        });
        return () => { unNet(); unQueue(); unSync(); };
    }, []);

    const isBusy = isLoading || isSyncing;
    const busyLabel = isSyncing ? 'Syncing...' : label;

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
            setLabel('Load...');
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
            setIsOfflineMode(false);
            await syncService.toggleOfflineMode(false);
            Alert.alert('✅ Online', 'Conectado. Dados sincronizados!');
        }
    };

    const isEffectivelyOffline = isOfflineMode || !isConnected;

    return (
        <View style={styles.container}>
            <View style={styles.badge}>
                {isBusy ? (
                    <>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.text}>{busyLabel}</Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.text}>{isEffectivelyOffline ? 'OFFLINE' : 'ONLINE'}</Text>
                        <Switch
                            trackColor={{ false: '#ef4444', true: '#10b981' }}
                            thumbColor="#ffffff"
                            ios_backgroundColor="#ef4444"
                            onValueChange={handleToggle}
                            value={!isEffectivelyOffline}
                            disabled={isBusy}
                            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }], marginLeft: 4 }}
                        />
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginRight: 15, justifyContent: 'center', alignItems: 'center' },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    text: { color: '#fff', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }
});
