
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
    const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

    if (!auth.user) return null;

    return (
        <div className="min-h-screen bg-[#f8fafc] pb-32 text-slate-900">
            {/* Header Glass White */}
            <header className="fixed w-full top-0 z-50 px-6 py-4 flex justify-between items-center bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-indigo-100 overflow-hidden bg-indigo-50">
                        <img src={auth.user.avatar || `https://ui-avatars.com/api/?name=${auth.user.name}&background=e0e7ff&color=4338ca`} alt="Avatar" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Técnico</p>
                        <h1 className="text-sm font-bold text-slate-900 tracking-tight">{auth.user.name}</h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={refreshData} className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 active:scale-95 transition-transform hover:bg-slate-100">
                        <RefreshCw size={18} className={`text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={logout} className="p-2.5 rounded-2xl bg-red-50 border border-red-100 text-red-500 active:scale-95 transition-transform hover:bg-red-100">
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            <main className="px-6 pt-24 space-y-8 animate-in">
                {/* Salutation */}
                <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">
                        Nexus <span className="text-indigo-600">Tech</span>
                    </h2>
                </div>

                {/* KPI Grid - Clean White */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-[2rem] relative overflow-hidden shadow-sm border border-slate-100">
                        <CheckCircle2 size={24} className="text-indigo-600 mb-4" />
                        <p className="text-[10px] font-black uppercase text-slate-400">Concluídas</p>
                        <p className="text-3xl font-black text-slate-900">{orders.filter(o => o.status === OrderStatus.COMPLETED).length}</p>
                        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-50 rounded-full -z-0"></div>
                    </div>
                    <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
                        <Clock size={24} className="text-amber-500 mb-4" />
                        <p className="text-[10px] font-black uppercase text-slate-400">Pendentes</p>
                        <p className="text-3xl font-black text-slate-900">{orders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.ASSIGNED).length}</p>
                    </div>
                </div>

                {/* Search Bar Clean */}
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar Ordem de Serviço..."
                        className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 transition-all placeholder:text-slate-400"
                    />
                </div>

                {/* OS List Clean */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 pl-2">Agenda de Hoje</h3>
                    {orders.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
                            <p className="text-sm font-bold">Nenhuma ordem encontrada hoje.</p>
                        </div>
                    ) : (
                        orders.map(order => (
                            <div
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 cursor-pointer flex items-center justify-between active:scale-[0.98] transition-transform hover:border-indigo-200 hover:shadow-md"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${order.priority === OrderPriority.CRITICAL || order.priority === OrderPriority.HIGH ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                                        <LayoutDashboard size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm tracking-tight text-slate-900">{order.customerName}</h4>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">{order.operationType || 'Visita Técnica'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                        {order.status}
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300" />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Bottom Tab Bar Premium (Clean White) - Esconde quando modal está aberto */}
            {!selectedOrder && (
                <nav className="fixed bottom-6 left-6 right-6 bg-white/90 backdrop-blur-xl border border-white/40 shadow-2xl rounded-[2.5rem] p-5 flex justify-between items-center z-40">
                    <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-400'}`}>
                        <div className={`p-1 rounded-xl ${activeTab === 'home' ? 'bg-indigo-50' : 'bg-transparent'}`}><LayoutDashboard size={20} /></div>
                        <span className="text-[8px] font-black uppercase tracking-widest">Início</span>
                    </button>
                    <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${activeTab === 'orders' ? 'text-indigo-600' : 'text-slate-400'}`}>
                        <div className={`p-1 rounded-xl ${activeTab === 'orders' ? 'bg-indigo-50' : 'bg-transparent'}`}><ListTodo size={20} /></div>
                        <span className="text-[8px] font-black uppercase tracking-widest">Tarefas</span>
                    </button>
                    <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${activeTab === 'map' ? 'text-indigo-600' : 'text-slate-400'}`}>
                        <div className={`p-1 rounded-xl ${activeTab === 'map' ? 'bg-indigo-50' : 'bg-transparent'}`}><MapPin size={20} /></div>
                        <span className="text-[8px] font-black uppercase tracking-widest">Rota</span>
                    </button>
                    <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-400'}`}>
                        <div className={`p-1 rounded-xl ${activeTab === 'settings' ? 'bg-indigo-50' : 'bg-transparent'}`}><Settings size={20} /></div>
                        <span className="text-[8px] font-black uppercase tracking-widest">Conta</span>
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
