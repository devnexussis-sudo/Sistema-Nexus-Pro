import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, MapPin, Clock, RefreshCw, History, Calendar, Search, Map as MapIcon, Layers, Satellite, Users, ClipboardList, X, ChevronDown, ChevronUp, Filter, ExternalLink } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { CacheManager } from '../../lib/cache';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { OrderStatus } from '../../types';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Technician {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    last_latitude?: number;
    last_longitude?: number;
    last_seen?: string;
    active?: boolean;
    speed?: number;
    battery_level?: number;
}

interface LocationHistory {
    latitude: number;
    longitude: number;
    recorded_at: string;
}

const createTechIcon = (avatarUrl: string, isMoving: boolean = true, customColorHex?: string) => {
    const defaultColor = isMoving ? '#10b981' : '#ef4444'; // Verde se em movimento, vermelho se parado
    const borderColor = customColorHex || (isMoving ? '#10b981' : '#94a3b8');
    const statusColor = customColorHex || defaultColor;
    const pulseAnimation = isMoving ? 'animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;' : '';

    return L.divIcon({
        html: `
            <style>
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            </style>
            <div style="position: relative; width: 40px; height: 40px;">
                <img src="${avatarUrl || 'https://ui-avatars.com/api/?name=Tech&background=random'}" style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid ${borderColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.3); object-fit: cover; ${!isMoving ? 'opacity: 0.7;' : ''}" />
                <div style="position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; background: ${statusColor}; border: 2px solid white; border-radius: 50%; ${pulseAnimation}; box-shadow: 0 1px 4px rgba(0,0,0,0.4);"></div>
            </div>
        `,
        className: 'tech-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
    });
};

const getStatusColorHex = (status: OrderStatus) => {
    switch (status) {
        case OrderStatus.PENDING: return '#3b82f6';
        case OrderStatus.ASSIGNED: return '#1d4ed8';
        case OrderStatus.TRAVELING: return '#f59e0b';
        case OrderStatus.IN_PROGRESS: return '#eab308';
        case OrderStatus.COMPLETED: return '#10b981';
        case OrderStatus.CANCELED: return '#d946ef';
        case OrderStatus.BLOCKED: return '#ef4444';
        default: return '#94a3b8';
    }
};

const createOrderIcon = (status: OrderStatus, displayId: string) => {
    const color = getStatusColorHex(status);
    return L.divIcon({
        html: `
            <div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; position: relative;">
                <div style="position: absolute; bottom: -6px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid ${color};"></div>
                <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
            </div>
        `,
        className: 'os-marker',
        iconSize: [28, 34],
        iconAnchor: [14, 34],
    });
};

// Custom cluster icon for OS
const createClusterCustomIcon = function (cluster: any) {
    const childCount = cluster.getChildCount();
    let size = 40;
    if (childCount > 10) size = 50;
    if (childCount > 100) size = 60;

    return L.divIcon({
        html: `<div style="background: rgba(245, 158, 11, 0.85); min-width: ${size}px; height: ${size}px; border-radius: 50%; border: 3px solid rgba(251, 191, 36, 1); display: flex; align-items: center; justify-content: center; font-weight: 900; color: white; font-size: ${size > 40 ? '16px' : '14px'}; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"><span style="text-shadow: 0px 1px 2px rgba(0,0,0,0.5);">${childCount}</span></div>`,
        className: 'custom-cluster-icon',
        iconSize: L.point(size, size, true),
    });
};


