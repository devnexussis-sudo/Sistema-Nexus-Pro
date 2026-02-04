
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
    addDays,
    eachDayOfInterval,
    parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Search,
    Filter,
    User,
    MapPin,
    ExternalLink,
    Clock,
    CheckCircle2,
    AlertCircle
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
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [showFilters, setShowFilters] = useState(false);

    // Filtros idênticos à página de atividades
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
        const start = startOfWeek(startOfMonth(currentMonth));
        const end = endOfWeek(endOfMonth(currentMonth));
        return eachDayOfInterval({ start, end });
    }, [currentMonth]);

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const goToToday = () => setCurrentMonth(new Date());

    const getOrdersForDay = (day: Date) => {
        return filteredOrders.filter(order => {
            const orderDate = order.scheduledDate || order.createdAt;
            if (!orderDate) return false;
            return isSameDay(parseISO(orderDate.substring(0, 10)), day);
        });
    };

    const getStatusColor = (status: OrderStatus) => {
        switch (status) {
            case OrderStatus.COMPLETED: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case OrderStatus.IN_PROGRESS: return 'bg-blue-100 text-blue-700 border-blue-200';
            case OrderStatus.PENDING: return 'bg-amber-100 text-amber-700 border-amber-200';
            case OrderStatus.CANCELED: return 'bg-red-100 text-red-700 border-red-200';
            case OrderStatus.BLOCKED: return 'bg-slate-100 text-slate-700 border-slate-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const handleOrderClick = (order: ServiceOrder) => {
        const publicUrl = `${window.location.origin}/#/view/${order.publicToken || order.id}`;
        window.open(publicUrl, '_blank');
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
            {/* HEADER E FILTROS */}
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
                            <CalendarIcon className="text-indigo-600" size={32} />
                            Calendário <span className="text-indigo-600">Operacional</span>
                        </h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Visualização Estratégica Mensal</p>
                    </div>

                    <div className="flex items-center bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200">
                        <button onClick={prevMonth} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"><ChevronLeft size={20} /></button>
                        <div className="px-6 text-sm font-black text-slate-900 uppercase italic min-w-[180px] text-center">
                            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                        </div>
                        <button onClick={nextMonth} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"><ChevronRight size={20} /></button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={goToToday} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all active:scale-95">Hoje</button>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showFilters ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-600'}`}
                        >
                            <Filter size={14} /> Filtros
                        </button>
                    </div>
                </div>

                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm animate-fade-in mb-4">
                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar</label>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                <input
                                    type="text"
                                    placeholder="ID, Cliente, Serviço..."
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-12 pr-4 text-xs font-bold outline-none focus:border-indigo-500"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Técnico</label>
                            <select
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold outline-none focus:border-indigo-500"
                                value={techFilter}
                                onChange={(e) => setTechFilter(e.target.value)}
                            >
                                <option value="ALL">Todos os Técnicos</option>
                                {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                            <select
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold outline-none focus:border-indigo-500"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="ALL">Todos os Status</option>
                                {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* CALENDÁRIO */}
            <div className="flex-1 overflow-auto bg-slate-50/30 p-4">
                <div className="min-w-[1000px] h-full flex flex-col">
                    {/* DIAS DA SEMANA */}
                    <div className="grid grid-cols-7 mb-2">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                            <div key={day} className="text-center py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* GRID DE DIAS */}
                    <div className="grid grid-cols-7 grid-rows-6 gap-2 flex-1">
                        {days.map((day, idx) => {
                            const dayOrders = getOrdersForDay(day);
                            const isToday = isSameDay(day, new Date());
                            const isCurrentMonth = isSameMonth(day, currentMonth);

                            return (
                                <div
                                    key={idx}
                                    className={`min-h-[140px] bg-white rounded-3xl border transition-all ${isCurrentMonth ? 'border-slate-100 shadow-sm' : 'border-transparent opacity-30'} ${isToday ? 'ring-2 ring-indigo-500/20 bg-indigo-50/5' : ''}`}
                                >
                                    <div className="p-3 flex justify-between items-center bg-slate-50/50 rounded-t-3xl mb-1">
                                        <span className={`text-xs font-black ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>
                                            {format(day, 'd')}
                                        </span>
                                        {dayOrders.length > 0 && (
                                            <span className="text-[8px] font-black bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md">
                                                {dayOrders.length} OS
                                            </span>
                                        )}
                                    </div>

                                    <div className="p-2 space-y-1 overflow-y-auto max-h-[100px] custom-scrollbar">
                                        {dayOrders.map(order => {
                                            const tech = techs.find(t => t.id === order.assignedTo);
                                            return (
                                                <div
                                                    key={order.id}
                                                    onClick={() => handleOrderClick(order)}
                                                    className={`group relative h-7 flex items-center px-2 rounded-lg border text-[9px] font-bold cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${getStatusColor(order.status)}`}
                                                >
                                                    <span className="truncate w-full">{order.customerName}</span>

                                                    {/* TOOLTIP INTERATIVO */}
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-4 bg-slate-900 text-white rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-[100] border border-white/10 scale-95 group-hover:scale-100 origin-bottom">
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-start">
                                                                <span className="text-[8px] font-black text-indigo-400 uppercase">OS #{order.id}</span>
                                                                <div className="px-1.5 py-0.5 bg-white/10 rounded text-[7px] font-black uppercase tracking-widest">{order.status}</div>
                                                            </div>

                                                            <div>
                                                                <p className="text-[7px] text-white/40 font-black uppercase tracking-widest mb-1">Cliente</p>
                                                                <p className="line-clamp-1">{order.customerName}</p>
                                                            </div>

                                                            <div className="flex justify-between gap-2 pt-2 border-t border-white/5">
                                                                <div className="flex-1">
                                                                    <p className="text-[7px] text-white/40 font-black uppercase tracking-widest mb-1">Técnico</p>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className="w-4 h-4 rounded-md bg-white/10 flex items-center justify-center">
                                                                            <User size={8} />
                                                                        </div>
                                                                        <span className="text-[9px] font-bold truncate">{tech?.name || 'Não Atribuído'}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-[7px] text-white/40 font-black uppercase tracking-widest mb-1">Horário</p>
                                                                    <div className="flex items-center gap-1 text-emerald-400">
                                                                        <Clock size={8} />
                                                                        <span className="text-[9px] font-black italic">{order.scheduledTime || '--:--'}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2 text-[8px] font-black text-indigo-400 animate-pulse">
                                                                <ExternalLink size={10} />
                                                                CLIQUE PARA VER PUBLICAMENTE
                                                            </div>
                                                        </div>
                                                        {/* Triângulo do Tooltip */}
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[6px] border-transparent border-t-slate-900"></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
      `}</style>
        </div>
    );
};
