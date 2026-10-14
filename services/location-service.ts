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

// ─── Thresholds ──────────────────────────────────────────────────────────────
// Only send a real-time position update when the tech moves at least this far.
// No route history is stored — we only keep the CURRENT position in the
// `technicians` table (last_latitude, last_longitude, last_seen, battery_level).
const MIN_DISTANCE_M = 50;   // Minimum movement before sending an update
const HEARTBEAT_MS  = 5 * 60 * 1000; // Presence ping every 5 min when stationary
const ACCURACY_MAX_M = 40;   // Discard noisy GPS readings

// ─── In-memory state ─────────────────────────────────────────────────────────
let foregroundSubscription: Location.LocationSubscription | null = null;
let lastSentLat: number | null = null;
let lastSentLng: number | null = null;
let lastSentTime = 0;
let lastMovingTime = 0;
let lastHeartbeatTime = 0;
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

// ─── Core: Real-time position update (no route history) ──────────────────────
// Only updates the `technicians` row — no INSERT anywhere.
const sendLocationUpdate = async (
    location: Location.LocationObject,
    options: { force?: boolean } = {}
) => {
    if (isProcessing) return;
    isProcessing = true;

    const { latitude, longitude, accuracy } = location.coords;
    const now = Date.now();

    try {
        // Drop noisy GPS readings
        if (accuracy && accuracy > ACCURACY_MAX_M && !options.force) {
            logger.log(`[GPS] ⛔ Discarded, accuracy=${accuracy?.toFixed(0)}m`, 'info');
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const battery = await getBattery();

        const timeDeltaSec = lastSentTime > 0 ? (now - lastSentTime) / 1000 : 0;
        const distFromLast = (lastSentLat !== null && lastSentLng !== null)
            ? haversine(lastSentLat, lastSentLng, latitude, longitude)
            : Infinity;

        // 1. Velocidade instantânea do GPS (m/s -> km/h) com fallback por deslocamento
        let currentSpeedKmh = 0;
        const { speed: rawSpeed } = location.coords;
        if (rawSpeed !== null && rawSpeed !== undefined && rawSpeed >= 0) {
            currentSpeedKmh = rawSpeed * 3.6;
        } else if (timeDeltaSec > 0 && distFromLast < Infinity) {
            currentSpeedKmh = (distFromLast / timeDeltaSec) * 3.6;
        }

        // 2. Detecção inteligente de movimento:
        // - Velocidade >= 3.5 km/h (caminhada rápida ou veículo) OU deslocamento >= 20 metros
        const isCurrentlyMoving = currentSpeedKmh >= 3.5 || distFromLast >= 20;
        if (isCurrentlyMoving) {
            lastMovingTime = now;
        }

        // Tolerância para paradas rápidas (ex: semáforos/cruzamentos nos últimos 45s mantêm 'EM MOVIMENTO')
        const isMoving = isCurrentlyMoving || (lastMovingTime > 0 && (now - lastMovingTime) < 45000);
        const motionState = isMoving ? 'EM MOVIMENTO' : 'PARADO';

        // 3. Frequência de envio inteligente:
        // - Em movimento: envia a cada 20m ou a cada 12 segundos
        // - Parado: envia heartbeat a cada 60s para economizar bateria e banco
        const shouldSend = 
            options.force ||
            lastSentLat === null ||
            (isCurrentlyMoving && (distFromLast >= 20 || timeDeltaSec >= 12)) ||
            (!isMoving && (now - lastHeartbeatTime) >= 60000);

        if (!shouldSend) return;

        const deviceModel = Device.modelName || Device.brand || Platform.OS || 'Desconhecido';

        // Single UPDATE com speed em km/h e motion_state preciso
        const { error } = await supabase
            .from('technicians')
            .update({
                last_latitude:  latitude,
                last_longitude: longitude,
                last_seen:      new Date().toISOString(),
                battery_level:  battery,
                device_model:   deviceModel,
                motion_state:   motionState,
                speed:          Math.round(currentSpeedKmh),
            })
            .eq('id', session.user.id);

        if (error) {
            logger.log(`[GPS] ❌ Update error: ${JSON.stringify(error)}`, 'error');
        } else {
            lastSentLat = latitude;
            lastSentLng = longitude;
            lastSentTime = now;
            lastHeartbeatTime = now;
            logger.log(`[GPS] 📍 Position updated (state: ${motionState}, speed: ${Math.round(currentSpeedKmh)}km/h, dist: ${distFromLast < Infinity ? distFromLast.toFixed(0) + 'm' : 'first'})`, 'info');

            // Auto Check-in: check proximity to client
            autoCheckinOnNewLocation(latitude, longitude).catch(() => {});
        }

    } catch (err) {
        console.error('[GPS] Sync error:', err);
    } finally {
        isProcessing = false;
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

        // 3. Foreground watcher — rastreamento contínuo em tempo real enquanto o app está aberto
        if (foregroundSubscription) foregroundSubscription.remove();

        foregroundSubscription = await Location.watchPositionAsync(
            {
                accuracy:         Location.Accuracy.High,
                timeInterval:     8000, // 8 segundos para resposta ágil no carro
                distanceInterval: 12,   // ou a cada 12 metros de deslocamento
            },
            (location) => {
                const isFirstPing = lastSentLat === null;
                sendLocationUpdate(location, { force: isFirstPing });
            }
        );

        // 4. Background service via TaskManager — APENAS em builds Standalone / Dev Client
        if (!isExpoGo) {
            try {
                if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
                    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                        accuracy:            Location.Accuracy.High,
                        timeInterval:        15000,  // 15s em background
                        distanceInterval:    20,     // 20 metros
                        deferredUpdatesInterval: 15000, // For iOS
                        deferredUpdatesDistance: 20,    // For iOS
                        showsBackgroundLocationIndicator: true,
                        pausesUpdatesAutomatically: false,
                        activityType: Location.ActivityType.AutomotiveNavigation,
                        foregroundService: {
                            notificationTitle: 'Nexus Pro — Localização Ativa',
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
