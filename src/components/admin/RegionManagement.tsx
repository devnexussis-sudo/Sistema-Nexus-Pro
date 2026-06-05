// src/components/admin/RegionManagement.tsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, GeoJSON, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { getRegions, createRegion, updateRegion, deleteRegion } from '../../services/regionService';
import { Region } from '../../types/region';
import { RegionModal } from './RegionModal';
import { Button } from '../ui/Button';
import { Check, X, Search, Loader2, Filter, ChevronDown } from 'lucide-react';
import { TechnicianService } from '../../services/technicianService';
import { SearchableSelect } from '../common/SearchableSelect';

// Hack to fix react-leaflet-draw crash on React 18
if (typeof window !== 'undefined' && (window as any).L && (window as any).L.Draw) {
  const OriginalToolbar = (window as any).L.Toolbar;
  if (OriginalToolbar) {
    const originalDisable = OriginalToolbar.prototype.disable;
    OriginalToolbar.prototype.disable = function () {
      try {
        originalDisable.call(this);
      } catch (e) {
        // Silently catch the 'disable' undefined error caused by React unmounting
      }
    };
  }
}

// Helper para calcular e formatar a área do polígono
const formatArea = (geojson: any) => {
  try {
    const areaSqMeters = turf.area(geojson);
    const areaSqKm = areaSqMeters / 1000000;
    if (areaSqKm < 0.01) {
      // Se for muito pequeno, mostra em hectares ou metros
      return `${(areaSqMeters / 10000).toFixed(2)} ha`;
    }
    return `${areaSqKm.toFixed(2)} km²`;
  } catch (e) {
    return '';
  }
};

/**
 * Inner component that enables Leaflet native editing on a specific region's polygon.
 * Uses useMap() to directly manipulate layers, bypassing the EditControl toolbar entirely.
 */
const ReshapeController: React.FC<{
  regionId: string;
  regions: Region[];
  onSave: (regionId: string, geojson: any) => void;
  onCancel: () => void;
}> = ({ regionId, regions, onSave, onCancel }) => {
  const map = useMap();
  const editableLayerRef = useRef<L.GeoJSON | null>(null);
  
  // Use a ref to always hold the latest onSave callback to avoid React closure staleness
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!regionId || !map) return;

    const region = regions.find(r => r.id === regionId);
    if (!region || !region.polygon_geojson) return;

    // Create an editable layer from the region's GeoJSON
    const geoJsonLayer = L.geoJSON(region.polygon_geojson as any, {
      style: { color: region.color, weight: 3, fillOpacity: 0.4 }
    });

    geoJsonLayer.addTo(map);

    // Enable editing on each sub-layer (polygons)
    geoJsonLayer.eachLayer((layer: any) => {
      if (layer.editing) {
        layer.editing.enable();
      }
    });

    editableLayerRef.current = geoJsonLayer;

    // Fit map to the editing region
    const bounds = geoJsonLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60] });
    }

    // Listen for save event from parent
    const handleSaveEvent = () => {
      if (!editableLayerRef.current) return;
      
      // We MUST disable editing first to force Leaflet to commit vertex changes to the GeoJSON layer
      editableLayerRef.current.eachLayer((layer: any) => {
        if (layer.editing) {
          try { layer.editing.disable(); } catch (e) {}
        }
      });

      const updatedGeo = editableLayerRef.current.toGeoJSON();
      const feature = (updatedGeo as any).type === 'FeatureCollection'
        ? (updatedGeo as any).features[0]
        : updatedGeo;
        
      onSaveRef.current(regionId, feature);
    };

    const handleCancelEvent = () => {
      onCancel();
    };

    window.addEventListener('reshape-save', handleSaveEvent);
    window.addEventListener('reshape-cancel', handleCancelEvent);

    return () => {
      window.removeEventListener('reshape-save', handleSaveEvent);
      window.removeEventListener('reshape-cancel', handleCancelEvent);

      // Cleanup: disable editing and remove layer
      if (editableLayerRef.current) {
        editableLayerRef.current.eachLayer((layer: any) => {
          if (layer.editing) {
            try { layer.editing.disable(); } catch (e) {}
          }
        });
        map.removeLayer(editableLayerRef.current);
        editableLayerRef.current = null;
      }
    };
  }, [regionId, map]);

  return null;
};

