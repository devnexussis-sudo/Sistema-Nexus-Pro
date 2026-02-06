import { useState, useEffect, useRef, useCallback } from 'react';
import { DataService } from '../services/dataService';
import { SessionStorage } from '../lib/sessionStorage';

interface LocationState {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    speed: number | null;
    timestamp: number | null;
    error: string | null;
    isTracking: boolean;
}

const TRACKING_OPTS: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 10000
};

// Configurações de Throttling
const MIN_DISTANCE_METERS = 20; // Só envia se moveu 20m
const MIN_TIME_MS = 30 * 1000;  // Ou se passou 30 segundos

// Função auxiliar para calcular distância (Haversine simples)
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d * 1000; // Distance in meters
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

export const useLocationTracker = () => {
    const [state, setState] = useState<LocationState>({
        latitude: null,
        longitude: null,
        accuracy: null,
        speed: null,
        timestamp: null,
        error: null,
        isTracking: false
    });

    const watchId = useRef<number | null>(null);
    const lastSentRef = useRef<{ lat: number, lng: number, time: number } | null>(null);

    const sendLocation = useCallback(async (pos: GeolocationPosition) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        const now = Date.now();

        // Lógica de Throttling (Economia de Bateria/Dados)
        let shouldSend = false;

        if (!lastSentRef.current) {
            shouldSend = true;
        } else {
            const timeDiff = now - lastSentRef.current.time;
            const distance = getDistanceFromLatLonInM(
                lastSentRef.current.lat,
                lastSentRef.current.lng,
                latitude,
                longitude
            );

            // Envia se: Passou o tempo minimo E moveu uma distancia minima
            // OU: Se moveu muito (ex: > 500m) mesmo em pouco tempo
            // OU: Se passou muito tempo (ex: 5 min) mesmo parado
            if ((timeDiff > MIN_TIME_MS && distance > MIN_DISTANCE_METERS) || distance > 500 || timeDiff > 5 * 60 * 1000) {
                shouldSend = true;
            }
        }

        if (shouldSend) {
            try {
                // Obtem ID do usuário logado (Prioriza fontes do Tech App)
                let userId = null;
                const techUserStr = localStorage.getItem('nexus_tech_session') || localStorage.getItem('nexus_tech_persistent');

                if (techUserStr) {
                    const user = JSON.parse(techUserStr);
                    userId = user.id || user.uid;
                } else {
                    const legacyUser = SessionStorage.get('user');
                    if (legacyUser) userId = legacyUser.id;
                }

                if (userId) {
                    await DataService.updateTechnicianLocation(userId, latitude, longitude);
                    lastSentRef.current = { lat: latitude, lng: longitude, time: now };
                    // console.log(`[📍 GPS] Sync: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                }
            } catch (error) {
                // console.warn('[📍 GPS] Sync Fallback:', error);
            }
        }

        setState(prev => ({
            ...prev,
            latitude,
            longitude,
            accuracy,
            speed,
            timestamp: now,
            error: null
        }));
    }, []);

    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            setState(prev => ({ ...prev, error: "Geolocalização não suportada" }));
            return;
        }

        setState(prev => ({ ...prev, isTracking: true, error: null }));

        // Pega primeira posição imediatamente
        navigator.geolocation.getCurrentPosition(sendLocation, (err) => {
            console.error("[📍 GPS] Erro inicial:", err);
            setState(prev => ({ ...prev, error: err.message }));
        }, TRACKING_OPTS);

        // Inicia Watch
        watchId.current = navigator.geolocation.watchPosition(
            sendLocation,
            (error) => {
                console.error('[📍 GPS] Erro no watch:', error);
                // Não para o tracking em erro temporário (ex: túnel), apenas loga
                if (error.code === error.PERMISSION_DENIED) {
                    setState(prev => ({ ...prev, isTracking: false, error: "Permissão de GPS negada." }));
                }
            },
            TRACKING_OPTS
        );
    }, [sendLocation]);

    const stopTracking = useCallback(() => {
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
        }
        setState(prev => ({ ...prev, isTracking: false }));
    }, []);

    // Auto-start se já tiver permissão (opcional, mas bom pra UX)
    useEffect(() => {
        // Cleanup on unmount
        return () => {
            if (watchId.current !== null) {
                navigator.geolocation.clearWatch(watchId.current);
            }
        };
    }, []);

    return {
        ...state,
        startTracking,
        stopTracking
    };
};
