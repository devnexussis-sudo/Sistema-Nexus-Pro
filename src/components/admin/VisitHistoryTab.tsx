/**
 * 🗂️ VisitHistoryTab — Aba de Histórico de Visitas
 *
 * Design Principles:
 *   - Completamente desacoplada das outras abas do modal de OS
 *   - Lazy-loaded: só busca dados quando a aba está ativa (isActive=true)
 *   - Somente leitura — não altera estado externo
 *   - Timeline visual com cards expansíveis por visita
 *   - Acessível e responsivo
 */

import React, { useState, useEffect } from 'react';
import {
    Clock,
    CheckCircle2,
    AlertTriangle,
    PauseCircle,
    Navigation,
    ChevronDown,
    ChevronUp,
    User,
    History,
    Loader2,
    Calendar,
    Timer,
} from 'lucide-react';
import { VisitService } from '../../services/visitService';
import { ServiceVisit, VisitStatusEnum } from '../../types';

// ─── Config de Status ───────────────────────────────────────────

interface StatusConfig {
    label: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    icon: React.ReactNode;
}

const STATUS_CONFIG: Record<VisitStatusEnum, StatusConfig> = {
    [VisitStatusEnum.PENDING]: {
        label: 'Agendado',
        colorClass: 'text-slate-600',
        bgClass: 'bg-slate-50',
        borderClass: 'border-slate-200',
        icon: <Calendar size={13} />,
    },
    [VisitStatusEnum.ONGOING]: {
        label: 'Em Andamento',
        colorClass: 'text-blue-600',
        bgClass: 'bg-blue-50',
        borderClass: 'border-blue-200',
        icon: <Timer size={13} />,
    },
    [VisitStatusEnum.PAUSED]: {
        label: 'Pausado',
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-200',
        icon: <PauseCircle size={13} />,
    },
    [VisitStatusEnum.BLOCKED]: {
        label: 'Impedido',
        colorClass: 'text-rose-600',
        bgClass: 'bg-rose-50',
        borderClass: 'border-rose-200',
        icon: <AlertTriangle size={13} />,
    },
    [VisitStatusEnum.COMPLETED]: {
        label: 'Concluído',
        colorClass: 'text-emerald-600',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-200',
        icon: <CheckCircle2 size={13} />,
    },
};

const IMPEDIMENT_LABELS: Record<string, string> = {
    AWAITING_PART: 'Aguardando peça',
    ACCESS_DENIED: 'Acesso negado',
    WEATHER: 'Condições climáticas',
    TECHNICAL: 'Problema técnico',
    OTHER: 'Outro motivo',
};

// ─── Helpers ────────────────────────────────────────────────────

