import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

export function HeaderRightToggle() {
    const [isOfflineMode, setIsOfflineMode] = useState(syncService.isOfflineModeEnabled());
    const [isConnected, setIsConnected] = useState(true);
    const [isBusy, setIsBusy] = useState(false);
    const [busyLabel, setBusyLabel] = useState('');

    useEffect(() => {
        const unsubscribeNet = NetInfo.addEventListener(state => {
            setIsConnected(!!state.isConnected);
        });
        const unsubscribeSync = syncService.subscribe(() => {
            setIsOfflineMode(syncService.isOfflineModeEnabled());
        });
        return () => { unsubscribeNet(); unsubscribeSync(); };
    }, []);

    const handleToggle = async () => {
        if (isBusy) return;
        const newVal = !isOfflineMode;

        if (newVal) {
            // Ativando offline: pré-carregar OS do dia
            if (!isConnected) {
                await syncService.toggleOfflineMode(true);
                setIsOfflineMode(true);
                Alert.alert('Modo Offline', 'Sem conexão — usando dados em cache.');
                return;
            }
            setIsBusy(true);
            setBusyLabel('Carregando...');
            try {
                await syncService.toggleOfflineMode(true);
                setIsOfflineMode(true);
                const count = await syncService.prefetchTodayOrders((c, t) => setBusyLabel(`${c}/${t} OS`));
                Alert.alert('📶 Modo Offline', count > 0 ? `${count} OS carregadas para uso offline.` : 'Nenhuma OS aberta para hoje.');
            } catch (_) {
                Alert.alert('Aviso', 'Erro ao carregar OS.');
            } finally {
                setIsBusy(false);
                setBusyLabel('');
            }
        } else {
            // Voltando online: sincronizar
            setIsBusy(true);
            setBusyLabel('Sincronizando...');
            try {
                await syncService.toggleOfflineMode(false);
                setIsOfflineMode(false);
                Alert.alert('✅ Online', 'Dados sincronizados com sucesso!');
            } catch (_) {
                Alert.alert('Aviso', 'Erro na sincronização. Tente novamente.');
            } finally {
                setIsBusy(false);
                setBusyLabel('');
            }
        }
    };

    const isEffectivelyOffline = isOfflineMode || !isConnected;

    return (
        <Pressable style={styles.container} onPress={handleToggle} disabled={isBusy}>
            <View style={[styles.badge, { backgroundColor: isBusy ? '#f59e0b' : isEffectivelyOffline ? '#ef4444' : '#10b981' }]}>
                {isBusy ? (
                    <>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.text}>{busyLabel}</Text>
                    </>
                ) : (
                    <>
                        <Ionicons name={isEffectivelyOffline ? "cloud-offline" : "cloud-done"} size={14} color="#fff" />
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
