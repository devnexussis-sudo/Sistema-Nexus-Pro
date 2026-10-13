/**
 * 🗺️ Auto Check-in Service
 *
 * Monitora a proximidade do técnico em relação ao endereço do cliente.
 * Quando o técnico permanece dentro de um raio de 50 m por 10 minutos,
 * a OS correspondente é iniciada automaticamente (startExecution).
 *
 * Fluxo:
 *   location-service → onNewLocation() → geocode address → haversine →
 *   timer de 10 min → triggerAutoCheckin() → startExecution + notificação
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { OrderService } from './order-service';
import { logger } from './logger';

// Conditional import — expo-notifications remote push crashes Expo Go on Android SDK53+
const isExpoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';
const Notifications = isExpoGoAndroid ? null : require('expo-notifications');

// ─── Constantes ──────────────────────────────────────────────────────────────
const CHECKIN_RADIUS_M = 250;         // Raio em metros para detectar chegada
const CHECKIN_DWELL_MS = 5 * 60 * 1000; // 5 minutos dentro do raio
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Cache de geocode: 24h
const GEOCODE_CACHE_KEY_PREFIX = '@nexus:geocode:';

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface AutoCheckinOrder {
  id: string;
  displayId?: string;
  customerName: string;
  customerAddress: string;
  customerId?: string;
  customerLat?: number | null;
  customerLng?: number | null;
  status: string;
}

interface GeocoderResult {
  lat: number;
  lng: number;
  cachedAt: number;
}

interface DwellEntry {
  enteredAt: number;    // timestamp em que entrou no raio
  triggered: boolean;   // já disparou o check-in?
}

// ─── Tiny typed event bus (React Native safe, no Node deps) ─────────────────
type CheckinListener = (payload: { order: AutoCheckinOrder; techLat: number; techLng: number }) => void;
const _listeners = new Set<CheckinListener>();

export const autoCheckinEvents = {
  on(event: string, fn: CheckinListener) { _listeners.add(fn); },
  off(event: string, fn: CheckinListener) { _listeners.delete(fn); },
  emit(event: string, payload: Parameters<CheckinListener>[0]) {
    _listeners.forEach(fn => { try { fn(payload); } catch { /* silent */ } });
  },
};

/**
 * Emitido quando um check-in automático é realizado.
 * O listener pode navegar para a tela da OS.
 */
export const AUTO_CHECKIN_EVENT = 'auto_checkin_triggered';

// ─── Estado interno ───────────────────────────────────────────────────────────
let _enabled = false;
let _activeOrders: AutoCheckinOrder[] = [];
const _dwellMap = new Map<string, DwellEntry>(); // orderId → entrada

