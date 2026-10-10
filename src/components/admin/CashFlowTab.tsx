import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { FinancialService } from '../../services/financialService';
import { getCurrentTenantId } from '../../lib/tenantContext';
import { ArrowDownRight, ArrowUpRight, Calendar, DollarSign, Loader2, TrendingUp, Filter, RefreshCcw, X, Wallet, ArrowRight, FileSpreadsheet, Printer } from 'lucide-react';
import { CashFlowEntry } from '../../types';
import { Pagination } from '../ui/Pagination';
import { exportToExcelWithStyle, printFinancialReport } from '../../utils/financialExportUtils';
import { FloatingBatchBar } from './FloatingBatchBar';

interface CashFlowTabProps {
    tenantId: string;
    receivables: any[]; // Itens de recebimento unificados (orders, quotes) já calculados no FinancialDashboard
}

export const CashFlowTab: React.FC<CashFlowTabProps> = ({ tenantId, receivables }) => {
    const { t } = useI18n();
    const { showAlert } = useDialog();
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    });

    const [isLoading, setIsLoading] = useState(true);
    const [cashFlow, setCashFlow] = useState<CashFlowEntry[]>([]);
    const [payables, setPayables] = useState<any[]>([]);
    const [pendingInstallments, setPendingInstallments] = useState<any[]>([]);
    const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
    const [showFilters, setShowFilters] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
    const ITEMS_PER_PAGE = 10;

    const cleanDateStr = (rawDate?: string) => {
        if (!rawDate) return '';
        return String(rawDate).split('T')[0].split(' ')[0].trim();
    };

    const fetchData = async () => {
        const activeTenantId = tenantId || getCurrentTenantId();
        if (!activeTenantId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        let isDone = false;

        // Failsafe timeout to prevent infinite spinner
        setTimeout(() => {
            if (!isDone) {
                console.warn("CashFlow fetchData timeout! Forcing spinner to stop.");
                setIsLoading(false);
            }
        }, 15000);

        try {
            // Buscamos um range mais amplo para calcular saldo atual acumulado (ex: últimos 2 anos)
            const dStart = new Date();
            dStart.setFullYear(dStart.getFullYear() - 2);
            
            const [cfData, payablesData, instRes, invRes] = await Promise.all([
                FinancialService.getCashFlow({ start: dStart.toISOString().split('T')[0], end: endDate }).catch(e => { console.error("CF Error", e); return []; }),
                FinancialService.getAccountsPayable({ start: startDate, end: endDate, status: 'ALL' }).catch(e => { console.error("AP Error", e); return []; }),
                supabase.from('invoice_installments').select('id, invoice_id, due_date, status, amount, value').eq('tenant_id', activeTenantId).neq('status', 'PAID').neq('status', 'CANCELED').limit(200).then(res => res).catch(e => ({ data: [], error: e })),
                supabase.from('invoices').select('id, due_date, created_at, status, gateway_status, total_amount, discount_amount, shipping_amount, other_additions_amount').eq('tenant_id', activeTenantId).neq('status', 'PAID').neq('status', 'CANCELED').limit(200).then(res => res).catch(e => ({ data: [], error: e }))
            ]);

            setCashFlow(cfData || []);
            setPayables(payablesData || []);
            setPendingInstallments(instRes.data || []);
            setPendingInvoices(invRes.data || []);
        } catch (error) {
            console.error("Erro ao carregar dados de fluxo de caixa", error);
        } finally {
            isDone = true;
            setIsLoading(false);
        }
    };

    // Disparar busca de dados ao montar o componente ou quando alterar tenant / datas
    useEffect(() => {
        fetchData();
    }, [tenantId, startDate, endDate]);

    // Reset página e seleção ao mudar o período de datas
    useEffect(() => {
        setCurrentPage(1);
        setSelectedEntryIds([]);
    }, [startDate, endDate]);

    const filteredEntries = useMemo(() => {
        return cashFlow.filter(entry => {
            const entryDate = cleanDateStr(entry.entryDate);
            return (!startDate || entryDate >= startDate) && (!endDate || entryDate <= endDate);
        }).sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());
    }, [cashFlow, startDate, endDate]);

    const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);

    const paginatedEntries = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredEntries, currentPage]);

    const toggleSelectAll = () => {
        if (paginatedEntries.length === 0) return;
        const pageIds = paginatedEntries.map(e => e.id);
        const allSelected = pageIds.every(id => selectedEntryIds.includes(id));
        if (allSelected) {
            setSelectedEntryIds(prev => prev.filter(id => !pageIds.includes(id)));
        } else {
            setSelectedEntryIds(prev => Array.from(new Set([...prev, ...pageIds])));
        }
    };

    const toggleSelectEntry = (id: string) => {
        setSelectedEntryIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const totalSelectedAmount = useMemo(() => {
        return filteredEntries
            .filter(e => selectedEntryIds.includes(e.id))
            .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    }, [filteredEntries, selectedEntryIds]);

    // 1. Cálculo de Saldo Atual (Todo o histórico até a data final selecionada)
    const saldoAtual = useMemo(() => {
        return cashFlow.reduce((acc, entry) => {
            if (entry.type === 'INCOME') return acc + Number(entry.amount);
            if (entry.type === 'EXPENSE') return acc - Number(entry.amount);
            return acc;
        }, 0);
    }, [cashFlow]);

    // 2. Cálculo de Entradas Previstas no Período (Parcelas de Faturas + Faturas Pendentes + Recebíveis não Faturados)
    const entradasPrevistas = useMemo(() => {
        let total = 0;

        // A) Parcelas de faturas pendentes a vencer no período
        const instInvoiceIds = new Set<string>();
        pendingInstallments.forEach(inst => {
            instInvoiceIds.add(inst.invoice_id);
            const instDate = cleanDateStr(inst.due_date);
            const inRange = (!startDate || instDate >= startDate) && (!endDate || instDate <= endDate);
            const isPending = inst.status !== 'PAID' && inst.status !== 'CANCELED' && inst.status !== 'RECEIVED' && inst.status !== 'CONFIRMED' && inst.status !== 'approved';
            if (isPending && inRange) {
                total += Number(inst.amount || inst.value || 0);
            }
        });

        // B) Faturas integrais pendentes (sem parcelas) a vencer no período
        pendingInvoices.forEach(inv => {
            if (!instInvoiceIds.has(inv.id)) {
                const invDate = cleanDateStr(inv.due_date || inv.created_at);
                const inRange = (!startDate || invDate >= startDate) && (!endDate || invDate <= endDate);
                const isPending = inv.status !== 'PAID' && inv.status !== 'CANCELED' && inv.gateway_status !== 'approved';
                if (isPending && inRange) {
                    const val = Number(inv.total_amount - (inv.discount_amount || 0) + (inv.shipping_amount || 0) + (inv.other_additions_amount || 0));
                    total += Math.max(0, val);
                }
            }
        });

        // C) Recebíveis diretos (OS/Orçamentos não faturados) pendentes
        receivables.forEach(item => {
            const isPending = item.status !== 'PAID';
            const itemDate = cleanDateStr(item.dueDate || item.date);
            const inRange = (!startDate || itemDate >= startDate) && (!endDate || itemDate <= endDate);
            if (isPending && inRange) {
                total += Number(item.value || 0);
            }
        });

        return total;
    }, [pendingInstallments, pendingInvoices, receivables, startDate, endDate]);

    // 3. Cálculo de Saídas Previstas no Período (Contas a Pagar pendentes)
    const saidasPrevistas = useMemo(() => {
        return payables.filter(item => {
            const isPending = item.status === 'PENDING' || item.status === 'OVERDUE';
            const itemDate = cleanDateStr(item.dueDate);
            const inRange = (!startDate || itemDate >= startDate) && (!endDate || itemDate <= endDate);
            return isPending && inRange;
        }).reduce((acc, curr) => acc + Number(curr.amount), 0);
    }, [payables, startDate, endDate]);

    // 4. Saldo Projetado
    const saldoProjetado = saldoAtual + entradasPrevistas - saidasPrevistas;

    // 5. Agrupamento para Gráfico Diário (Entradas vs Saídas no período selecionado)
    const dailyData = useMemo(() => {
        const daysMap: Record<string, { income: number, expense: number, dateStr: string }> = {};
        
        if (!startDate || !endDate) return [];
        
        const start = new Date(startDate + 'T12:00:00');
        const end = new Date(endDate + 'T12:00:00');
        
        // Inicializar dias no mapa
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const iso = d.toISOString().split('T')[0];
            daysMap[iso] = { income: 0, expense: 0, dateStr: iso };
        }

        // Adicionar Entradas Realizadas (Cash Flow)
        cashFlow.forEach(c => {
            const dateStr = cleanDateStr(c.entryDate);
            if (daysMap[dateStr]) {
                if (c.type === 'INCOME') daysMap[dateStr].income += Number(c.amount);
                if (c.type === 'EXPENSE') daysMap[dateStr].expense += Number(c.amount);
            }
        });

        // Adicionar Parcelas de Faturas Previstas
        const instInvoiceIds = new Set<string>();
        pendingInstallments.forEach(inst => {
            instInvoiceIds.add(inst.invoice_id);
            const isPending = inst.status !== 'PAID' && inst.status !== 'CANCELED' && inst.status !== 'RECEIVED' && inst.status !== 'CONFIRMED' && inst.status !== 'approved';
            if (isPending) {
                const dateStr = cleanDateStr(inst.due_date);
                if (daysMap[dateStr]) {
                    daysMap[dateStr].income += Number(inst.amount || inst.value || 0);
                }
            }
        });

        // Adicionar Faturas Integrais Previstas
        pendingInvoices.forEach(inv => {
            if (!instInvoiceIds.has(inv.id)) {
                const isPending = inv.status !== 'PAID' && inv.status !== 'CANCELED' && inv.gateway_status !== 'approved';
                if (isPending) {
                    const dateStr = cleanDateStr(inv.due_date || inv.created_at);
                    if (daysMap[dateStr]) {
                        const val = Number(inv.total_amount - (inv.discount_amount || 0) + (inv.shipping_amount || 0) + (inv.other_additions_amount || 0));
                        daysMap[dateStr].income += Math.max(0, val);
                    }
                }
            }
        });

        // Adicionar Recebíveis diretos (OS/Orçamentos não faturados)
        receivables.forEach(r => {
            if (r.status !== 'PAID') {
                const dateStr = cleanDateStr(r.dueDate || r.date);
                if (daysMap[dateStr]) daysMap[dateStr].income += Number(r.value);
            }
        });

        // Adicionar Saídas Previstas (Payables)
        payables.forEach(p => {
            if (p.status === 'PENDING' || p.status === 'OVERDUE') {
                const dateStr = cleanDateStr(p.dueDate);
                if (daysMap[dateStr]) daysMap[dateStr].expense += Number(p.amount);
            }
        });

        return Object.values(daysMap).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    }, [cashFlow, pendingInstallments, pendingInvoices, receivables, payables, startDate, endDate]);

    const maxVolume = useMemo(() => {
        let max = 0;
        dailyData.forEach(d => {
            if (d.income > max) max = d.income;
            if (d.expense > max) max = d.expense;
        });
        return max || 1; // evitar divisão por zero
    }, [dailyData]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDateShort = (iso: string) => {
        const parts = iso.split('-');
        if (parts.length < 3) return iso;
        return `${parts[2]}/${parts[1]}`;
    };

    const handleExportExcel = () => {
        if (selectedEntryIds.length === 0) {
            showAlert('Selecione ao menos um lançamento para exportar.', 'warning');
            return;
        }

        const entriesToExport = filteredEntries.filter(e => selectedEntryIds.includes(e.id));
        if (entriesToExport.length === 0) {
            showAlert('Nenhum lançamento selecionado para exportar.', 'warning');
            return;
        }

        const headers = [
            'Data',
            'Descrição',
            'Categoria',
            'Tipo',
            'Valor (R$)'
        ];

        const rows = entriesToExport.map(e => [
            e.entryDate ? new Date(e.entryDate + (e.entryDate.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—',
            e.description || 'Lançamento',
            e.category || 'Geral',
            e.type === 'INCOME' ? 'Entrada' : 'Saída',
            e.type === 'INCOME' ? Number(e.amount) : -Number(e.amount)
        ]);

        const colWidths = [
            { wch: 15 },
            { wch: 35 },
            { wch: 20 },
            { wch: 15 },
            { wch: 18 }
        ];

        exportToExcelWithStyle({
            filename: `Nexus_Giro_de_Caixa_${startDate}_a_${endDate}`,
            sheetName: 'Giro de Caixa',
            headers,
            rows,
            colWidths
        });
    };

    const handlePrintPdf = () => {
        if (selectedEntryIds.length === 0) {
            showAlert('Selecione ao menos um lançamento para imprimir.', 'warning');
            return;
        }

        const entriesToPrint = filteredEntries.filter(e => selectedEntryIds.includes(e.id));
        if (entriesToPrint.length === 0) {
            showAlert('Nenhum lançamento selecionado para imprimir.', 'warning');
            return;
        }

        const headers = [
            'Data',
            'Descrição',
            'Categoria',
            'Tipo',
            'Valor'
        ];

        const rows = entriesToPrint.map(e => [
            e.entryDate ? new Date(e.entryDate + (e.entryDate.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—',
            e.description || 'Lançamento',
            e.category || 'Geral',
            e.type === 'INCOME' ? 'ENTRADA' : 'SAÍDA',
            formatCurrency(Number(e.amount))
        ]);

        const totalIncome = entriesToPrint.filter(e => e.type === 'INCOME').reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
        const totalExpense = entriesToPrint.filter(e => e.type === 'EXPENSE').reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
        const netTotal = totalIncome - totalExpense;

        const formatDtBR = (dt: string) => {
            if (!dt) return '—';
            const parts = dt.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dt;
        };

        const userStored = localStorage.getItem('nexus_user');
        let userName = 'Administrador';
        try { if (userStored) userName = JSON.parse(userStored)?.name || userName; } catch {}

        printFinancialReport({
            title: 'Relatório de Giro de Caixa',
            subtitle: `Período: ${formatDtBR(startDate)} a ${formatDtBR(endDate)} • ${entriesToPrint.length} lançamentos selecionados`,
            headers,
            rows,
            colAlignments: ['center', 'left', 'left', 'center', 'right'],
            summaryCards: [
                { label: 'Qtd. Selecionados', value: String(entriesToPrint.length), color: '#0f172a' },
                { label: 'Total Entradas', value: formatCurrency(totalIncome), color: '#059669' },
                { label: 'Total Saídas', value: formatCurrency(totalExpense), color: '#e11d48' },
                { label: 'Saldo Selecionado', value: formatCurrency(netTotal), color: netTotal >= 0 ? '#4338ca' : '#e11d48' },
            ],
            userName
        });
    };

    return (
        <div className="space-y-4 pb-8 animate-in fade-in duration-300">
            {/* Top Toolbar */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
                    <div className="shrink-0">
                        <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <Wallet className="text-indigo-600" size={20} /> Giro de Caixa
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Acompanhamento e projeção financeira</p>
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 w-full lg:w-auto">
                        {/* Start Date */}
                        <div className="relative flex items-center bg-white border border-slate-200 rounded-lg shadow-sm h-9 px-2.5 min-w-[140px] flex-1 sm:flex-none">
                            <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full"
                            />
                        </div>
                        <span className="text-slate-300"><ArrowRight size={14} /></span>
                        {/* End Date */}
                        <div className="relative flex items-center bg-white border border-slate-200 rounded-lg shadow-sm h-9 px-2.5 min-w-[140px] flex-1 sm:flex-none">
                            <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full"
                            />
                        </div>

                        {selectedEntryIds.length > 0 && (
                            <>
                                <button
                                    onClick={handleExportExcel}
                                    disabled={isLoading}
                                    className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-emerald-700 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 animate-in fade-in"
                                    title={`Exportar ${selectedEntryIds.length} lançamentos selecionados para Excel`}
                                >
                                    <FileSpreadsheet size={14} className="text-emerald-600" />
                                    <span className="hidden sm:inline">Excel ({selectedEntryIds.length})</span>
                                </button>

                                <button
                                    onClick={handlePrintPdf}
                                    disabled={isLoading}
                                    className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#1c2d4f] rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 animate-in fade-in"
                                    title={`Imprimir ${selectedEntryIds.length} lançamentos selecionados em PDF`}
                                >
                                    <Printer size={14} className="text-[#1c2d4f]" />
                                    <span className="hidden sm:inline">PDF ({selectedEntryIds.length})</span>
                                </button>
                            </>
                        )}

                        <button
                            onClick={fetchData}
                            disabled={isLoading}
                            className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            title="Atualizar Dados"
                        >
                            <RefreshCcw size={14} className={isLoading ? 'animate-spin text-primary-600' : ''} />
                            <span className="hidden sm:inline">Atualizar</span>
                        </button>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center p-20 bg-white rounded-xl border border-slate-200">
                    <Loader2 className="animate-spin text-indigo-500 mb-4" size={32} />
                    <p className="text-sm text-slate-500 font-medium">Calculando projeções financeiras...</p>
                </div>
            ) : (
                <>
                    {/* Resumo Financeiro (Cards) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Saldo Atual */}
                        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col justify-between group hover:-translate-y-0.5 transition-transform duration-300">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Saldo Realizado</p>
                                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:scale-110 transition-transform"><DollarSign size={14} /></div>
                            </div>
                            <h3 className="text-lg font-black text-slate-800">{formatCurrency(saldoAtual)}</h3>
                            <p className="text-[9px] text-slate-400 font-medium mt-1">Acumulado até hoje</p>
                        </div>

                        {/* Entradas Previstas */}
                        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col justify-between group hover:-translate-y-0.5 transition-transform duration-300">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Entradas Previstas</p>
                                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg group-hover:scale-110 transition-transform"><ArrowUpRight size={14} /></div>
                            </div>
                            <h3 className="text-lg font-black text-emerald-600">{formatCurrency(entradasPrevistas)}</h3>
                            <p className="text-[9px] text-slate-400 font-medium mt-1">A receber no período</p>
                        </div>

                        {/* Saídas Previstas */}
                        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col justify-between group hover:-translate-y-0.5 transition-transform duration-300">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Saídas Previstas</p>
                                <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg group-hover:scale-110 transition-transform"><ArrowDownRight size={14} /></div>
                            </div>
                            <h3 className="text-lg font-black text-rose-600">{formatCurrency(saidasPrevistas)}</h3>
                            <p className="text-[9px] text-slate-400 font-medium mt-1">A pagar no período</p>
                        </div>

                        {/* Saldo Projetado */}
                        <div className={`rounded-xl p-3 shadow-sm flex flex-col justify-between group hover:-translate-y-0.5 transition-transform duration-300 border overflow-hidden relative ${saldoProjetado >= 0 ? 'bg-gradient-to-br from-indigo-600 to-[#1c2d4f] border-indigo-900/50 text-white' : 'bg-gradient-to-br from-rose-600 to-rose-900 border-rose-900/50 text-white'}`}>
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Saldo Projetado</p>
                                <div className="p-1.5 bg-white/10 text-white rounded-lg group-hover:scale-110 transition-transform border border-white/10"><TrendingUp size={14} /></div>
                            </div>
                            <h3 className="text-lg font-black relative z-10 drop-shadow-md">{formatCurrency(saldoProjetado)}</h3>
                            <p className="text-[9px] text-white/70 font-medium mt-1 relative z-10">Projeção no fim do período</p>
                            
                            <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />
                        </div>
                    </div>

                    {/* Gráfico de Evolução */}
                    <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col shadow-sm relative overflow-hidden mt-3">
                        <div className="flex items-center justify-between mb-2 relative z-10">
                            <div>
                                <h3 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                                    <TrendingUp className="text-indigo-500" size={14} /> Projeção Diária
                                </h3>
                                <p className="text-[9px] text-slate-500 font-medium mt-0.5">Entradas vs Saídas no período selecionado</p>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
                                    <span className="text-[9px] font-bold text-slate-600 uppercase">Entradas</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 shadow-xs" />
                                    <span className="text-[9px] font-bold text-slate-600 uppercase">Saídas</span>
                                </div>
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="w-full overflow-x-auto custom-scrollbar pb-1">
                            <div className="flex items-end justify-start gap-1 sm:gap-1.5 h-[80px] min-w-max px-2 border-b border-slate-200 relative z-10 mt-auto">
                                {dailyData.length === 0 ? (
                                    <div className="w-full flex items-center justify-center text-slate-400 text-xs font-medium h-full">Nenhum dado financeiro no período</div>
                                ) : (
                                    dailyData.map(d => {
                                        const incomeH = maxVolume > 0 ? (d.income / maxVolume) * 100 : 0;
                                        const expenseH = maxVolume > 0 ? (d.expense / maxVolume) * 100 : 0;
                                        const hasActivity = d.income > 0 || d.expense > 0;
                                        
                                        return (
                                            <div key={d.dateStr} className="flex flex-col items-center justify-end h-full group relative w-7 sm:w-9">
                                                {/* Tooltip */}
                                                {hasActivity && (
                                                    <div className="absolute bottom-[calc(100%+6px)] px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-sm text-white text-[9px] font-bold rounded-lg opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all shadow-xl z-30 pointer-events-none origin-bottom border border-slate-700 whitespace-nowrap">
                                                        <p className="text-slate-400 mb-0.5 border-b border-slate-700 pb-0.5">{d.dateStr.split('-').reverse().join('/')}</p>
                                                        <p className="text-emerald-400">Entradas: {formatCurrency(d.income)}</p>
                                                        <p className="text-rose-400">Saídas: {formatCurrency(d.expense)}</p>
                                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/95 rotate-45 border-r border-b border-slate-700"></div>
                                                    </div>
                                                )}

                                                {/* Bars */}
                                                <div className="w-full relative flex items-end justify-center h-full gap-0.5">
                                                    {/* Income Bar */}
                                                    <div 
                                                        className="w-full max-w-[14px] rounded-t-xs transition-all duration-300 ease-out group-hover:brightness-110 relative overflow-hidden"
                                                        style={{
                                                            height: d.income > 0 ? `${Math.max(incomeH, 3)}%` : '0%',
                                                            background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                                                            opacity: d.income > 0 ? 1 : 0
                                                        }}
                                                    />
                                                    {/* Expense Bar */}
                                                    <div 
                                                        className="w-full max-w-[14px] rounded-t-xs transition-all duration-300 ease-out group-hover:brightness-110 relative overflow-hidden"
                                                        style={{
                                                            height: d.expense > 0 ? `${Math.max(expenseH, 3)}%` : '0%',
                                                            background: 'linear-gradient(180deg, #f43f5e 0%, #e11d48 100%)',
                                                            opacity: d.expense > 0 ? 1 : 0
                                                        }}
                                                    />
                                                </div>
                                                {/* X Axis Label */}
                                                <div className="mt-1 text-[8.5px] font-bold text-slate-400 tracking-tighter w-full text-center truncate">
                                                    {formatDateShort(d.dateStr)}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabela de Lançamentos do Período */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col shadow-sm mt-4">
                        <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5 mb-4">
                            <Wallet className="text-indigo-500" size={16} /> Entradas e Saídas do Período
                        </h3>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                    <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        <th className="py-2.5 px-3 w-10 text-center">
                                            <input
                                                type="checkbox"
                                                checked={paginatedEntries.length > 0 && paginatedEntries.every(e => selectedEntryIds.includes(e.id))}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                title="Selecionar todos da página"
                                            />
                                        </th>
                                        <th className="py-2.5 px-3">Data</th>
                                        <th className="py-2.5 px-3">Descrição</th>
                                        <th className="py-2.5 px-3">Categoria</th>
                                        <th className="py-2.5 px-3 text-right">Valor</th>
                                        <th className="py-2.5 px-3 text-center">Tipo</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedEntries.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                                                Nenhum registro encontrado para o período.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedEntries.map(entry => (
                                            <tr 
                                                key={entry.id} 
                                                onClick={() => toggleSelectEntry(entry.id)}
                                                className={`transition-colors cursor-pointer ${selectedEntryIds.includes(entry.id) ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-slate-50/50'}`}
                                            >
                                                <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedEntryIds.includes(entry.id)}
                                                        onChange={() => toggleSelectEntry(entry.id)}
                                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-3 text-xs text-slate-600 font-medium">
                                                    {formatDateShort(entry.entryDate.split('T')[0])}
                                                </td>
                                                <td className="py-2.5 px-3 text-xs text-slate-800 font-medium max-w-[200px] truncate" title={entry.description}>
                                                    {entry.description}
                                                </td>
                                                <td className="py-2.5 px-3 text-xs text-slate-500">
                                                    {entry.category}
                                                </td>
                                                <td className={`py-2.5 px-3 text-xs font-bold text-right ${entry.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {entry.type === 'INCOME' ? '+' : '-'}{formatCurrency(Number(entry.amount))}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${entry.type === 'INCOME' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                        {entry.type === 'INCOME' ? 'ENTRADA' : 'SAÍDA'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginação padrão */}
                        {totalPages > 1 && (
                            <div className="mt-4 border-t border-slate-100 shrink-0">
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    totalItems={filteredEntries.length}
                                    itemsPerPage={ITEMS_PER_PAGE}
                                    onPageChange={setCurrentPage}
                                />
                            </div>
                        )}
                    </div>
                </>
            )}

            {selectedEntryIds.length > 0 && (
                <FloatingBatchBar
                    count={selectedEntryIds.length}
                    totalAmount={totalSelectedAmount}
                    onExportExcel={handleExportExcel}
                    onPrintPdf={handlePrintPdf}
                    onClearSelection={() => setSelectedEntryIds([])}
                />
            )}
        </div>
    );
};
