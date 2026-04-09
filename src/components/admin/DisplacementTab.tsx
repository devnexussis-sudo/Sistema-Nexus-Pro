import React, { useMemo } from 'react';
import { MapPin, Navigation, Clock, Activity, Map } from 'lucide-react';
import { ServiceVisit } from '../../types';

interface DisplacementTabProps {
  visits: ServiceVisit[];
}

export function DisplacementTab({ visits }: DisplacementTabProps) {
  const displacementData = useMemo(() => {
    return visits
      .filter(v => v.formData?.displacement)
      .map(v => {
        const d = v.formData.displacement;
        
        let distanceText = 'N/A';
        let durationText = 'N/A';
        let rawDistanceKm = 0;

        if (d.start_lat && d.start_lon && d.arrival_lat && d.arrival_lon) {
          // Haversine formula
          const R = 6371; // km
          const dLat = (d.arrival_lat - d.start_lat) * Math.PI / 180;
          const dLon = (d.arrival_lon - d.start_lon) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(d.start_lat * Math.PI / 180) * Math.cos(d.arrival_lat * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          rawDistanceKm = R * c;
          distanceText = `${rawDistanceKm.toFixed(2)} km`;
        }

        if (d.start_time && d.arrival_time) {
          const t1 = new Date(d.start_time).getTime();
          const t2 = new Date(d.arrival_time).getTime();
          const diffMins = Math.round(Math.abs(t2 - t1) / 60000);
          const hours = Math.floor(diffMins / 60);
          const mins = diffMins % 60;
          durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        }

        return {
          id: v.id,
          date: d.start_time || d.arrival_time || v.created_at,
          startTime: d.start_time ? new Date(d.start_time).toLocaleString('pt-BR') : 'N/A',
          arrivalTime: d.arrival_time ? new Date(d.arrival_time).toLocaleString('pt-BR') : 'N/A',
          startLatLon: d.start_lat && d.start_lon ? `${d.start_lat}, ${d.start_lon}` : 'N/A',
          arrivalLatLon: d.arrival_lat && d.arrival_lon ? `${d.arrival_lat}, ${d.arrival_lon}` : 'N/A',
          startLat: d.start_lat,
          startLon: d.start_lon,
          arrivalLat: d.arrival_lat,
          arrivalLon: d.arrival_lon,
          distance: distanceText,
          duration: durationText
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [visits]);

  if (displacementData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg border border-slate-200 text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-slate-50 flex items-center justify-center rounded-full border border-slate-100 mb-4">
          <MapPin size={32} className="text-slate-300" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">Sem dados de deslocamento</h3>
        <p className="text-xs text-slate-500 mt-2 font-medium max-w-sm">Nenhuma visita nesta Ordem de Serviço registrou início ou fim de deslocamento por GPS pelo técnico local.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {displacementData.map((d, idx) => (
        <div key={d.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-3">
              <Navigation size={18} className="text-blue-500" />
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-tight">Deslocamento da Visita {displacementData.length - idx}</h3>
            </div>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="mt-1"><Activity size={16} className="text-emerald-500" /></div>
                <div>
                  <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Início Mapeado</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">{d.startTime}</p>
                  {d.startLatLon !== 'N/A' && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${d.startLatLon}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 font-medium hover:underline inline-flex items-center gap-1 mt-1">
                      <Map size={12} /> Ver no Mapa
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1"><MapPin size={16} className="text-rose-500" /></div>
                <div>
                  <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Chegada ao Local</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">{d.arrivalTime}</p>
                  {d.arrivalLatLon !== 'N/A' && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${d.arrivalLatLon}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 font-medium hover:underline inline-flex items-center gap-1 mt-1">
                      <Map size={12} /> Ver no Mapa
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-lg border border-slate-100 flex flex-col justify-center space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-1"><Clock size={12}/> Tempo de Viagem</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{d.duration}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-1 justify-end"><Navigation size={12}/> Distância Rota (Linha reta)</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{d.distance}</p>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
