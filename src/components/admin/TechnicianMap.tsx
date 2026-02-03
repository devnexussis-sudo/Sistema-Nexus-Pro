
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, MapPin, Clock, RefreshCw } from 'lucide-react';
import { DataService } from '../../services/dataService';

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
                    sessionStorage.removeItem(`techs_${tenantId}`);
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
                sessionStorage.removeItem(`techs_${tenantId}`);
            }
            // Recarrega dados frescos
            await loadTechnicians();
            console.log('[Map] ✅ Posições dos técnicos atualizadas!');
        } catch (error) {
            console.error('[Map] Erro ao atualizar:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

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

                {/* Refresh Button */}
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

                {/* Legend */}
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
            </div>

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
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {filteredTechs.map(t => {
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
