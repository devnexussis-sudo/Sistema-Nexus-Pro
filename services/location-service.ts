import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Alert, Platform, Linking } from 'react-native';
import { supabase } from './supabase';
import { logger } from './logger';
import { onNewLocation as autoCheckinOnNewLocation } from './auto-checkin-service';

export const LOCATION_TASK_NAME = 'background-location-task';

// Detecção segura do Expo Go (Background Location em 2º plano no Expo Go causa crash no iOS)
const isExpoGo = Constants.appOwnership === 'expo' || (Constants as any).executionEnvironment === 'storeClient';

// ─── Thresholds (Regras de Negócio do GPS Duno) ──────────────────────────────
// 1. Movimento considerado apenas acima de 30 metros:
const MOVEMENT_THRESHOLD_M = 30;

// 2. Tempo de inatividade (< 30m) para transicionar o status no mapa para PARADO: 5 minutos
const STATIONARY_TIMEOUT_MS = 5 * 60 * 1000; // 300.000 ms

// 3. Heartbeat periódico quando parado: a cada 5 minutos (evita que o técnico fique offline no mapa)
const HEARTBEAT_STATIONARY_MS = 5 * 60 * 1000; // 300.000 ms

// 4. Precisão máxima aceitável do GPS: descarta leituras ruidosas acima de 40m
const ACCURACY_MAX_M = 40;

// ─── In-memory state ─────────────────────────────────────────────────────────
let foregroundSubscription: Location.LocationSubscription | null = null;
let lastSentLat: number | null = null;
let lastSentLng: number | null = null;
let lastSentTime = 0;
let stationaryStartTime: number | null = null;
let currentMotionState: 'EM MOVIMENTO' | 'PARADO' = 'PARADO';
let stationaryTimer: any = null;
let isProcessing = false;

// ─── Haversine distance ──────────────────────────────────────────────────────
const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R  = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Battery helper ──────────────────────────────────────────────────────────
const getBattery = async (): Promise<number | null> => {
    try {
        const level = await Battery.getBatteryLevelAsync();
        return level !== -1 ? Math.round(level * 100) : null;
    } catch { return null; }
};

interface SendLocationOptions {
    force?: boolean;
    reason?: string;
}

