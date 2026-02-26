
import React, { useState, useMemo } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval,
  parseISO,
  addDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search,
  User,
  ExternalLink,
  Clock,
  Box,
  X,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar as CalendarIcon
} from 'lucide-react';
import { ServiceOrder, User as TechUser, Customer, OrderStatus } from '../../types';
import { getStatusCalendarStyle, getStatusLabel } from '../../lib/statusColors';

interface OrderCalendarProps {
  orders: ServiceOrder[];
  techs: TechUser[];
  customers: Customer[];
}

export const OrderCalendar: React.FC<OrderCalendarProps> = ({ orders, techs, customers }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL'); // Default: Todos
  const [selectedDayData, setSelectedDayData] = useState<{ day: Date, orders: ServiceOrder[] } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

  const handleDayClick = (day: Date, dayOrders: ServiceOrder[]) => {
    if (dayOrders.length > 0) {
      setSelectedDayData({ day, orders: dayOrders });
    }
  };

  const handleOrderClick = (order: ServiceOrder) => {
    setSelectedOrder(order);
  };

  // Filtros
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term) ||
        (order.displayId || '').toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

      const assignedTech = techs.find(t => t.id === order.assignedTo);
      const techName = assignedTech ? assignedTech.name.toLowerCase() : '';
      const matchesTech = techFilter === 'ALL' || techName.includes(techFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesTech;
    });
  }, [orders, techs, searchTerm, statusFilter, techFilter]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    let interval = eachDayOfInterval({ start, end });

    // Garantir 6 semanas (42 dias) sempre
    while (interval.length < 42) {
      interval.push(addDays(interval[interval.length - 1], 1));
    }
    return interval;
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  const getOrdersForDay = (day: Date) => {
    return filteredOrders.filter(order => {
      const orderDate = order.scheduledDate;
      if (!orderDate) return false;
      return isSameDay(parseISO(orderDate.substring(0, 10)), day);
    });
  };

  // ✅ Usando cores vibrantes do Design System para boa visibilidade no calendário
  const getStatusStyle = getStatusCalendarStyle;

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
      {/* HEADER ULTRA-COMPACTO - APENAS FILTROS E NAVEGAÇÃO */}
      <header className="px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-4 z-30 shadow-sm shrink-0">
        {/* Navegação de Data Compacta */}
        <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 shrink-0">
          <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-all active:scale-95"><ChevronLeft size={16} /></button>
          <div className="px-3 text-[10px] font-black text-slate-900 uppercase italic min-w-[120px] text-center tracking-tighter">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </div>
          <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-all active:scale-95"><ChevronRight size={16} /></button>
        </div>

        <button onClick={goToToday} className="px-4 py-2 bg-[#1c2d4f] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#253a66] transition-all active:scale-95 shadow-lg shadow-primary-100 shrink-0">Hoje</button>

        <div className="h-6 w-px bg-slate-200 mx-1"></div>

        {/* Filtros Padronizados */}
        <div className="flex-1 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="BUSCAR O.S. OU CLIENTE..."
              className="w-full bg-slate-100 border border-transparent rounded-xl py-2 pl-10 pr-4 text-[9px] font-black uppercase tracking-widest outline-none focus:bg-white focus:border-primary-500 transition-all italic"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              className="bg-slate-100 border border-slate-200 rounded-xl py-2 px-3 text-[9px] font-black uppercase tracking-widest outline-none focus:bg-white focus:border-primary-500 transition-all cursor-pointer min-w-[180px]"
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
            >
              <option value="ALL">TODOS OS TÉCNICOS</option>
              {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>

            <select
              className={`border rounded-xl py-2 px-3 text-[9px] font-black uppercase tracking-widest outline-none transition-all cursor-pointer min-w-[150px] ${statusFilter === 'ALL' ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-primary-50 border-primary-200 text-primary-700'}`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="ALL">TODOS STATUS</option>
              {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s === OrderStatus.PENDING ? '📍 AGENDADAS' : s.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* GRID DO CALENDÁRIO - SEM SCROLL NO CONTAINER PAI */}
      <main className="flex-1 overflow-hidden flex flex-col bg-slate-100/50 min-h-0">
        {/* DIAS DA SEMANA */}
        <div className="grid grid-cols-7 bg-white shrink-0">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
            <div key={day} className="py-2 text-center text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] italic border-r border-slate-100 last:border-0 border-b">
              {day}
            </div>
          ))}
        </div>

        {/* GRID DE DIAS - FLEX-1 PARA PREENCHER TELA */}
        <div className="flex-1 grid grid-cols-7 auto-rows-fr gap-px bg-slate-200 min-h-0">
          {days.map((day, idx) => {
            const dayOrders = getOrdersForDay(day);
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentMonth);

            return (
              <div
                key={idx}
                onClick={() => handleDayClick(day, dayOrders)}
                className={`flex flex-col items-center justify-center overflow-hidden relative transition-all group min-h-0 cursor-pointer
                  ${isCurrentMonth ? 'bg-white' : 'bg-slate-50 opacity-40'} 
                  ${isToday ? 'bg-primary-50/20' : ''}
                  ${dayOrders.length > 0 ? 'hover:bg-slate-50' : ''}
                `}
              >
                {/* Indicador de Dia Compacto */}
                <div className="absolute top-2 left-2 flex justify-between items-center z-10">
                  <span className={`text-sm font-black italic tracking-tighter transition-all shrink-0
                    ${isToday ? 'text-primary-600 scale-110 drop-shadow-sm' : 'text-slate-300 group-hover:text-slate-900'}
                  `}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* VISUALIZAÇÃO DE QUANTIDADE (O que o usuário pediu) */}
                {dayOrders.length > 0 ? (
                  <div className="flex flex-col items-center gap-1 group-hover:scale-110 transition-transform">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-sm
                      ${isToday
                        ? 'bg-primary-600 border-primary-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-white'
                      }
                    `}>
                      <span className="text-xl font-black italic">{dayOrders.length}</span>
                    </div>
                    <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest group-hover:text-slate-900">
                      {dayOrders.length === 1 ? 'Ordem' : 'Ordens'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center opacity-10 grayscale">
                    <CalendarIcon size={24} className="text-slate-200" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* MODAL DE LISTAGEM POR DIA (QUANTIDADE -> LISTA) */}
      {selectedDayData && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tighter">
                    {format(selectedDayData.day, "dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{selectedDayData.orders.length} Ordens de Serviço</p>
                </div>
                <button onClick={() => setSelectedDayData(null)} className="p-2 hover:bg-white rounded-xl text-slate-400 transition-all"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {selectedDayData.orders.map(order => (
                  <div 
                    key={order.id}
                    onClick={() => handleOrderClick(order)}
                    className={`group flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] hover:shadow-lg active:scale-95 ${getStatusStyle(order.status)}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
                      <Clock size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase truncate leading-none mb-1">{order.customerName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold bg-black/10 px-1 rounded uppercase tracking-tighter">#{order.displayId || 'S/N'}</span>
                        <span className="text-[8px] font-black italic">{order.scheduledTime || '--:--'}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="opacity-30 group-hover:opacity-100 transition-all" />
                  </div>
                ))}
              </div>
           </div>
        </div>
      )}

      {/* MODAL / BALÃO DE DETALHES - MANTÉM O ESTILO PREMIUM */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            {/* Cabeçalho */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`px-3 py-1 rounded-full text-[7px] font-black uppercase tracking-[0.2em] border flex items-center gap-1.5 ${getStatusStyle(selectedOrder.status)}`}>
                    <span className="opacity-70">STATUS:</span>
                    {selectedOrder.status}
                  </div>
                  <span className="text-[8px] font-black text-primary-600 uppercase tracking-widest">Detalhes da O.S.</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter leading-none">
                  #{selectedOrder.displayId || selectedOrder.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2.5 hover:bg-white rounded-xl text-slate-400 hover:text-red-500 transition-all shadow-none hover:shadow-md"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo - SCROLLABLE AREA */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cliente / Unidade</label>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-base font-black text-slate-900 uppercase italic leading-tight">{selectedOrder.customerName}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Técnico Responsável</label>
                  <div className="flex items-center gap-3 p-3 bg-primary-50/50 rounded-xl border border-primary-100">
                    <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center">
                      <User size={20} />
                    </div>
                    <span className="text-[11px] font-black text-slate-900 uppercase">
                      {techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'NÃO ATRIBUÍDO'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Agenda / Horário</label>
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                      <Clock size={20} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-emerald-800 uppercase italic">
                        {format(parseISO(selectedOrder.scheduledDate), "dd 'de' MMMM", { locale: ptBR })}
                      </span>
                      <span className="text-lg font-black italic text-emerald-700">{selectedOrder.scheduledTime || '--:--'}</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Equipamento / Ativo</label>
                  <div className="flex items-center gap-4 p-5 bg-slate-900 rounded-[1.5rem] text-white">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-primary-300 shrink-0">
                      <Box size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase italic tracking-tight text-primary-300">
                        {selectedOrder.equipmentName || 'MANUTENÇÃO GERAL'}
                      </p>
                      <p className="text-[9px] font-bold text-white/40 uppercase">
                        {selectedOrder.equipmentModel || 'MODELO NÃO ESPECIFICADO'}
                        {selectedOrder.equipmentSerial ? ` • SN: ${selectedOrder.equipmentSerial}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Motivo / Descrição</label>
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl max-h-32 overflow-y-auto italic text-[11px] font-bold text-slate-600 leading-relaxed">
                    {selectedOrder.description || selectedOrder.title || 'Sem descrição detalhada.'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  const publicUrl = `${window.location.origin}/#/view/${selectedOrder.publicToken || selectedOrder.id}`;
                  window.open(publicUrl, '_blank');
                }}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-primary-600 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-primary-700 transition-all shadow-xl shadow-primary-100 active:scale-95 shrink-0"
              >
                <ExternalLink size={14} /> Abrir Relatório Público
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar-thin::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
