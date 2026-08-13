// src/components/admin/RegionModal.tsx
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Region } from "../../types/region";
import { Button } from "../ui/Button";
import { DataService } from "../../services/dataService";
import { User as UserType } from "../../types";
import { Search, CheckCircle2, User as UserIcon, Trash2, Map as MapIcon, ShieldAlert } from "lucide-react";

interface RegionModalProps {
  region: Region | null;
  onClose: () => void;
  onSave: (region: Region) => Promise<void>;
  onDelete?: (regionId: string) => Promise<void>;
  onEditMap?: () => void;
}

export const RegionModal: React.FC<RegionModalProps> = ({ region, onClose, onSave, onDelete, onEditMap }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3366ff");
  const [isActive, setIsActive] = useState(true);
  
  const [technicians, setTechnicians] = useState<UserType[]>([]);
  const [techSearch, setTechSearch] = useState("");
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de Confirmação customizado (padrão do sistema)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirmar',
    isDanger: false
  });

  useEffect(() => {
    // Carregar técnicos
    const loadTechs = async () => {
      try {
        const techs = await DataService.getAllTechnicians();
        setTechnicians(techs);
      } catch (err) {
        console.error("Erro ao carregar técnicos:", err);
      } finally {
        setLoading(false);
      }
    };
    loadTechs();
  }, []);

  useEffect(() => {
    if (region) {
      setName(region.name);
      setDescription(region.description ?? "");
      setColor(region.color);
      setIsActive(region.is_active);
      setSelectedTechIds(region.technician_ids || []);
    } else {
      setName("");
      setDescription("");
      setColor("#3366ff");
      setIsActive(true);
      setSelectedTechIds([]);
    }
  }, [region]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload: Region = {
      id: region?.id ?? "",
      name,
      description: description || undefined,
      color,
      is_active: isActive,
      technician_ids: selectedTechIds,
      polygon_geojson: region?.polygon_geojson ?? null,
    };

    await onSave(payload);
  };

  const toggleTechnician = (techId: string) => {
    setSelectedTechIds(prev => 
      prev.includes(techId) ? prev.filter(id => id !== techId) : [...prev, techId]
    );
  };

  const filteredTechs = technicians.filter(t => 
    t.name.toLowerCase().includes(techSearch.toLowerCase()) || 
    t.email.toLowerCase().includes(techSearch.toLowerCase())
  );

  const handleDeleteClick = () => {
    if (!region || !onDelete) return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Região',
      message: `Tem certeza que deseja excluir a região "${region.name}" definitivamente? Esta ação não pode ser desfeita e os técnicos associados perderão o vínculo com esta área.`,
      confirmText: 'Excluir Definitivamente',
      isDanger: true,
      onConfirm: () => {
        onDelete(region.id!);
      }
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-slate-100 shrink-0 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-800">
              {region ? "Editar Região de Atendimento" : "Nova Região de Atendimento"}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Defina os limites geográficos e associe os técnicos responsáveis por esta área.
            </p>
          </div>
          {region && onDelete && (
            <button 
              type="button" 
              onClick={handleDeleteClick}
              className="flex items-center gap-2 px-3 py-2 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors"
            >
              <Trash2 size={16} />
              Excluir
            </button>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Nome da Região</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Zona Sul"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Descrição (opcional)</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all outline-none"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes sobre a área de cobertura..."
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Cor no Mapa</label>
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2">
                    <input 
                      type="color" 
                      value={color} 
                      onChange={(e) => setColor(e.target.value)} 
                      className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                    />
                    <span className="text-xs font-semibold text-slate-600 uppercase">{color}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Status</label>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`w-full flex justify-center items-center py-2.5 rounded-xl text-xs font-bold transition-all border ${
                      isActive 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    {isActive ? "Região Ativa" : "Região Inativa"}
                  </button>
                </div>
              </div>
            </div>

            {/* SELEÇÃO DE TÉCNICOS */}
            <div className="flex flex-col h-full">
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Técnicos Associados</span>
                <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {selectedTechIds.length} selecionado(s)
                </span>
              </label>
              
              <div className="relative mb-3 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Buscar por nome ou e-mail..."
                  value={techSearch}
                  onChange={(e) => setTechSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all"
                />
              </div>

              <div className="flex-1 bg-slate-50/50 border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-[200px]">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-400 font-medium">
                    Carregando técnicos...
                  </div>
                ) : filteredTechs.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                    <UserIcon size={24} className="text-slate-300 mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Nenhum técnico encontrado.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {filteredTechs.map(tech => {
                      const isSelected = selectedTechIds.includes(tech.id);
                      return (
                        <button
                          key={tech.id}
                          type="button"
                          onClick={() => toggleTechnician(tech.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left group ${
                            isSelected
                              ? 'border-[#1c2d4f] bg-[#1c2d4f05] shadow-sm'
                              : 'border-transparent hover:bg-white hover:border-slate-200'
                          }`}
                        >
                          <div className="relative shrink-0">
                            {tech.avatar ? (
                              <img src={tech.avatar} className="w-8 h-8 rounded-lg object-cover border border-slate-200" alt={tech.name} />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                                {tech.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{tech.name}</p>
                            <p className="text-[9px] text-slate-500 font-medium truncate">{tech.email}</p>
                          </div>
                          <div className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected ? 'bg-[#1c2d4f] border-[#1c2d4f] text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <CheckCircle2 size={10} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-100 shrink-0">
            <div>
              {region && onEditMap && (
                <button
                  type="button"
                  onClick={onEditMap}
                  className="flex items-center gap-2 px-4 py-2 text-[#1c2d4f] hover:bg-[#1c2d4f0a] rounded-xl text-sm font-bold transition-colors"
                >
                  <MapIcon size={18} />
                  Remodelar no Mapa
                </button>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={onClose} className="px-6">Cancelar</Button>
              <Button type="submit" className="px-8 shadow-lg shadow-[#1c2d4f]/20">
                {region ? "Salvar Alterações" : "Avançar para Desenhar"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Modal de Confirmação customizado (padrão do sistema) */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in border border-slate-100">
            <div className="flex items-center gap-3 mb-3 text-red-600">
              <ShieldAlert size={28} />
              <h3 className="text-lg font-semibold text-slate-800">{confirmModal.title}</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <Button 
                variant="secondary" 
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="rounded-lg text-slate-500 border-slate-200"
              >
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }} 
                className={`rounded-lg text-white shadow-sm ${confirmModal.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1c2d4f] hover:bg-[#1c2d4f]/90'}`}
              >
                {confirmModal.confirmText || 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
