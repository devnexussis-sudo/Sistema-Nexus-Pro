import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform, Linking } from 'react-native';
import { supabase } from './supabase';
import { logger } from './logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_TASK_NAME = 'background-location-task';

// ─── Thresholds ──────────────────────────────────────────────────────────────
const MOVEMENT_PING_M         = 5;     // Send a route ping every ≥5 m of movement
const STATIONARY_THRESHOLD_M  = 50;   // <50 m from anchor = "stationary"
const STOP_STATUS_MS          = 10 * 60 * 1000;   // 10 min  → "stopped"
const STOP_LONG_MS            = 2  * 60 * 60 * 1000;  // 2 h → "stopped_over_2h"
const OFFLINE_MS              = 8  * 60 * 60 * 1000;  // 8 h → "offline"
const HEARTBEAT_INTERVAL_MS   = 5  * 60 * 1000;   // Keep-alive every 5 min when stationary
const ACCURACY_MAX_M          = 40;   // Discard readings worse than 40 m accuracy

// ─── Storage keys ────────────────────────────────────────────────────────────
const KEY_LAST_LOC   = '@nexus:last_location';
const KEY_LAST_HB    = '@nexus:last_heartbeat';
const KEY_LAST_MOVE  = '@nexus:last_movement';
const KEY_ANCHOR     = '@nexus:stop_anchor';   // The point where the tech stopped
const KEY_LAST_DATE  = '@nexus:last_gps_date'; // YYYY-MM-DD of last ping

// ─── In-memory state ─────────────────────────────────────────────────────────
let foregroundSubscription: Location.LocationSubscription | null = null;
let stationaryTimer: ReturnType<typeof setTimeout> | null = null;
let stopStatusSent: 'none' | 'stopped' | 'stopped_over_2h' | 'offline' = 'none';
let lastSentLocation: { lat: number; lng: number } | null = null;
let anchorLocation:   { lat: number; lng: number } | null = null;
let lastHeartbeatTime = 0;
let lastMovementTime  = 0;
let stateHydrated     = false;
let isProcessing      = false;

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

// ─── Midnight reset: clear route on first ping of a new day ─────────────────
const checkMidnightReset = async (userId: string): Promise<boolean> => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    try {
        const stored = await AsyncStorage.getItem(KEY_LAST_DATE);
        if (stored && stored !== today) {
            // New day — reset the route on the server
            logger.log(`[GPS] 🌙 New day (${today}), sending midnight reset`, 'info');
            await supabase.rpc('reset_tech_daily_route', { p_user_id: userId });
            // Reset local movement time so stationary timers start fresh
            lastMovementTime = Date.now();
            anchorLocation   = null;
            stopStatusSent   = 'none';
            await AsyncStorage.multiRemove([KEY_ANCHOR, KEY_LAST_MOVE]);
        }
        await AsyncStorage.setItem(KEY_LAST_DATE, today);
        return stored !== null && stored !== today;
    } catch (e) {
        console.warn('[GPS] Midnight reset check error:', e);
        return false;
    }
};

// ─── Stationary status machine ───────────────────────────────────────────────
const sendStatusUpdate = async (
    status: 'stopped' | 'stopped_over_2h' | 'offline',
    lat: number, lng: number, battery: number | null
) => {
    if (stopStatusSent === status) return; // Already sent
    try {
        logger.log(`[GPS] 📌 Status → ${status}`, 'warn');
        await supabase.rpc('update_tech_status', {
            p_lat:    lat,
            p_lng:    lng,
            p_status: status,
            p_battery: battery,
        });
        stopStatusSent = status;
    } catch (e) {
        console.warn('[GPS] Status update error:', e);
    }
};

// Schedule rolling status checks after the tech stops moving
const scheduleStationaryChecks = (lat: number, lng: number) => {
    if (stationaryTimer) clearTimeout(stationaryTimer);

    const stoppedAt = Date.now();

    const tick = async () => {
        const elapsed = Date.now() - stoppedAt;
        const battery = await getBattery();

        if (elapsed >= OFFLINE_MS) {
            await sendStatusUpdate('offline', lat, lng, battery);
            // No more checks needed
        } else if (elapsed >= STOP_LONG_MS) {
            await sendStatusUpdate('stopped_over_2h', lat, lng, battery);
            stationaryTimer = setTimeout(tick, OFFLINE_MS - elapsed);
        } else if (elapsed >= STOP_STATUS_MS) {
            await sendStatusUpdate('stopped', lat, lng, battery);
            stationaryTimer = setTimeout(tick, STOP_LONG_MS - elapsed);
        } else {
            stationaryTimer = setTimeout(tick, STOP_STATUS_MS - elapsed);
        }
    };

    stationaryTimer = setTimeout(tick, STOP_STATUS_MS);
};

// Cancel all stationary timers when the tech resumes movement
const cancelStationaryChecks = () => {
    if (stationaryTimer) { clearTimeout(stationaryTimer); stationaryTimer = null; }
};

// ─── Hydrate in-memory state from AsyncStorage ───────────────────────────────
const hydrateState = async () => {
    if (stateHydrated) return;
    try {
        const [loc, hb, move, anchor] = await Promise.all([
            AsyncStorage.getItem(KEY_LAST_LOC),
            AsyncStorage.getItem(KEY_LAST_HB),
            AsyncStorage.getItem(KEY_LAST_MOVE),
            AsyncStorage.getItem(KEY_ANCHOR),
        ]);
        if (loc)    lastSentLocation  = JSON.parse(loc);
        if (hb)    lastHeartbeatTime  = parseInt(hb,  10);
        if (move)  lastMovementTime   = parseInt(move, 10);
        if (anchor) anchorLocation    = JSON.parse(anchor);
    } catch { /* ignore */ }
    stateHydrated = true;
};

