import React, { useState, useRef } from 'react';
import { useTech } from '../context/TechContext';
import {
    LayoutDashboard,
    ListTodo,
    Settings,
    Search,
    RefreshCw,
    LogOut,
    ChevronRight,
    Clock,
    CheckCircle2,
    MapPin,
    Camera,
    Trash2
} from 'lucide-react';
import { OrderDetailsV2 } from './OrderDetailsV2';
import { OrderStatus, OrderPriority, ServiceOrder } from '../../../../types';
import { DataService } from '../../../../services/dataService';

export const TechDashboardV2: React.FC = () => {
    const { auth, orders, isSyncing, refreshData, logout, updateOrderStatus, pagination, filters } = useTech();
    const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'settings'>('home');
    const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && auth.user) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                try {
                    // Upload REAL para o Supabase e atualização do cadastro
                    const publicUrl = await DataService.updateTechnicianAvatar(auth.user!.id, base64);

                    // Atualiza sessão local com a nova URL
                    const newAuth = { ...auth, user: { ...auth.user!, avatar: publicUrl } };
                    localStorage.setItem('nexus_tech_session_v2', JSON.stringify(newAuth.user));

                    // Recarrega para aplicar visualmente em todo o app
                    window.location.reload();
                } catch (err) {
                    console.error("Erro ao fazer upload da foto:", err);
                    alert("Falha ao atualizar foto. Verifique sua conexão.");
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleHardReset = () => {
        if (confirm("Isso limpará todos os dados locais e fará uma reconexão completa. Deseja continuar?")) {
            localStorage.clear();
            window.location.reload();
        }
    };

    if (!auth.user) return null;

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-500/30 flex flex-col">
            {/* Header Global Compacto */}
            <header className="fixed w-full top-0 z-50 px-6 py-4 flex justify-between items-center bg-[#0f172a] shadow-md shadow-indigo-900/10 rounded-b-[1.5rem]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl border border-indigo-500/30 overflow-hidden bg-slate-800 p-0.5">
                        <img className="w-full h-full rounded-lg object-cover" src={auth.user.avatar || `https://ui-avatars.com/api/?name=${auth.user.name}&background=6366f1&color=fff`} alt="Avatar" />
                    </div>
                    <div>
                        <p className="text-[9px] uppercase font-black text-indigo-400 tracking-widest mb-0.5">Olá,</p>
                        <h1 className="text-sm font-bold text-white tracking-tight leading-none">{auth.user.name.split(' ')[0]}</h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={refreshData} className="p-2.5 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all hover:bg-white/10 group">
                        <RefreshCw size={18} className={`text-indigo-400 group-hover:text-white transition-colors ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                    {activeTab === 'settings' && (
                        <button onClick={logout} className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 active:scale-95 transition-all hover:bg-red-500/20">
                            <LogOut size={18} />
                        </button>
                    )}
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 px-4 pt-[5.5rem] pb-28 animate-in overflow-y-auto w-full"> {/* PT ajustado para altura do header */}

                {/* ABA 1: HOME (LISTA DE OS) */}
                {activeTab === 'home' && (
                    <div className="space-y-4">
                        {/* Filters & Search sticky - Ajustado position e z-index */}
                        <div className="sticky top-0 z-40 bg-slate-50 pt-2 pb-2 space-y-2 -mx-4 px-4 shadow-sm border-b border-indigo-50/50 backdrop-blur-sm bg-slate-50/95">
                            {/* Datas Coloridas */}
                            <div className="flex gap-2">
                                <div className="flex-1 relative group">
                                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                        <span className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">DE</span>
                                    </div>
                                    <input
                                        type="date"
                                        className="w-full bg-white border-2 border-indigo-100 rounded-xl pl-9 pr-2 py-2.5 text-[10px] font-bold text-indigo-900 outline-none focus:border-indigo-500 uppercase shadow-sm transition-all"
                                        value={filters.startDate}
                                        onChange={(e) => refreshData({ newFilters: { startDate: e.target.value } })}
                                    />
                                </div>
                                <div className="flex-1 relative group">
                                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                        <span className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">ATÉ</span>
                                    </div>
                                    <input
                                        type="date"
                                        className="w-full bg-white border-2 border-indigo-100 rounded-xl pl-9 pr-2 py-2.5 text-[10px] font-bold text-indigo-900 outline-none focus:border-indigo-500 uppercase shadow-sm transition-all"
                                        value={filters.endDate}
                                        onChange={(e) => refreshData({ newFilters: { endDate: e.target.value } })}
                                    />
                                </div>
                            </div>

                            {/* Status Filter Scrollable Colorido */}
                            <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-hide">
                                {[
                                    { id: 'ALL', label: 'Todos', color: 'slate' },
                                    { id: OrderStatus.ASSIGNED, label: 'Pendentes', color: 'indigo' },
                                    { id: OrderStatus.IN_PROGRESS, label: 'Executando', color: 'amber' },
                                    { id: OrderStatus.COMPLETED, label: 'Concluídas', color: 'emerald' },
                                    { id: OrderStatus.BLOCKED, label: 'Impedidas', color: 'red' }
                                ].map((st) => {
                                    const isActive = filters.status === st.id;
                                    // Map color prop to tailwind classes dynamic check isnt great for purifier so explicit map:
                                    let activeClass = '';
                                    let inactiveClass = '';

                                    switch (st.color) {
                                        case 'indigo':
                                            activeClass = 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/30 transform scale-105';
                                            inactiveClass = 'bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50';
                                            break;
                                        case 'amber':
                                            activeClass = 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/30 transform scale-105';
                                            inactiveClass = 'bg-white border-amber-100 text-amber-600 hover:bg-amber-50';
                                            break;
                                        case 'emerald':
                                            activeClass = 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30 transform scale-105';
                                            inactiveClass = 'bg-white border-emerald-100 text-emerald-600 hover:bg-emerald-50';
                                            break;
                                        case 'red':
                                            activeClass = 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/30 transform scale-105';
                                            inactiveClass = 'bg-white border-red-100 text-red-600 hover:bg-red-50';
                                            break;
                                        default: // slate/all
                                            activeClass = 'bg-slate-800 border-slate-800 text-white shadow-lg shadow-slate-500/30 transform scale-105';
                                            inactiveClass = 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50';
                                    }

                                    return (
                                        <button
                                            key={st.id}
                                            onClick={() => refreshData({ newFilters: { status: st.id as any } })}
                                            className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm flex-shrink-0 ${isActive ? activeClass : inactiveClass
                                                }`}
                                        >
                                            {st.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Lista de Ordens Compacta - Padding Top seguro */}
                        <div className="space-y-4 pt-2 pb-4">
                            {orders.length === 0 ? (
                                <div className="py-12 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-[2rem]">
                                    <ListTodo size={32} className="mx-auto text-slate-300 mb-3" />
                                    <p className="text-xs font-bold opacity-60">Nenhuma ordem encontrada.</p>
                                    <button
                                        onClick={() => {
                                            const today = new Date().toISOString().split('T')[0];
                                            refreshData({ newFilters: { status: 'ALL', startDate: today, endDate: today } });
                                        }}
                                        className="mt-4 text-[10px] font-black uppercase text-indigo-500 hover:underline"
                                    >
                                        Limpar Filtros (Voltar para Hoje)
                                    </button>
                                </div>
                            ) : (
                                orders.map(order => (
                                    <div
                                        key={order.id}
                                        className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-100 relative overflow-hidden transition-all active:scale-[0.98] active:bg-slate-50 group"
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-500' :
                                            order.status === OrderStatus.IN_PROGRESS ? 'bg-amber-500' :
                                                order.priority === OrderPriority.CRITICAL ? 'bg-red-500' :
                                                    'bg-indigo-500'
                                            }`}></div>

                                        <div className="pl-3" onClick={() => setSelectedOrder(order)}>
                                            {/* Header do Card */}
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg w-fit mb-1">
                                                        #{order.id.slice(0, 6)}
                                                    </span>
                                                    <h4 className="font-bsold text-sm text-slate-900 leading-tight">
                                                        {order.customerName}
                                                    </h4>
                                                </div>
                                                <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-50 text-emerald-600' :
                                                    order.status === OrderStatus.IN_PROGRESS ? 'bg-amber-50 text-amber-600 animate-pulse' :
                                                        'bg-indigo-50 text-indigo-600'
                                                    }`}>
                                                    {order.status === OrderStatus.IN_PROGRESS ? 'Executando' :
                                                        order.status === OrderStatus.COMPLETED ? 'Concluída' : 'Pendente'}
                                                </div>
                                            </div>

                                            {/* Details */}
                                            <div className="space-y-1 mb-3">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <LayoutDashboard size={12} className="text-slate-400" />
                                                    <p className="text-xs font-semibold truncate max-w-[220px]">
                                                        {order.equipmentName || 'Equipamento genérico'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Clock size={12} className="text-slate-400" />
                                                    <p className="text-xs font-semibold">
                                                        {new Date(order.scheduledDate || order.createdAt).toLocaleDateString()} às {new Date(order.scheduledDate || order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Botão de GPS no Rodapé do Card */}
                                        <div className="pl-3 mt-2 pt-2 border-t border-slate-50 flex justify-between items-center">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (order.customerAddress) {
                                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress)}`, '_blank');
                                                    } else {
                                                        alert("Endereço não disponível.");
                                                    }
                                                }}
                                                className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-600 px-3 py-2 rounded-xl transition-colors"
                                            >
                                                <MapPin size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-wider">Ir para Local</span>
                                            </button>

                                            <button
                                                onClick={() => setSelectedOrder(order)}
                                                className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"
                                            >
                                                <ChevronRight size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Paginação */}
                        {pagination.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-4 pb-8">
                                <button
                                    disabled={pagination.page <= 1}
                                    onClick={() => refreshData({ page: pagination.page - 1 })}
                                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 disabled:opacity-50 active:scale-95 transition-all"
                                >
                                    Anterior
                                </button>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Página {pagination.page} de {pagination.totalPages}
                                </span>
                                <button
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => refreshData({ page: pagination.page + 1 })}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/30 disabled:opacity-50 active:scale-95 transition-all"
                                >
                                    Próxima
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ABA 2: DASHBOARD (KPIs) */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 text-center">
                            <h2 className="text-2xl font-black text-slate-900">{pagination.total}</h2>
                            <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Total Encontrado</p>
                            <p className="text-[9px] text-slate-300 mt-1">Baseado nos filtros atuais</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => refreshData({ newFilters: { status: OrderStatus.COMPLETED } })}
                                className="p-5 rounded-[2rem] bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden text-left active:scale-95 transition-all"
                            >
                                <CheckCircle2 size={28} className="mb-3 opacity-80" />
                                <h3 className="text-lg font-black mb-1">Concluídas</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Filtrar</p>
                                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white opacity-10 rounded-full blur-xl" />
                            </button>

                            <button
                                onClick={() => refreshData({ newFilters: { status: OrderStatus.ASSIGNED } })}
                                className="p-5 rounded-[2rem] bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 relative overflow-hidden text-left active:scale-95 transition-all"
                            >
                                <Clock size={28} className="mb-3 opacity-80" />
                                <h3 className="text-lg font-black mb-1">Pendentes</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Filtrar</p>
                                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white opacity-10 rounded-full blur-xl" />
                            </button>

                            <button
                                onClick={() => refreshData({ newFilters: { status: OrderStatus.IN_PROGRESS } })}
                                className="p-5 rounded-[2rem] bg-amber-500 text-white shadow-lg shadow-amber-500/20 relative overflow-hidden text-left active:scale-95 transition-all"
                            >
                                <ListTodo size={28} className="mb-3 opacity-80" />
                                <h3 className="text-lg font-black mb-1">Executando</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Filtrar</p>
                                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white opacity-10 rounded-full blur-xl" />
                            </button>

                            <button
                                onClick={() => refreshData({ newFilters: { status: OrderStatus.BLOCKED } })}
                                className="p-5 rounded-[2rem] bg-red-500 text-white shadow-lg shadow-red-500/20 relative overflow-hidden text-left active:scale-95 transition-all"
                            >
                                <MapPin size={28} className="mb-3 opacity-80" />
                                <h3 className="text-lg font-black mb-1">Impedidas</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Filtrar</p>
                                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white opacity-10 rounded-full blur-xl" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ABA 3: SETTINGS (CONFIGURAÇÕES) */}
                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        {/* Avatar Change */}
                        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center">
                            <div className="relative mb-4 group">
                                <div className="w-24 h-24 rounded-full border-4 border-slate-50 overflow-hidden shadow-lg">
                                    <img className="w-full h-full object-cover" src={auth.user.avatar || `https://ui-avatars.com/api/?name=${auth.user.name}&background=6366f1&color=fff`} alt="Avatar" />
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-xl shadow-lg active:scale-90 transition-all border-2 border-white"
                                >
                                    <Camera size={16} />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handlePhotoUpload}
                                    accept="image/*"
                                    className="hidden"
                                />
                            </div>
                            <h2 className="text-lg font-black text-slate-800">{auth.user.name}</h2>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{auth.user.role}</p>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                            <button
                                onClick={handleHardReset}
                                className="w-full bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                    <RefreshCw size={20} />
                                </div>
                                <div className="text-left">
                                    <h4 className="font-bold text-slate-800 text-sm">Resetar App & Cache</h4>
                                    <p className="text-[10px] text-slate-400">Corrige bugs de conexão e atualiza</p>
                                </div>
                            </button>

                            <button
                                onClick={logout}
                                className="w-full bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center group-hover:bg-slate-800 group-hover:text-white transition-colors">
                                    <LogOut size={20} />
                                </div>
                                <div className="text-left">
                                    <h4 className="font-bold text-slate-800 text-sm">Sair da Conta</h4>
                                    <p className="text-[10px] text-slate-400">Desconectar deste dispositivo</p>
                                </div>
                            </button>
                        </div>

                        <div className="text-center pt-8 opacity-40">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Nexus Tech v2.5</p>
                        </div>
                    </div>
                )}

            </main>

            {/* NAVBAR COMPACTA - BAIXA E 3 BOTÕES */}
            {!selectedOrder && (
                <nav className="fixed bottom-0 left-0 right-0 bg-[#0f172a] rounded-t-[1.5rem] px-8 py-3 pb-6 flex justify-between items-center z-40 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.2)]">

                    <button
                        onClick={() => setActiveTab('home')}
                        className={`group flex flex-col items-center gap-1 transition-all ${activeTab === 'home' ? 'text-white scale-105' : 'text-slate-500 active:scale-95'}`}
                    >
                        <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'home' ? 'bg-indigo-500/20' : ''}`}>
                            <ListTodo size={20} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === 'home' ? 'opacity-100' : 'opacity-60'}`}>Início</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`group flex flex-col items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'text-white scale-105' : 'text-slate-500 active:scale-95'}`}
                    >
                        <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-500/20' : ''}`}>
                            <LayoutDashboard size={20} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === 'dashboard' ? 'opacity-100' : 'opacity-60'}`}>Painel</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`group flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-white scale-105' : 'text-slate-500 active:scale-95'}`}
                    >
                        <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-indigo-500/20' : ''}`}>
                            <Settings size={20} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeTab === 'settings' ? 'opacity-100' : 'opacity-60'}`}>Config</span>
                    </button>

                </nav>
            )}

            {/* ORDER DETAILS MODAL */}
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
