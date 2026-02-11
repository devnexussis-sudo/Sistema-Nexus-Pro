
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert } from 'react-native';

import { logger } from './logger';

export const LOCATION_TASK_NAME = 'background-location-task';

// 1. Define the task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        logger.log(`[LocationTask] Error: ${error}`, 'error');
        return;
    }
    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        // TODO: Send these locations to your backend
        logger.log(`[LocationTask] Received ${locations.length} new locations`, 'info');
        locations.forEach(loc => {
            logger.log(`[LocationTask] Lat: ${loc.coords.latitude}, Long: ${loc.coords.longitude}`, 'info');
        });
    }
});

export const startBackgroundLocation = async () => {
    try {
        // 2. Request Permissions
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
            Alert.alert('Permissão necessária', 'Precisamos da sua localização para rastrear o serviço.');
            return;
        }

        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
            Alert.alert('Permissão de fundo necessária', 'Precisamos rastrear sua localização mesmo com o app fechado para fins de segurança e auditoria.');
            // We can continue with foreground only if critical, but user asked for "always active"
            // return; 
        }

        // 3. Start updates
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced, // Balanced is good for battery/performance trade-off
            timeInterval: 60000, // Update every 1 minute
            distanceInterval: 100, // Or every 100 meters
            showsBackgroundLocationIndicator: true, // Show blue bar on iOS
            foregroundService: {
                notificationTitle: "Rastreamento de Técnico",
                notificationBody: "Sua localização está sendo monitorada para o serviço.",
                notificationColor: "#1c2d4f"
            }
        });

        console.log('[LocationService] Background location started');
        logger.log('Serviço de localização iniciado', 'info');

        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        logger.log('Status da tarefa de localização: ' + isStarted, 'info');

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
