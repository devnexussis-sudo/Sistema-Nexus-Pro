import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Activity, TrendingUp, User } from 'lucide-react';
import { DataService } from '../../services/dataService';

interface TechMovementReport {
    technician_id: string;
    technician_name: string;
    technician_avatar: string;
    total_pings: number;
    first_ping: string;
    last_ping: string;
    hours_active: number;
    locations_visited: number;
}

export const TechnicianMovementReport: React.FC = () => {
    const [report, setReport] = useState<TechMovementReport[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadReport();
    }, [selectedDate]);

    const loadReport = async () => {
        setLoading(true);
        try {
            const tenantId = DataService.getCurrentTenantId();
            if (!tenantId) return;

            const { data, error } = await DataService.getServiceClient()
                .rpc('get_daily_tech_movement_report', {
                    p_tenant_id: tenantId,
                    p_date: selectedDate
                });

            if (error) throw error;
            setReport(data || []);
        } catch (error) {
            console.error('[Movement Report] Erro:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return '--:--';
        return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const totalPings = report.reduce((sum, t) => sum + t.total_pings, 0);
    const avgHours = report.length > 0
        ? (report.reduce((sum, t) => sum + t.hours_active, 0) / report.length).toFixed(1)
        : '0';

    return (
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-xl">
                        <Activity size={20} className="text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 uppercase italic tracking-tight">
                            Relatório de Movimentação
                        </h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">
                            Histórico diário de localização dos técnicos
                        </p>
                    </div>
                </div>

                {/* Date Selector */}
                <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-slate-400" />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p className="text-xs font-black text-emerald-600 uppercase mb-1">Técnicos Ativos</p>
                    <p className="text-2xl font-black text-emerald-900">{report.length}</p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <p className="text-xs font-black text-indigo-600 uppercase mb-1">Total de Pings</p>
                    <p className="text-2xl font-black text-indigo-900">{totalPings}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <p className="text-xs font-black text-purple-600 uppercase mb-1">Média de Horas</p>
                    <p className="text-2xl font-black text-purple-900">{avgHours}h</p>
                </div>
            </div>

            {/* Report Table */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-r-transparent"></div>
                    <p className="mt-2 text-sm text-slate-500 font-bold">Carregando relatório...</p>
                </div>
            ) : report.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl">
                    <MapPin size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase">
                        Nenhuma movimentação registrada neste dia
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-3 px-4 text-xs font-black text-slate-500 uppercase tracking-wider">
                                    Técnico
                                </th>
                                <th className="text-center py-3 px-4 text-xs font-black text-slate-500 uppercase tracking-wider">
                                    Pings
                                </th>
                                <th className="text-center py-3 px-4 text-xs font-black text-slate-500 uppercase tracking-wider">
                                    Primeiro Ping
                                </th>
                                <th className="text-center py-3 px-4 text-xs font-black text-slate-500 uppercase tracking-wider">
                                    Último Ping
                                </th>
                                <th className="text-center py-3 px-4 text-xs font-black text-slate-500 uppercase tracking-wider">
                                    Horas Ativas
                                </th>
                                <th className="text-center py-3 px-4 text-xs font-black text-slate-500 uppercase tracking-wider">
                                    Locais Visitados
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.map((tech) => (
                                <tr key={tech.technician_id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={tech.technician_avatar}
                                                alt={tech.technician_name}
                                                className="w-8 h-8 rounded-lg object-cover"
                                            />
                                            <span className="text-sm font-black text-slate-900 uppercase">
                                                {tech.technician_name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="text-center py-3 px-4">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-black">
                                            <TrendingUp size={12} />
                                            {tech.total_pings}
                                        </span>
                                    </td>
                                    <td className="text-center py-3 px-4">
                                        <span className="text-xs font-bold text-slate-600">
                                            {formatTime(tech.first_ping)}
                                        </span>
                                    </td>
                                    <td className="text-center py-3 px-4">
                                        <span className="text-xs font-bold text-slate-600">
                                            {formatTime(tech.last_ping)}
                                        </span>
                                    </td>
                                    <td className="text-center py-3 px-4">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black">
                                            <Clock size={12} />
                                            {tech.hours_active.toFixed(1)}h
                                        </span>
                                    </td>
                                    <td className="text-center py-3 px-4">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-black">
                                            <MapPin size={12} />
                                            {tech.locations_visited}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