// ─── Core: Atualização de Posição em Tempo Real (Sem Histórico / Sem Pooling) ──
const sendLocationUpdate = async (
    location: Location.LocationObject,
    options: SendLocationOptions = {}
) => {
    if (isProcessing) return;
    isProcessing = true;

    const { latitude, longitude, accuracy } = location.coords;
    const now = Date.now();

    try {
        // Descartar leituras ruidosas do GPS (exceto se for pulso forçado)
        if (accuracy && accuracy > ACCURACY_MAX_M && !options.force) {
            logger.log(`[GPS] ⛔ Descartado por imprecisão: accuracy=${accuracy?.toFixed(0)}m > ${ACCURACY_MAX_M}m`, 'info');
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        // Distância em relação à última coordenada enviada com sucesso ao banco
        const distFromLast = (lastSentLat !== null && lastSentLng !== null)
            ? haversine(lastSentLat, lastSentLng, latitude, longitude)
            : Infinity;

        // Velocidade instantânea do GPS (m/s -> km/h)
        let currentSpeedKmh = 0;
        const { speed: rawSpeed } = location.coords;
        if (rawSpeed !== null && rawSpeed !== undefined && rawSpeed >= 0) {
            currentSpeedKmh = rawSpeed * 3.6;
        }

        let shouldSend = false;
        let nextMotionState: 'EM MOVIMENTO' | 'PARADO' = currentMotionState;
        let reason = options.reason || '';

        // ── REGRA 1: Pulso Forçado (Login no app, abertura do app ou mudança de status de OS) ──
        if (options.force || lastSentLat === null) {
            shouldSend = true;
            nextMotionState = (distFromLast >= MOVEMENT_THRESHOLD_M && currentSpeedKmh >= 3.5) ? 'EM MOVIMENTO' : 'PARADO';
            if (nextMotionState === 'PARADO') {
                stationaryStartTime = now;
            } else {
                stationaryStartTime = null;
            }
            reason = reason || (lastSentLat === null ? 'PRIMEIRO_PULSO_LOGIN' : 'PULSO_FORCADO');
        }
        // ── REGRA 2: Movimento REAL acima de 30 metros ──
        else if (distFromLast >= MOVEMENT_THRESHOLD_M) {
            // Técnico se moveu 30 metros ou mais!
            shouldSend = true;
            nextMotionState = 'EM MOVIMENTO';
            stationaryStartTime = null; // Reseta contador de tempo parado
            reason = `MOVIMENTO_${distFromLast.toFixed(0)}M`;

            // Agenda/reinicia timer de 5 minutos para transicionar para PARADO caso pare de se mover
            if (stationaryTimer) clearTimeout(stationaryTimer);
            stationaryTimer = setTimeout(async () => {
                await checkAndTransitionToStationary();
            }, STATIONARY_TIMEOUT_MS);
        }
        // ── REGRA 3: Movimento MENOR que 30 metros (Parado ou oscilação local) ──
        else {
            // Se estiver se movimentando menos de 30 metros, NÃO envia nada ao banco
            if (stationaryStartTime === null) {
                stationaryStartTime = now;
            }

            const stationaryDuration = now - stationaryStartTime;

            // Se ficar parado em menos de 30 metros por mais de 5 minutos:
            if (stationaryDuration >= STATIONARY_TIMEOUT_MS) {
                // Se o status anterior era 'EM MOVIMENTO', agora muda obrigatoriamente para 'PARADO'
                if (currentMotionState === 'EM MOVIMENTO') {
                    shouldSend = true;
                    nextMotionState = 'PARADO';
                    currentSpeedKmh = 0;
                    reason = 'PARADO_MAIS_DE_5MIN';
                }
                // Se já estava 'PARADO', envia apenas o heartbeat a cada 5 minutos para manter online no mapa
                else if ((now - lastSentTime) >= HEARTBEAT_STATIONARY_MS) {
                    shouldSend = true;
                    nextMotionState = 'PARADO';
                    currentSpeedKmh = 0;
                    reason = 'HEARTBEAT_5MIN_PARADO';
                } else {
                    // Menos de 5 minutos desde o último envio enquanto parado: NÃO ENVIA NADA
                    shouldSend = false;
                }
            } else {
                // Menos de 5 minutos parado e deslocou menos de 30m: NÃO ENVIA NADA (Sem pooling)
                shouldSend = false;
            }
        }

        // Se a regra determinou que não deve enviar, aborta aqui para evitar pooling desnecessário
        if (!shouldSend) {
            return;
        }

        // Se o novo estado for PARADO, limpa o timer pendente
        if (nextMotionState === 'PARADO' && stationaryTimer) {
            clearTimeout(stationaryTimer);
            stationaryTimer = null;
        }

        const battery = await getBattery();
        const deviceModel = Device.modelName || Device.brand || Platform.OS || 'Desconhecido';

        // UPDATE na tabela `technicians` — sem INSERT em rotas
        const { error } = await supabase
            .from('technicians')
            .update({
                last_latitude:  latitude,
                last_longitude: longitude,
                last_seen:      new Date().toISOString(),
                battery_level:  battery,
                device_model:   deviceModel,
                motion_state:   nextMotionState,
                speed:          nextMotionState === 'EM MOVIMENTO' ? Math.round(currentSpeedKmh) : 0,
            })
            .eq('id', session.user.id);

        if (error) {
            logger.log(`[GPS] ❌ Erro ao atualizar status: ${JSON.stringify(error)}`, 'error');
        } else {
            lastSentLat = latitude;
            lastSentLng = longitude;
            lastSentTime = now;
            currentMotionState = nextMotionState;
            logger.log(`[GPS] 📍 Pulso enviado (${reason}) — Status: ${nextMotionState}, Dist: ${distFromLast < Infinity ? distFromLast.toFixed(0) + 'm' : 'primeiro'}, Vel: ${Math.round(currentSpeedKmh)}km/h`, 'info');

            // Auto Check-in: verificar proximidade com o cliente
            autoCheckinOnNewLocation(latitude, longitude).catch(() => {});
        }

    } catch (err) {
        console.error('[GPS] Sync error:', err);
    } finally {
        isProcessing = false;
    }
};

// ─── Transição automática para PARADO após 5 minutos de inatividade ────────────
const checkAndTransitionToStationary = async () => {
    try {
        if (currentMotionState !== 'EM MOVIMENTO') return;
        const now = Date.now();
        if (stationaryStartTime !== null && (now - stationaryStartTime) >= STATIONARY_TIMEOUT_MS) {
            const pos = await Location.getLastKnownPositionAsync().catch(() => null);
            if (pos) {
                await sendLocationUpdate(pos, { force: true, reason: 'TIMEOUT_5MIN_PARADO' });
            } else if (lastSentLat !== null && lastSentLng !== null) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    await supabase
                        .from('technicians')
                        .update({
                            last_seen:    new Date().toISOString(),
                            motion_state: 'PARADO',
                            speed:        0,
                        })
                        .eq('id', session.user.id);
                    currentMotionState = 'PARADO';
                    lastSentTime = now;
                    logger.log('[GPS] 📍 Status atualizado para PARADO após 5min sem deslocamento > 30m', 'info');
                }
            }
        }
    } catch (e) {
        console.warn('[GPS] Erro ao transicionar para parado:', e);
    }
};