const formatTime = (iso?: string): string => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatDate = (iso?: string): string => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const calcDuration = (arrival?: string, departure?: string): string => {
    if (!arrival || !departure) return '—';
    const ms = new Date(departure).getTime() - new Date(arrival).getTime();
    if (ms < 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

// ─── Props ──────────────────────────────────────────────────────

interface VisitHistoryTabProps {
    orderId: string;
    isActive: boolean; // Controla lazy-load — só busca quando ativo
}

// ─── Componente Principal ────────────────────────────────────────

export const VisitHistoryTab: React.FC<VisitHistoryTabProps> = ({
    orderId,
    isActive,
}) => {
    const [visits, setVisits] = useState<ServiceVisit[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Lazy-load: busca somente quando a aba fica ativa
    useEffect(() => {
        if (!isActive || !orderId) return;
        let cancelled = false;

        setLoading(true);
        setError(null);

        VisitService.getVisitsByOrderId(orderId)
            .then((data) => { if (!cancelled) setVisits(data); })
            .catch(() => { if (!cancelled) setError('Não foi possível carregar o histórico.'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [isActive, orderId]);

    // ── Loading ────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="animate-spin text-primary-400" size={28} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Carregando Histórico...
                </span>
            </div>
        );
    }

    // ── Error ──────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                <AlertTriangle size={36} className="text-rose-300" />
                <p className="text-[11px] font-bold text-slate-500">{error}</p>
            </div>
        );
    }

    // ── Empty ──────────────────────────────────────────────────────
    if (visits.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                <History size={40} className="text-slate-200" />
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Sem visitas registradas
                </p>
                <p className="text-[10px] text-slate-300 font-medium">
                    As visitas técnicas aparecerão aqui conforme forem criadas.
                </p>
            </div>
        );
    }

    // ── Content ────────────────────────────────────────────────────
    return (
        <div className="p-4 space-y-2">
            {/* Resumo */}
            <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {visits.length} {visits.length === 1 ? 'visita registrada' : 'visitas registradas'}
                </span>
                <span className="text-[10px] font-bold text-slate-300">
                    Ordem cronológica
                </span>
            </div>

            {/* Timeline */}
            <div className="relative">
                {/* Linha vertical da timeline */}
                <div className="absolute left-[21px] top-4 bottom-4 w-px bg-gradient-to-b from-primary-200 via-slate-200 to-transparent" />

                {visits.map((visit, idx) => {
                    const cfg = STATUS_CONFIG[visit.status] ?? STATUS_CONFIG[VisitStatusEnum.PENDING];
                    const isExpanded = expandedId === visit.id;
                    const isLast = idx === visits.length - 1;

                    return (
                        <div key={visit.id} className="relative flex gap-3 pb-3">
                            {/* Indicador de nº da visita */}
                            <div
                                className={`
                  shrink-0 z-10 w-[42px] h-[42px] rounded-full flex items-center justify-center
                  border-2 shadow-sm transition-all
                  ${isLast
                                        ? 'border-primary-400 bg-primary-50 text-primary-700'
                                        : 'border-slate-200 bg-white text-slate-500'}
                `}
                            >
                                <span className="text-[11px] font-black">{visit.visitNumber}</span>
                            </div>

                            {/* Card */}
                            <div className={`
                flex-1 bg-white border rounded-2xl shadow-sm overflow-hidden transition-all
                ${cfg.borderClass}
              `}>
                                {/* Header do card */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : visit.id)}
                                    className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {/* Badge de status */}
                                        <span className={`
                      inline-flex items-center gap-1 px-2 py-1 rounded-lg
                      text-[9px] font-black uppercase tracking-wide shrink-0
                      ${cfg.colorClass} ${cfg.bgClass}
                    `}>
                                            {cfg.icon} {cfg.label}
                                        </span>

                                        {/* Infos */}
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black text-slate-700 truncate">
                                                Visita {visit.visitNumber}
                                                {visit.technicianName && (
                                                    <span className="font-normal text-slate-400"> · {visit.technicianName}</span>
                                                )}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">
                                                {formatDate(visit.scheduledDate || visit.createdAt)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-slate-300 shrink-0 ml-2">
                                        {isExpanded
                                            ? <ChevronUp size={16} />
                                            : <ChevronDown size={16} />
                                        }
                                    </div>
                                </button>

                                {/* Detalhes expandidos */}
                                {isExpanded && (
                                    <div className={`border-t px-4 py-4 space-y-3 ${cfg.bgClass} ${cfg.borderClass}`}>
                                        {/* Grade de horários */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <InfoCell label="Chegada" value={formatTime(visit.arrivalTime)} />
                                            <InfoCell label="Saída" value={formatTime(visit.departureTime)} />
                                            <InfoCell label="Duração" value={calcDuration(visit.arrivalTime, visit.departureTime)} />
                                        </div>

                                        {/* Técnico responsável */}
                                        {visit.technicianName && (
                                            <div className="flex items-center gap-2 p-2.5 bg-white/70 rounded-xl border border-white">
                                                <User size={14} className="text-slate-400 shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase">Técnico</p>
                                                    <p className="text-[11px] font-bold text-slate-700 truncate">{visit.technicianName}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Motivo de impedimento */}
                                        {(visit.impedimentReason || visit.pauseReason) && (
                                            <div className={`p-3 rounded-xl border ${visit.status === VisitStatusEnum.BLOCKED
                                                    ? 'bg-rose-50 border-rose-100'
                                                    : 'bg-amber-50 border-amber-100'
                                                }`}>
                                                <p className={`text-[9px] font-black uppercase mb-1 ${visit.status === VisitStatusEnum.BLOCKED ? 'text-rose-500' : 'text-amber-500'
                                                    }`}>
                                                    {visit.status === VisitStatusEnum.BLOCKED ? 'Motivo do Impedimento' : 'Motivo da Pausa'}
                                                </p>
                                                {visit.impedimentCategory && (
                                                    <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-md mb-1.5 ${visit.status === VisitStatusEnum.BLOCKED
                                                            ? 'bg-rose-100 text-rose-600'
                                                            : 'bg-amber-100 text-amber-600'
                                                        }`}>
                                                        {IMPEDIMENT_LABELS[visit.impedimentCategory] ?? visit.impedimentCategory}
                                                    </span>
                                                )}
                                                <p className="text-[11px] font-medium text-slate-700 leading-snug">
                                                    {visit.impedimentReason || visit.pauseReason}
                                                </p>
                                            </div>
                                        )}

                                        {/* Observações */}
                                        {visit.notes && (
                                            <div className="p-2.5 bg-white/70 rounded-xl border border-white">
                                                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Observações</p>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">{visit.notes}</p>
                                            </div>
                                        )}

                                        {/* Localização */}
                                        {visit.scheduledDate && (
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <Navigation size={12} />
                                                <span className="text-[9px] font-bold uppercase">
                                                    Agendado: {formatDate(visit.scheduledDate)}
                                                    {visit.scheduledTime && ` às ${visit.scheduledTime}`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Sub-componente auxiliar ─────────────────────────────────────

const InfoCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="text-center bg-white/70 rounded-xl p-2 border border-white">
        <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">{label}</p>
        <p className="text-[12px] font-black text-slate-700">{value}</p>
    </div>
);
