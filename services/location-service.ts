import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase'; // Ensure this path is correct relative to service
import { logger } from './logger';

export const LOCATION_TASK_NAME = 'background-location-task';

// 1. Define the task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        logger.log(`[LocationTask] Error: ${error.message}`, 'error');
        return;
    }
    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };

        if (locations && locations.length > 0) {
            const lastLocation = locations[locations.length - 1];
            const { latitude, longitude, speed, heading, accuracy } = lastLocation.coords;
            const batteryLevel = -1; // Battery API might not be available in background task context easily without extra config

            logger.log(`[LocationTask] Buffer: ${locations.length} | Last: ${latitude}, ${longitude}`, 'info');

            try {
                // Determine user ID from local storage or auth session if available
                // Note: Auth session might be tricky in background task. 
                // Best practice: Use supabase client which handles auth persistance visually.

                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (session?.user) {
                    const { error: rpcError } = await supabase.rpc('update_tech_location_v2', {
                        p_lat: latitude,
                        p_lng: longitude,
                        p_speed: speed || 0,
                        p_heading: heading || 0,
                        p_accuracy: accuracy || 0,
                        p_battery: null // Optional
                    });

                    if (rpcError) {
                        logger.log(`[LocationTask] RPC Failed: ${rpcError.message}`, 'warn');
                        // Fallback
                        await supabase.from('technicians').update({
                            last_latitude: latitude,
                            last_longitude: longitude,
                            last_seen: new Date().toISOString()
                        }).eq('id', session.user.id);
                    } else {
                        logger.log(`[LocationTask] ✅ Location synced via RPC`, 'info');
                    }
                } else {
                    logger.log(`[LocationTask] ⚠️ No active session in background task`, 'warn');
                }

            } catch (err) {
                logger.log(`[LocationTask] Sync Error: ${JSON.stringify(err)}`, 'error');
            }
        }
    }
});

export const startBackgroundLocation = async () => {
    try {
        // 2. Request Permissions
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
            Alert.alert('Permissão necessária', 'Precisamos da sua localização para o funcionamento correto do app.');
            return;
        }

        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
            Alert.alert('Permissão de fundo necessária', 'Para rastreamento contínuo durante o serviço, permita o acesso à localização "Sempre" ou "O tempo todo".');
        }

        // 3. Start updates
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000, // Update every 30 seconds
            distanceInterval: 50, // Or every 50 meters
            showsBackgroundLocationIndicator: true,
            foregroundService: {
                notificationTitle: "Nexus Pro - Rastreamento Ativo",
                notificationBody: "Sua localização está sendo monitorada para o serviço.",
                notificationColor: "#1c2d4f"
            }
        });

        logger.log('Serviço de localização iniciado', 'info');
        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        logger.log('Status da tarefa: ' + isStarted, 'info');

    } catch (error) {
        logger.log('Falha ao iniciar localização: ' + error, 'error');
        Alert.alert('Erro', 'Falha ao iniciar rastreamento de localização.');
    }
};

export const stopBackgroundLocation = async () => {
    try {
        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isStarted) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            logger.log('Serviço de localização parado', 'warn');
        }
    } catch (error) {
        logger.log('Falha ao parar localização: ' + error, 'error');
    }
};