/**
 * Força o envio imediato de um pulso de localização ao banco.
 * Utilizado exclusivamente em:
 * 1. Login no app / abertura do app
 * 2. Mudanças de status de OS (deslocamento, check-in, execução, conclusão, impedimento)
 */
export const sendForcedLocationPulse = async (reason: string = 'FORCED'): Promise<void> => {
    try {
        let pos = await Location.getLastKnownPositionAsync().catch(() => null);
        if (!pos) {
            pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        }
        if (pos) {
            await sendLocationUpdate(pos, { force: true, reason });
        }
    } catch (err) {
        console.warn(`[GPS] Falha no pulso forçado (${reason}):`, err);
    }
};

// ─── Background Task Definition ──────────────────────────────────────────────
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        logger.log(`[GPS Task] Error: ${error.message}`, 'error');
        return;
    }
    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        if (locations?.length > 0) {
            const best = locations.reduce((a, b) =>
                (a.coords.accuracy ?? 999) <= (b.coords.accuracy ?? 999) ? a : b
            );
            await sendLocationUpdate(best);
        }
    }
});

// ─── Google Play Compliant Prominent Disclosure Helper ───────────────────────
const showBackgroundLocationDisclosure = (): Promise<boolean> => {
    return new Promise((resolve) => {
        Alert.alert(
            'Uso da Localização em Segundo Plano',
            'O aplicativo Duno coleta seus dados de localização para permitir o rastreamento contínuo de rotas de atendimento e registrar seu deslocamento técnico em tempo real, MESMO QUANDO O APLICATIVO ESTIVER FECHADO OU EM SEGUNDO PLANO.\n\nEsses dados são utilizados exclusivamente para a execução das ordens de serviço da sua empresa.',
            [
                {
                    text: 'Agora Não',
                    style: 'cancel',
                    onPress: () => resolve(false),
                },
                {
                    text: 'Entendi e Concordo',
                    onPress: () => resolve(true),
                },
            ],
            { cancelable: false }
        );
    });
};