/**
 * Inner component to programmatically pan/zoom the map to specific coordinates.
 */
const MapFlyToCenter: React.FC<{ center: { lat: number; lng: number } | null }> = ({ center }) => {
  const map = useMap();
  React.useEffect(() => {
    if (center) {
      map.flyTo([center.lat, center.lng], 12, { duration: 1.5 });
    }
  }, [center, map]);
  return null;
};

/**
 * Inner component to programmatically pan/zoom the map to specific regions' bounds.
 */
const MapBoundsFitter: React.FC<{ regions: Region[] }> = ({ regions }) => {
  const map = useMap();
  React.useEffect(() => {
    if (!regions || regions.length === 0) return;

    try {
      const features = regions
        .filter(r => r.polygon_geojson)
        .map(r => r.polygon_geojson?.type === 'Feature' ? r.polygon_geojson : { type: 'Feature', properties: {}, geometry: r.polygon_geojson });
      
      if (features.length === 0) return;

      const fc = turf.featureCollection(features as any);
      const bbox = turf.bbox(fc); // [minX, minY, maxX, maxY]

      const leafletBounds = L.latLngBounds(
        [bbox[1], bbox[0]], // [minY, minX]
        [bbox[3], bbox[2]]  // [maxY, maxX]
      );

      map.flyToBounds(leafletBounds, { padding: [50, 50], maxZoom: 14, duration: 1.0 });
    } catch (e) {
      console.warn('Could not calculate bounds for flying', e);
    }
  }, [regions, map]);

  return null;
};

/**
 * Admin page for managing service regions (geofencing).
 * Displays a Leaflet map with draw controls to create/edit polygons.
 */
