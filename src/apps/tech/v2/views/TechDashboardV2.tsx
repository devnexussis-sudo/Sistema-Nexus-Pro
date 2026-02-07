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
    Trash2,
    Calendar
} from 'lucide-react';
import { OrderDetailsV2 } from './OrderDetailsV2';
import { OrderStatus, OrderPriority, ServiceOrder } from '../../../../types';
import { DataService } from '../../../../services/dataService';

export const TechDashboardV2: React.FC = () => {
    const { auth, orders, isSyncing, refreshData, logout, updateOrderStatus, pagination, filters } = useTech();
    const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'settings'>('home');
    const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 🔄 Sync Selected Order with Context
    React.useEffect(() => {
        if (selectedOrder) {
            const freshOrder = orders.find(o => o.id === selectedOrder.id);
            if (freshOrder) {
                const statusOrder = [OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED, OrderStatus.BLOCKED];
                const currentIdx = statusOrder.indexOf(selectedOrder.status as any);
                const freshIdx = statusOrder.indexOf(freshOrder.status as any);

                if (freshIdx > currentIdx || (freshOrder.notes !== selectedOrder.notes && freshIdx >= currentIdx)) {
                    setSelectedOrder(freshOrder);
                }
            }
        }
    }, [orders]);

    // Compressão de Imagem
    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const scaleSize = MAX_WIDTH / img.width;
                    const width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
                    const height = (img.width > MAX_WIDTH) ? img.height * scaleSize : img.height;

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    resolve(dataUrl);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && auth.user) {
            try {
                const compressedBase64 = await compressImage(file);
                const publicUrl = await DataService.updateTechnicianAvatar(auth.user!.id, compressedBase64);
                const newAuth = { ...auth, user: { ...auth.user!, avatar: publicUrl } };
                localStorage.setItem('nexus_tech_session_v2', JSON.stringify(newAuth.user));
                window.location.reload();
            } catch (err) {
                console.error("Erro ao processar/enviar foto:", err);
                alert("Falha ao atualizar foto. Tente uma imagem menor.");
            }
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
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
            {/* Header Clean Big Tech */}
            <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border border-slate-200 overflow-hidden bg-slate-100">
                        <img
                            className="w-full h-full object-cover"
                            src={auth.user.avatar || `https://ui-avatars.com/api/?name=${auth.user.name}&background=f1f5f9&color=64748b`}
                            alt="Avatar"
                        />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-900 leading-tight">Olá, {auth.user.name.split(' ')[0]}</h1>
                        <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                            Online
                        </p>
                    </div>
                </div>
                <button
                    onClick={refreshData}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 active:scale-95 transition-all hover:bg-slate-100"
                >
                    <RefreshCw size={16} className={`${isSyncing ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
            </header>

            {/* MAIN CONTENT */}
            <main className="px-4 py-4 max-w-lg mx-auto w-full">

                {/* ABA 1: HOME (LISTA DE OS) */}
                {activeTab === 'home' && (
                    <div className="space-y-4">
                        {/* Filtros de Data Compactos */}
                        <div className="flex gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex-1 relative">
                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Calendar size={14} />
                                </div>
                                <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-primary-500 transition-colors"
                                    value={filters.startDate}
                                    onChange={(e) => refreshData({ newFilters: { startDate: e.target.value } })}
                                />
                            </div>
                            <div className="w-px bg-slate-100 mx-1"></div>
                            <div className="flex-1 relative">
                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Calendar size={14} />
                                </div>
                                <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-primary-500 transition-colors"
                                    value={filters.endDate}
                                    onChange={(e) => refreshData({ newFilters: { endDate: e.target.value } })}
                                />
                            </div>
                        </div>

                        {/* Status Filter Scrollable Clean */}
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                            {[
                                { id: 'ALL', label: 'Tudo' },
                                { id: OrderStatus.ASSIGNED, label: 'Pendentes' },
                                { id: OrderStatus.IN_PROGRESS, label: 'Executando' },
                                { id: OrderStatus.COMPLETED, label: 'Concluídas' },
                                { id: OrderStatus.BLOCKED, label: 'Impedidas' }
                            ].map((st) => {
                                const isActive = filters.status === st.id;
                                return (
                                    <button
                                        key={st.id}
                                        onClick={() => refreshData({ newFilters: { status: st.id as any } })}
                                        className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0 border ${isActive
                                            ? 'bg-primary-500 border-primary-500 text-white shadow-none'
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        {st.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Lista de Ordens Refinada */}
                        <div className="space-y-3">
                            {orders.length === 0 ? (
                                <div className="py-16 text-center">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <ListTodo size={24} className="text-slate-400" />
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-700">Nada por aqui</h3>
                                    <p className="text-xs text-slate-400 mt-1">Nenhuma ordem encontrada para os filtros.</p>
                                    <button
                                        onClick={() => {
                                            const today = new Date().toISOString().split('T')[0];
                                            refreshData({ newFilters: { status: 'ALL', startDate: today, endDate: today } });
                                        }}
                                        className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                    >
                                        Limpar Filtros
                                    </button>
                                </div>
                            ) : (
                                orders.map(order => (
                                    <div
                                        key={order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className="bg-white rounded-lg shadow-none border border-slate-200 overflow-hidden active:scale-[0.99] transition-transform"
                                    >
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-bold text-slate-400">#{order.id.slice(0, 6)}</span>
                                                        {order.priority === OrderPriority.CRITICAL && (
                                                            <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[9px] font-bold rounded-md uppercase">Crítico</span>
                                                        )}
                                                    </div>
                                                    <h3 className="font-bold text-sm text-slate-900 leading-tight line-clamp-1">
                                                        {order.customerName}
                                                    </h3>
                                                </div>
                                                <div className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide ${order.status === OrderStatus.COMPLETED ? 'bg-emerald-50 text-emerald-600' :
                                                    order.status === OrderStatus.IN_PROGRESS ? 'bg-amber-50 text-amber-600' :
                                                        order.status === OrderStatus.BLOCKED ? 'bg-red-50 text-red-600' :
                                                            'bg-slate-100 text-slate-600'
                                                    }`}>
                                                    {order.status === OrderStatus.IN_PROGRESS ? 'Executando' :
                                                        order.status === OrderStatus.COMPLETED ? 'Concluída' :
                                                            order.status === OrderStatus.BLOCKED ? 'Impedida' : 'Pendente'}
                                                </div>
                                            </div>

                                            <div className="space-y-1.5 mb-3">
                                                <div className="flex items-start gap-2 text-slate-500">
                                                    <LayoutDashboard size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                                    <p className="text-xs font-medium leading-tight text-slate-600 line-clamp-1">
                                                        {order.equipmentName || 'Equipamento genérico'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Clock size={13} className="text-slate-400 flex-shrink-0" />
                                                    <p className="text-xs font-medium text-slate-600">
                                                        {new Date(order.scheduledDate || order.createdAt).toLocaleDateString()} • {new Date(order.scheduledDate || order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                                {order.customerAddress && (
                                                    <div className="flex items-start gap-2 text-slate-500">
                                                        <MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                                        <p className="text-xs font-medium text-slate-600 line-clamp-1">
                                                            {order.customerAddress}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (order.customerAddress) {
                                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress)}`, '_blank');
                                                    } else {
                                                        alert("Endereço não disponível.");
                                                    }
                                                }}
                                                className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5 hover:underline"
                                            >
                                                <MapPin size={14} />
                                                Abrir Mapa
                                            </button>
                                            <span className="text-slate-300">
                                                <ChevronRight size={16} />
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Paginação Clean */}
                        {pagination.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-4 pb-20">
                                <button
                                    disabled={pagination.page <= 1}
                                    onClick={() => refreshData({ page: pagination.page - 1 })}
                                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 disabled:opacity-50 active:scale-95 transition-all shadow-sm"
                                >
                                    Anterior
                                </button>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    {pagination.page} / {pagination.totalPages}
                                </span>
                                <button
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => refreshData({ page: pagination.page + 1 })}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-md shadow-slate-900/10 disabled:opacity-50 active:scale-95 transition-all"
                                >
                                    Próxima
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ABA 2: DASHBOARD (KPIs) */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col items-center text-center">
                                <span className="text-3xl font-bold text-slate-900 tracking-tight">{pagination.total}</span>
                                <span className="text-[10px] uppercase font-bold text-slate-400 mt-1">Total OS</span>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col items-center text-center">
                                <span className="text-3xl font-bold text-indigo-600 tracking-tight">
                                    {orders.filter(o => o.status === OrderStatus.COMPLETED).length}
                                </span>
                                <span className="text-[10px] uppercase font-bold text-slate-400 mt-1">Concluídas (Hoje)</span>
                            </div>
                        </div>

                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1 mt-6 mb-2">Filtros Rápidos</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => refreshData({ newFilters: { status: OrderStatus.COMPLETED } })}
                                className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-left active:scale-95 transition-all"
                            >
                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                                    <CheckCircle2 size={16} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800">Concluídas</h3>
                                <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Ver apenas finalizadas</p>
                            </button>

                            <button
                                onClick={() => refreshData({ newFilters: { status: OrderStatus.ASSIGNED } })}
                                className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-left active:scale-95 transition-all"
                            >
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2">
                                    <Clock size={16} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800">Pendentes</h3>
                                <p className="text-[10px] text-indigo-600 font-medium mt-0.5">Aguardando início</p>
                            </button>

                            <button
                                onClick={() => refreshData({ newFilters: { status: OrderStatus.IN_PROGRESS } })}
                                className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-left active:scale-95 transition-all"
                            >
                                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
                                    <ListTodo size={16} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800">Executando</h3>
                                <p className="text-[10px] text-amber-600 font-medium mt-0.5">Em andamento</p>
                            </button>
                        </div>
                    </div>
                )}

                {/* ABA 3: SETTINGS (CONFIGURAÇÕES) */}
                {activeTab === 'settings' && (
                    <div className="space-y-4 pt-2">
                        {/* Avatar Change */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
                            <div className="relative group flex-shrink-0">
                                <div className="w-16 h-16 rounded-full border border-slate-100 overflow-hidden shadow-sm bg-slate-50">
                                    <img className="w-full h-full object-cover" src={auth.user.avatar || `https://ui-avatars.com/api/?name=${auth.user.name}&background=f1f5f9&color=64748b`} alt="Avatar" />
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute bottom-0 right-0 p-1.5 bg-slate-900 text-white rounded-full shadow-md active:scale-90 transition-all border border-white"
                                >
                                    <Camera size={12} />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handlePhotoUpload}
                                    accept="image/*"
                                    className="hidden"
                                />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900">{auth.user.name}</h2>
                                <p className="text-xs text-slate-500 font-medium">{auth.user.email}</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                            <button
                                onClick={handleHardReset}
                                className="w-full bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3 active:scale-[0.98] transition-all hover:bg-slate-50"
                            >
                                <RefreshCw size={18} className="text-slate-400" />
                                <span className="text-sm font-semibold text-slate-700">Resetar App & Cache</span>
                            </button>

                            <button
                                onClick={logout}
                                className="w-full bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3 active:scale-[0.98] transition-all hover:bg-red-50 group"
                            >
                                <LogOut size={18} className="text-red-400 group-hover:text-red-500" />
                                <span className="text-sm font-semibold text-red-600 transition-colors">Sair da Conta</span>
                            </button>
                        </div>

                        <div className="text-center pt-8 opacity-30">
                            <p className="text-[10px] font-bold uppercase tracking-widest">Nexus Tech v2.7.0 (Big Tech Edition)</p>
                        </div>
                    </div>
                )}

            </main>

            {/* NAVBAR COMPACTA - BAIXA E 3 BOTÕES */}
            {!selectedOrder && (
                <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-2 pb-6 flex justify-around items-center z-40 max-w-lg mx-auto">
                    <button
                        onClick={() => setActiveTab('home')}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${activeTab === 'home' ? 'text-primary-500 bg-primary-50' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <ListTodo size={22} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
                        <span className="text-[10px] font-bold">Início</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${activeTab === 'dashboard' ? 'text-primary-500 bg-primary-50' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <LayoutDashboard size={22} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
                        <span className="text-[10px] font-bold">Painel</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${activeTab === 'settings' ? 'text-primary-500 bg-primary-50' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Settings size={22} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
                        <span className="text-[10px] font-bold">Config</span>
                    </button>
                </nav>
            )}

            {/* ORDER DETAILS MODAL */}
            {selectedOrder && (
                <OrderDetailsV2
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onUpdateStatus={async (status, notes, formData) => {
                        // 🚀 ULTRA OPTIMISTIC UPDATE
                        const updatedOrder = {
                            ...selectedOrder,
                            status,
                            notes: notes || selectedOrder.notes,
                            formData: { ...selectedOrder.formData, ...formData },
                            signature: formData?.signature || selectedOrder.signature,
                            signatureName: formData?.signatureName || selectedOrder.signatureName,
                            signatureDoc: formData?.signatureDoc || selectedOrder.signatureDoc
                        };

                        setSelectedOrder(updatedOrder);

                        updateOrderStatus(selectedOrder.id, status, notes, formData).catch(err => {
                            console.error("[Tech-V2] Background Sync Failed:", err);
                        });

                        return Promise.resolve();
                    }}
                />
            )}
        </div>
    );
};