// ─── Public API ──────────────────────────────────────────────────────────────
export const startBackgroundLocation = async () => {
    try {
        console.log('[GPS] 🚀 Initializing...');

        // 1. Permissão de Primeiro Plano (Foreground) — segura em todas as plataformas
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
            console.warn('[GPS] Foreground permission denied');
            return false;
        }

        // 2. Permissão de Segundo Plano (Background)
        // ⚠️ ATENÇÃO: No Expo Go (iOS e Android), solicitar permissão de background ou rodar tasks
        // de background crasha/fecha o Expo Go imediatamente por restrições do sandbox da Apple/Google.
        // O rastreamento em 2º plano completo funciona em builds Standalone ou Development Build (IPA/APK).
        if (!isExpoGo) {
            try {
                const { status: bgStatus, canAskAgain } = await Location.getBackgroundPermissionsAsync();
                if (bgStatus !== 'granted') {
                    if (canAskAgain) {
                        // 🛡️ Prominent Disclosure exigida pelas políticas de lojas
                        const userAccepted = await showBackgroundLocationDisclosure();
                        if (!userAccepted) {
                            console.warn('[GPS] Background permission disclosure declined by user');
                            return false;
                        }

                        const { status } = await Location.requestBackgroundPermissionsAsync();
                        if (status !== 'granted') throw new Error('BACKGROUND_DENIED');
                    } else {
                        Alert.alert(
                            'Rastreamento em Segundo Plano',
                            'Para rastreio contínuo, vá em Configurações > Permissões > Localização → "Permitir o tempo todo".',
                            [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                    text: 'Configurações',
                                    onPress: () => Platform.OS === 'ios'
                                        ? Linking.openURL('app-settings:')
                                        : Linking.openSettings()
                                }
                            ]
                        );
                        return false;
                    }
                }
            } catch (e: any) {
                if (e.message === 'BACKGROUND_DENIED') {
                    console.warn('[GPS] Background permission denied');
                    return false;
                }
                console.warn('[GPS] Background permission check failed:', e);
            }
        } else {
            console.log('[GPS] ℹ️ Expo Go detectado: Rastreamento ativo em primeiro plano (Background GPS requer Development Client ou Standalone Build)');
        }

        // 3. Foreground watcher — rastreamento contínuo em primeiro plano (limiar de 30m)
        if (foregroundSubscription) foregroundSubscription.remove();

        foregroundSubscription = await Location.watchPositionAsync(
            {
                accuracy:         Location.Accuracy.High,
                timeInterval:     10000, // 10 segundos
                distanceInterval: 30,    // 30 metros de deslocamento
            },
            (location) => {
                const isFirstPing = lastSentLat === null;
                sendLocationUpdate(location, { force: isFirstPing, reason: isFirstPing ? 'LOGIN_APP_START' : undefined });
            }
        );

        // 4. Background service via TaskManager — APENAS em builds Standalone / Dev Client
        if (!isExpoGo) {
            try {
                if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
                    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                        accuracy:            Location.Accuracy.High,
                        timeInterval:        30000,  // 30s em background
                        distanceInterval:    30,     // 30 metros
                        deferredUpdatesInterval: 30000, // For iOS
                        deferredUpdatesDistance: 30,    // For iOS
                        showsBackgroundLocationIndicator: true,
                        pausesUpdatesAutomatically: false,
                        activityType: Location.ActivityType.AutomotiveNavigation,
                        foregroundService: {
                            notificationTitle: 'Duno — Localização Ativa',
                            notificationBody:  'Compartilhando sua localização em tempo real.',
                            notificationColor: '#1c2d4f',
                            killServiceOnDestroy: false,
                        },
                    });
                    console.log('[GPS] ✅ Background service started');
                }
            } catch (e: any) {
                console.warn('[GPS] Background start error:', e);
            }
        }

        logger.log('Serviço GPS iniciado', 'info');
        return true;

    } catch (error: any) {
        console.error('[GPS] ❌ Fatal:', error);
        logger.log(`Erro ao iniciar GPS: ${error.message || error}`, 'error');
        return false;
    }
};

export const stopBackgroundLocation = async () => {
    try {
        if (stationaryTimer) {
            clearTimeout(stationaryTimer);
            stationaryTimer = null;
        }
        if (foregroundSubscription) {
            foregroundSubscription.remove();
            foregroundSubscription = null;
        }

        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
        if (isStarted) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        }

        logger.log('Serviço GPS parado', 'warn');
    } catch (error) {
        console.warn('[GPS] Stop error:', error);
    }
};

export const isLocationRunning = async (): Promise<boolean> => {
    try {
        const bgStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
        return bgStarted || foregroundSubscription !== null;
    } catch (e) {
        return foregroundSubscription !== null;
    }
};