// ─── Haversine ────────────────────────────────────────────────────────────────
const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Geocodificação via Nominatim (OpenStreetMap) ─────────────────────────────
const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  if (!address || address.trim().length < 5) return null;

  // Chave de cache simples: hash da string
  const cacheKey = GEOCODE_CACHE_KEY_PREFIX + address.replace(/\s+/g, '_').toLowerCase().slice(0, 80);

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed: GeocoderResult = JSON.parse(cached);
      if (Date.now() - parsed.cachedAt < GEOCODE_CACHE_TTL_MS) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    }
  } catch { /* ignore cache errors */ }

  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=0`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NexusMobileApp/1.0 (campo@duno.com.br)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });

    const json = await res.json();
    if (!json || json.length === 0) return null;

    const { lat, lon } = json[0];
    const result: GeocoderResult = { lat: parseFloat(lat), lng: parseFloat(lon), cachedAt: Date.now() };

    await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
    logger.log(`[AutoCheckin] 📍 Geocoded "${address.slice(0, 40)}..." → ${result.lat},${result.lng}`, 'info');
    return { lat: result.lat, lng: result.lng };
  } catch (err: any) {
    logger.log(`[AutoCheckin] ⚠️ Geocode falhou: ${err.message}`, 'warn');
    return null;
  }
};

// ─── Disparo do Check-in ──────────────────────────────────────────────────────
const triggerAutoCheckin = async (order: AutoCheckinOrder, techLat: number, techLng: number) => {
  try {
    logger.log(`[AutoCheckin] 🎯 Disparando check-in automático para OS ${order.displayId || order.id}`, 'info');

    // Executa a OS
    await OrderService.startExecution(order.id, techLat, techLng);

    // Import the lifecycle manager directly and force UI update (delayed slightly to allow DB commit)
    const { appLifecycle } = require('./app-lifecycle');
    setTimeout(() => {
        if (appLifecycle) appLifecycle.forceUISync();
    }, 1000);

    // Notificação local para o técnico (apenas se não for Expo Go Android)
    if (Notifications) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '✅ Check-in Automático Realizado!',
            body: `Você chegou ao cliente ${order.customerName}. A OS ${order.displayId || ''} foi iniciada automaticamente.`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority?.MAX,
            channelId: 'nexus-alerts',
            data: { orderId: order.id },
          },
          trigger: null, // Imediato
        });
      } catch (notifErr: any) {
        logger.log(`[AutoCheckin] ⚠️ Notificação falhou (não crítico): ${notifErr.message}`, 'warn');
      }
    }

    // Emite evento para o app navegar
    autoCheckinEvents.emit(AUTO_CHECKIN_EVENT, { order, techLat, techLng });

    logger.log(`[AutoCheckin] ✅ Check-in automático concluído para OS ${order.id}`, 'info');
  } catch (err: any) {
    logger.log(`[AutoCheckin] ❌ Erro no check-in automático: ${err.message}`, 'error');
  }
};

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Habilita ou desabilita o serviço de check-in automático.
 * Chamado ao carregar as configurações do tenant.
 */
export const setAutoCheckinEnabled = (enabled: boolean) => {
  _enabled = enabled;
  if (!enabled) {
    _dwellMap.clear();
    console.warn('🔴 Auto Check-in desabilitado na config do tenant');
    logger.log('[AutoCheckin] 🔴 Serviço desabilitado', 'info');
  } else {
    console.warn('🟢 Auto Check-in habilitado! Aguardando OS...');
    logger.log('[AutoCheckin] 🟢 Serviço habilitado (raio 50m, dwell 5min)', 'info');
  }
};

/**
 * Atualiza a lista de OS ativas que serão monitoradas.
 * Chamar ao logar, ao mudar status de OS, etc.
 */
export const setAutoCheckinOrders = (orders: AutoCheckinOrder[]) => {
  // Filtra apenas OS elegíveis (atribuídas ao técnico, não iniciadas ainda)
  _activeOrders = orders.filter(
    o => o.status === 'ATRIBUÍDO' || o.status === 'EM DESLOCAMENTO'
  );

  // Remove da dwell map as OS que não estão mais ativas
  const activeIds = new Set(_activeOrders.map(o => o.id));
  for (const key of _dwellMap.keys()) {
    if (!activeIds.has(key)) _dwellMap.delete(key);
  }

  console.warn(`📋 Auto Check-in: ${_activeOrders.length} OS monitoradas (${orders.length} recebidas)`);
  logger.log(`[AutoCheckin] 📋 ${_activeOrders.length} OS monitoradas para auto check-in`, 'info');
};

/**
 * Chamado pelo location-service a cada nova posição GPS.
 * Verifica proximidade e gerencia o timer de dwell.
 */
export const onNewLocation = async (techLat: number, techLng: number): Promise<void> => {
  if (!_enabled || _activeOrders.length === 0) return;

  const now = Date.now();

  for (const order of _activeOrders) {
    const dwell = _dwellMap.get(order.id);
    if (dwell?.triggered) continue; // Já fez check-in nesta OS

    // Resolve coordenadas do cliente
    let clientLat: number | null = order.customerLat ?? null;
    let clientLng: number | null = order.customerLng ?? null;

    if (!clientLat || !clientLng) {
      // Tenta geocodificar pelo endereço
      const coords = await geocodeAddress(order.customerAddress);
      if (!coords) continue; // Sem coordenadas, pula esta OS
      clientLat = coords.lat;
      clientLng = coords.lng;
    }

    const dist = haversine(techLat, techLng, clientLat, clientLng);
    const isNear = dist <= CHECKIN_RADIUS_M;

    if (!dwell && dist <= 500 && !isNear) {
      console.warn(`📍 Quase lá... OS ${order.displayId || order.id} está a ${dist.toFixed(0)}m de distância (Precisa estar a ≤ 250m)`);
    }

    if (isNear) {
      if (!dwell) {
        // Acabou de entrar no raio: registra timestamp de entrada
        _dwellMap.set(order.id, { enteredAt: now, triggered: false });
        console.warn(`📍 ENTROU no raio da OS ${order.displayId || order.id}! (${dist.toFixed(0)}m). O check-in acontecerá em 5 minutos.`);
        logger.log(`[AutoCheckin] 📍 Entrou no raio da OS ${order.displayId || order.id} (${dist.toFixed(0)}m)`, 'info');
      } else {
        // Já estava no raio: verifica se passou 5 minutos
        const elapsed = now - dwell.enteredAt;
        if (elapsed >= CHECKIN_DWELL_MS) {
          // Marca como disparado ANTES de chamar async para evitar duplo disparo
          _dwellMap.set(order.id, { ...dwell, triggered: true });
          console.warn(`🚀 Disparando Check-in Automático OS ${order.displayId || order.id} (${dist.toFixed(0)}m)`);
          await triggerAutoCheckin(order, techLat, techLng);
        } else {
          const remainingSec = Math.ceil((CHECKIN_DWELL_MS - elapsed) / 1000);
          if (remainingSec % 60 === 0 || remainingSec < 10) {
             console.warn(`⏱️ Faltam ${remainingSec}s para o check-in automático (${dist.toFixed(0)}m)`);
          }
          logger.log(`[AutoCheckin] ⏱️ OS ${order.displayId || order.id}: ${remainingSec}s restantes para check-in`, 'info');
        }
      }
    } else {
      if (dwell && !dwell.triggered) {
        // Saiu do raio antes do check-in: reinicia contagem
        _dwellMap.delete(order.id);
        console.warn(`🚶 SAIU do raio da OS ${order.displayId || order.id} antes dos 5 minutos (${dist.toFixed(0)}m). Timer zerado.`);
        logger.log(`[AutoCheckin] 🚶 Saiu do raio da OS ${order.displayId || order.id} (${dist.toFixed(0)}m)`, 'info');
      }
    }
  }
};
