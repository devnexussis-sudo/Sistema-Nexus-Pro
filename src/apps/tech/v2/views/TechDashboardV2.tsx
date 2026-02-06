
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
        <div className="min-h-screen pb-32">
            {/* Header Glass */}
            <header className="glass sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-emerald-500 overflow-hidden bg-slate-800">
                        <img src={auth.user.avatar || `https://ui-avatars.com/api/?name=${auth.user.name}`} alt="Avatar" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Technician</p>
                        <h1 className="text-sm font-bold text-white tracking-tight">{auth.user.name}</h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={refreshData} className="p-2.5 rounded-2xl bg-white/5 border border-white/10 active:scale-90 transition-transform">
                        <RefreshCw size={18} className={`text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={logout} className="p-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 active:scale-90 transition-transform">
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            <main className="px-6 mt-6 space-y-8 animate-in text-slate-50">
                {/* Salutation */}
                <div>
                    <h2 className="text-2xl font-black italic uppercase italic tracking-tighter">
                        Nexus <span className="text-emerald-500">Tech 2.0</span>
                    </h2>
                </div>

                {/* KPI Grid - Glass with Glow */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="glass-emerald p-5 rounded-[32px] relative overflow-hidden">
                        <CheckCircle2 size={24} className="text-emerald-500 mb-4" />
                        <p className="text-[10px] font-black uppercase text-emerald-500/60">Concluídas</p>
                        <p className="text-3xl font-black">{orders.filter(o => o.status === OrderStatus.COMPLETED).length}</p>
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 blur-3xl rounded-full"></div>
                    </div>
                    <div className="glass p-5 rounded-[32px]">
                        <Clock size={24} className="text-amber-500 mb-4" />
                        <p className="text-[10px] font-black uppercase text-slate-500">Pendentes</p>
                        <p className="text-3xl font-black">{orders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.ASSIGNED).length}</p>
                    </div>
                </div>

                {/* Search Bar Premium */}
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar Ordem de Serviço..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all text-white"
                    />
                </div>

                {/* OS List */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 pl-1">Agenda de Hoje</h3>
                    {orders.length === 0 ? (
                        <div className="py-12 text-center text-slate-500">
                            <p className="text-sm">Nenhuma ordem encontrada hoje.</p>
                        </div>
                    ) : (
                        orders.map(order => (
                            <div
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className="os-card glass cursor-pointer flex items-center justify-between active:scale-[0.98] transition-transform"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${order.priority === OrderPriority.CRITICAL || order.priority === OrderPriority.HIGH ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                                        <LayoutDashboard size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm tracking-tight">{order.customerName}</h4>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">{order.operationType || 'Visita Técnica'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`status-pill ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                        {order.status}
                                    </div>
                                    <ChevronRight size={18} className="text-slate-600" />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Bottom Tab Bar Premium (Glass) */}
            <nav className="tab-bar glass m-4 rounded-[32px]">
                <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-emerald-500' : 'text-slate-500'}`}>
                    <LayoutDashboard size={20} />
                    <span className="text-[8px] font-black uppercase">Dashboard</span>
                </button>
                <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center gap-1 ${activeTab === 'orders' ? 'text-emerald-500' : 'text-slate-500'}`}>
                    <ListTodo size={20} />
                    <span className="text-[8px] font-black uppercase">Tarefas</span>
                </button>
                <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 ${activeTab === 'map' ? 'text-emerald-500' : 'text-slate-500'}`}>
                    <MapPin size={20} />
                    <span className="text-[8px] font-black uppercase">Rota</span>
                </button>
                <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-emerald-500' : 'text-slate-500'}`}>
                    <Settings size={20} />
                    <span className="text-[8px] font-black uppercase">Ajustes</span>
                </button>
            </nav>

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
