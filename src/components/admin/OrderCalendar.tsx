
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

interface OrderCalendarProps {
  orders: ServiceOrder[];
  techs: TechUser[];
  customers: Customer[];
}

export const OrderCalendar: React.FC<OrderCalendarProps> = ({ orders, techs, customers }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>(OrderStatus.PENDING); // Default: Agendadas
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

  // Filtros
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term);

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

    // Garantir 6 semanas (42 dias)
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

  const getStatusStyle = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.COMPLETED: return 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-200';
      case OrderStatus.IN_PROGRESS: return 'bg-blue-500 text-white border-blue-600 shadow-blue-200';
      case OrderStatus.PENDING: return 'bg-amber-500 text-white border-amber-600 shadow-amber-200';
      case OrderStatus.CANCELED: return 'bg-rose-500 text-white border-rose-600 shadow-rose-200';
      case OrderStatus.BLOCKED: return 'bg-slate-500 text-white border-slate-600 shadow-slate-200';
      default: return 'bg-indigo-500 text-white border-indigo-600 shadow-indigo-200';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
      {/* HEADER DINÂMICO E ESPAÇOSO */}
      <header className="px-8 py-6 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-6 z-30 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-1">Painel Operacional</span>
            <h1 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              <CalendarIcon className="text-indigo-600" size={24} />
            </h1>
          </div>

          <div className="flex items-center bg-slate-100 rounded-[1.25rem] p-1.5 border border-slate-200 shadow-inner">
            <button onClick={prevMonth} className="p-2.5 hover:bg-white rounded-xl text-slate-600 transition-all active:scale-90 shadow-none hover:shadow-md"><ChevronLeft size={20} /></button>
            <button onClick={goToToday} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 mx-2">Hoje</button>
            <button onClick={nextMonth} className="p-2.5 hover:bg-white rounded-xl text-slate-600 transition-all active:scale-90 shadow-none hover:shadow-md"><ChevronRight size={20} /></button>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-1 max-w-4xl">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="PESQUISAR CLIENTE, O.S. OU TÉCNICO..."
              className="w-full bg-slate-100 border-2 border-transparent rounded-[1.5rem] py-4 pl-14 pr-6 text-[11px] font-black uppercase tracking-widest outline-none focus:bg-white focus:border-indigo-500 transition-all shadow-inner focus:shadow-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-600 transition-colors" size={14} />
              <select
                className="bg-slate-100 border border-slate-200 rounded-[1.25rem] py-3.5 pl-10 pr-6 text-[10px] font-black uppercase tracking-widest outline-none focus:bg-white focus:border-indigo-500 transition-all cursor-pointer shadow-sm appearance-none min-w-[220px]"
                value={techFilter}
                onChange={(e) => setTechFilter(e.target.value)}
              >
                <option value="ALL">TODOS OS TÉCNICOS</option>
                {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>

            <select
              className={`border-2 rounded-[1.25rem] py-3.5 px-6 text-[10px] font-black uppercase tracking-widest outline-none transition-all cursor-pointer shadow-sm min-w-[180px] ${statusFilter === 'ALL' ? 'bg-slate-100 border-transparent text-slate-600' : 'bg-indigo-50 border-indigo-600 text-indigo-700'}`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="ALL">TODOS OS STATUS</option>
              {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s === OrderStatus.PENDING ? '📍 AGENDADAS' : s.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* GRID DO CALENDÁRIO - MAXIMIZADO */}
      <main className="flex-1 overflow-auto bg-slate-200 p-px custom-scrollbar">
        <div className="min-w-[1200px] h-full flex flex-col">
          {/* DIAS DA SEMANA */}
          <div className="grid grid-cols-7 bg-white border-b border-slate-200 shadow-sm">
            {['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'].map(day => (
              <div key={day} className="py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] italic border-r border-slate-100 last:border-0">
                {day}
              </div>
            ))}
          </div>

          {/* GRID DE DIAS */}
          <div className="flex-1 grid grid-cols-7 grid-rows-6">
            {days.map((day, idx) => {
              const dayOrders = getOrdersForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentMonth);

              return (
                <div
                  key={idx}
                  className={`relative group flex flex-col border-r border-b border-slate-200 min-h-[160px] transition-all
                                ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/80 opacity-60'} 
                                ${isToday ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}
                              `}
                >
                  {/* Background Number Decal */}
                  <div className={`absolute top-4 right-6 text-6xl font-black italic tracking-tighter opacity-[0.03] pointer-events-none select-none transition-all group-hover:opacity-[0.07] ${isToday ? 'text-indigo-600 opacity-[0.1]' : 'text-slate-900'}`}>
                    {format(day, 'd')}
                  </div>

                  <div className="p-4 flex justify-between items-start z-10">
                    <span className={`text-2xl font-black italic tracking-tighter transition-transform group-hover:scale-110 origin-left 
                                      ${isToday ? 'text-indigo-600 drop-shadow-md' : 'text-slate-300 group-hover:text-slate-900'}
                                  `}>
                      {format(day, 'd')}
                    </span>
                    {dayOrders.length > 0 && (
                      <div className={`flex flex-col items-end`}>
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full shadow-sm animate-pulse border
                                              ${isToday ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-slate-900 text-white border-slate-900'}
                                          `}>
                          {dayOrders.length} O.S.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* LISTA DE O.S. NO DIA */}
                  <div className="flex-1 px-3 pb-4 space-y-2 overflow-y-auto custom-scrollbar-thin max-h-[180px] z-10">
                    {dayOrders.map(order => (
                      <div
                        key={order.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOrderClick(order);
                        }}
                        className={`group/item flex flex-col p-3 rounded-xl border-2 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer shadow-sm hover:shadow-xl ${getStatusStyle(order.status)}`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <span className="text-[10px] font-black tracking-tight uppercase line-clamp-2 leading-tight flex-1">
                            {order.customerName}
                          </span>
                          <span className="text-[9px] font-black bg-black/20 px-2 py-0.5 rounded-lg backdrop-blur-sm">
                            {order.scheduledTime || '--:--'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[8px] font-bold opacity-80 border-t border-white/20 pt-1 mt-1">
                          <span className="uppercase tracking-tighter truncate max-w-[100px]">#{order.id}</span>
                          <div className="flex items-center gap-1">
                            <User size={8} />
                            <span className="uppercase">{techs.find(t => t.id === order.assignedTo)?.name?.split(' ')[0] || '---'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* MODAL / BALÃO DE DETALHES */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] border border-white/20 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            {/* Cabeçalho Premium */}
            <div className="p-10 bg-gradient-to-br from-indigo-50 to-white border-b border-indigo-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none transform translate-x-1/4 -translate-y-1/4">
                <CalendarIcon size={240} />
              </div>

              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full shadow-lg shadow-indigo-200">
                      Atividade Detalhada
                    </span>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border-2 ${getStatusStyle(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <h3 className="text-4xl font-black text-slate-900 italic uppercase tracking-tighter">O.S. #{selectedOrder.id}</h3>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-4 bg-white/50 hover:bg-white hover:text-red-500 rounded-[1.5rem] text-slate-400 transition-all shadow-xl border border-white active:scale-90"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Conteúdo Rico */}
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="col-span-2 group">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] block mb-3 group-hover:text-indigo-600 transition-colors">Cliente / Unidade de Serviço</label>
                  <div className="p-5 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-indigo-100 hover:bg-white transition-all shadow-inner hover:shadow-xl">
                    <p className="text-lg font-black text-slate-900 uppercase italic tracking-tight leading-snug">{selectedOrder.customerName}</p>
                    <div className="flex items-center gap-2 mt-2 text-slate-400">
                      <MapPin size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Endereço vinculado no cadastro</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] block">Técnico em Campo</label>
                  <div className="flex items-center gap-4 p-4 bg-indigo-50/50 rounded-[1.5rem] border border-indigo-100">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                      <User size={24} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                        {techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'NÃO ATRIBUÍDO'}
                      </span>
                      <span className="text-[9px] font-bold text-indigo-600 uppercase">Equipe de Manutenção</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] block">Horário do Agendamento</label>
                  <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-[1.5rem] border border-emerald-100">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200">
                      <Clock size={24} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xl font-black italic text-emerald-700">
                        {selectedOrder.scheduledTime || '--:--'}
                      </span>
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Horário Comercial</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] block mb-3">Ativo Tecnológico</label>
                  <div className="flex items-center gap-5 p-6 bg-slate-900 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group/equip">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-transparent pointer-events-none"></div>
                    <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-indigo-400 animate-pulse group-hover/equip:scale-110 transition-transform">
                      <Box size={32} />
                    </div>
                    <div className="flex flex-col gap-1 relative z-10">
                      <p className="text-lg font-black uppercase italic tracking-tighter text-indigo-300 line-clamp-1">{selectedOrder.equipmentName || 'MANUTENÇÃO GERAL / SEM ATIVO'}</p>
                      <p className="text-[11px] font-bold text-white/50 uppercase tracking-[0.2em]">{selectedOrder.equipmentModel || 'MODELO NÃO ESPECIFICADO'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ações Estratégicas */}
              <div className="pt-8 flex gap-4">
                <button
                  onClick={() => {
                    const publicUrl = `${window.location.origin}/#/view/${selectedOrder.publicToken || selectedOrder.id}`;
                    window.open(publicUrl, '_blank');
                  }}
                  className="flex-1 flex items-center justify-center gap-4 py-6 bg-indigo-600 text-white rounded-[1.75rem] text-xs font-black uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-2xl shadow-indigo-200 active:scale-95 group/btn"
                >
                  <ExternalLink size={20} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                  Vincular Relatório Público
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 20px;
          border: 2px solid #f1f5f9;
        }
        .custom-scrollbar-thin::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
