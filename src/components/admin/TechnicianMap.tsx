import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, MapPin, Clock, RefreshCw, Calendar, Search, Map as MapIcon, Layers, Satellite, Users, ClipboardList, X, ChevronDown, ChevronUp, Filter, ExternalLink } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { CacheManager } from '../../lib/cache';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { OrderStatus } from '../../types';
import { normalizeOrderStatus } from '../ui/StatusBadge';

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

const getStatusColorHex = (status: OrderStatus | string) => {
    const normalized = normalizeOrderStatus(status as string);
    switch (normalized) {
        case OrderStatus.PENDING:     return '#3b82f6';
        case OrderStatus.ASSIGNED:    return '#1d4ed8';
        case OrderStatus.TRAVELING:   return '#f59e0b';
        case OrderStatus.IN_PROGRESS: return '#eab308';
        case OrderStatus.COMPLETED:   return '#10b981';
        case OrderStatus.CANCELED:    return '#d946ef';
        case OrderStatus.BLOCKED:     return '#ef4444';
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
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

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
    // ROTA LIMPA E SEM RUÍDOS (REMOVIDO)
    // ═══════════════════════════════════════════════════════════════════════

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

        if (!selectedDate) return true;

        let dateMatched = false;
        if (o.scheduledDate && String(o.scheduledDate).includes(selectedDate)) {
            dateMatched = true;
        }
        if (o.createdAt && String(o.createdAt).includes(selectedDate)) {
            dateMatched = true;
        }

        return dateMatched;
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
                                setTechSearch('');
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
                        {mappedOrders.map(o => {
                            const assignedTech = technicians.find(t => t.id === o.assignedTo);
                            return (
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
                                            <p className="text-[10px] text-slate-500 font-bold mb-1 break-all">{o.displayId || o.id}</p>
                                            {o.customerName && (
                                                <p className="text-[11px] font-bold text-slate-700 mb-2 truncate">🏢 {o.customerName}</p>
                                            )}

                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 mb-2 group-hover:border-primary-100 transition-colors">
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                    <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getStatusColorHex(o.status) }}></span>
                                                    <span className="text-[9px] font-black uppercase text-slate-700 tracking-wider">{normalizeOrderStatus(o.status as string)}</span>
                                                </div>
                                                <div className="flex items-start gap-1 text-[10px] text-slate-600">
                                                    <MapPin size={12} className="shrink-0 text-slate-400 mt-0.5 group-hover:text-primary-500 transition-colors" />
                                                    <span className="truncate">{o.customerAddress}</span>
                                                </div>
                                            </div>

                                            {assignedTech && (
                                                <div className="flex items-center gap-2 mb-2 bg-white border border-slate-100 p-1.5 rounded-lg shadow-sm">
                                                    <img src={assignedTech.avatar || `https://ui-avatars.com/api/?name=${assignedTech.name}&background=random`} className="w-6 h-6 rounded-full border border-slate-200" alt="" />
                                                    <div className="overflow-hidden">
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-0.5">Técnico Atribuído</p>
                                                        <p className="text-[10px] font-bold text-slate-700 truncate leading-none">{assignedTech.name}</p>
                                                    </div>
                                                </div>
                                            )}

                                            {o.scheduledDate && (
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mt-2">
                                                    <Calendar size={12} className="text-primary-500" />
                                                    <span>Agendado: {format(new Date(o.scheduledDate), "dd/MM/yyyy")} {o.scheduledTime}</span>
                                                </div>
                                            )}

                                            <div className="mt-3 flex justify-center items-center gap-2 text-[9px] font-black text-white uppercase bg-[#1c2d4f] hover:bg-[#111f38] py-2 rounded-lg transition-all shadow-sm">
                                                <ExternalLink size={12} />
                                                <span>Abrir O.S</span>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
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