// ─── Core send function ──────────────────────────────────────────────────────
const sendLocationUpdate = async (
    location: Location.LocationObject,
    options: { force?: boolean } = {}
) => {
    if (isProcessing) return;
    isProcessing = true;

    const { latitude, longitude, speed, heading, accuracy } = location.coords;
    const now = Date.now();

    try {
        // Drop noisy / weak GPS readings
        if (accuracy && accuracy > ACCURACY_MAX_M && !options.force) {
            logger.log(`[GPS] ⛔ Discarded, accuracy=${accuracy?.toFixed(0)}m`, 'info');
            return;
        }

        await hydrateState();

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const userId  = session.user.id;
        const battery = await getBattery();

        // Midnight reset check before doing anything else
        await checkMidnightReset(userId);

        const distFromLast = lastSentLocation
            ? haversine(lastSentLocation.lat, lastSentLocation.lng, latitude, longitude)
            : Infinity;

        const distFromAnchor = anchorLocation
            ? haversine(anchorLocation.lat, anchorLocation.lng, latitude, longitude)
            : Infinity;

        const isMoving = distFromLast >= MOVEMENT_PING_M;
        const resumedFromStop = anchorLocation !== null && distFromAnchor >= STATIONARY_THRESHOLD_M;

        const needsHeartbeat = (now - lastHeartbeatTime) >= HEARTBEAT_INTERVAL_MS;

        if (!isMoving && !needsHeartbeat && !options.force) return;

        if (isMoving || options.force) {
            // ── Movement ping: full route telemetry ──────────────────────────
            logger.log(
                `[GPS] 🚀 Move ${distFromLast < Infinity ? distFromLast.toFixed(1) + 'm' : 'first'} acc=${accuracy?.toFixed(0)}m`,
                'info'
            );

            const { error } = await supabase.rpc('update_tech_location_v2', {
                p_lat:      latitude,
                p_lng:      longitude,
                p_speed:    speed    ?? 0,
                p_heading:  heading  ?? 0,
                p_accuracy: accuracy ?? 0,
                p_battery:  battery,
            });

            if (error) {
                logger.log(`[GPS] ❌ ERRO_BANCO_DE_DADOS: ${JSON.stringify(error)}`, 'error');
            }

            if (!error) {
                lastSentLocation  = { lat: latitude, lng: longitude };
                lastHeartbeatTime = now;

                if (resumedFromStop || distFromLast >= STATIONARY_THRESHOLD_M) {
                    // Tech has moved meaningfully — reset stationary state
                    lastMovementTime  = now;
                    anchorLocation    = null;
                    stopStatusSent    = 'none';
                    cancelStationaryChecks();

                    await Promise.all([
                        AsyncStorage.setItem(KEY_LAST_MOVE, now.toString()),
                        AsyncStorage.removeItem(KEY_ANCHOR),
                    ]);

                    logger.log('[GPS] ▶️ Movement resumed / anchor cleared', 'info');
                } else if (!anchorLocation) {
                    // First ping but not yet far from where we stopped — keep anchor
                    lastMovementTime = now;
                    anchorLocation   = { lat: latitude, lng: longitude };
                    await Promise.all([
                        AsyncStorage.setItem(KEY_LAST_MOVE, now.toString()),
                        AsyncStorage.setItem(KEY_ANCHOR, JSON.stringify(anchorLocation)),
                    ]);
                    scheduleStationaryChecks(latitude, longitude);
                }

                await AsyncStorage.setItem(KEY_LAST_LOC, JSON.stringify(lastSentLocation));
                await AsyncStorage.setItem(KEY_LAST_HB,  now.toString());
            }

        } else if (needsHeartbeat) {
            // ── Stationary heartbeat: keep-alive only ────────────────────────
            logger.log('[GPS] 💓 Heartbeat (stationary)', 'info');

            const { error } = await supabase.rpc('tech_heartbeat', { p_battery: battery });
            if (!error) {
                lastHeartbeatTime = now;
                await AsyncStorage.setItem(KEY_LAST_HB, now.toString());
            }

            // Set anchor on very first heartbeat after stopping
            if (!anchorLocation) {
                anchorLocation = { lat: latitude, lng: longitude };
                await AsyncStorage.setItem(KEY_ANCHOR, JSON.stringify(anchorLocation));
                scheduleStationaryChecks(latitude, longitude);
                logger.log(`[GPS] 📍 Anchor set at ${latitude.toFixed(5)},${longitude.toFixed(5)}`, 'info');
            }
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
            // Use the most recent & most accurate reading from the batch
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
                accuracy:         Location.Accuracy.BestForNavigation,
                timeInterval:     3000,  // Check every 3s
                distanceInterval: 5,     // OS fires event after 5m — matches our threshold
            },
            (location) => {
                const isFirstPing = !lastSentLocation;
                sendLocationUpdate(location, { force: isFirstPing });
            }
        );

        // Background service — high accuracy, wakes on 5m movement
        try {
            if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                    accuracy:            Location.Accuracy.High,
                    timeInterval:        10000,  // Wake at least every 10s
                    distanceInterval:    5,      // Wake on 5m movement
                    showsBackgroundLocationIndicator: true,
                    pausesUpdatesAutomatically: false,
                    activityType: Location.ActivityType.AutomotiveNavigation,
                    foregroundService: {
                        notificationTitle: 'Nexus Pro — GPS Ativo',
                        notificationBody:  'Rastreamento de rota em andamento.',
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
        cancelStationaryChecks();

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
