import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform, Linking } from 'react-native';
import { supabase } from './supabase';
import { logger } from './logger';
import { onNewLocation as autoCheckinOnNewLocation } from './auto-checkin-service';

export const LOCATION_TASK_NAME = 'background-location-task';

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

        const distFromLast = (lastSentLat !== null && lastSentLng !== null)
            ? haversine(lastSentLat, lastSentLng, latitude, longitude)
            : Infinity;

        const hasMoved = distFromLast >= MIN_DISTANCE_M;
        const needsHeartbeat = (now - lastHeartbeatTime) >= HEARTBEAT_MS;

        if (!hasMoved && !needsHeartbeat && !options.force) return;

        // Single UPDATE — no route history INSERT
        const { error } = await supabase
            .from('technicians')
            .update({
                last_latitude:  latitude,
                last_longitude: longitude,
                last_seen:      new Date().toISOString(),
                battery_level:  battery,
            })
            .eq('id', session.user.id);

        if (error) {
            logger.log(`[GPS] ❌ Update error: ${JSON.stringify(error)}`, 'error');
        } else {
            lastSentLat = latitude;
            lastSentLng = longitude;
            lastHeartbeatTime = now;
            logger.log(`[GPS] 📍 Position updated (moved ${distFromLast < Infinity ? distFromLast.toFixed(0) + 'm' : 'first'})`, 'info');

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

// ─── Public API ──────────────────────────────────────────────────────────────
export const startBackgroundLocation = async () => {
    try {
        console.log('[GPS] 🚀 Initializing...');

        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
            console.warn('[GPS] Foreground permission denied');
            return false;
        }

        // Background permission
        try {
            const { status: bgStatus, canAskAgain } = await Location.getBackgroundPermissionsAsync();
            if (bgStatus !== 'granted') {
                if (canAskAgain) {
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

        // Foreground watcher — highest resolution for active-app tracing
        if (foregroundSubscription) foregroundSubscription.remove();

        foregroundSubscription = await Location.watchPositionAsync(
            {
                accuracy:         Location.Accuracy.High,
                timeInterval:     30000, // Check every 30s — no need to hammer the DB
                distanceInterval: 50,    // Only fire when moved 50m
            },
            (location) => {
                const isFirstPing = lastSentLat === null;
                sendLocationUpdate(location, { force: isFirstPing });
            }
        );

        // Background service — high accuracy, wakes on 5m movement
        try {
            if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                    accuracy:            Location.Accuracy.High,
                    timeInterval:        60000,  // Wake at most every 60s
                    distanceInterval:    50,     // Wake on 50m movement
                    showsBackgroundLocationIndicator: true,
                    pausesUpdatesAutomatically: false,
                    activityType: Location.ActivityType.Other,
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
            if (Platform.OS === 'android' && e.message?.includes('Expo Go')) {
                Alert.alert(
                    'Expo Go — Limitação',
                    'Background GPS não funciona no Expo Go (Android). Use um APK de development build.',
                    [{ text: 'OK' }]
                );
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