export const RegionManagement: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([]);
  const [techs, setTechs] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [pendingRegion, setPendingRegion] = useState<Region | null>(null);
  const [reshapeRegionId, setReshapeRegionId] = useState<string | null>(null);

  const [citySearch, setCitySearch] = useState('');
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number, lng: number } | null>(null);

  const [techFilter, setTechFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [nameFilter, setNameFilter] = useState<string>('');

  useEffect(() => {
    fetchRegions();
    fetchTechs();
  }, []);

  const fetchTechs = async () => {
    try {
      const data = await TechnicianService.getAllTechnicians();
      setTechs(data);
    } catch (e) {
      console.error('Failed to load techs', e);
    }
  };

  const filteredRegions = useMemo(() => {
    return regions.filter(r => {
      if (statusFilter === 'ACTIVE' && !r.is_active) return false;
      if (statusFilter === 'INACTIVE' && r.is_active) return false;
      
      if (techFilter !== 'ALL') {
        if (!r.technician_ids || !r.technician_ids.includes(techFilter)) return false;
      }

      if (nameFilter) {
        if (!r.name || !r.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
      }
      
      return true;
    });
  }, [regions, statusFilter, techFilter, nameFilter]);

  const fetchRegions = async () => {
    try {
      const data = await getRegions();
      setRegions(data);
    } catch (e) {
      console.error('Failed to load regions', e);
    }
  };

  const onCreated = async (e: any) => {
    const layer = e.layer as L.Layer;
    const geo = layer.toGeoJSON();

    const map = (layer as any)._map;
    if (map) {
      map.removeLayer(layer);
    } else if (e.layerContainer) {
      e.layerContainer.removeLayer(layer);
    }

    if (pendingRegion) {
      try {
        const payload: any = { ...pendingRegion, polygon_geojson: geo };
        if (payload.id === '') {
          delete payload.id;
        }
        await createRegion(payload);

        setTimeout(() => {
          setPendingRegion(null);
          fetchRegions();
        }, 100);
      } catch (err: any) {
        console.error('Erro ao salvar região:', err);
        alert('Erro ao salvar região: ' + (err.message || 'Erro desconhecido.'));
      }
    } else {
      alert('Por favor, clique em "Criar Nova Região" e preencha os dados primeiro antes de desenhar o mapa.');
    }
  };

  const onEdited = async (e: any) => {};
  const onDeleted = async (e: any) => {};

  const handleSave = async (region: Region) => {
    if (region.id) {
      await updateRegion(region.id, region);
      fetchRegions();
    } else {
      setPendingRegion(region);
      setTimeout(() => {
        const drawBtn = document.querySelector('.leaflet-draw-draw-polygon') as HTMLElement;
        if (drawBtn) drawBtn.click();
      }, 500);
    }
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRegion(id);
      fetchRegions();
      setShowModal(false);
    } catch (e) {
      console.error('Failed to delete region', e);
      alert('Erro ao excluir a região.');
    }
  };

  const handleEditMap = () => {
    if (editingRegion?.id) {
      setReshapeRegionId(editingRegion.id);
    }
    setShowModal(false);
  };

  const handleReshapeSave = async (regionId: string, geojson: any) => {
    setRegions(prev => prev.map(r => r.id === regionId ? { ...r, polygon_geojson: geojson } : r));
    setReshapeRegionId(null);

    try {
      await updateRegion(regionId, { polygon_geojson: geojson });
      fetchRegions();
    } catch (e) {
      console.error('Erro ao salvar remodelação', e);
      alert('Erro ao salvar remodelação da região.');
      fetchRegions();
    }
  };

  const handleReshapeCancel = () => {
    setReshapeRegionId(null);
  };

  const handleCitySearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!citySearch.trim()) return;

    setIsSearchingCity(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(citySearch)}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        setMapCenter({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      } else {
        alert("Cidade não encontrada.");
      }
    } catch (error) {
      console.error("Erro ao buscar cidade", error);
      alert("Falha na busca da cidade.");
    } finally {
      setIsSearchingCity(false);
    }
  };

  const isReshapingMode = !!reshapeRegionId;

  return (
    <div className="p-4 flex flex-col h-[calc(100vh-80px)]">
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gestão de Regiões</h2>
          <p className="text-sm text-slate-500 mt-1">
            Crie limites geográficos (cercas virtuais) e associe aos seus técnicos.
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <form onSubmit={handleCitySearch} className="flex items-center relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Ir para cidade..."
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-2 h-10 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all shadow-sm"
            />
            <button 
              type="submit" 
              disabled={isSearchingCity}
              className="absolute right-2 text-slate-400 hover:text-primary-600 transition-colors p-1"
            >
              {isSearchingCity ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </form>

          <Button onClick={() => { setEditingRegion(null); setShowModal(true); }} className="h-10">
            Criar Nova Região
          </Button>
        </div>
      </div>

      <div className={`flex-1 rounded-xl overflow-hidden border shadow-sm relative z-0 ${
        pendingRegion ? 'border-amber-400 ring-4 ring-amber-400/20'
        : isReshapingMode ? 'border-blue-400 ring-4 ring-blue-400/20'
        : 'border-slate-200'
      }`}>
        {/* Floating Filters Overlay (Discreet Pills) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col sm:flex-row gap-3 pointer-events-none w-[90%] max-w-3xl justify-center items-start">
            
            <div className="relative pointer-events-auto bg-white/90 backdrop-blur-sm shadow-md border border-slate-200/60 rounded-xl w-full sm:w-56 h-10 transition-all hover:bg-white focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-500/20">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Search size={14} className="text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Pesquisar por nome..."
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                className="w-full h-full bg-transparent border-none rounded-xl pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="pointer-events-auto relative z-20 w-full sm:w-64 h-10 drop-shadow-md">
              <SearchableSelect
                options={[
                  { id: 'ALL', name: 'Todos os Técnicos' },
                  ...techs.map(t => ({ id: t.id, name: t.name }))
                ]}
                value={techFilter}
                onChange={setTechFilter}
                placeholder="Filtrar por Técnico"
              />
            </div>

            <div className="relative pointer-events-auto shadow-md rounded-xl h-10 w-full sm:w-40">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-full appearance-none bg-white/90 backdrop-blur-sm border border-slate-200/60 rounded-xl pl-3 pr-10 text-xs font-semibold text-slate-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer"
              >
                <option value="ALL">Todas Regiões</option>
                <option value="ACTIVE">Ativas</option>
                <option value="INACTIVE">Inativas</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <ChevronDown size={14} className="text-slate-400" />
              </div>
            </div>
            
        </div>

        {pendingRegion && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur border border-amber-200 shadow-xl rounded-full px-4 py-2 flex items-center gap-3 animate-fade-in">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-xs font-bold text-slate-700">
              Modo Desenho: <span className="text-amber-600">{pendingRegion.name}</span>
            </p>
            <button onClick={() => setPendingRegion(null)} className="ml-2 text-[10px] text-slate-400 hover:text-rose-500 font-bold underline">
              Cancelar
            </button>
          </div>
        )}

        {isReshapingMode && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur border border-blue-200 shadow-xl rounded-full px-5 py-2.5 flex items-center gap-4 animate-fade-in">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="text-xs font-bold text-slate-700">
              Remodelando: <span className="text-blue-600">{regions.find(r => r.id === reshapeRegionId)?.name}</span>
            </p>
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('reshape-save'))}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <Check size={14} />
                Salvar
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('reshape-cancel'))}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
              >
                <X size={14} />
                Cancelar
              </button>
            </div>
          </div>
        )}

        <MapContainer center={[-23.55052, -46.63331]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <MapFlyToCenter center={mapCenter} />
          <MapBoundsFitter regions={filteredRegions} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          <FeatureGroup>
            {filteredRegions.map(r => {
              // Hide the region being reshaped (ReshapeController renders its own editable copy)
              if (r.id === reshapeRegionId) return null;

              const geoData = r.polygon_geojson?.type === 'Feature'
                ? { ...r.polygon_geojson, properties: { ...(r.polygon_geojson.properties || {}), regionId: r.id } }
                : { type: 'Feature', properties: { regionId: r.id }, geometry: r.polygon_geojson };

              return (
                <GeoJSON
                  key={r.id}
                  data={geoData as any}
                  pathOptions={{
                    color: r.color,
                    weight: r.is_active ? 2 : 1,
                    fillOpacity: r.is_active ? 0.3 : 0.1,
                    dashArray: r.is_active ? undefined : '5, 5'
                  }}
                  onEachFeature={(feature, layer) => {
                    if (!isReshapingMode) {
                      layer.on('click', () => {
                        setEditingRegion(r);
                        setShowModal(true);
                      });
                    }
                    if (r.name) {
                      const areaStr = formatArea(geoData);
                      layer.bindTooltip(`${r.name} - ${areaStr}${!r.is_active ? ' (Inativa)' : ''}`, { 
                        permanent: true, 
                        direction: 'center', 
                        className: `bg-white/90 border-0 shadow-sm rounded-lg text-[10px] font-bold ${!r.is_active ? 'text-slate-400' : 'text-slate-800'}` 
                      });
                    }
                  }}
                />
              );
            })}
            {!isReshapingMode && (
              <EditControl
                position="topright"
                onCreated={onCreated}
                onEdited={onEdited}
                onDeleted={onDeleted}
                draw={{ 
                  polygon: {
                    showArea: true,
                    metric: true
                  }, 
                  rectangle: false, polyline: false, circle: false, marker: false, circlemarker: false 
                }}
              />
            )}
          </FeatureGroup>

          {/* Custom reshape controller — manages editable layer directly via Leaflet API */}
          {isReshapingMode && reshapeRegionId && (
            <ReshapeController
              regionId={reshapeRegionId}
              regions={regions}
              onSave={handleReshapeSave}
              onCancel={handleReshapeCancel}
            />
          )}
        </MapContainer>
      </div>

      {showModal && (
        <RegionModal
          region={editingRegion}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          onDelete={handleDelete}
          onEditMap={handleEditMap}
        />
      )}
    </div>
  );
};
