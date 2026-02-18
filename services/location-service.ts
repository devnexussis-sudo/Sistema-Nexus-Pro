import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform, Linking } from 'react-native';
import { supabase } from './supabase';
import { logger } from './logger';

export const LOCATION_TASK_NAME = 'background-location-task';

let foregroundSubscription: Location.LocationSubscription | null = null;

// ✅ Reusable function to sync location to Supabase
const sendLocationUpdate = async (location: Location.LocationObject) => {
    const { latitude, longitude, speed, heading, accuracy } = location.coords;

    // 🔋 Battery Fetch
    let batteryLevel = null;
    try {
        const level = await Battery.getBatteryLevelAsync();
        if (level !== -1) {
            batteryLevel = Math.round(level * 100);
        }
    } catch (e) {
        // Battery api might fail on some simulators or conditions
    }

    logger.log(`[Location] Sending update: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (Speed: ${speed}) 🔋${batteryLevel}%`, 'info');

    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
            // 1. First try RPC (Most efficient)
            const { error: rpcError } = await supabase.rpc('update_tech_location_v2', {
                p_lat: latitude,
                p_lng: longitude,
                p_speed: speed || 0,
                p_heading: heading || 0,
                p_accuracy: accuracy || 0,
                p_battery: batteryLevel
            });

            if (rpcError) {
                console.warn(`[Location] RPC Failed (${rpcError.message}) - Trying Direct Update`);

                // 2. Fallback: Update Technicians Table Directly
                const { error: techError } = await supabase.from('technicians').update({
                    last_latitude: latitude,
                    last_longitude: longitude,
                    speed: speed || 0,
                    heading: heading || 0,
                    accuracy: accuracy || 0,
                    battery_level: batteryLevel,
                    last_seen: new Date().toISOString()
                }).eq('id', session.user.id);

                if (techError) {
                    console.error('[Location] Technician Table Update Failed:', techError.message);
                } else {
                    console.log('[Location] ✅ Technician table updated directly');
                }
            } else {
                console.log(`[Location] ✅ Database updated via RPC`);
            }
        } else {
            console.warn(`[Location] ⚠️ No active session for update`);
        }
    } catch (err) {
        console.error(`[Location] Sync Error:`, err);
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
                accuracy: Location.Accuracy.Balanced, // Saves battery
                timeInterval: 120000, // 2 minutes (Production Standard)
                distanceInterval: 50, // 50 meters (Avoids jitter)
            },
            (location) => {
                console.log('[Location] 📍 Foreground Update received');
                sendLocationUpdate(location);
            }
        );

        // 5. Try Starting Background Updates
        try {
            const isTaskDefined = await TaskManager.isTaskDefinedAsync(LOCATION_TASK_NAME);
            if (!isTaskDefined) {
                console.log('[Location] Task not defined, skipping background start');
            } else {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                    accuracy: Location.Accuracy.High, // ⬆️ Increased accuracy for background
                    timeInterval: 60000, // Reduced to 1 min for testing (then can be 2)
                    distanceInterval: 20, // Reduced to 20m for better sensitivity
                    showsBackgroundLocationIndicator: true,
                    pausesUpdatesAutomatically: false,
                    activityType: Location.ActivityType.AutomotiveNavigation,
                    foregroundService: {
                        notificationTitle: "Nexus Pro",
                        notificationBody: "Rastreamento GPS Ativo", // Text explicitly saying GPS is active
                        notificationColor: "#1c2d4f",
                        killServiceOnDestroy: false // ⚠️ Ensure service persists
                    }
                });
                console.log('[Location] ✅ Background Service Registered with High Persistence');
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

    } catch (error) {
        console.error('[Location] ❌ Fatal Error starting location:', error);
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
