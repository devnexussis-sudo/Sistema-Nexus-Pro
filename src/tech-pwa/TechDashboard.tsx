
import React, { useState } from 'react';
import { User, UserRole, ServiceOrder, OrderStatus, OrderPriority } from '../types';
import { OrderDetailsModal } from './OrderDetailsModal';
import { StatusBadge, PriorityBadge } from '../components/ui/StatusBadge';
import { RefreshCw, CheckCircle2, Clock, ChevronRight, LogOut, AlertTriangle, Hexagon, Filter, Calendar as CalendarIcon, X, Share2, MessageCircle, Navigation2, ZapOff, Ban } from 'lucide-react';
import { DataService } from '../services/dataService';

interface TechDashboardProps {
  user: User;
  orders: ServiceOrder[];
  onUpdateStatus: (orderId: string, status: OrderStatus, notes?: string, formData?: any) => Promise<void>;
  onRefresh: () => Promise<void>;
  onLogout: (e?: React.MouseEvent) => void;
  isFetching?: boolean;
}

export const TechDashboard: React.FC<TechDashboardProps> = ({ user, orders, onUpdateStatus, onRefresh, onLogout, isFetching = false }) => {
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Combina o loading local do botão com o global do download
  const isLoading = loading || isFetching;

  // 🛰️ NEXUS GEOLOCATION TRACKING SYSTEM (WATCH MODE)
  React.useEffect(() => {
    if (!user || user.role !== UserRole.TECHNICIAN) return;

    let watchId: number | null = null;

    const startTracking = () => {
      if ("geolocation" in navigator) {
        console.log("[🛰️ Geolocation] Iniciando monitoramento contínuo (Watch Mode)...");

        // Ping imediato para garantir posição atual
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await DataService.updateTechnicianLocation(user.id, pos.coords.latitude, pos.coords.longitude);
          },
          (err) => console.warn("[🛰️ Geolocation] Ping inicial falhou:", err.message),
          { enableHighAccuracy: true, timeout: 10000 }
        );

        // Configuração do Watch para alta fidelidade e persistência
        watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            console.log(`[🛰️ Geolocation] Movimento detectado (Acurácia: ${accuracy.toFixed(1)}m): ${latitude}, ${longitude}`);

            try {
              // Só envia se tiver uma acurácia razoável ou for a primeira vez
              await DataService.updateTechnicianLocation(user.id, latitude, longitude);
            } catch (err) {
              console.error("[🛰️ Geolocation] Erro no DataSync:", err);
            }
          },
          (error) => {
            console.warn(`[🛰️ Geolocation] Erro no monitoramento: (${error.code}) ${error.message}`);
            // Se falhar o watch, tenta reiniciar após um tempo
            if (error.code === 3) { // TIMEOUT
              setTimeout(startTracking, 30000);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
          }
        );
      }
    };

    startTracking();

    // 🔋 Background Support: Visibility Change
    const handleVisibilityChange = () => {
      // Se voltar a ficar visível, garante que o tracking está vivo
      if (!document.hidden && !watchId) {
        startTracking();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const handleUpdateStatus = async (orderId: string, status: OrderStatus, notes?: string, formData?: any, items?: any[]) => {
    // Quando executa uma OS, manda a localização também
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        await DataService.updateTechnicianLocation(user.id, latitude, longitude);
      });
    }
    await onUpdateStatus(orderId, status, notes, formData, items);
  };

  const handleRefresh = async () => {
    setLoading(true);

    // Atualiza as ordens
    await onRefresh();

    // Atualiza o perfil do usuário (incluindo avatar)
    const updatedUser = await DataService.refreshUserProfile();
    if (updatedUser) {
      // Propaga a atualização para o componente pai se necessário
      window.dispatchEvent(new CustomEvent('user-profile-updated', { detail: updatedUser }));
    }

    setLoading(false);
  };

  const filteredOrders = orders.filter(order => {
    let matchesStatus = false;
    if (statusFilter === 'ALL') {
      matchesStatus = true;
    } else if (statusFilter === 'PENDING_ASSIGNED') {
      matchesStatus = order.status === OrderStatus.PENDING || order.status === OrderStatus.ASSIGNED;
    } else {
      matchesStatus = order.status === statusFilter;
    }

    let matchesDate = true;
    if (startDate || endDate) {
      const orderDate = new Date(order.scheduledDate || order.createdAt);
      orderDate.setHours(0, 0, 0, 0);

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) matchesDate = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        if (orderDate > end) matchesDate = false;
      }
    }

    return matchesStatus && matchesDate;
  });

  const clearFilters = () => {
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const todayCompleted = orders.filter(o => o.status === OrderStatus.COMPLETED).length;
  const inProgress = orders.filter(o => o.status === OrderStatus.IN_PROGRESS).length;
  const pending = orders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.ASSIGNED).length;
  const blocked = orders.filter(o => o.status === OrderStatus.BLOCKED).length;
  const canceled = orders.filter(o => o.status === OrderStatus.CANCELED).length;

  const handleKPISelect = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
    // Rolagem suave para a lista
    const listElement = document.getElementById('orders-list');
    if (listElement) {
      listElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '---';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] pb-24 font-sans overflow-y-auto relative">
      {/* 🔮 NEXUS IMMERSIVE LOADER - A "bolinha" carregando */}
      {isFetching && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/60 backdrop-blur-md animate-fade-in">
          <div className="relative">
            {/* Círculo externo pulsante */}
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping scale-150"></div>
            {/* A Bolinha (Spinner) */}
            <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin shadow-xl"></div>
            {/* Logo Central Mini (Identidade Nexus) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 bg-[#0f172a] rounded-xl flex items-center justify-center shadow-lg border border-white/10">
                <Hexagon size={20} className="text-emerald-400 fill-emerald-400/10" />
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center gap-1">
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] italic animate-pulse">Sincronizando</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Baixando Ordens de Serviço...</p>
          </div>
        </div>
      )}

      <div className="bg-[#0f172a] px-6 py-4 sticky top-0 z-50 shadow-2xl border-b border-white/5">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <img src={user.avatar} className="w-10 h-10 rounded-xl border border-emerald-400/30 shadow-lg object-cover" alt={user.name} />
            <div>
              <h1 className="text-white font-black text-sm tracking-tight italic uppercase">NEXUS<span className="text-emerald-400">.TEC</span></h1>
              <p className="text-emerald-300/60 text-[8px] font-black uppercase italic">Técnico: {user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} className="p-2.5 bg-white/5 text-white rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLogout(e);
              }}
              className="p-2.5 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-2 cursor-pointer"
              title="Sair do Aplicativo"
            >
              <LogOut size={18} />
              <span className="text-[10px] font-black uppercase hidden sm:block">Sair</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div
            onClick={() => handleKPISelect(OrderStatus.COMPLETED)}
            className={`cursor-pointer border transition-all rounded-2xl p-3 flex flex-col items-center ${statusFilter === OrderStatus.COMPLETED ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/30' : 'bg-white/5 border-white/10'}`}
          >
            <div className={`p-2 rounded-lg mb-1 ${statusFilter === OrderStatus.COMPLETED ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'}`}><CheckCircle2 size={14} /></div>
            <p className={`text-[7px] uppercase ${statusFilter === OrderStatus.COMPLETED ? 'text-white/80' : 'text-white/40'}`}>Concluídas</p>
            <p className="text-sm font-black text-white">{todayCompleted}</p>
          </div>
          <div
            onClick={() => handleKPISelect(OrderStatus.IN_PROGRESS)}
            className={`cursor-pointer border transition-all rounded-2xl p-3 flex flex-col items-center ${statusFilter === OrderStatus.IN_PROGRESS ? 'bg-blue-500 border-blue-400 shadow-lg shadow-blue-500/30' : 'bg-white/5 border-white/10'}`}
          >
            <div className={`p-2 rounded-lg mb-1 ${statusFilter === OrderStatus.IN_PROGRESS ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-400'}`}><RefreshCw size={14} /></div>
            <p className={`text-[7px] uppercase ${statusFilter === OrderStatus.IN_PROGRESS ? 'text-white/80' : 'text-white/40'}`}>Em Execução</p>
            <p className="text-sm font-black text-white">{inProgress}</p>
          </div>
          <div
            onClick={() => handleKPISelect('PENDING_ASSIGNED')}
            className={`cursor-pointer border transition-all rounded-2xl p-3 flex flex-col items-center ${statusFilter === 'PENDING_ASSIGNED' ? 'bg-amber-500 border-amber-400 shadow-lg shadow-amber-500/30' : 'bg-white/5 border-white/10'}`}
          >
            <div className={`p-2 rounded-lg mb-1 ${statusFilter === 'PENDING_ASSIGNED' ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400'}`}><Clock size={14} /></div>
            <p className={`text-[7px] uppercase ${statusFilter === 'PENDING_ASSIGNED' ? 'text-white/80' : 'text-white/40'}`}>Pendentes</p>
            <p className="text-sm font-black text-white">{pending}</p>
          </div>
        </div>

        {/* ⚠️ KPI DE EXCEÇÕES (IMPEDIDAS / CANCELADAS) */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div
            onClick={() => handleKPISelect(OrderStatus.BLOCKED)}
            className={`cursor-pointer border transition-all rounded-2xl px-4 py-2.5 flex items-center justify-between ${statusFilter === OrderStatus.BLOCKED ? 'bg-rose-500 border-rose-400 shadow-lg shadow-rose-500/30' : 'bg-rose-500/5 border-rose-500/20'}`}
          >
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${statusFilter === OrderStatus.BLOCKED ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-400'}`}><ZapOff size={12} /></div>
              <p className={`text-[8px] font-black uppercase tracking-tight ${statusFilter === OrderStatus.BLOCKED ? 'text-white' : 'text-rose-400'}`}>Impedidas</p>
            </div>
            <p className={`text-xs font-black ${statusFilter === OrderStatus.BLOCKED ? 'text-white' : 'text-rose-500'}`}>{blocked}</p>
          </div>

          <div
            onClick={() => handleKPISelect(OrderStatus.CANCELED)}
            className={`cursor-pointer border transition-all rounded-2xl px-4 py-2.5 flex items-center justify-between ${statusFilter === OrderStatus.CANCELED ? 'bg-slate-700 border-slate-600 shadow-lg shadow-slate-700/30' : 'bg-white/5 border-white/10'}`}
          >
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${statusFilter === OrderStatus.CANCELED ? 'bg-white/20 text-white' : 'bg-slate-500/20 text-slate-400'}`}><Ban size={12} /></div>
              <p className={`text-[8px] font-black uppercase tracking-tight ${statusFilter === OrderStatus.CANCELED ? 'text-white' : 'text-slate-400'}`}>Canceladas</p>
            </div>
            <p className={`text-xs font-black ${statusFilter === OrderStatus.CANCELED ? 'text-white' : 'text-slate-300'}`}>{canceled}</p>
          </div>
        </div>

        {/* 🛠️ BARRA DE FILTROS NEXUS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-t border-white/5 pt-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${showFilters ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-emerald-400 border border-white/10'}`}
            >
              <Filter size={12} />
              {showFilters ? 'Fechar Filtros' : 'Filtrar Ordens'}
            </button>
            {(statusFilter !== 'ALL' || startDate || endDate) && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-[8px] font-black text-red-400 uppercase tracking-widest hover:underline">
                <X size={10} /> Limpar
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-3 animate-fade-in">
              <div className="flex flex-col gap-1.5">
                <span className="text-[7px] font-black text-white/30 uppercase ml-2">Status da Operação</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black text-white uppercase outline-none focus:border-emerald-500/50 appearance-none"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PENDING_ASSIGNED">Pendentes (Novo/Atribuído)</option>
                  <option value={OrderStatus.IN_PROGRESS}>Em Execução</option>
                  <option value={OrderStatus.COMPLETED}>Concluído</option>
                  <option value={OrderStatus.BLOCKED}>Impedido</option>
                  <option value={OrderStatus.CANCELED}>Cancelado</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[7px] font-black text-white/30 uppercase ml-2">Data Inicial</span>
                  <div className="relative">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black text-white outline-none focus:border-emerald-500/50 uppercase"
                    />
                    <CalendarIcon size={12} className="absolute right-3 top-2.5 text-white/20 pointer-events-none" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[7px] font-black text-white/30 uppercase ml-2">Data Final</span>
                  <div className="relative">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black text-white outline-none focus:border-emerald-500/50 uppercase"
                    />
                    <CalendarIcon size={12} className="absolute right-3 top-2.5 text-white/20 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div id="orders-list" className="p-4 space-y-3 max-w-lg mx-auto">
        {filteredOrders.length === 0 && !isFetching ? (
          <div className="py-20 text-center space-y-4">
            <Clock size={48} className="mx-auto text-slate-300" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nenhuma ordem encontrada</p>
            {(statusFilter !== 'ALL' || startDate || endDate) && (
              <button onClick={clearFilters} className="text-[9px] font-black text-emerald-500 uppercase underline">Limpar Filtros</button>
            )}
          </div>
        ) : filteredOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(order => {
          const isCritical = order.priority === OrderPriority.CRITICAL || order.priority === OrderPriority.HIGH;

          return (
            <div
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              className={`bg-white border-2 rounded-[1.5rem] p-4 relative overflow-hidden shadow-sm active:scale-95 transition-all cursor-pointer ${isCritical ? 'border-red-500/10 bg-red-50/5' : 'border-gray-200/60'}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-500' :
                (isCritical ? 'bg-red-600 animate-pulse' : 'bg-indigo-600')
                }`}></div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase">OS #{order.id}</span>
                    {isCritical && (
                      <span className="flex items-center gap-1 text-[8px] font-black text-red-600 bg-red-100 px-2 py-1 rounded-lg uppercase animate-pulse">
                        <AlertTriangle size={10} /> Urgente
                      </span>
                    )}
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div>
                  <h3 className="text-gray-900 font-black text-base uppercase truncate italic tracking-tighter">{order.customerName}</h3>
                  <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-0.5">{order.title}</p>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-gray-400 uppercase">Agenda Planejada</span>
                    <span className="text-[10px] font-black text-slate-900">{formatDateDisplay(order.scheduledDate)} - {order.scheduledTime || 'Horário Comercial'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={order.priority} />
                    <ChevronRight size={14} className="text-slate-300" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const address = encodeURIComponent(order.customerAddress);
                    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${address}`;
                    const appleMapsUrl = `maps://maps.apple.com/?q=${address}`;

                    // Tenta abrir app nativo, se falhar ou estiver no desktop, abre Google Maps
                    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                      window.open(appleMapsUrl, '_blank');
                    } else {
                      window.open(googleMapsUrl, '_blank');
                    }
                  }}
                  className="w-full flex items-center justify-between text-indigo-600 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 active:scale-95 transition-all hover:bg-indigo-100/50"
                  title="Abrir no GPS"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <MapPin size={14} className="shrink-0" />
                    <span className="text-[10px] font-black text-indigo-800 truncate uppercase italic">{order.customerAddress}</span>
                  </div>
                  <Navigation2 size={12} className="shrink-0 text-indigo-400" />
                </button>

                {/* BOTÕES DE AÇÃO RÁPIDA (CONCLUÍDAS/IMPEDIDAS) */}
                {(order.status === OrderStatus.COMPLETED || order.status === OrderStatus.BLOCKED) && (
                  <div className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const publicUrl = `${window.location.origin}/#/view/${order.publicToken || order.id}`;
                        const message = `Seu atendimento foi finalizado, segue sua OS: ${publicUrl}`;

                        if (navigator.share) {
                          navigator.share({
                            title: `OS #${order.id.toUpperCase()} - Nexus`,
                            text: message,
                            url: publicUrl
                          }).catch(console.error);
                        } else {
                          navigator.clipboard.writeText(message);
                          alert('Link e mensagem copiados! Cole no app desejado.');
                          window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                    >
                      <MessageCircle size={14} /> Enviar WhatsApp
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const publicUrl = `${window.location.origin}/#/view/${order.publicToken || order.id}`;
                        navigator.clipboard.writeText(publicUrl);
                        alert('Link da OS copiado para a área de transferência!');
                      }}
                      className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      <Share2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* CONTROLES DE PAGINAÇÃO */}
        {filteredOrders.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between pt-4 pb-2">
            <button
              disabled={currentPage === 1}
              onClick={() => {
                setCurrentPage(prev => Math.max(1, prev - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${currentPage === 1 ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white text-indigo-600 border-indigo-100 shadow-sm active:scale-95'}`}
            >
              Anterior
            </button>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Pág. <span className="text-indigo-600">{currentPage}</span> de {Math.ceil(filteredOrders.length / ITEMS_PER_PAGE)}
            </span>
            <button
              disabled={currentPage === Math.ceil(filteredOrders.length / ITEMS_PER_PAGE)}
              onClick={() => {
                setCurrentPage(prev => Math.min(Math.ceil(filteredOrders.length / ITEMS_PER_PAGE), prev + 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${currentPage === Math.ceil(filteredOrders.length / ITEMS_PER_PAGE) ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white text-indigo-600 border-indigo-100 shadow-sm active:scale-95'}`}
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onUpdateStatus={handleUpdateStatus} />
      )}
    </div>
  );
};

const MapPin = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
