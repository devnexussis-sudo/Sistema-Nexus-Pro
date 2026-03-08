import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, MapPin, Clock, RefreshCw, History, Calendar, Search, Map as MapIcon, Layers, Satellite, Users, ClipboardList, X } from 'lucide-react';
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
            {/* 🔮 NEXUS SMART CONTROL PANEL (Glassmorphism) */}
            <div className="absolute top-6 left-6 z-[1002] flex flex-col gap-4 w-80 pointer-events-none">

                {/* 🏷️ Info Header */}
                <div className="bg-[#1c2d4f]/95 backdrop-blur-xl rounded-[2rem] p-6 shadow-2xl border border-white/10 pointer-events-auto transition-all hover:shadow-primary-900/20">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col">
                            <h2 className="text-xl font-black text-white italic tracking-tighter">Nexus <span className="text-primary-400">Map</span></h2>
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] leading-none">Console de Operações</p>
                        </div>
                        <div className={`p-2 rounded-2xl ${isAutoRefresh ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-white/5 border border-white/10'}`}>
                            <Navigation size={18} className={isAutoRefresh ? 'text-emerald-400 animate-pulse' : 'text-white/40'} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                            <p className="text-[8px] font-black text-white/30 uppercase mb-1">Técnicos Ativos</p>
                            <div className="flex items-end gap-1">
                                <span className="text-xl font-black text-white leading-none">{activeTechs.length}</span>
                                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-tighter pb-0.5">Online</span>
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                            <p className="text-[8px] font-black text-white/30 uppercase mb-1">OS Localizadas</p>
                            <div className="flex items-end gap-1">
                                <span className="text-xl font-black text-white leading-none">{mappedOrders.length}</span>
                                <span className="text-[9px] font-bold text-primary-400 uppercase tracking-tighter pb-0.5">Map</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Última Atualização</span>
                            <span className="text-[10px] font-bold text-white/60">{format(lastUpdated, 'HH:mm:ss')}</span>
                        </div>
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className={`p-2.5 rounded-xl transition-all ${isRefreshing ? 'bg-primary-500 text-white animate-spin' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>

                {/* 🎮 Map & Data Controls */}
                <div className="bg-white/90 backdrop-blur-xl rounded-[2rem] p-6 shadow-2xl border border-white/50 pointer-events-auto space-y-5">

                    {/* View Switcher */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl overflow-hidden">
                        <button
                            onClick={() => { setViewMode('ORDERS'); setIsHistoryMode(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${viewMode === 'ORDERS' ? 'bg-white text-[#1c2d4f] shadow-sm' : 'text-slate-400'}`}
                        >
                            <ClipboardList size={14} /> Ordens
                        </button>
                        <button
                            onClick={() => setViewMode('TECHS')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${viewMode === 'TECHS' ? 'bg-white text-[#1c2d4f] shadow-sm' : 'text-slate-400'}`}
                        >
                            <Users size={14} /> Técnicos
                        </button>
                    </div>

                    {/* Date Filters */}
                    {!isHistoryMode && (
                        <div className="space-y-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Período Selecionado</p>
                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1 px-3 h-12">
                                <Calendar size={14} className="text-primary-600" />
                                <div className="flex items-center gap-1 flex-1">
                                    <input
                                        type="date"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                        className="bg-transparent text-[10px] font-black text-slate-700 outline-none w-full"
                                    />
                                    <div className="w-px h-3 bg-slate-200 mx-1"></div>
                                    <input
                                        type="date"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                        className="bg-transparent text-[10px] font-black text-slate-700 outline-none w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Toggles */}
                    <div className="grid grid-cols-1 gap-2">
                        <button
                            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                            className={`flex items-center justify-between p-4 rounded-[1.5rem] border transition-all ${isAutoRefresh ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}
                        >
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isAutoRefresh ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isAutoRefresh ? 'text-emerald-700' : 'text-slate-500'}`}>Monitoramento Live</span>
                            </div>
                            <div className={`w-8 h-4 rounded-full relative transition-colors ${isAutoRefresh ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isAutoRefresh ? 'left-4.5' : 'left-0.5'}`} style={{ left: isAutoRefresh ? '18px' : '2px' }}></div>
                            </div>
                        </button>

                        <button
                            onClick={() => setMapType(prev => prev === 'DEFAULT' ? 'SATELLITE' : 'DEFAULT')}
                            className={`flex items-center justify-between p-4 rounded-[1.5rem] border transition-all ${mapType === 'SATELLITE' ? 'bg-[#1c2d4f] text-white border-primary-500/30' : 'bg-slate-50 border-slate-200'}`}
                        >
                            <div className="flex items-center gap-2">
                                <Satellite size={14} className={mapType === 'SATELLITE' ? 'text-primary-400' : 'text-slate-400'} />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${mapType === 'SATELLITE' ? 'text-white' : 'text-slate-500'}`}>Mapa Satélite</span>
                            </div>
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${mapType === 'SATELLITE' ? 'bg-white/10 text-primary-300' : 'bg-slate-200 text-slate-400'}`}>
                                {mapType === 'SATELLITE' ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        {viewMode === 'TECHS' && (
                            <button
                                onClick={() => setIsHistoryMode(!isHistoryMode)}
                                className={`flex items-center justify-between p-4 rounded-[1.5rem] border transition-all ${isHistoryMode ? 'bg-primary-600 text-white border-primary-500' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <History size={14} className={isHistoryMode ? 'text-white' : 'text-slate-400'} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isHistoryMode ? 'text-white' : 'text-slate-500'}`}>Modo Histórico</span>
                                </div>
                                <X size={14} className={isHistoryMode ? 'rotate-0' : 'rotate-45 opacity-0'} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 🕒 Side History Drawer (Big Tech Style) */}
            <div className={`absolute top-0 right-0 bottom-0 z-[1003] w-full max-w-sm transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${isHistoryMode ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full bg-white/95 backdrop-blur-xl shadow-2xl border-l border-slate-200 flex flex-col pt-24 px-6 gap-6 relative">
                    <button
                        onClick={() => setIsHistoryMode(false)}
                        className="absolute top-6 left-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex flex-col gap-1 mt-4">
                        <h2 className="text-2xl font-black text-[#1c2d4f] italic tracking-tighter">Histórico</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Rastreamento de ativos e rotas</p>
                    </div>

                    <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar-thin pr-2">
                        {/* Seletor de Técnico */}
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-[10px] font-black text-primary-600 uppercase tracking-widest">
                                <Users size={12} /> Selecionar Técnico
                            </label>
                            <div className="grid grid-cols-1 gap-2">
                                {technicians.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedHistoryTech(t)}
                                        className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${selectedHistoryTech?.id === t.id ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-100' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <img src={t.avatar || `https://ui-avatars.com/api/?name=${t.name}&background=random`} className="w-8 h-8 rounded-full border border-white shadow-sm" alt="" />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-[11px] font-black uppercase truncate ${selectedHistoryTech?.id === t.id ? 'text-primary-700' : 'text-slate-700'}`}>{t.name}</p>
                                            <p className="text-[8px] text-slate-400 truncate tracking-tight">{t.email}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Seletor de Data */}
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-[10px] font-black text-primary-600 uppercase tracking-widest">
                                <Calendar size={12} /> Período
                            </label>
                            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 italic">
                                <input
                                    type="date"
                                    value={selectedHistoryDate}
                                    onChange={(e) => setSelectedHistoryDate(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full bg-transparent border-none text-sm font-black text-slate-700 outline-none"
                                />
                            </div>
                        </div>

                        {/* Estatística do Percurso */}
                        {selectedHistoryTech && (
                            <div className="bg-slate-900 rounded-[2rem] p-6 text-white overflow-hidden relative group">
                                <div className="absolute -right-4 -top-4 p-8 opacity-10 group-hover:scale-110 transition-transform"><Navigation size={120} /></div>
                                <p className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mb-4">Resumo do Percurso</p>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col">
                                        {isLoadingHistory ? (
                                            <RefreshCw size={24} className="animate-spin text-white mb-2" />
                                        ) : (
                                            <span className="text-3xl font-black italic leading-none mb-1">{historyPath.length}</span>
                                        )}
                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Registros</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-3xl font-black italic leading-none mb-1">{isMovingTechsHistory ? 'ATIVO' : 'PARADO'}</span>
                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Status Médio</span>
                                    </div>
                                </div>

                                <div className="mt-6 pt-6 border-t border-white/10">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Rota Disponível</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!selectedHistoryTech && !technicians.length && (
                            <div className="py-10 text-center flex flex-col items-center gap-4 opacity-30">
                                <Search size={40} className="text-slate-300" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nenhum técnico encontrado</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Legend Overlay for OS */}
            {viewMode === 'ORDERS' && (
                <div className="absolute bottom-6 mb-8 md:mb-0 left-4 z-[1000] bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/20 pointer-events-auto max-w-[200px]">
                    <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Status da OS</h4>
                    <div className="space-y-2">
                        {Object.values(OrderStatus).map(status => (
                            <div key={status} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: getStatusColorHex(status) }}></div>
                                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter truncate">{status}</span>
                            </div>
                        ))}
                    </div>
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
