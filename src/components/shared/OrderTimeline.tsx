import React, { useEffect, useState } from 'react';
import { OrderTimelineEvent } from '../../../types';
import { OrderService } from '../../../services/orderService';
import { Clock, Play, Pause, CheckCircle2, AlertCircle, Edit3, CalendarCheck, MessageSquare } from 'lucide-react';

interface OrderTimelineProps {
    orderId: string;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ orderId }) => {
    const [events, setEvents] = useState<OrderTimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orderId) return;
        const loadTimeline = async () => {
            setLoading(true);
            try {
                const data = await OrderService.getOrderTimeline(orderId);
                setEvents(data);
            } catch (error) {
                console.error('Failed to load timeline:', error);
            } finally {
                setLoading(false);
            }
        };
        loadTimeline();
    }, [orderId]);

    if (loading) {
        return (
            <div className="flex justify-center p-8 animate-pulse text-slate-400">
                <Clock className="w-6 h-6 animate-spin mr-2" />
                <span className="text-sm font-medium">Carregando cronologia...</span>
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="text-center p-8 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-500">Nenhum evento registrado nesta OS ainda.</p>
            </div>
        );
    }

    const getIcon = (type: string) => {
        if (type === 'ORDER_CREATED') return <CheckCircle2 size={16} className="text-emerald-500" />;
        if (type.startsWith('VISIT_ONGOING')) return <Play size={16} className="text-blue-500" />;
        if (type.startsWith('VISIT_PAUSED')) return <Pause size={16} className="text-amber-500" />;
        if (type.startsWith('VISIT_COMPLETED')) return <CheckCircle2 size={16} className="text-emerald-500" />;
        if (type === 'STATUS_CHANGED') return <Edit3 size={16} className="text-[#1c2d4f]" />;
        return <AlertCircle size={16} className="text-slate-400" />;
    };

    const getLabel = (type: string, details: any) => {
        if (type === 'ORDER_CREATED') return `OS Criada (${details.status})`;
        if (type === 'VISIT_PENDING') return `Visita Agendada`;
        if (type === 'VISIT_ONGOING') return `Visita em Andamento`;
        if (type === 'VISIT_PAUSED') return `Visita Pausada`;
        if (type === 'VISIT_COMPLETED') return `Visita Concluída`;
        if (type === 'STATUS_CHANGED') return `Status Alterado para ${details.new_status}`;
        return type;
    };

    return (
        <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3">Linha do Tempo (Big Tech Audit)</h3>

            <div className="relative border-l-2 border-slate-100 ml-4 space-y-8 pb-4">
                {events.map((event, index) => (
                    <div key={event.eventId || index} className="relative pl-6 animate-in fade-in slide-in-from-bottom-2">
                        {/* Bullet Marker */}
                        <div className="absolute -left-[11px] top-1 w-5 h-5 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center">
                            {getIcon(event.eventType)}
                        </div>

                        {/* Content */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-800">
                                        {getLabel(event.eventType, event.details)}
                                    </h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                                        Por: {event.userName || 'Sistema'}
                                    </p>
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                                    {new Date(event.eventDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                            </div>

                            {/* Detalhes Específicos do Evento */}
                            {event.eventType === 'VISIT_PAUSED' && event.details.pause_reason && (
                                <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg font-medium flex gap-2">
                                    <AlertCircle size={14} className="shrink-0" />
                                    <span>Motivo: {event.details.pause_reason}</span>
                                </div>
                            )}

                            {event.eventType === 'STATUS_CHANGED' && (
                                <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-2">
                                    De: <span className="font-bold text-slate-400 line-through">{event.details.old_status}</span>
                                    Para: <span className="font-bold text-[#1c2d4f]">{event.details.new_status}</span>
                                </div>
                            )}

                            {event.details.notes && (
                                <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg font-medium flex gap-2">
                                    <MessageSquare size={14} className="text-slate-400 shrink-0" />
                                    <span>{event.details.notes}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
