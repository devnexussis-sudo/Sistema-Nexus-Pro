import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform, Linking } from 'react-native';
import { supabase } from './supabase';
import { logger } from './logger';

import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_TASK_NAME = 'background-location-task';
const STORAGE_KEY_LAST_LOC = '@nexus:last_location';
const STORAGE_KEY_LAST_HB = '@nexus:last_heartbeat';
const MOVEMENT_THRESHOLD = 30; // metros
const HEARTBEAT_INTERVAL = 15 * 60 * 1000; // 15 minutos

let foregroundSubscription: Location.LocationSubscription | null = null;
let lastSentLocation: { lat: number; lng: number } | null = null;
let lastHeartbeatTime: number = 0;
let isProcessing = false;

/**
 * ✅ Calculate distance between two points in meters (Haversine Formula)
 */
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// ✅ Reusable function to sync location to Supabase
const sendLocationUpdate = async (location: Location.LocationObject) => {
    if (isProcessing) return;

    const { latitude, longitude, speed, heading, accuracy } = location.coords;
    const now = Date.now();

    // 🛡️ FILTRO DE PRECISÃO (Evitar pings de jitter/ indoor drift)
    // Se a precisão for pior que 100m, ignoramos para o log de histórico.
    if (accuracy && accuracy > 100) {
        // Apenas logamos internamente mas não subimos pro banco
        console.log(`[Location] 🛰️ GPS Signal weak (accuracy: ${accuracy.toFixed(1)}m). Skipping update.`);
        return;
    }

    isProcessing = true;

    try {
        // 1. CARREGAR ESTADOS (Se ainda não estiver em memória)
        if (!lastSentLocation) {
            try {
                const [storedLoc, storedHB] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEY_LAST_LOC),
                    AsyncStorage.getItem(STORAGE_KEY_LAST_HB)
                ]);
                if (storedLoc) lastSentLocation = JSON.parse(storedLoc);
                if (storedHB) lastHeartbeatTime = parseInt(storedHB, 10);
            } catch (e) { /* ignore */ }
        }

        // 2. FILTRO INTELIGENTE E HEARTBEAT
        let distance = 0;
        if (lastSentLocation) {
            distance = calculateDistance(lastSentLocation.lat, lastSentLocation.lng, latitude, longitude);
        }

        const isMoving = !lastSentLocation || distance >= MOVEMENT_THRESHOLD;
        const needsHeartbeat = (now - lastHeartbeatTime) >= HEARTBEAT_INTERVAL;

        // Se estiver parado E não chegou a hora do heartbeat, ignora tudo.
        if (!isMoving && !needsHeartbeat) {
            isProcessing = false;
            return;
        }

        // 🔋 Battery Fetch
        let batteryLevel = null;
        try {
            const level = await Battery.getBatteryLevelAsync();
            if (level !== -1) batteryLevel = Math.round(level * 100);
        } catch (e) { }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            isProcessing = false;
            return;
        }

        if (isMoving) {
            // 🎯 MOVIMENTAÇÃO REAL (>30m): Update Full + Ping Log
            logger.log(`[Location] 🚀 Movimentação detectada (${distance.toFixed(1)}m). Enviando telemetria...`, 'info');
            const { error: rpcError } = await supabase.rpc('update_tech_location_v2', {
                p_lat: latitude,
                p_lng: longitude,
                p_speed: speed || 0,
                p_heading: heading || 0,
                p_accuracy: accuracy || 0,
                p_battery: batteryLevel
            });

            if (!rpcError) {
                lastSentLocation = { lat: latitude, lng: longitude };
                lastHeartbeatTime = now;
                await Promise.all([
                    AsyncStorage.setItem(STORAGE_KEY_LAST_LOC, JSON.stringify(lastSentLocation)),
                    AsyncStorage.setItem(STORAGE_KEY_LAST_HB, now.toString())
                ]);
            }
        } else if (needsHeartbeat) {
            // 💓 HEARTBEAT (15 min): Apenas presença para o mapa do painel
            logger.log(`[Location] 💓 Enviando Heartbeat de 15 min (Técnico parado mas Online)`, 'info');
            const { error: hbError } = await supabase.rpc('tech_heartbeat', {
                p_battery: batteryLevel
            });

            if (!hbError) {
                lastHeartbeatTime = now;
                await AsyncStorage.setItem(STORAGE_KEY_LAST_HB, now.toString());
            }
        }
    } catch (err) {
        console.error(`[Location] Sync Error:`, err);
    } finally {
        isProcessing = false;
    }
};

