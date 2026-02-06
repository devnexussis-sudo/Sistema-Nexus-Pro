
import React, { useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, OrderPriority } from '../../../../types';
import {
    X,
    MapPin,
    Calendar,
    Clock,
    ChevronRight,
    Camera,
    PenTool,
    CheckCircle2,
    AlertCircle,
    Play,
    Pause,
    CheckScreen,
    Navigation,
    Info
} from 'lucide-react';

interface OrderDetailsV2Props {
    order: ServiceOrder;
    onClose: () => void;
    onUpdateStatus: (status: OrderStatus) => Promise<void>;
}

export const OrderDetailsV2: React.FC<OrderDetailsV2Props> = ({ order, onClose, onUpdateStatus }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<'info' | 'checklist' | 'photos'>('info');

    const handleStatusChange = async (newStatus: OrderStatus) => {
        setIsLoading(true);
        try {
            await onUpdateStatus(newStatus);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-[#05070a] flex flex-col animate-in">
            {/* Header Premium */}
            <div className="glass px-6 pt-12 pb-6 flex justify-between items-center sticky top-0 z-10">
                <button onClick={onClose} className="p-2 rounded-2xl bg-white/5 border border-white/10 active:scale-90 transition-all">
                    <X size={20} className="text-slate-400" />
                </button>
                <div className="text-center">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Ordem de Serviço</p>
                    <h2 className="text-sm font-bold text-white tracking-tight">#{order.id.slice(0, 8)}</h2>
                </div>
                <div className={`status-pill ${order.priority === OrderPriority.CRITICAL || order.priority === OrderPriority.HIGH ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {order.priority}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 pb-32">
                {/* Status Hero */}
                <div className="glass-emerald p-6 rounded-[32px] flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-emerald-500/60 mb-1">Status Atual</p>
                        <h3 className="text-xl font-black text-white">{order.status}</h3>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                        <Info size={24} />
                    </div>
                </div>

                {/* Section Selector */}
                <div className="flex gap-2 p-1.5 glass rounded-2xl">
                    <button
                        onClick={() => setActiveSection('info')}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${activeSection === 'info' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                        Informações
                    </button>
                    <button
                        onClick={() => setActiveSection('checklist')}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${activeSection === 'checklist' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                        Checklist
                    </button>
                    <button
                        onClick={() => setActiveSection('photos')}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${activeSection === 'photos' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                        Evidências
                    </button>
                </div>

                {activeSection === 'info' && (
                    <div className="space-y-6 animate-in">
                        {/* Client Info */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest pl-1">Cliente & Local</h4>
                            <div className="glass p-6 rounded-[32px] space-y-4">
                                <div>
                                    <p className="text-lg font-black text-white">{order.customerName}</p>
                                    <p className="text-xs text-slate-400 mt-1">{order.customerAddress}</p>
                                </div>
                                <button className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center gap-3 text-emerald-400 font-bold text-sm active:scale-95 transition-all">
                                    <Navigation size={18} />
                                    Abrir no Mapa
                                </button>
                            </div>
                        </div>

                        {/* Equipment Info */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest pl-1">Ativo / Equipamento</h4>
                            <div className="glass p-6 rounded-[32px] space-y-2">
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-slate-500 font-bold uppercase">Modelo</p>
                                    <p className="text-sm font-bold text-white">{order.equipmentName || 'Não especificado'}</p>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-slate-500 font-bold uppercase">Série</p>
                                    <p className="text-sm font-bold text-slate-300">{order.equipmentSerial || '---'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Service Description */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest pl-1">Descrição do Serviço</h4>
                            <div className="glass p-6 rounded-[32px]">
                                <p className="text-sm text-slate-300 leading-relaxed italic">
                                    "{order.description || 'Nenhuma descrição detalhada fornecida.'}"
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'checklist' && (
                    <div className="space-y-6 animate-in">
                        <div className="py-12 text-center glass rounded-[32px] border-dashed border-white/10">
                            <CheckCircle2 size={40} className="mx-auto text-slate-700 mb-4" />
                            <p className="text-slate-500 text-sm font-bold">Checklist ainda não carregado.</p>
                            <p className="text-xs text-slate-600 mt-1 uppercase font-black">Em desenvolvimento</p>
                        </div>
                    </div>
                )}

                {activeSection === 'photos' && (
                    <div className="space-y-6 animate-in">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="aspect-square glass rounded-[32px] flex flex-col items-center justify-center border-dashed border-white/10 active:scale-95 transition-all">
                                <Camera size={32} className="text-emerald-500/50 mb-2" />
                                <p className="text-[10px] font-black uppercase text-emerald-500/50">Foto Antes</p>
                            </div>
                            <div className="aspect-square glass rounded-[32px] flex flex-col items-center justify-center border-dashed border-white/10 active:scale-95 transition-all">
                                <Camera size={32} className="text-emerald-500/50 mb-2" />
                                <p className="text-[10px] font-black uppercase text-emerald-500/50">Foto Depois</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Actions Premium */}
            <div className="glass px-6 pt-4 pb-8 fixed bottom-0 left-0 right-0 z-20 flex gap-3">
                {order.status === OrderStatus.PENDING || order.status === OrderStatus.ASSIGNED ? (
                    <button
                        onClick={() => handleStatusChange(OrderStatus.IN_PROGRESS)}
                        className="flex-[2] py-4 bg-emerald-500 rounded-2xl text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Play size={18} fill="currentColor" />
                        Iniciar Atendimento
                    </button>
                ) : order.status === OrderStatus.IN_PROGRESS ? (
                    <button
                        onClick={() => handleStatusChange(OrderStatus.COMPLETED)}
                        className="flex-[2] py-4 bg-emerald-500 rounded-2xl text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={18} />
                        Concluir Serviço
                    </button>
                ) : (
                    <button
                        disabled
                        className="flex-[2] py-4 bg-slate-800 rounded-2xl text-slate-500 font-black uppercase text-sm tracking-widest opacity-50 flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={18} />
                        Serviço Finalizado
                    </button>
                )}

                <button className="flex-1 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2">
                    <AlertCircle size={16} />
                    Impedir
                </button>
            </div>
        </div>
    );
};
