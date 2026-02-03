import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, MapPin, Clock, RefreshCw, History, Calendar, ChevronLeft, Search, User } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
}

interface LocationHistory {
    latitude: number;
    longitude: number;
    recorded_at: string;
}

const createTechIcon = (avatarUrl: string, isMoving: boolean = true) => {
    const borderColor = isMoving ? '#10b981' : '#94a3b8'; // Verde se em movimento, cinza se parado
    const statusColor = isMoving ? '#10b981' : '#ef4444'; // Verde se em movimento, vermelho se parado
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
                <img src="${avatarUrl}" style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid ${borderColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.3); object-fit: cover; ${isMoving ? '' : 'opacity: 0.7;'}" />
                <div style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; background: ${statusColor}; border: 2px solid white; border-radius: 50%; ${pulseAnimation}"></div>
            </div>
        `,
        className: 'tech-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
    });
};

export const TechnicianMap: React.FC = () => {
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // 🕒 History Mode States
    const [isHistoryMode, setIsHistoryMode] = useState(false);
    const [selectedHistoryTech, setSelectedHistoryTech] = useState<Technician | null>(null);
    const [selectedHistoryDate, setSelectedHistoryDate] = useState(new Date().toISOString().split('T')[0]);
    const [historyPath, setHistoryPath] = useState<LocationHistory[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

    useEffect(() => {
        loadTechnicians();
        const interval = setInterval(loadTechnicians, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    // 🌙 Verifica se virou o dia e limpa cache automaticamente
    useEffect(() => {
        const checkDailyReset = () => {
            const lastResetDate = sessionStorage.getItem('last_map_reset_date');
            const today = new Date().toDateString();

            if (lastResetDate !== today) {
                console.log('[Map] 🌙 Novo dia detectado! Limpando cache do mapa...');
                const tenantId = DataService.getCurrentTenantId();
                if (tenantId) {
                    DataService.invalidateCache(`techs_${tenantId}`);
                }
                sessionStorage.setItem('last_map_reset_date', today);
                loadTechnicians();
            }
        };

        checkDailyReset();
        // Verifica a cada 5 minutos se virou o dia
        const resetInterval = setInterval(checkDailyReset, 5 * 60 * 1000);
        return () => clearInterval(resetInterval);
    }, []);


    const loadTechnicians = async () => {
        try {
            const techs = await DataService.getAllTechnicians();
            setTechnicians(techs);
        } catch (error) {
            console.error('[Map] Erro ao carregar técnicos:', error);
        }
    };

    // 🔄 Força atualização com invalidação de cache
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            // Invalida o cache antes de recarregar
            const tenantId = DataService.getCurrentTenantId();
            if (tenantId) {
                DataService.invalidateCache(`techs_${tenantId}`);
            }
            // Recarrega dados frescos
            await loadTechnicians();
        } catch (error) {
            console.error('[Map] Erro ao atualizar:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const loadHistoryPath = async (techId: string, date: string) => {
        setIsLoadingHistory(true);
        try {
            const { data, error } = await DataService.getServiceClient()
                .from('technician_location_history')
                .select('latitude, longitude, recorded_at')
                .eq('technician_id', techId)
                .eq('date', date)
                .order('recorded_at', { ascending: true });

            if (error) throw error;
            setHistoryPath(data || []);

            // Centralizar no caminho se houver pontos
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

    const activeTechs = technicians.filter(t =>
        t.last_latitude && t.last_longitude && t.active !== false
    );

    const filteredTechs = activeTechs.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

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

    // Verifica se o técnico está em movimento (ping nos últimos 5 minutos)
    const isTechMoving = (lastSeen?: string): boolean => {
        if (!lastSeen) return false;
        const diff = Date.now() - new Date(lastSeen).getTime();
        const minutes = Math.floor(diff / 60000);
        return minutes < 5; // Considera "em movimento" se ping foi há menos de 5 min
    };

    // Separa técnicos em movimento dos parados
    const movingTechs = activeTechs.filter(t => isTechMoving(t.last_seen));
    const stoppedTechs = activeTechs.filter(t => !isTechMoving(t.last_seen));

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* 🔮 NEXUS COMPACT TOP BAR */}
            <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center gap-2">
                {/* Radar Info */}
                <div className="bg-white/90 backdrop-blur-md rounded-full px-4 py-2 shadow-lg border border-white/20 flex items-center gap-2">
                    <div className="p-1 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-600/20">
                        <Navigation size={12} className="text-white" />
                    </div>
                    <span className="text-[8px] font-black text-slate-900 uppercase tracking-wider">Radar</span>
                    <div className="w-px h-3 bg-slate-300"></div>
                    <span className="text-[7px] font-black text-slate-400 uppercase">Em movimento:</span>
                    <span className="text-[9px] font-black text-emerald-600">{activeTechs.length}</span>
                    <div className="w-px h-3 bg-slate-300"></div>
                    <div className="flex items-center gap-1">
                        <span className="text-[7px] font-black text-slate-400 uppercase">Parados:</span>
                        <span className="text-[9px] font-black text-red-600">{stoppedTechs.length}</span>
                    </div>
                </div>

                {/* Search Bar - Expandable */}
                <div className="flex-1 max-w-xs">
                    <input
                        type="text"
                        placeholder="Buscar técnico..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-white/90 backdrop-blur-md border border-white/20 rounded-full px-4 py-2 text-[8px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all italic placeholder:text-slate-400 shadow-lg"
                    />
                </div>

                {/* Refresh Button - Only in Live Mode */}
                {!isHistoryMode && (
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="bg-white/90 backdrop-blur-md rounded-full p-2.5 shadow-lg border border-white/20 hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                        title="Atualizar posições"
                    >
                        <RefreshCw
                            size={14}
                            className={`text-indigo-600 transition-transform ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`}
                        />
                    </button>
                )}

                {/* History Toggle Button */}
                <button
                    onClick={() => setIsHistoryMode(!isHistoryMode)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg border transition-all font-black text-[8px] uppercase tracking-widest ${isHistoryMode
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : 'bg-white/90 backdrop-blur-md text-slate-600 border-white/20 hover:bg-indigo-50'
                        }`}
                >
                    <History size={14} />
                    {isHistoryMode ? 'Modo Histórico' : 'Ver Histórico'}
                </button>

                {/* Legend - Only in Live Mode */}
                {!isHistoryMode && (
                    <div className="bg-white/90 backdrop-blur-md rounded-full py-2 px-4 shadow-lg border border-white/20 flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">Em Movimento</span>
                        </div>
                        <div className="w-px h-2 bg-slate-200"></div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                            <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">Parado</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 🕒 History Controls Overlay */}
            {isHistoryMode && (
                <div className="absolute top-20 left-4 right-4 z-[1000] flex flex-wrap gap-3 pointer-events-none">
                    <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-indigo-100 flex flex-col md:flex-row items-center gap-4 pointer-events-auto">
                        <div className="flex flex-col gap-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase tracking-wider">Técnico</label>
                            <select
                                value={selectedHistoryTech?.id || ''}
                                onChange={(e) => setSelectedHistoryTech(technicians.find(t => t.id === e.target.value) || null)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="">Selecione um técnico</option>
                                {technicians.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[7px] font-black text-slate-400 uppercase tracking-wider">Data do Percurso</label>
                            <input
                                type="date"
                                value={selectedHistoryDate}
                                onChange={(e) => setSelectedHistoryDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        {selectedHistoryTech && (
                            <div className="flex flex-col gap-1 items-center px-4 border-l border-slate-100">
                                {isLoadingHistory ? (
                                    <RefreshCw size={16} className="text-indigo-600 animate-spin" />
                                ) : (
                                    <>
                                        <span className="text-[12px] font-black text-indigo-600">{historyPath.length}</span>
                                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-wider">Pontos</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Technician List - Floating Left Sidebar (only when searching) */}
            {searchQuery && filteredTechs.length > 0 && (
                <div className="absolute top-16 left-4 z-[1000] w-64 bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-white/20 max-h-96 overflow-y-auto custom-scrollbar">
                    <div className="space-y-1">
                        {filteredTechs.map(t => (
                            <div
                                key={t.id}
                                className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/50 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all cursor-pointer group"
                            >
                                <img src={t.avatar} className="w-8 h-8 rounded-lg object-cover shadow-sm" alt={t.name} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black text-slate-900 uppercase truncate leading-none">{t.name}</p>
                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide mt-0.5 block">{formatLastSeen(t.last_seen)}</span>
                                </div>
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
                    zoomControl={false}
                    className="nexus-map"
                    ref={setMapInstance}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* --- LIVE MODE RENDERING --- */}
                    {!isHistoryMode && filteredTechs.map(t => {
                        const isMoving = isTechMoving(t.last_seen);
                        return (
                            <Marker
                                key={t.id}
                                position={[t.last_latitude!, t.last_longitude!] as any}
                                icon={createTechIcon(t.avatar || '', isMoving)}
                            >
                                <Popup>
                                    <div className="p-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <img src={t.avatar} className="w-10 h-10 rounded-lg object-cover shadow" alt={t.name} />
                                            <div>
                                                <p className="font-black text-sm text-slate-900">{t.name}</p>
                                                <p className="text-[10px] text-slate-500">{t.email}</p>
                                            </div>
                                        </div>
                                        <div className="mb-2">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase ${isMoving ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                {isMoving ? '🟢 Em Movimento' : '🔴 Parado'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-slate-600">
                                            <Clock size={10} />
                                            <span>{formatLastSeen(t.last_seen)}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-slate-600 mt-1">
                                            <MapPin size={10} />
                                            <span>
                                                {t.last_latitude?.toFixed(4)}, {t.last_longitude?.toFixed(4)}
                                            </span>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}

                    {/* --- HISTORY MODE RENDERING --- */}
                    {isHistoryMode && historyPath.length > 0 && (
                        <>
                            {/* Path Line */}
                            <Polyline
                                positions={historyPath.map(p => [p.latitude, p.longitude]) as any}
                                color="#4f46e5"
                                weight={3}
                                opacity={0.6}
                                dashArray="5, 10"
                            />

                            {/* Breadcrumbs (Individual Points) */}
                            {historyPath.map((point, idx) => (
                                <CircleMarker
                                    key={`hist-${idx}`}
                                    center={[point.latitude, point.longitude] as any}
                                    radius={4}
                                    pathOptions={{
                                        fillColor: idx === 0 ? '#10b981' : (idx === historyPath.length - 1 ? '#ef4444' : '#4f46e5'),
                                        color: 'white',
                                        weight: 1,
                                        fillOpacity: 1
                                    }}
                                >
                                    <Popup>
                                        <div className="p-2 min-w-[150px]">
                                            <p className="font-black text-[10px] text-slate-900 uppercase">Ping #{idx + 1}</p>
                                            <p className="text-[9px] text-slate-500 font-bold mt-1">
                                                {format(new Date(point.recorded_at), "HH:mm:ss 'em' dd/MM", { locale: ptBR })}
                                            </p>
                                            <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-100 pt-2">
                                                <span className="text-[8px] font-black text-slate-400">STATUS</span>
                                                <span className={`text-[8px] font-black ${idx === 0 ? 'text-emerald-600' : (idx === historyPath.length - 1 ? 'text-red-500' : 'text-indigo-600')}`}>
                                                    {idx === 0 ? 'PARTIDA' : (idx === historyPath.length - 1 ? 'LOCAL ATUAL' : 'EM TRÂNSITO')}
                                                </span>
                                            </div>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            ))}
                        </>
                    )}
                </MapContainer>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(100, 116, 139, 0.3);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(100, 116, 139, 0.5);
                }
            `}</style>
        </div>
    );
};
