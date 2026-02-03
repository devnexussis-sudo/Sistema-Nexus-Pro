
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DataService } from '../../services/dataService';
import { User, UserRole } from '../../types';
import { MapPin, User as UserIcon, Clock, Phone, Mail, Navigation } from 'lucide-react';

// Corrigindo ícones do Leaflet que quebram com build de front-end moderno
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

interface Technician extends User {
    last_latitude?: number;
    last_longitude?: number;
    last_seen?: string;
}

export const TechnicianMap: React.FC = () => {
    const [techs, setTechs] = useState<Technician[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const loadTechs = async () => {
        try {
            const allTechs = await DataService.getAllTechnicians();
            // Filtra apenas os que tem localização
            setTechs(allTechs as Technician[]);
        } catch (error) {
            console.error("Erro ao carregar técnicos para o mapa:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTechs();
        const interval = setInterval(loadTechs, 60000); // Atualiza mapa a cada minuto
        return () => clearInterval(interval);
    }, []);

    const activeTechs = techs.filter(t => t.last_latitude && t.last_longitude);

    const filteredTechs = activeTechs.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatLastSeen = (dateStr?: string) => {
        if (!dateStr) return 'Nunca';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = (now.getTime() - date.getTime()) / 1000;

        if (diff < 60) return 'Agora mesmo';
        if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} horas atrás`;
        return date.toLocaleDateString('pt-BR');
    };

    // Ícone Customizado para o Técnico
    const createTechIcon = (avatarUrl: string) => {
        return L.divIcon({
            className: 'custom-tech-icon',
            html: `
        <div class="relative w-10 h-10">
          <img src="${avatarUrl}" class="w-10 h-10 rounded-full border-2 border-indigo-600 shadow-xl bg-white object-cover" />
          <div class="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm animate-pulse"></div>
        </div>
      `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* 🔮 NEXUS MAP CONTROL PANEL */}
            <div className="absolute top-24 right-6 z-[1000] w-72 space-y-3">
                <div className="bg-white/90 backdrop-blur-md rounded-[2rem] p-5 shadow-2xl border border-white/20">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
                            <Navigation size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-[10px] font-black uppercase text-slate-900 italic tracking-tighter">Radar Nexus</h2>
                            <p className="text-[7px] font-black uppercase text-slate-400 tracking-widest">Tempo Real</p>
                        </div>
                    </div>

                    <div className="relative mb-3">
                        <input
                            type="text"
                            placeholder="Buscar técnico..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-100 border-none rounded-2xl px-4 py-2.5 text-[9px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all italic"
                        />
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {filteredTechs.length > 0 ? filteredTechs.map(t => (
                            <div
                                key={t.id}
                                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-100 transition-all cursor-pointer group"
                                onClick={() => {
                                    // Aqui poderíamos centralizar o mapa no técnico
                                }}
                            >
                                <img src={t.avatar} className="w-8 h-8 rounded-lg object-cover shadow-sm group-hover:scale-105 transition-transform" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black text-slate-900 uppercase truncate italic leading-none">{t.name}</p>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{formatLastSeen(t.last_seen)}</span>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="py-8 text-center">
                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest italic leading-relaxed">
                                    {searchQuery ? 'Nenhum técnico encontrado' : 'Nenhum técnico online no momento'}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Total Ativos</span>
                            <span className="text-sm font-black text-indigo-600 italic">{activeTechs.length}</span>
                        </div>
                        <button className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                            <Clock size={16} />
                        </button>
                    </div>
                </div>

                {/* Legend Card */}
                <div className="bg-white/90 backdrop-blur-md rounded-[2rem] p-4 px-6 shadow-xl border border-white/20 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">Online</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">Offline</span>
                    </div>
                </div>
            </div>

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
                    {filteredTechs.map(t => (
                        <Marker
                            key={t.id}
                            position={[t.last_latitude!, t.last_longitude!] as any}
                            icon={createTechIcon(t.avatar || '')}
                        >
                            <Popup className="tech-popup">
                                <div className="w-64 p-2 bg-white rounded-3xl overflow-hidden font-sans">
                                    <div className="flex items-center gap-4 mb-4">
                                        <img src={t.avatar} className="w-12 h-12 rounded-2xl object-cover border border-slate-100 shadow-sm" />
                                        <div>
                                            <h4 className="text-[11px] font-black uppercase text-slate-900 italic tracking-tighter leading-none">{t.name}</h4>
                                            <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest mt-1.5 italic">Especialista Externo</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2.5">
                                        <div className="flex items-center gap-3 text-slate-500">
                                            <Mail size={12} className="text-slate-300" />
                                            <span className="text-[9px] font-bold truncate">{t.email}</span>
                                        </div>
                                        {t.phone && (
                                            <div className="flex items-center gap-3 text-slate-500">
                                                <Phone size={12} className="text-slate-300" />
                                                <span className="text-[9px] font-bold">{t.phone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                                            <Clock size={12} />
                                            <span className="text-[9px] font-black uppercase tracking-widest italic">Visto em: {formatLastSeen(t.last_seen)}</span>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-slate-100">
                                        <button className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase italic tracking-[0.2em] shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
                                            Falar agora
                                        </button>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                    <ZoomControl position="bottomright" />
                </MapContainer>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .leaflet-container {
          background-color: #f1f5f9 !important;
        }
        .nexus-map {
          filter: saturate(0.8) contrast(1.1);
        }
        .custom-tech-icon {
          background: transparent !important;
          border: none !important;
        }
        .tech-popup .leaflet-popup-content-wrapper {
          border-radius: 2rem !important;
          padding: 8px !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
        }
        .tech-popup .leaflet-popup-content {
          margin: 0 !important;
          width: auto !important;
        }
        .tech-popup .leaflet-popup-tip {
          box-shadow: none !important;
        }
      `}} />
        </div>
    );
};

const ZoomControl: React.FC<{ position: L.ControlPosition }> = ({ position }) => {
    const map = useMap();
    useEffect(() => {
        const control = L.control.zoom({ position });
        control.addTo(map);
        return () => { control.remove(); };
    }, [map, position]);
    return null;
};
