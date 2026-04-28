import React, { useMemo, useState, useEffect } from 'react';
import { MapPin, Navigation, Clock, Activity, Map, CheckCircle2 } from 'lucide-react';
import { ServiceVisit } from '../../types';

interface DisplacementTabProps {
  visits: ServiceVisit[];
}

export function DisplacementTab({ visits }: DisplacementTabProps) {
  const displacementData = useMemo(() => {
    return visits
      .map((v, index) => {
        const d = v.formData?.displacement || {};
        
        let distanceText = 'N/A';
        let durationText = 'N/A';
        let rawDistanceKm = 0;

        // Try to get location from old displacement object or checkin/checkout locations if available in the future
        const startLat = d.start_lat || null;
        const startLon = d.start_lon || null;
        const arrivalLat = d.arrival_lat || null;
        const arrivalLon = d.arrival_lon || null;

        if (startLat && startLon && arrivalLat && arrivalLon) {
          // Fallback: Haversine formula (linha reta)
          const R = 6371; // km
          const dLat = (arrivalLat - startLat) * Math.PI / 180;
          const dLon = (arrivalLon - startLon) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(startLat * Math.PI / 180) * Math.cos(arrivalLat * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          rawDistanceKm = R * c;
          distanceText = `~${rawDistanceKm.toFixed(2)} km (Linha Reta)`;
        }

        const startTimeStr = d.start_time || v.createdAt;
        const arrivalTimeStr = d.arrival_time || v.arrivalTime;
        const departureTimeStr = d.finish_time || v.departureTime;

        if (startTimeStr && arrivalTimeStr) {
          const t1 = new Date(startTimeStr).getTime();
          const t2 = new Date(arrivalTimeStr).getTime();
          const diffMins = Math.round(Math.abs(t2 - t1) / 60000);
          const hours = Math.floor(diffMins / 60);
          const mins = diffMins % 60;
          durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        }

        let serviceDurationText = 'N/A';
        if (arrivalTimeStr && departureTimeStr) {
          const t1 = new Date(arrivalTimeStr).getTime();
          const t2 = new Date(departureTimeStr).getTime();
          const diffMins = Math.round(Math.abs(t2 - t1) / 60000);
          const hours = Math.floor(diffMins / 60);
          const mins = diffMins % 60;
          serviceDurationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        }

        return {
          id: v.id,
          visitNumber: v.visitNumber || index + 1,
          date: startTimeStr || arrivalTimeStr || departureTimeStr || v.createdAt,
          startTime: startTimeStr ? new Date(startTimeStr).toLocaleString('pt-BR') : 'Aguardando',
          arrivalTime: arrivalTimeStr ? new Date(arrivalTimeStr).toLocaleString('pt-BR') : 'Aguardando',
          departureTime: departureTimeStr ? new Date(departureTimeStr).toLocaleString('pt-BR') : 'Aguardando',
          startLatLon: startLat && startLon ? `${startLat}, ${startLon}` : 'N/A',
          arrivalLatLon: arrivalLat && arrivalLon ? `${arrivalLat}, ${arrivalLon}` : 'N/A',
          startLat,
          startLon,
          arrivalLat,
          arrivalLon,
          distance: distanceText,
          duration: durationText,
          serviceDuration: serviceDurationText
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [visits]);

  const [routeDistances, setRouteDistances] = useState<Record<string, { distance: string, loading: boolean }>>({});

  useEffect(() => {
    displacementData.forEach(async (d) => {
      if (d.startLat && d.startLon && d.arrivalLat && d.arrivalLon) {
        setRouteDistances(prev => {
          if (prev[d.id]) return prev;
          return { ...prev, [d.id]: { distance: 'Calculando rota...', loading: true } };
        });

        try {
          // Usando OSRM para roteamento real de ruas (semelhante ao Maps) gratuitamente
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${d.startLon},${d.startLat};${d.arrivalLon},${d.arrivalLat}?overview=false`);
          const data = await res.json();
          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const km = (data.routes[0].distance / 1000).toFixed(2);
            setRouteDistances(prev => ({ ...prev, [d.id]: { distance: `${km} km`, loading: false } }));
          } else {
            setRouteDistances(prev => ({ ...prev, [d.id]: { distance: d.distance, loading: false } })); // fallback p/ linha reta
          }
        } catch (err) {
          setRouteDistances(prev => ({ ...prev, [d.id]: { distance: d.distance, loading: false } }));
        }
      }
    });
  }, [displacementData]);

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
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-tight">Deslocamento da Visita {d.visitNumber}</h3>
            </div>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="mt-1"><Activity size={16} className="text-emerald-500" /></div>
                <div>
                  <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">1. Início de Deslocamento</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">{d.startTime}</p>
                  {d.startLatLon !== 'N/A' && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${d.startLatLon}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 font-medium hover:underline inline-flex items-center gap-1 mt-1">
                      <Map size={12} /> Ver no Mapa
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1"><MapPin size={16} className="text-amber-500" /></div>
                <div>
                  <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">2. Início do Atendimento no Cliente</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">{d.arrivalTime}</p>
                  {d.arrivalLatLon !== 'N/A' && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${d.arrivalLatLon}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 font-medium hover:underline inline-flex items-center gap-1 mt-1">
                      <Map size={12} /> Ver no Mapa
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1"><CheckCircle2 size={16} className="text-rose-500" /></div>
                <div>
                  <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">3. Fim do Atendimento / Checkout</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">{d.departureTime}</p>
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
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-1 justify-end"><Navigation size={12}/> Distância Percorrida</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {routeDistances[d.id] ? routeDistances[d.id].distance : d.distance}
                  </p>
                  {d.startLatLon !== 'N/A' && d.arrivalLatLon !== 'N/A' && (
                     <a href={`https://www.google.com/maps/dir/?api=1&origin=${d.startLat},${d.startLon}&destination=${d.arrivalLat},${d.arrivalLon}&travelmode=driving`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 font-bold hover:underline inline-flex items-center gap-1 mt-2 justify-end">
                       <Map size={10} /> Rota no Google Maps
                     </a>
                  )}
                </div>
              </div>
              
              <div className="w-full h-px bg-slate-200"></div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-600 flex items-center gap-1"><Clock size={12}/> Tempo de Atendimento (Trabalho)</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">{d.serviceDuration}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