// 1. Define the Background Task (Works in Development Build / Production, NOT Expo Go Android)
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        logger.log(`[LocationTask] Error: ${error.message}`, 'error');
        return;
    }
    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        if (locations && locations.length > 0) {
            const lastLocation = locations[locations.length - 1];
            await sendLocationUpdate(lastLocation);
        }
    }
});

export const startBackgroundLocation = async () => {
    try {
        console.log('[Location] 🚀 Initializing Location Service...');

        // 2. Request Foreground Permissions
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        console.log(`[Location] Foreground Status: ${fgStatus}`);

        if (fgStatus !== 'granted') {
            console.warn('[Location] Foreground permission denied. Aborting.');
            return;
        }

        // 3. Request Background Permissions (Crucial for minimizing)
        try {
            const { status: bgStatus, canAskAgain } = await Location.getBackgroundPermissionsAsync();

            if (bgStatus !== 'granted') {
                if (canAskAgain) {
                    const { status: newStatus } = await Location.requestBackgroundPermissionsAsync();
                    if (newStatus === 'granted') {
                        console.log('[Location] Background Permission Granted on Request');
                    } else {
                        throw new Error('BACKGROUND_DENIED');
                    }
                } else {
                    // Open settings directly if we can't ask again
                    Alert.alert(
                        'Rastreamento em Segundo Plano',
                        'Para o rastreamento funcionar com a tela bloqueada, você deve ir em Configurações > Permissões > Localização e selecionar "Permitir o tempo todo".',
                        [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Abrir Configurações', onPress: () => Location.enableNetworkProviderAsync().catch(() => Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings()) }
                        ]
                    );
                    return; // Stop here if no permission
                }
            }
        } catch (e: any) {
            if (e.message === 'BACKGROUND_DENIED') {
                console.warn('[Location] Background permission denied by user.');
                return;
            }
            console.warn('[Location] Background permission check failed:', e);
            // On Expo Go Android, this might fail but background works restrictedly.
            // On Production Build, this is critical.
        }

        // 4. Start Foreground Tracking (Reliable in Expo Go)
        // This puts the GPS icon in the status bar while app is open
        if (foregroundSubscription) {
            foregroundSubscription.remove();
        }

        console.log('[Location] Starting Foreground Watcher (Expo Go safe)...');
        foregroundSubscription = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.High,
                timeInterval: 60000, // 1 minuto (reduzido de 15s)
                distanceInterval: 15, // 15 metros
            },
            (location) => {
                console.log('[Location] 📍 Foreground Update received');
                sendLocationUpdate(location);
            }
        );

        // 5. Try Starting Background Updates
        try {
            const isTaskDefined = TaskManager.isTaskDefined(LOCATION_TASK_NAME);
            if (!isTaskDefined) {
                console.log('[Location] Task not defined, skipping background start');
            } else {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                    accuracy: Location.Accuracy.Balanced, // Reduzido de Best para Balanced para evitar jitter excessivo
                    timeInterval: 60000, // Sync check a cada 1 min (acordar app)
                    distanceInterval: 30, // Acordar app a cada 30m movidos
                    showsBackgroundLocationIndicator: true,
                    pausesUpdatesAutomatically: false,
                    activityType: Location.ActivityType.AutomotiveNavigation,
                    foregroundService: {
                        notificationTitle: "Nexus Pro - GPS Ativo",
                        notificationBody: "O GPS está em modo 'Sempre Ativo' para auditoria.",
                        notificationColor: "#1c2d4f",
                        killServiceOnDestroy: false
                    }
                });
                console.log('[Location] ✅ Background Service Registered with MAX Persistence');
            }
        } catch (e: any) {
            console.warn('[Location] Background Start Error:', e);
            // 🚨 Alert User if on Android Expo Go (Common Issue)
            if (Platform.OS === 'android' && e.message?.includes('Expo Go')) {
                Alert.alert(
                    'Limitação do Expo Go',
                    'O rastreamento em segundo plano (Background) NÃO funciona no app "Expo Go" no Android. Para testar isso, você precisa gerar um APK de desenvolvimento (Development Build) ou testar em um dispositivo iOS.',
                    [{ text: 'Entendi' }]
                );
            }
        }

        logger.log('Serviço de localização iniciado', 'info');
        return true;

    } catch (error: any) {
        console.error('[Location] ❌ Fatal Error starting location:', error);
        logger.log(`Erro ao iniciar GPS: ${error.message || error}`, 'error');
        return false;
    }
};

export const stopBackgroundLocation = async () => {
    try {
        if (foregroundSubscription) {
            foregroundSubscription.remove();
            foregroundSubscription = null;
            console.log('[Location] Foreground watcher stopped');
        }

        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isStarted) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            logger.log('Serviço de localização background parado', 'warn');
        }
    } catch (error) {
        console.log('Erro ao parar localização:', error);
    }
};