export const TechnicianMap: React.FC = () => {
    // 🌍 General Maps State
    const [mapType, setMapType] = useState<'DEFAULT' | 'SATELLITE'>('DEFAULT');
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAutoRefresh, setIsAutoRefresh] = useState(false);
    const [showLegend, setShowLegend] = useState(true);
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [techSearch, setTechSearch] = useState('');

    // 👷 Techs & History State
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [isHistoryMode, setIsHistoryMode] = useState(false);
    const [selectedHistoryTech, setSelectedHistoryTech] = useState<Technician | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [historyPath, setHistoryPath] = useState<LocationHistory[]>([]);
    const [routedPath, setRoutedPath] = useState<[number, number][][]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [routeSnapped, setRouteSnapped] = useState(false);
    const [selectedStopIdx, setSelectedStopIdx] = useState<number | null>(null);

    // 📋 Orders State
    const [orders, setOrders] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);



    useEffect(() => {
        // Initial load
        loadTechnicians();
        loadOrders();

        let interval: any;
        if (isAutoRefresh) {
            console.log('[Map] Auto-refresh habilitado: Próxima atualização em 5 minutos');
            // Refresh imediato ao ligar o modo Live
            handleRefresh();

            interval = setInterval(() => {
                handleRefresh();
            }, 5 * 60 * 1000); // 5 minutes
        }

        const timer = setTimeout(() => {
            if (mapInstance) {
                mapInstance.invalidateSize();
            }
        }, 500);

        return () => {
            if (interval) clearInterval(interval);
            clearTimeout(timer);
        };
    }, [mapInstance, isAutoRefresh]);

    const loadOrders = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            const ords = await DataService.getOrders();
            const custs = await DataService.getCustomers();
            clearTimeout(timeoutId);
            setOrders(ords);
            setCustomers(custs);
        } catch (error: any) {
            if (error?.name !== 'AbortError') {
                console.error('[Map] Erro ao carregar OS:', error);
            }
        }
    };

    const loadTechnicians = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            const techs = await DataService.getAllTechnicians(null, null, true);
            clearTimeout(timeoutId);
            setTechnicians(techs);
        } catch (error: any) {
            if (error?.name !== 'AbortError') {
                console.error('[Map] Erro ao carregar técnicos:', error);
            }
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        const safetyTimeout = setTimeout(() => {
            setIsRefreshing(false);
        }, 15000);

        try {
            const tenantId = DataService.getCurrentTenantId();
            if (tenantId) {
                // Invalida ambos os caches para garantir dados frescos no mapa global
                CacheManager.invalidate(`techs_${tenantId}`);
                CacheManager.invalidate(`orders_${tenantId}`);
                CacheManager.invalidate(`customers_${tenantId}`);
            }

            await Promise.all([
                loadTechnicians(),
                loadOrders()
            ]);

            setLastUpdated(new Date());
            console.log('[Map] Dados atualizados com sucesso (OS & Técnicos)');
        } catch (error) {
            console.error('[Map] Erro ao atualizar:', error);
        } finally {
            clearTimeout(safetyTimeout);
            setIsRefreshing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // PROCESSAMENTO DE HISTÓRICO — 100% LOCAL (ZERO API EXTERNA)
    // ─────────────────────────────────────────────────────────────────────
    // PASSO 1: Detecta "janelas de movimento" (saiu do raio de 200m)
    // PASSO 2: Para cada janela, volta nos dados brutos e pega TODOS os
    //          pontos intermediários (filtro de 15m anti-jitter).
    //          Com GPS a cada 10-30s, os pontos seguem as curvas da rua.
    // RESULTADO: Instantâneo + linhas nas ruas + sem linhas quando parado
    // ═══════════════════════════════════════════════════════════════════════
    const processHistoryRoute = async (points: LocationHistory[]): Promise<[number, number][][]> => {
        if (points.length < 2) return [];

        const distM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const R = 6371e3;
            const p1 = lat1 * Math.PI/180, p2 = lat2 * Math.PI/180;
            const dp = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
            const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };

        // ── PASSO 1: Encontrar janelas de movimento ─────────────────────
        // Uma "janela" = intervalo [startIdx, endIdx] onde o técnico se
        // deslocou mais de 200m da âncora anterior.
        const windows: { s: number; e: number }[] = [];
        let anchor = points[0];
        let anchorIdx = 0;
        let moveStart = -1;

        for (let i = 1; i < points.length; i++) {
            const d = distM(anchor.latitude, anchor.longitude, points[i].latitude, points[i].longitude);
            const sec = Math.max(1, (new Date(points[i].recorded_at).getTime() - new Date(anchor.recorded_at).getTime()) / 1000);
            // Anti-teletransporte: >120km/h é GPS falso
            if ((d / sec) * 3.6 > 120) continue;

            if (d >= 200) {
                // Técnico saiu do raio: está em movimento
                if (moveStart === -1) moveStart = anchorIdx;
                anchor = points[i];
                anchorIdx = i;
            } else if (moveStart !== -1) {
                // Parou após ter se movido — fecha a janela
                windows.push({ s: moveStart, e: anchorIdx });
                moveStart = -1;
            }
        }
        // Fecha janela aberta
        if (moveStart !== -1) windows.push({ s: moveStart, e: anchorIdx });

        if (windows.length === 0) {
            console.log(`[Map] Técnico parado — ${points.length} pings, sem deslocamento > 200m`);
            return [];
        }

        // ── PASSO 2: Coletar pontos DENSOS de cada janela ───────────────
        // Volta nos dados brutos entre s..e e pega TODOS os pontos com
        // deslocamento > 15m (remove só os duplicados de GPS parado).
        // Esses pontos densos (a cada 10-30s) seguem as curvas da rua.
        const segments: [number, number][][] = [];

        for (const w of windows) {
            const seg: [number, number][] = [];
            let prev = points[w.s];
            seg.push([prev.latitude, prev.longitude]);

            for (let i = w.s + 1; i <= w.e; i++) {
                const pt = points[i];
                const d = distM(prev.latitude, prev.longitude, pt.latitude, pt.longitude);
                const sec = Math.max(1, (new Date(pt.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000);
                if (d < 25) continue; // jitter mínimo (ignora micro-deslocamento falso)
                if ((d / sec) * 3.6 > 120) continue; // teletransporte
                if (d > 5000) { // gap irreal
                    if (seg.length >= 2) segments.push([...seg]);
                    seg.length = 0;
                }
                seg.push([pt.latitude, pt.longitude]);
                prev = pt;
            }
            if (seg.length >= 2) segments.push(seg);
        }

        console.log(`[Map] ${points.length} pings → ${windows.length} trecho(s) → ${segments.reduce((a,s) => a+s.length, 0)} pontos plotados`);
        return segments;
    };

    const loadHistoryPath = async (techId: string, date: string) => {
        setIsLoadingHistory(true);
        setRoutedPath([]);
        setRouteSnapped(false);
        try {
            const { data, error } = await DataService.getServiceClient()
                .from('technician_gps_pings')
                .select('latitude, longitude, created_at')
                .eq('technician_id', techId)
                .gte('created_at', new Date(`${date}T00:00:00`).toISOString())
                .lte('created_at', new Date(`${date}T23:59:59.999`).toISOString())
                .order('created_at', { ascending: true });

            if (error) throw error;
            
            const mappedData = (data || []).map((d: any) => ({
                latitude: d.latitude,
                longitude: d.longitude,
                recorded_at: d.created_at
            }));

            setHistoryPath(mappedData);

            if (mappedData.length > 0) {
                if (mapInstance) {
                    const bounds = L.latLngBounds(mappedData.map(p => [p.latitude, p.longitude]));
                    mapInstance.fitBounds(bounds, { padding: [60, 60] });
                }
                // Calcula histórico limpo instantaneamente via CPU
                const segments = await processHistoryRoute(mappedData);
                setRoutedPath(segments);
                setRouteSnapped(true);
                // Fit to snapped route bounding box
                if (segments.length > 0 && mapInstance) {
                    const allPts = segments.flat();
                    if (allPts.length > 0) {
                        mapInstance.fitBounds(L.latLngBounds(allPts), { padding: [60, 60] });
                    }
                }
            }
        } catch (error) {
            console.error('[Map] Erro ao carregar histórico:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (!isHistoryMode || !selectedHistoryTech || !selectedDate) {
            setHistoryPath([]);
            setRoutedPath([]);
            setRouteSnapped(false);
            return;
        }
        loadHistoryPath(selectedHistoryTech.id, selectedDate);
    }, [isHistoryMode, selectedHistoryTech, selectedDate]);

    const formatLastSeen = (lastSeen?: string) => {
        if (!lastSeen) return 'Nunca visto';
        const diff = Date.now() - new Date(lastSeen).getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Agora';
        if (minutes < 60) return `${minutes}m atrás`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h atrás`;
        return `${Math.floor(hours / 24)}d atrás`;
    };

    const isTechMoving = (lastSeen?: string): boolean => {
        if (!lastSeen) return false;
        const diff = Date.now() - new Date(lastSeen).getTime();
        return Math.floor(diff / 60000) < 30;
    };

    const isMovingTechsHistory = historyPath.length > 5; // Simulação de status de movimento para o resumo histórico

    // Detecção de paradas com raio de 200m (consistente com o filtro de rota)
    // Cada parada = ponto único com horário de chegada e saída
    const { historyStops, startPoint, endPoint, rawSamplesCount } = React.useMemo(() => {
        if (!historyPath || historyPath.length === 0) return { historyStops: [], startPoint: null, endPoint: null, rawSamplesCount: 0 };
        
        const getDistanceM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const R = 6371e3;
            const p1 = lat1 * Math.PI/180, p2 = lat2 * Math.PI/180;
            const dp = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
            const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };

        const start = historyPath[0];
        const end = historyPath[historyPath.length - 1];

        // Agrupa pontos em "clusters" de 200m. Se ficou num cluster > 5min = parada.
        const stops: { latitude: number; longitude: number; startTime: string; endTime: string; durationMins: number; pointCount: number }[] = [];
        let clusterStart = 0;
        let clusterAnchor = historyPath[0];

        for (let i = 1; i <= historyPath.length; i++) {
            const isLast = i === historyPath.length;
            const departed = isLast || getDistanceM(
                clusterAnchor.latitude, clusterAnchor.longitude,
                historyPath[i].latitude, historyPath[i].longitude
            ) > 200;

            if (departed) {
                const clusterEnd = i - 1;
                const durationMins = (new Date(historyPath[clusterEnd].recorded_at).getTime() - new Date(historyPath[clusterStart].recorded_at).getTime()) / 60000;
                
                if (durationMins >= 5) {
                    // Calcula centróide do cluster para posição mais precisa
                    let sumLat = 0, sumLon = 0, count = 0;
                    for (let j = clusterStart; j <= clusterEnd; j++) {
                        sumLat += historyPath[j].latitude;
                        sumLon += historyPath[j].longitude;
                        count++;
                    }
                    stops.push({
                        latitude: sumLat / count,
                        longitude: sumLon / count,
                        startTime: historyPath[clusterStart].recorded_at,
                        endTime: historyPath[clusterEnd].recorded_at,
                        durationMins: Math.round(durationMins),
                        pointCount: count
                    });
                }

                if (!isLast) {
                    clusterStart = i;
                    clusterAnchor = historyPath[i];
                }
            }
        }
        // ── MERGE: Consolida paradas no mesmo raio de 250m ──────────────
        // Se o técnico saiu 200m e voltou ao mesmo local, gera 2 paradas
        // no mesmo ponto. Esse merge une tudo em 1 pin único com a primeira
        // chegada e a última saída.
        const merged: typeof stops = [];
        for (const stop of stops) {
            const existing = merged.find(m => getDistanceM(m.latitude, m.longitude, stop.latitude, stop.longitude) < 250);
            if (existing) {
                // Mesmo local: expande horários e soma pontos
                if (new Date(stop.startTime) < new Date(existing.startTime)) existing.startTime = stop.startTime;
                if (new Date(stop.endTime) > new Date(existing.endTime)) existing.endTime = stop.endTime;
                existing.durationMins = Math.round((new Date(existing.endTime).getTime() - new Date(existing.startTime).getTime()) / 60000);
                existing.pointCount += stop.pointCount;
                // Recalcula centróide ponderado
                const totalPts = existing.pointCount;
                const prevPts = totalPts - stop.pointCount;
                existing.latitude = (existing.latitude * prevPts + stop.latitude * stop.pointCount) / totalPts;
                existing.longitude = (existing.longitude * prevPts + stop.longitude * stop.pointCount) / totalPts;
            } else {
                merged.push({ ...stop });
            }
        }

        return { historyStops: merged, startPoint: start, endPoint: end, rawSamplesCount: historyPath.length };
    }, [historyPath]);

    // Total de pontos plotados nas rotas
    const routedPointsCount = routedPath.reduce((sum, seg) => sum + seg.length, 0);

    const activeTechs = technicians.filter(t => {
        const hasCoords = t.last_latitude !== undefined && t.last_latitude !== null &&
            t.last_longitude !== undefined && t.last_longitude !== null;
        const isActive = t.active !== false;

        // 🕒 Regra de Inatividade: Só exibe no mapa se foi visto nas últimas 24 horas
        let isRecent = false;
        if (t.last_seen) {
            const diff = Date.now() - new Date(t.last_seen).getTime();
            const hours = diff / (1000 * 60 * 60);
            isRecent = hours <= 24;
        }

        return hasCoords && isActive && isRecent;
    });

    const movingTechs = activeTechs.filter(t => isTechMoving(t.last_seen));
    const stoppedTechs = activeTechs.filter(t => !isTechMoving(t.last_seen));

    const getTechActiveOrder = (techId: string) => {
        return orders.find(o =>
            o.assignedTo === techId &&
            (
                o.status === OrderStatus.IN_PROGRESS ||
                o.status === OrderStatus.TRAVELING ||
                String(o.status).toUpperCase() === 'EM ANDAMENTO' ||
                String(o.status).toUpperCase() === 'EM DESLOCAMENTO' ||
                String(o.status).toLowerCase() === 'in_progress' ||
                String(o.status).toLowerCase() === 'traveling'
            )
        );
    };

    const mappedOrders = orders.map(o => {
        const c = customers.find(cust => cust.id === o.customerId || cust.name === o.customerName);
        return { ...o, latitude: c?.latitude, longitude: c?.longitude };
    }).filter(o => {
        const hasCoords = o.latitude && o.longitude;
        if (!hasCoords) return false;

        // Filtro por Data (Dia exato selecionado)
        if (o.scheduledDate) {
            const orderDateStr = parseISO(o.scheduledDate).toISOString().split('T')[0];
            return orderDateStr === selectedDate;
        }
        return false;
    });

    const tileLayerUrl = mapType === 'SATELLITE'
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const tileAttribution = mapType === 'SATELLITE'
        ? "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
        : "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors";


    return (
        <div className="flex flex-col h-full bg-slate-50 relative font-sans">
            {/* 🗺️ MINIMAL TOP BAR */}
            <div className="absolute top-4 left-4 z-[1002] flex items-center gap-2 pointer-events-none">
                <button
                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                    className="pointer-events-auto bg-white hover:bg-slate-50 text-slate-700 p-2.5 rounded-xl shadow-lg border border-slate-200 transition-all focus:ring-2 focus:ring-primary-500 outline-none"
                    title="Menu de Filtros"
                >
                    <Filter size={18} />
                </button>

                <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow-lg border border-slate-200 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-[#1c2d4f] tracking-tight">Duno<span className="text-primary-600 ml-1">Maps</span></span>
                        <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-3">
                            <div className={`w-2 h-2 rounded-full ${isAutoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                            <span className="text-[10px] font-bold text-slate-600 uppercase pt-0.5">{isAutoRefresh ? 'Live' : 'Standby'}</span>
                        </div>
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur rounded-xl p-1 shadow-lg border border-slate-200">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`p-1.5 rounded-lg transition-all ${isRefreshing ? 'bg-primary-50 text-primary-600 animate-spin' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Atualizar dados"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        onClick={() => setMapType(prev => prev === 'DEFAULT' ? 'SATELLITE' : 'DEFAULT')}
                        className={`p-1.5 rounded-lg transition-all ${mapType === 'SATELLITE' ? 'bg-[#1c2d4f] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        title="Alternar Satélite"
                    >
                        <Satellite size={14} />
                    </button>
                    <button
                        onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                        className={`px-2 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${isAutoRefresh ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        <span className="text-[10px] uppercase">Atualização Auto</span>
                    </button>
                </div>
            </div>

            {/* 🎛️ RETRACTABLE FILTER PANEL (LEFT SIDE) */}
            <div className={`absolute top-0 left-0 bottom-0 z-[1004] w-80 bg-white shadow-[20px_0_50px_rgba(0,0,0,0.1)] border-r border-slate-200 transition-transform duration-500 ease-in-out transform flex flex-col ${showFilterPanel ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2 text-primary-700">
                        <Filter size={18} />
                        <h2 className="text-sm font-black uppercase tracking-wide">Filtros do Mapa</h2>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                setSelectedDate(new Date().toISOString().split('T')[0]);
                                setIsHistoryMode(false);
                                setTechSearch('');
                                setHistoryPath([]);
                                setRoutedPath([]);
                                setRouteSnapped(false);
                            }}
                            className="text-[9px] font-black text-white bg-[#1c2d4f] hover:bg-[#111f38] px-2.5 py-1.5 rounded-lg shadow-sm transition-all uppercase tracking-wider"
                        >
                            Limpar
                        </button>
                        <button
                            onClick={() => setShowFilterPanel(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar-thin">
                    
                    {/* Filtro de Data Global (Afeta OS e Histórico) */}
                    <section className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Calendar size={12} /> Data do Mapa
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => {
                                if (e.target.value) {
                                    setSelectedDate(e.target.value);
                                }
                            }}
                            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-primary-500 transition-colors"
                        />
                        <p className="text-[10px] text-slate-400">Exibe OS agendadas para esta data.</p>
                    </section>

                    <hr className="border-slate-100" />

                    {/* Ativação do Histórico */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <History size={12} /> Histórico de Rotas
                            </label>
                            <button 
                                onClick={() => {
                                    setIsHistoryMode(!isHistoryMode);
                                    if (!isHistoryMode && !selectedHistoryTech && technicians.length > 0) {
                                        setSelectedHistoryTech(technicians[0]);
                                    }
                                }}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isHistoryMode ? 'bg-[#1c2d4f] shadow-inner' : 'bg-slate-300'}`}
                            >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isHistoryMode ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {isHistoryMode && (
                            <div className="space-y-3 animate-fade-in">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Selecione o Técnico</label>
                                <input 
                                    type="text"
                                    placeholder="Buscar por nome..."
                                    value={techSearch}
                                    onChange={e => setTechSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs outline-none focus:border-primary-500 transition-colors"
                                />
                                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto px-1">
                                    {technicians.filter(t => t.name.toLowerCase().includes(techSearch.toLowerCase())).map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedHistoryTech(t)}
                                            className={`flex items-center gap-3 p-2 rounded-xl border transition-all text-left ${selectedHistoryTech?.id === t.id ? 'bg-primary-50 border-primary-500 text-primary-900 shadow-sm' : 'bg-white border-slate-200 hover:border-primary-300 text-slate-700'}`}
                                        >
                                            <img src={t.avatar || `https://ui-avatars.com/api/?name=${t.name}&background=random`} className="w-8 h-8 rounded-full border border-slate-200" alt="" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold truncate leading-none mb-1">{t.name}</p>
                                                <p className="text-[10px] text-slate-500 truncate">{t.email}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                {/* Resumo Rodapé do Painel */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] font-bold text-slate-500">
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        {activeTechs.length} Técnicos Online
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full border-2 border-primary-500 bg-white"></span>
                        {mappedOrders.length} OS no Mapa
                    </div>
                </div>
            </div>

            {/* 📍 Integrated Legend Pill */}
            <div className="absolute bottom-6 left-6 z-[1001] pointer-events-none">
                <div className={`bg-white/95 backdrop-blur shadow-xl border border-slate-200 pointer-events-auto transition-all duration-300 ${showLegend ? 'rounded-2xl p-4 w-48' : 'rounded-full w-10 h-10 p-0 flex items-center justify-center'}`}>
                    <button
                        onClick={() => setShowLegend(!showLegend)}
                        className={`transition-all ${showLegend ? 'absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-600' : 'text-slate-600'}`}
                    >
                        {showLegend ? <X size={12} /> : <Layers size={18} />}
                    </button>

                    {showLegend && (
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2">Status Operacional</h4>
                            <div className="grid grid-cols-1 gap-2">
                                {Object.values(OrderStatus).map(status => (
                                    <div key={status} className="flex items-center gap-2 group">
                                        <div className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: getStatusColorHex(status) }}></div>
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tight truncate">{status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute inset-0 z-0">
                <MapContainer
                    center={[-15.7801, -47.9292] as any} // Brasília (Centro do Brasil)
                    zoom={4}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                    className="nexus-map"
                    ref={setMapInstance}
                >
                    <TileLayer attribution={tileAttribution} url={tileLayerUrl} />

                    {/* --- ORDERS RENDERING --- */}
                    <MarkerClusterGroup
                        chunkedLoading
                        iconCreateFunction={createClusterCustomIcon}
                        showCoverageOnHover={false}
                        maxClusterRadius={60}
                    >
                        {mappedOrders.map(o => (
                            <Marker
                                key={o.id}
                                position={[o.latitude!, o.longitude!] as any}
                                icon={createOrderIcon(o.status, o.displayId || o.id.split('-')[0])}
                            >
                                <Popup>
                                    <div 
                                        className="p-3 w-48 cursor-pointer hover:bg-slate-50 transition-colors group"
                                        title="Clique para abrir detalhes da OS"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(`${window.location.origin}/#/order/view/${o.publicToken || o.id}`, '_blank');
                                        }}
                                    >
                                        <p className="font-black text-sm text-[#1c2d4f] truncate group-hover:text-primary-600 transition-colors">{o.title}</p>
                                        <p className="text-[10px] text-slate-500 font-bold mb-2 break-all">{o.displayId || o.id}</p>

                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 mb-2 group-hover:border-primary-100 transition-colors">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getStatusColorHex(o.status) }}></span>
                                                <span className="text-[9px] font-black uppercase text-slate-700 tracking-wider tooltip">{o.status}</span>
                                            </div>
                                            <div className="flex items-start gap-1 text-[10px] text-slate-600">
                                                <MapPin size={12} className="shrink-0 text-slate-400 mt-0.5 group-hover:text-primary-500 transition-colors" />
                                                <span className="truncate">{o.customerAddress}</span>
                                            </div>
                                        </div>

                                        {o.scheduledDate && (
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mt-2">
                                                <Calendar size={12} className="text-primary-500" />
                                                <span>Agendado: {format(new Date(o.scheduledDate), "dd/MM/yyyy")} {o.scheduledTime}</span>
                                            </div>
                                        )}

                                        <div className="mt-3 flex justify-center items-center gap-2 text-[9px] font-black text-primary-600 uppercase bg-primary-50 py-1.5 rounded-lg group-hover:bg-primary-600 group-hover:text-white transition-all shadow-sm">
                                            <ExternalLink size={12} />
                                            <span>Abrir O.S</span>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MarkerClusterGroup>


                    {/* --- TECHS LIVE RENDERING --- */}
                    {activeTechs.map(t => {
                        const isMoving = isTechMoving(t.last_seen);
                        const activeOrder = getTechActiveOrder(t.id);
                        const activeOrderStatusColor = activeOrder ? getStatusColorHex(activeOrder.status) : undefined;

                        return (
                            <Marker
                                key={t.id}
                                position={[t.last_latitude!, t.last_longitude!] as any}
                                icon={createTechIcon(t.avatar || '', isMoving, activeOrderStatusColor)}
                            >
                                <Popup>
                                    <div className="p-2 w-48">
                                        <div className="flex items-center gap-2 mb-2">
                                            <img src={t.avatar || 'https://ui-avatars.com/api/?name=Tech'} className="w-10 h-10 rounded-lg object-cover shadow" alt={t.name} />
                                            <div className="overflow-hidden">
                                                <p className="font-black text-sm text-slate-900 truncate">{t.name}</p>
                                                <p className="text-[9px] text-slate-500 truncate">{t.email}</p>
                                            </div>
                                        </div>
                                        <div className="mb-2 flex flex-col gap-1">
                                            <span className={`inline-flex w-full justify-center items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase ${isMoving ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                {isMoving ? '🟢 Sinal GPS Recente' : '🔴 Sem Sinal (> 30m)'}
                                            </span>
                                            {activeOrder && (
                                                <span
                                                    className="inline-flex w-full justify-center items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase text-white shadow-sm truncate"
                                                    style={{ backgroundColor: activeOrderStatusColor }}
                                                    title={activeOrder.title || activeOrder.displayId}
                                                >
                                                    {String(activeOrder.status).toUpperCase().includes('DESLOCAMENTO') || String(activeOrder.status).toLowerCase().includes('travel')
                                                        ? '🚗 Deslocamento'
                                                        : '🛠️ Em Execução'
                                                    } - {activeOrder.displayId || (activeOrder.id && activeOrder.id.length > 8 ? activeOrder.id.split('-')[0] : activeOrder.id)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100 mb-2">
                                            <span className="text-[9px] text-slate-500 font-bold uppercase">Bateria:</span>
                                            <div className={`flex items-center gap-1 font-black text-[10px] ${(t.battery_level ?? 0) > 20 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                <div className="relative w-4 h-2 border border-current rounded-sm flex items-center p-px">
                                                    <div className="h-full bg-current rounded-[0.5px]" style={{ width: `${Math.min(t.battery_level ?? 0, 100)}%` }} />
                                                    <div className="absolute -right-0.5 top-0.5 w-0.5 h-1 bg-current rounded-e-sm" />
                                                </div>
                                                <span>{(t.battery_level !== undefined && t.battery_level !== null) ? `${Math.round(t.battery_level)}%` : '--'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                                            <Clock size={12} className="text-slate-400" />
                                            <span className="font-bold">{formatLastSeen(t.last_seen)}</span>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}

                    {/* --- TECHS HISTORY RENDERING --- */}
                    {isHistoryMode && routedPath.length > 0 && (() => {
                        const totalSegs = routedPath.length;
                        const getSegmentColors = (idx: number) => {
                            const t = totalSegs <= 1 ? 0 : idx / (totalSegs - 1);
                            if (t < 0.25) return { core: '#3b82f6', border: '#1e40af', highlight: '#93c5fd' };
                            if (t < 0.50) return { core: '#06b6d4', border: '#0e7490', highlight: '#a5f3fc' };
                            if (t < 0.75) return { core: '#10b981', border: '#047857', highlight: '#6ee7b7' };
                            return { core: '#f97316', border: '#c2410c', highlight: '#fed7aa' };
                        };

                        // Verifica se um segmento está próximo da parada selecionada
                        const isSegmentNearStop = (segment: [number, number][], stopIdx: number | null): boolean => {
                            if (stopIdx === null || !historyStops[stopIdx]) return false;
                            const stop = historyStops[stopIdx];
                            const distM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
                                const R = 6371e3;
                                const p1 = lat1*Math.PI/180, p2 = lat2*Math.PI/180;
                                const dp = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
                                const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
                                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                            };
                            // Checa se algum ponto do segmento está dentro de 300m da parada
                            const first = segment[0];
                            const last = segment[segment.length - 1];
                            return distM(first[0], first[1], stop.latitude, stop.longitude) < 300 ||
                                   distM(last[0], last[1], stop.latitude, stop.longitude) < 300;
                        };

                        return (
                            <>
                                {/* ROTAS COM GRADIENTE + HIGHLIGHT VERMELHO NA PARADA SELECIONADA */}
                                {routedPath.map((segment, idx) => {
                                    const nearSelected = isSegmentNearStop(segment, selectedStopIdx);
                                    const colors = nearSelected
                                        ? { core: '#ef4444', border: '#991b1b', highlight: '#fca5a5' }
                                        : getSegmentColors(idx);
                                    const dimmed = selectedStopIdx !== null && !nearSelected;
                                    return (
                                        <React.Fragment key={`seg-${idx}`}>
                                            <Polyline positions={segment as any} color="#000000" weight={nearSelected ? 12 : 10} opacity={dimmed ? 0.03 : 0.08} lineCap="round" lineJoin="round" />
                                            <Polyline positions={segment as any} color={colors.border} weight={nearSelected ? 8 : 6} opacity={dimmed ? 0.3 : 0.9} lineCap="round" lineJoin="round" />
                                            <Polyline positions={segment as any} color={colors.core} weight={nearSelected ? 5 : 3.5} opacity={dimmed ? 0.4 : 1} lineCap="round" lineJoin="round" />
                                            <Polyline positions={segment as any} color={colors.highlight} weight={nearSelected ? 2 : 1.2} opacity={dimmed ? 0.2 : 0.5} lineCap="round" lineJoin="round" />
                                        </React.Fragment>
                                    );
                                })}

                                {/* Marcador de INÍCIO — bandeira verde */}
                                {startPoint && (
                                    <Marker 
                                        position={[startPoint.latitude, startPoint.longitude] as any}
                                        icon={L.divIcon({
                                            className: '',
                                            html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#10b981;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">🚩</div>`,
                                            iconSize: [32, 32],
                                            iconAnchor: [16, 16]
                                        })}
                                    >
                                        <Popup>
                                            <div className="p-3 min-w-[180px]">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                                    <span className="font-black text-xs text-emerald-700 uppercase">Início do Dia</span>
                                                </div>
                                                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                                                    <span className="text-lg font-black text-emerald-600">{format(new Date(startPoint.recorded_at), "HH:mm", { locale: ptBR })}</span>
                                                    <p className="text-[9px] text-emerald-500 font-bold mt-0.5">Primeiro registro GPS</p>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}

                                {/* PONTOS DE PARADA — ícone diferenciado com card detalhado */}
                                {historyStops.map((stop, idx) => {
                                    const isSelected = selectedStopIdx === idx;
                                    const pinColor = isSelected ? '#ef4444' : '#f59e0b';
                                    return (
                                    <Marker
                                        key={`stop-${idx}`}
                                        position={[stop.latitude, stop.longitude] as any}
                                        icon={L.divIcon({
                                            className: '',
                                            html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
                                                <div style="width:${isSelected ? 34 : 28}px;height:${isSelected ? 34 : 28}px;background:${pinColor};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 12px rgba(0,0,0,${isSelected ? '0.5' : '0.3'});display:flex;align-items:center;justify-content:center;font-size:${isSelected ? 14 : 12}px;font-weight:900;color:#fff;transition:all 0.2s;">${idx + 1}</div>
                                                <div style="width:3px;height:8px;background:${pinColor};border-radius:0 0 2px 2px;"></div>
                                            </div>`,
                                            iconSize: [isSelected ? 34 : 28, isSelected ? 42 : 36],
                                            iconAnchor: [isSelected ? 17 : 14, isSelected ? 42 : 36]
                                        })}
                                        eventHandlers={{
                                            click: () => setSelectedStopIdx(prev => prev === idx ? null : idx)
                                        }}
                                    >
                                        <Popup>
                                            <div className="p-3 min-w-[220px] max-w-[260px]">
                                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-100">
                                                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-black text-sm">{idx + 1}</div>
                                                    <div>
                                                        <p className="font-black text-xs text-amber-700 uppercase">Parada #{idx + 1}</p>
                                                        <p className="text-[9px] text-slate-400 font-bold">{stop.pointCount} registros GPS</p>
                                                    </div>
                                                </div>
                                                
                                                {/* Timeline de entrada/saída */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200"></div>
                                                        <div className="flex-1 flex justify-between items-center">
                                                            <span className="text-[10px] text-slate-500 font-bold">Chegada</span>
                                                            <span className="text-xs font-black text-emerald-600">{format(new Date(stop.startTime), "HH:mm:ss", { locale: ptBR })}</span>
                                                        </div>
                                                    </div>
                                                    <div className="ml-[3px] w-0.5 h-3 bg-amber-200"></div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-200"></div>
                                                        <div className="flex-1 flex justify-between items-center">
                                                            <span className="text-[10px] text-slate-500 font-bold">Saída</span>
                                                            <span className="text-xs font-black text-red-600">{format(new Date(stop.endTime), "HH:mm:ss", { locale: ptBR })}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-3 bg-amber-50 rounded-lg p-2 text-center border border-amber-100">
                                                    <span className="text-[9px] text-amber-500 font-bold uppercase">Tempo parado</span>
                                                    <p className="text-lg font-black text-amber-600">
                                                        {stop.durationMins >= 60 
                                                            ? `${Math.floor(stop.durationMins/60)}h ${stop.durationMins%60}min`
                                                            : `${stop.durationMins} min`
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                    );
                                })}

                                {/* Marcador de FIM — bandeira vermelha */}
                                {endPoint && endPoint !== startPoint && (
                                    <Marker
                                        position={[endPoint.latitude, endPoint.longitude] as any}
                                        icon={L.divIcon({
                                            className: '',
                                            html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">📍</div>`,
                                            iconSize: [32, 32],
                                            iconAnchor: [16, 16]
                                        })}
                                    >
                                        <Popup>
                                            <div className="p-3 min-w-[180px]">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                    <span className="font-black text-xs text-red-700 uppercase">Último Registro</span>
                                                </div>
                                                <div className="bg-red-50 rounded-lg p-2 text-center">
                                                    <span className="text-lg font-black text-red-600">{format(new Date(endPoint.recorded_at), "HH:mm", { locale: ptBR })}</span>
                                                    <p className="text-[9px] text-red-400 font-bold mt-0.5">Último ponto GPS do dia</p>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}
                            </>
                        );
                    })()}
                </MapContainer>
            </div>
            {/* Custom Map Control Styles adjustments */}
            <style>{`
                .leaflet-control-zoom {
                    border: none !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                    margin-top: 80px !important;
                }
                .leaflet-control-zoom a {
                    background-color: rgba(255,255,255,0.95) !important;
                    color: #1c2d4f !important;
                    border: 1px solid rgba(28, 45, 79, 0.1) !important;
                    width: 36px !important;
                    height: 36px !important;
                    line-height: 36px !important;
                    font-size: 16px !important;
                    border-radius: 8px !important;
                }
                .leaflet-control-zoom a:first-child {
                    margin-bottom: 4px;
                }
                .leaflet-bottom {
                    z-index: 100 !important;
                }
            `}</style>
        </div>
    );
};
