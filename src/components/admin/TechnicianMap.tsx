import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, MapPin, Clock, RefreshCw, History, Calendar, Search, Map as MapIcon, Layers, Satellite, Users, ClipboardList, X, ChevronDown, ChevronUp, Filter } from 'lucide-react';
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
    const [viewMode, setViewMode] = useState<'TECHS' | 'ORDERS'>('ORDERS');
    const [mapType, setMapType] = useState<'DEFAULT' | 'SATELLITE'>('DEFAULT');
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAutoRefresh, setIsAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showLegend, setShowLegend] = useState(true);

    // 👷 Techs State
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [isHistoryMode, setIsHistoryMode] = useState(false);
    const [selectedHistoryTech, setSelectedHistoryTech] = useState<Technician | null>(null);
    const [selectedHistoryDate, setSelectedHistoryDate] = useState(new Date().toISOString().split('T')[0]);
    const [historyPath, setHistoryPath] = useState<LocationHistory[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // 📋 Orders State
    const [orders, setOrders] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);

    // 📅 Date Filter State (Padrão: Mês Vigente)
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

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

    const loadHistoryPath = async (techId: string, date: string) => {
        setIsLoadingHistory(true);
        try {
            const startDateObj = new Date(date);
            startDateObj.setHours(0, 0, 0, 0);
            const endDateObj = new Date(date);
            endDateObj.setHours(23, 59, 59, 999);

            const { data, error } = await DataService.getServiceClient()
                .from('technician_location_history')
                .select('latitude, longitude, recorded_at')
                .eq('technician_id', techId)
                .gte('recorded_at', startDateObj.toISOString())
                .lte('recorded_at', endDateObj.toISOString())
                .order('recorded_at', { ascending: true });

            if (error) throw error;
            setHistoryPath(data || []);

            if (data && data.length > 0 && mapInstance) {
                const bounds = L.latLngBounds(data.map(p => [p.latitude, p.longitude]));
                mapInstance.fitBounds(bounds, { padding: [50, 50] });
            }
        } catch (error) {
            console.error('[Map] Erro ao carregar histórico:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (isHistoryMode && selectedHistoryTech) {
            loadHistoryPath(selectedHistoryTech.id, selectedHistoryDate);
        } else {
            setHistoryPath([]);
        }
    }, [isHistoryMode, selectedHistoryTech, selectedHistoryDate]);

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

    const activeTechs = technicians.filter(t =>
        t.last_latitude !== undefined && t.last_latitude !== null &&
        t.last_longitude !== undefined && t.last_longitude !== null &&
        t.active !== false
    );
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

        // Filtro por Data (Mês Vigente por padrão)
        if (o.scheduledDate) {
            const orderDate = parseISO(o.scheduledDate);
            const start = parseISO(dateRange.start);
            const end = parseISO(dateRange.end);
            end.setHours(23, 59, 59, 999);

            return isWithinInterval(orderDate, { start, end });
        }
        return false;
    });

    const tileLayerUrl = mapType === 'SATELLITE'
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    const tileAttribution = mapType === 'SATELLITE'
        ? "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
        : "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors &copy; <a href='https://carto.com/attributions'>CARTO</a>";


    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden font-sans">
            {/* 🔮 NEXUS SMART CONTROL PANEL (Compact & Glassmorphism) */}
            <div className={`absolute top-4 left-4 z-[1002] flex flex-col gap-3 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isCollapsed ? 'w-14' : 'w-72'} pointer-events-none`}>

                {/* 🏷️ Info Header & Main Controls */}
                <div className="bg-[#1c2d4f]/95 backdrop-blur-xl rounded-[1.5rem] p-3 shadow-2xl border border-white/10 pointer-events-auto transition-all hover:shadow-primary-900/20">
                    <div className="flex items-center justify-between gap-2">
                        <div className={`flex flex-col transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'flex-1'}`}>
                            <h2 className="text-sm font-black text-white italic tracking-tighter leading-tight">Nexus <span className="text-primary-400">Map</span></h2>
                            <p className="text-[7px] font-black text-white/40 uppercase tracking-[0.1em] leading-none">Console de Op.</p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            {!isCollapsed && (
                                <button
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className={`p-1.5 rounded-lg transition-all ${isRefreshing ? 'bg-primary-500 text-white animate-spin' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                    title="Atualizar agora"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            )}
                            <button
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="p-2 rounded-xl bg-white/10 border border-white/10 text-white hover:bg-white/20 transition-all shadow-lg"
                                title={isCollapsed ? "Menu Principal" : "Recolher Menu"}
                            >
                                {isCollapsed ? <MapIcon size={18} /> : <ChevronUp size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Stats Summary (Visible when expanded) */}
                    <div className={`transition-all duration-500 overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0 mt-0' : 'max-h-[100px] opacity-100 mt-3 border-t border-white/5 pt-3'}`}>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                                <p className="text-[7px] font-black text-white/30 uppercase mb-0.5">Online</p>
                                <span className="text-sm font-black text-white">{activeTechs.length}</span>
                            </div>
                            <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                                <p className="text-[7px] font-black text-white/30 uppercase mb-0.5">OS</p>
                                <span className="text-sm font-black text-white">{mappedOrders.length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 🎮 Detailed Controls (Visible when expanded) */}
                <div className={`bg-white/95 backdrop-blur-xl rounded-[1.5rem] shadow-2xl border border-white/50 pointer-events-auto overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isCollapsed ? 'max-h-0 p-0 opacity-0 border-none' : 'max-h-[600px] p-4 opacity-100'}`}>
                    <div className="space-y-4">
                        {/* View Switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button
                                onClick={() => { setViewMode('ORDERS'); setIsHistoryMode(false); }}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${viewMode === 'ORDERS' ? 'bg-white text-[#1c2d4f] shadow-sm' : 'text-slate-400'}`}
                            >
                                <ClipboardList size={12} /> Ordens
                            </button>
                            <button
                                onClick={() => setViewMode('TECHS')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${viewMode === 'TECHS' ? 'bg-white text-[#1c2d4f] shadow-sm' : 'text-slate-400'}`}
                            >
                                <Users size={12} /> Técnicos
                            </button>
                        </div>

                        {/* Date Filters */}
                        {!isHistoryMode && (
                            <div className="space-y-1.5">
                                <p className="text-[8px] font-black text-slate-400 uppercase px-1">Período</p>
                                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 px-2">
                                    <input
                                        type="date"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                        className="bg-transparent text-[9px] font-bold text-slate-700 outline-none w-full"
                                    />
                                    <span className="text-slate-300 text-[10px]">-</span>
                                    <input
                                        type="date"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                        className="bg-transparent text-[9px] font-bold text-slate-700 outline-none w-full"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Toggles */}
                        <div className="flex flex-col gap-1.5">
                            <button
                                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${isAutoRefresh ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                    <span className={`text-[9px] font-black uppercase ${isAutoRefresh ? 'text-emerald-700' : 'text-slate-500'}`}>Monitoramento Live</span>
                                </div>
                                <div className={`w-6 h-3 rounded-full relative transition-colors ${isAutoRefresh ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                    <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${isAutoRefresh ? 'left-3.5' : 'left-0.5'}`}></div>
                                </div>
                            </button>

                            <button
                                onClick={() => setMapType(prev => prev === 'DEFAULT' ? 'SATELLITE' : 'DEFAULT')}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${mapType === 'SATELLITE' ? 'bg-[#1c2d4f] text-white border-primary-500/30' : 'bg-slate-50 border-slate-200'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <Satellite size={12} className={mapType === 'SATELLITE' ? 'text-primary-400' : 'text-slate-400'} />
                                    <span className={`text-[9px] font-black uppercase ${mapType === 'SATELLITE' ? 'text-white' : 'text-slate-500'}`}>Satélite</span>
                                </div>
                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${mapType === 'SATELLITE' ? 'bg-white/10 text-primary-300' : 'bg-slate-200 text-slate-400'}`}>
                                    {mapType === 'SATELLITE' ? 'ON' : 'OFF'}
                                </span>
                            </button>

                            {viewMode === 'TECHS' && (
                                <button
                                    onClick={() => setIsHistoryMode(!isHistoryMode)}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${isHistoryMode ? 'bg-primary-600 text-white border-primary-500' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <History size={12} className={isHistoryMode ? 'text-white' : 'text-slate-400'} />
                                        <span className={`text-[9px] font-black uppercase ${isHistoryMode ? 'text-white' : 'text-slate-500'}`}>Histórico</span>
                                    </div>
                                    <ChevronDown size={12} className={isHistoryMode ? 'rotate-180' : 'rotate-0'} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 🕒 Side History Drawer (Compact Version) */}
            <div className={`absolute top-0 right-0 bottom-0 z-[1003] w-80 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${isHistoryMode ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full bg-white/95 backdrop-blur-xl shadow-2xl border-l border-slate-200 flex flex-col pt-20 px-4 pb-4 gap-4 relative">
                    <button
                        onClick={() => setIsHistoryMode(false)}
                        className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
                    >
                        <X size={18} />
                    </button>

                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-black text-[#1c2d4f] italic tracking-tighter">Histórico</h2>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Rastreamento de ativos</p>
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar-thin pr-1">
                        {/* Seletor de Técnico */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[8px] font-black text-primary-600 uppercase tracking-widest px-1">
                                <Users size={10} /> Técnico
                            </label>
                            <div className="grid grid-cols-1 gap-1.5">
                                {technicians.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedHistoryTech(t)}
                                        className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all text-left ${selectedHistoryTech?.id === t.id ? 'bg-primary-50 border-primary-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <img src={t.avatar || `https://ui-avatars.com/api/?name=${t.name}&background=random`} className="w-6 h-6 rounded-full border border-white shadow-sm" alt="" />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-[10px] font-black uppercase truncate ${selectedHistoryTech?.id === t.id ? 'text-primary-700' : 'text-slate-700'}`}>{t.name}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Seletor de Data */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[8px] font-black text-primary-600 uppercase tracking-widest px-1">
                                <Calendar size={10} /> Data
                            </label>
                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <input
                                    type="date"
                                    value={selectedHistoryDate}
                                    onChange={(e) => setSelectedHistoryDate(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full bg-transparent border-none text-[11px] font-black text-slate-700 outline-none"
                                />
                            </div>
                        </div>

                        {/* Estatística do Percurso */}
                        {selectedHistoryTech && (
                            <div className="bg-slate-900 rounded-2xl p-4 text-white overflow-hidden relative group">
                                <p className="text-[8px] font-black text-primary-400 uppercase tracking-widest mb-3">Resumo</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col">
                                        <span className="text-xl font-black italic">{isLoadingHistory ? '...' : historyPath.length}</span>
                                        <span className="text-[7px] font-black text-white/40 uppercase">Pontos</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xl font-black italic">{isMovingTechsHistory ? 'ATIVO' : 'PARADO'}</span>
                                        <span className="text-[7px] font-black text-white/40 uppercase">Status</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Legend Overlay (Integrated & Minimalist) */}
            {viewMode === 'ORDERS' && (
                <div className={`absolute bottom-6 left-6 z-[1001] bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 pointer-events-auto transition-all duration-300 ease-out ${showLegend ? 'p-3 w-40' : 'p-2 w-10 h-10 flex items-center justify-center overflow-hidden'}`}>
                    <button
                        onClick={() => setShowLegend(!showLegend)}
                        className={`transition-all ${showLegend ? 'absolute top-2 right-2 text-slate-400 hover:text-slate-600' : 'text-primary-600'}`}
                    >
                        {showLegend ? <X size={10} /> : <Layers size={16} />}
                    </button>

                    {showLegend ? (
                        <>
                            <h4 className="text-[8px] font-black text-[#1c2d4f] uppercase tracking-widest mb-2 border-b border-slate-100 pb-1">Legenda OS</h4>
                            <div className="grid grid-cols-1 gap-1.5">
                                {Object.values(OrderStatus).map(status => (
                                    <div key={status} className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full border border-black/5 shrink-0" style={{ backgroundColor: getStatusColorHex(status) }}></div>
                                        <span className="text-[8px] font-bold text-slate-600 uppercase truncate">{status}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : null}
                </div>
            )}

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

                    {/* --- ORDERS MODE RENDERING --- */}
                    {viewMode === 'ORDERS' && (
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
                                        <div className="p-3 w-48">
                                            <p className="font-black text-sm text-[#1c2d4f] truncate">{o.title}</p>
                                            <p className="text-[10px] text-slate-500 font-bold mb-2 break-all">{o.displayId || o.id}</p>

                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 mb-2">
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusColorHex(o.status) }}></span>
                                                    <span className="text-[9px] font-black uppercase text-slate-700 tracking-wider tooltip">{o.status}</span>
                                                </div>
                                                <div className="flex items-start gap-1 text-[10px] text-slate-600">
                                                    <MapPin size={12} className="shrink-0 text-slate-400 mt-0.5" />
                                                    <span className="truncate">{o.customerAddress}</span>
                                                </div>
                                            </div>

                                            {o.scheduledDate && (
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mt-2">
                                                    <Calendar size={12} className="text-primary-500" />
                                                    <span>Agendado: {format(new Date(o.scheduledDate), "dd/MM/yyyy")} {o.scheduledTime}</span>
                                                </div>
                                            )}
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MarkerClusterGroup>
                    )}


                    {/* --- TECHS LIVE MODE RENDERING --- */}
                    {viewMode === 'TECHS' && !isHistoryMode && activeTechs.map(t => {
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

                    {/* --- TECHS HISTORY MODE RENDERING --- */}
                    {viewMode === 'TECHS' && isHistoryMode && historyPath.length > 0 && (
                        <>
                            <Polyline
                                positions={historyPath.map(p => [p.latitude, p.longitude]) as any}
                                color="var(--color-primary-600, #1c2d4f)"
                                weight={4}
                                opacity={0.8}
                                dashArray="5, 10"
                            />
                            {historyPath.map((point, idx) => (
                                <CircleMarker
                                    key={`hist-${idx}`}
                                    center={[point.latitude, point.longitude] as any}
                                    radius={5}
                                    pathOptions={{
                                        fillColor: idx === 0 ? '#10b981' : (idx === historyPath.length - 1 ? '#ef4444' : '#1c2d4f'),
                                        color: 'white',
                                        weight: 2,
                                        fillOpacity: 1
                                    }}
                                >
                                    <Popup>
                                        <div className="p-2 min-w-[150px]">
                                            <p className="font-black text-[10px] text-slate-900 uppercase">Ponto #{idx + 1}</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">
                                                {format(new Date(point.recorded_at), "HH:mm:ss 'em' dd/MM", { locale: ptBR })}
                                            </p>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            ))}
                        </>
                    )}
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
