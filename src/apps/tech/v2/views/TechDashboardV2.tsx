
import React, { useState } from 'react';
import { useTech } from '../context/TechContext';
import {
    LayoutDashboard,
    ListTodo,
    MapPin,
    Settings,
    Search,
    RefreshCw,
    LogOut,
    ChevronRight,
    Clock,
    CheckCircle2
} from 'lucide-react';
import { OrderDetailsV2 } from './OrderDetailsV2';
import { OrderStatus, OrderPriority, ServiceOrder } from '../../../../types';

export const TechDashboardV2: React.FC = () => {
    const { auth, orders, isSyncing, refreshData, logout, updateOrderStatus } = useTech();
    const [activeTab, setActiveTab] = useState('home');
    const [activeFilter, setActiveFilter] = useState<OrderStatus | 'ALL'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

    if (!auth.user) return null;

    const filteredOrders = orders.filter(o => {
        const matchesStatus = activeFilter === 'ALL' || o.status === activeFilter;
        const matchesSearch = o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.id.includes(searchTerm) ||
            (o.equipmentName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const getStatusCount = (status: OrderStatus) => orders.filter(o => o.status === status).length;

    return (
        <div className="min-h-screen bg-slate-100 pb-32 font-sans selection:bg-indigo-500/30">
            {/* Header Dark (Admin Style) */}
            <header className="fixed w-full top-0 z-50 px-6 py-5 flex justify-between items-center bg-[#0f172a] shadow-lg shadow-indigo-900/10 rounded-b-[2rem]">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl border-2 border-indigo-500/30 overflow-hidden bg-slate-800 p-0.5">
                        <img className="w-full h-full rounded-xl object-cover" src={auth.user.avatar || `https://ui-avatars.com/api/?name=${auth.user.name}&background=6366f1&color=fff`} alt="Avatar" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-black text-indigo-400 tracking-widest mb-0.5">Técnico</p>
                        <h1 className="text-base font-bold text-white tracking-tight">{auth.user.name}</h1>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={refreshData} className="p-3 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all hover:bg-white/10 group">
                        <RefreshCw size={20} className={`text-indigo-400 group-hover:text-white transition-colors ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={logout} className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 active:scale-95 transition-all hover:bg-red-500/20">
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <main className="px-6 pt-32 space-y-8 animate-in mt-2">

                {/* KPI Dashboard Funcional */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 pl-2">Visão Geral</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setActiveFilter(activeFilter === OrderStatus.COMPLETED ? 'ALL' : OrderStatus.COMPLETED)}
                            className={`p-4 rounded-3xl border transition-all active:scale-95 text-left relative overflow-hidden group ${activeFilter === OrderStatus.COMPLETED ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/30' : 'bg-white border-slate-200 text-slate-600'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <CheckCircle2 size={24} className={activeFilter === OrderStatus.COMPLETED ? 'text-white' : 'text-emerald-500'} />
                                <span className="text-2xl font-black">{getStatusCount(OrderStatus.COMPLETED)}</span>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-wider opacity-80">Concluídas</p>
                            <div className={`absolute -right-4 -bottom-4 w-16 h-16 rounded-full blur-2xl opacity-50 ${activeFilter === OrderStatus.COMPLETED ? 'bg-white' : 'bg-emerald-500'}`}></div>
                        </button>

                        <button
                            onClick={() => setActiveFilter(activeFilter === OrderStatus.ASSIGNED ? 'ALL' : OrderStatus.ASSIGNED)}
                            className={`p-4 rounded-3xl border transition-all active:scale-95 text-left relative overflow-hidden ${activeFilter === OrderStatus.ASSIGNED ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30' : 'bg-white border-slate-200 text-slate-600'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <Clock size={24} className={activeFilter === OrderStatus.ASSIGNED ? 'text-white' : 'text-indigo-600'} />
                                <span className="text-2xl font-black">{getStatusCount(OrderStatus.ASSIGNED)}</span>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-wider opacity-80">Atribuídas</p>
                        </button>

                        <button
                            onClick={() => setActiveFilter(activeFilter === OrderStatus.IN_PROGRESS ? 'ALL' : OrderStatus.IN_PROGRESS)}
                            className={`p-4 rounded-3xl border transition-all active:scale-95 text-left relative overflow-hidden ${activeFilter === OrderStatus.IN_PROGRESS ? 'bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-500/30' : 'bg-white border-slate-200 text-slate-600'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <ListTodo size={24} className={activeFilter === OrderStatus.IN_PROGRESS ? 'text-white' : 'text-amber-500'} />
                                <span className="text-2xl font-black">{getStatusCount(OrderStatus.IN_PROGRESS)}</span>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-wider opacity-80">Executando</p>
                        </button>

                        <button
                            onClick={() => setActiveFilter(activeFilter === OrderStatus.BLOCKED ? 'ALL' : OrderStatus.BLOCKED)}
                            className={`p-4 rounded-3xl border transition-all active:scale-95 text-left relative overflow-hidden ${activeFilter === OrderStatus.BLOCKED ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/30' : 'bg-white border-slate-200 text-slate-600'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <MapPin size={24} className={activeFilter === OrderStatus.BLOCKED ? 'text-white' : 'text-red-500'} />
                                <span className="text-2xl font-black">{getStatusCount(OrderStatus.BLOCKED)}</span>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-wider opacity-80">Impedidas</p>
                        </button>
                    </div>
                </div>

                {/* Search Bar Refined */}
                <div className="relative group shadow-sm rounded-2xl">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, ID ou equipamento..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300 transition-all placeholder:text-slate-400"
                    />
                </div>

                {/* OS List - Beautiful Cards */}
                <div className="space-y-4 pb-24">
                    <div className="flex items-center justify-between pl-2 pr-2">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                            {activeFilter === 'ALL' ? 'Todas as Ordens' : `Filtro: ${activeFilter}`}
                        </h3>
                        <span className="text-[10px] font-bold py-1 px-2.5 bg-slate-200 rounded-lg text-slate-500">{filteredOrders.length}</span>
                    </div>

                    {filteredOrders.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-[2.5rem]">
                            <p className="text-sm font-bold opacity-60">Nenhuma ordem encontrada.</p>
                            <button onClick={() => { setActiveFilter('ALL'); setSearchTerm('') }} className="mt-4 text-[10px] font-black uppercase text-indigo-500 hover:underline">Limpar Filtros</button>
                        </div>
                    ) : (
                        filteredOrders.map(order => (
                            <div
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className="group bg-white p-5 rounded-[2rem] shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-slate-100 cursor-pointer relative overflow-hidden transition-all hover:border-indigo-200 hover:shadow-xl hover:-translate-y-1 active:scale-[0.98]"
                            >
                                {/* Lateral Color Strip Indicator */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-500' :
                                    order.status === OrderStatus.IN_PROGRESS ? 'bg-amber-500' :
                                        order.priority === OrderPriority.CRITICAL ? 'bg-red-500' :
                                            'bg-indigo-500'
                                    }`}></div>

                                <div className="flex items-start justify-between mb-4 pl-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                                            {order.id.slice(0, 8)} • {new Date(order.scheduledDate || order.createdAt).toLocaleDateString()}
                                        </p>
                                        <h4 className="font-bold text-base text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                                            {order.customerName}
                                        </h4>
                                    </div>
                                    <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-50 text-emerald-600' :
                                        order.status === OrderStatus.IN_PROGRESS ? 'bg-amber-50 text-amber-600' :
                                            order.priority === OrderPriority.CRITICAL ? 'bg-red-50 text-red-500' :
                                                'bg-indigo-50 text-indigo-600'
                                        }`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-500' :
                                            order.status === OrderStatus.IN_PROGRESS ? 'bg-amber-500' :
                                                'bg-indigo-500'
                                            }`}></div>
                                        {order.status}
                                    </div>
                                </div>

                                <div className="pl-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                                            {order.operationType?.toLowerCase().includes('instala') ? <Settings size={18} /> :
                                                order.operationType?.toLowerCase().includes('manuten') ? <RefreshCw size={18} /> :
                                                    <LayoutDashboard size={18} />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">{order.operationType || 'Visita Técnica'}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{order.equipmentName || 'Equipamento Geral'}</p>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                        <ChevronRight size={16} />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Bottom Tab Bar Dark (Admin Style) */}
            {!selectedOrder && (
                <nav className="fixed bottom-0 left-0 right-0 bg-[#0f172a] rounded-t-[2.5rem] p-4 pb-8 flex justify-between items-center z-40 shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.15)] border-t border-white/5">
                    <button onClick={() => setActiveTab('home')} className={`flex-1 flex flex-col items-center gap-1.5 transition-all active:scale-90 group ${activeTab === 'home' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        <div className={`p-2 rounded-2xl transition-all ${activeTab === 'home' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/40' : 'bg-transparent'}`}>
                            <LayoutDashboard size={22} className="" />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === 'home' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>Início</span>
                    </button>

                    <button onClick={() => setActiveTab('orders')} className={`flex-1 flex flex-col items-center gap-1.5 transition-all active:scale-90 group ${activeTab === 'orders' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        <div className={`p-2 rounded-2xl transition-all ${activeTab === 'orders' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/40' : 'bg-transparent'}`}>
                            <ListTodo size={22} className="" />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === 'orders' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>Tarefas</span>
                    </button>

                    <button onClick={() => setActiveTab('map')} className={`flex-1 flex flex-col items-center gap-1.5 transition-all active:scale-90 group ${activeTab === 'map' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        <div className={`p-2 rounded-2xl transition-all ${activeTab === 'map' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/40' : 'bg-transparent'}`}>
                            <MapPin size={22} className="" />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === 'map' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>Rota</span>
                    </button>

                    <button onClick={() => setActiveTab('settings')} className={`flex-1 flex flex-col items-center gap-1.5 transition-all active:scale-90 group ${activeTab === 'settings' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        <div className={`p-2 rounded-2xl transition-all ${activeTab === 'settings' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/40' : 'bg-transparent'}`}>
                            <Settings size={22} className="" />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === 'settings' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>Conta</span>
                    </button>
                </nav>
            )}

            {selectedOrder && (
                <OrderDetailsV2
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onUpdateStatus={async (status, notes, formData) => {
                        await updateOrderStatus(selectedOrder.id, status, notes, formData);
                        setSelectedOrder(prev => prev ? {
                            ...prev,
                            status,
                            notes: notes || prev.notes,
                            formData: { ...prev.formData, ...formData },
                            signature: formData?.signature || prev.signature,
                            signatureName: formData?.signatureName || prev.signatureName,
                            signatureDoc: formData?.signatureDoc || prev.signatureDoc
                        } : null);
                    }}
                />
            )}
        </div>
    );
};
