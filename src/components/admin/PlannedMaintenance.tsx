
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { safeCreatePortal } from '../../utils/portal';
import { useI18n } from '../../i18n';
import { ServiceOrder, User, OrderStatus, OrderPriority, Customer, Equipment, Contract } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge, PriorityBadge } from '../ui/StatusBadge';
import {
    FileText, CheckCircle2, Search, Calendar, Users,
    Box, Plus, X, ArrowRight, Check, Briefcase, ChevronRight,
    BellRing, Settings2, ArrowLeft, Bell, Clock, Edit3, ShieldAlert, Eye, Loader2,
    History, User as UserIcon, ListFilter, Activity, MessageSquare, AlertTriangle, ArrowUpRight,
    DollarSign, FileSignature, Layers, Filter, Save, Printer,
    Hexagon, MapPin, Phone, Globe, CalendarClock
} from 'lucide-react';
import { DataService } from '../../services/dataService';
import { FinancialService } from '../../services/financialService';
import { supabase } from '../../lib/supabase';
import { Pagination } from '../ui/Pagination';

interface AuditLog {
    timestamp: string;
    user: string;
    action: string;
    details: string;
    reason: string;
}

interface ContractsManagementProps {
    orders: any[];
    techs: User[];
    customers: Customer[];
    equipments: Equipment[];
    user: User | null;
    onUpdateOrders: () => Promise<void>;
    onEditOrder: (contract: any) => Promise<void>;
    onCreateOrder: (contract: any) => Promise<void>;
}

export const PlannedMaintenance: React.FC<ContractsManagementProps> = ({
    orders, techs, customers, equipments, user, onUpdateOrders, onEditOrder, onCreateOrder
}) => {
    const { t } = useI18n();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [modalTab, setModalTab] = useState<'technical' | 'commercial' | 'monitoring'>('technical');
    const [selectedContract, setSelectedContract] = useState<any | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewTab, setViewTab] = useState<'details' | 'history' | 'terms'>('details');

    const [pendingAction, setPendingAction] = useState<'CREATE' | 'EDIT' | 'TOGGLE'>('CREATE');
    const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);

    // States
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [selectedEquipIds, setSelectedEquipIds] = useState<string[]>([]);
    const [contractTitle, setContractTitle] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [periodicity, setPeriodicity] = useState('Mensal');
    const [maintenanceDay, setMaintenanceDay] = useState<number>(1);
    const [showFilters, setShowFilters] = useState(false);
    const [changeReason, setChangeReason] = useState('');

    // New Step 2 States
    const [contractValue, setContractValue] = useState<string>('0,00');
    const [includesParts, setIncludesParts] = useState(false);
    const [visitCount, setVisitCount] = useState<number>(1);
    const [contractTerms, setContractTerms] = useState('');

    // Auto-Billing States
    const [generateBilling, setGenerateBilling] = useState(false);
    const [billingDurationMonths, setBillingDurationMonths] = useState<number>(12);

    const [enableAlerts, setEnableAlerts] = useState(true);
    const [alertDaysBefore, setAlertDaysBefore] = useState(5);
    const [alertFrequency, setAlertFrequency] = useState(2);

    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
    const [isAlreadyBilled, setIsAlreadyBilled] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [tenant, setTenant] = useState<any>(null);
    const ITEMS_PER_PAGE = 12;

    useEffect(() => {
        const loadTenant = async () => {
            try {
                const data = await DataService.getTenantById();
                setTenant(data);
            } catch (err) {
                console.error("Erro ao carregar dados da empresa:", err);
            }
        };
        loadTenant();
    }, []);

    // Mascara de Moeda
    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, '');
        const formatted = (Number(value) / 100).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
        });
        setContractValue(formatted);
    };

    const parsedValue = useMemo(() => {
        return parseFloat(contractValue.replace(/\./g, '').replace(',', '.'));
    }, [contractValue]);

    const pmocCode = useMemo(() => {
        if (selectedContract?.pmocCode) return selectedContract.pmocCode;
        const customer = customers.find(c => c.name === selectedCustomerId);
        if (!customer?.document) return 'PMOC-00000000';
        const cnpjPrefix = customer.document.replace(/\D/g, '').substring(0, 4);
        const day = new Date().getDate().toString().padStart(2, '0');
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        return `PMOC-${cnpjPrefix}${day}${month}`;
    }, [selectedCustomerId, customers, selectedContract]);

    useEffect(() => {
        const checkBilling = async () => {
            if (pendingAction === 'EDIT' && selectedContract && pmocCode) {
                try {
                    const { data } = await supabase
                        .from('quotes')
                        .select('id')
                        .like('display_id', `${pmocCode}-%`)
                        .limit(1);
                    setIsAlreadyBilled(!!(data && data.length > 0));
                } catch {
                    setIsAlreadyBilled(false);
                }
            } else {
                setIsAlreadyBilled(false);
            }
        };
        checkBilling();
    }, [pendingAction, selectedContract, pmocCode]);

    const customerEquipments = useMemo(() => {
        const target = customers.find(c => c.name === selectedCustomerId || c.name === selectedContract?.customerName);
        return target ? equipments.filter(e => e.customerId === target.id || e.customerName === target.name) : [];
    }, [selectedCustomerId, customers, equipments, selectedContract]);

    const handleOpenEdit = (contract: any) => {
        setSelectedContract(contract);
        setSelectedCustomerId(contract.customerName);
        setCustomerSearch(contract.customerName);
        setSelectedEquipIds(contract.equipmentIds || []);
        setContractTitle(contract.title.replace('CONTRATO Master: ', ''));
        setStartDate(contract.scheduledDate);
        setPeriodicity(contract.periodicity || 'Mensal');
        setMaintenanceDay(contract.maintenanceDay || 1);

        // New Fields
        setContractValue(contract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00');
        setIncludesParts(contract.includesParts || false);
        setVisitCount(contract.visitCount || 1);
        setContractTerms(contract.contractTerms || '');

        setEnableAlerts(contract.alertSettings?.enabled ?? true);
        setAlertDaysBefore(contract.alertSettings?.daysBefore || 5);
        setAlertFrequency(contract.alertSettings?.frequency || 2);
        setChangeReason('');
        setModalTab('technical');
        setPendingAction('EDIT');
        setIsModalOpen(true);
    };

    const initToggleStatus = (contract: any) => {
        setSelectedContract(contract);
        setPendingAction('TOGGLE');
        setPendingStatus(contract.status === OrderStatus.CANCELED ? OrderStatus.PENDING : OrderStatus.CANCELED);
        setChangeReason('');
        setIsAuditModalOpen(true);
    };

    const handleConfirmAction = async () => {
        if (isSubmitting || !changeReason) return;

        try {
            setIsSubmitting(true);
            const now = new Date().toISOString();
            const currentLogs: AuditLog[] = selectedContract ? selectedContract.logs || [] : [];
            let newLogs: AuditLog[] = [];

            if (pendingAction === 'CREATE') {
                newLogs.push({ timestamp: now, user: user?.name || 'Sistema', action: 'CONTRATO_CRIADO', details: `Registro ${pmocCode} ativado. Valor: R$ ${contractValue}`, reason: changeReason });
            }
            else if (pendingAction === 'EDIT' && selectedContract) {
                newLogs.push({ timestamp: now, user: user?.name || 'Sistema', action: 'CONTRATO_ATUALIZADO', details: `Revisão comercial e técnica aplicada.`, reason: changeReason });
            }
            else if (pendingAction === 'TOGGLE' && selectedContract) {
                newLogs.push({ timestamp: now, user: user?.name || 'Sistema', action: pendingStatus === OrderStatus.CANCELED ? 'CONTRATO_INATIVADO' : 'CONTRATO_REATIVADO', details: `Ciclo alterado para ${pendingStatus}`, reason: changeReason });
            }

            const updatedLogs = [...currentLogs, ...newLogs];
            const customer = customers.find(c => c.name === (selectedContract?.customerName || selectedCustomerId));

            const finalPayload = {
                pmocCode: pmocCode,
                title: `CONTRATO Master: ${contractTitle || selectedContract?.title.replace('CONTRATO Master: ', '')}`,
                description: `Gestão PMOC: ${selectedEquipIds.length || selectedContract?.equipmentIds.length} ativos.`,
                customerName: customer?.name || selectedContract?.customerName || '',
                customerAddress: customer?.address || selectedContract?.customerAddress || '',
                status: pendingAction === 'TOGGLE' ? pendingStatus! : (selectedContract?.status || OrderStatus.PENDING),
                priority: OrderPriority.MEDIUM,
                scheduledDate: startDate || selectedContract?.scheduledDate,
                operationType: 'Manutenção Preventiva',
                periodicity: periodicity,
                maintenanceDay: maintenanceDay,
                equipmentIds: selectedEquipIds.length > 0 ? selectedEquipIds : selectedContract?.equipmentIds || [],
                logs: updatedLogs,
                alertSettings: { enabled: enableAlerts, daysBefore: alertDaysBefore, frequency: alertFrequency },
                contractValue: parsedValue,
                includesParts: includesParts,
                visitCount: visitCount,
                contractTerms: contractTerms
            };

            if (pendingAction === 'CREATE' || pendingAction === 'EDIT') {
                if (!finalPayload.equipmentIds || finalPayload.equipmentIds.length === 0) {
                    throw new Error('Selecione pelo menos um equipamento para este contrato.');
                }
            }

            if (pendingAction === 'CREATE') {
                await onCreateOrder(finalPayload);

                // ── Auto-Billing: gerar mensalidades no financeiro ──
                if (generateBilling && parsedValue > 0) {
                    try {
                        const periodicityMonths: Record<string, number> = {
                            'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12
                        };
                        const intervalMonths = periodicityMonths[periodicity] || 1;
                        const totalInstallments = Math.floor(billingDurationMonths / intervalMonths);

                        for (let i = 0; i < totalInstallments; i++) {
                            const dueDate = new Date(startDate + 'T12:00:00');
                            dueDate.setMonth(dueDate.getMonth() + (i * intervalMonths));
                            // Ajustar dia de vencimento ao maintenanceDay
                            dueDate.setDate(Math.min(maintenanceDay, new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate()));

                            await DataService.createQuote({
                                displayId: `${pmocCode}-${i + 1}/${totalInstallments}`,
                                customerName: finalPayload.customerName,
                                customerAddress: finalPayload.customerAddress,
                                title: `Mensalidade ${i + 1}/${totalInstallments} — Contrato ${pmocCode}`,
                                description: `Faturamento automático de contrato (PMOC) - Vencimento original: ${dueDate.toLocaleDateString('pt-BR')}`,
                                items: [{
                                    id: crypto.randomUUID(),
                                    description: `Mensalidade ${i + 1}/${totalInstallments} - Contrato ${pmocCode}`,
                                    quantity: 1,
                                    unitPrice: parsedValue,
                                    total: parsedValue
                                }],
                                totalValue: parsedValue,
                                status: 'APROVADO',
                                billingStatus: 'PENDING',
                                validUntil: dueDate.toISOString(),
                                approvedAt: dueDate.toISOString(),
                                notes: 'Gerado automaticamente via sistema PMOC.'
                            });
                        }
                        console.log(`✅ ${totalInstallments} mensalidades geradas no financeiro para ${pmocCode}`);
                    } catch (billingError: any) {
                        console.error('⚠️ Erro ao gerar mensalidades:', billingError);
                        alert(`Contrato criado com sucesso, porém houve um erro ao gerar as mensalidades automáticas: ${billingError.message}`);
                    }
                }
            } else {
                await onEditOrder({ ...selectedContract!, ...finalPayload });
            }

            setIsAuditModalOpen(false);
            setIsModalOpen(false);
            onUpdateOrders();
        } catch (error: any) {
            console.error("❌ Erro Nexus Save:", error);
            alert(`Erro ao salvar contrato: ${error.message || 'Falha na comunicação com o banco'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleManualInstallments = async () => {
        if (!selectedContract) return;
        
        // Use current form states
        const parsedValue = parseFloat(contractValue.replace(/\./g, '').replace(',', '.'));
        if (parsedValue <= 0) {
            alert('O valor do contrato deve ser maior que zero para gerar faturamento.');
            return;
        }

        if (!window.confirm(`Deseja lançar as mensalidades no financeiro agora?\nSerão geradas cobranças baseadas no valor de R$ ${contractValue} pelo período de ${billingDurationMonths} meses.`)) {
            return;
        }

        try {
            setIsSubmitting(true);

            // Verificação de faturamento duplicado
            const { data: existingBilled } = await supabase
                .from('quotes')
                .select('id')
                .like('display_id', `${pmocCode}-%`)
                .limit(1);

            if (existingBilled && existingBilled.length > 0) {
                alert(`⚠️ Atenção: O contrato ${pmocCode} já possui faturamento lançado no financeiro. Não é possível duplicar o lançamento.\n\nPara renovações, crie um novo ciclo de contrato.`);
                setIsSubmitting(false);
                return;
            }

            const periodicityMonths: Record<string, number> = {
                'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12
            };
            const intervalMonths = periodicityMonths[periodicity] || 1;
            const totalInstallments = Math.floor(billingDurationMonths / intervalMonths);

            const baseDateStr = startDate || selectedContract.scheduledDate || new Date().toISOString().split('T')[0];

            for (let i = 0; i < totalInstallments; i++) {
                const dueDate = new Date(baseDateStr + 'T12:00:00');
                dueDate.setMonth(dueDate.getMonth() + (i * intervalMonths));
                dueDate.setDate(Math.min(maintenanceDay, new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate()));

                await DataService.createQuote({
                    displayId: `${pmocCode}-${i + 1}/${totalInstallments}`,
                    customerName: customerSearch || selectedContract.customerName,
                    customerAddress: selectedContract.customerAddress || 'Endereço não cadastrado',
                    title: `Mensalidade ${i + 1}/${totalInstallments} — Contrato ${pmocCode}`,
                    description: `Faturamento automático de contrato (PMOC) - Vencimento original: ${dueDate.toLocaleDateString('pt-BR')}`,
                    items: [{
                        id: crypto.randomUUID(),
                        description: `Mensalidade ${i + 1}/${totalInstallments} - Contrato ${pmocCode}`,
                        quantity: 1,
                        unitPrice: parsedValue,
                        total: parsedValue
                    }],
                    totalValue: parsedValue,
                    status: 'APROVADO',
                    billingStatus: 'PENDING',
                    validUntil: dueDate.toISOString(),
                    approvedAt: dueDate.toISOString(),
                    notes: 'Gerado automaticamente via sistema PMOC.'
                });
            }
            setIsAlreadyBilled(true);
            alert(`✅ ${totalInstallments} mensalidades geradas com sucesso na tela Financeiro!`);
        } catch (billingError: any) {
            console.error('⚠️ Erro ao gerar mensalidades:', billingError);
            alert(`Erro ao gerar as mensalidades automáticas: ${billingError.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // States para Filtros Unificados Nexus
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const getDefaultDates = () => {
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 6);
        const dEnd = new Date();
        dEnd.setMonth(dEnd.getMonth() + 6);
        return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
    };
    const { start: initStart, end: initEnd } = getDefaultDates();
    const [startDateFilter, setStartDateFilter] = useState(initStart);
    const [endDateFilter, setEndDateFilter] = useState(initEnd);

    const handleDateValidation = (start: string, end: string) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if ((d2.getTime() - d1.getTime()) > 31622400000) { // 366 dias
                alert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada.');
                setStartDateFilter(start);
                setEndDateFilter(new Date(d1.getTime() + 31536000000).toISOString().split('T')[0]);
                setCurrentPage(1);
                return;
            }
        }
        setStartDateFilter(start);
        setEndDateFilter(end);
        setCurrentPage(1);
    };

    const filteredContracts = useMemo(() => {
        return orders.filter(contract => {
            const term = searchTerm.toLowerCase();
            const matchesSearch = (contract.id || '').toLowerCase().includes(term) ||
                (contract.customerName || '').toLowerCase().includes(term) ||
                (contract.title || '').toLowerCase().includes(term);

            const matchesStatus = statusFilter === 'ALL' || contract.status === statusFilter;

            let matchesTime = true;
             if (startDateFilter && endDateFilter && contract.scheduledDate) {
                 matchesTime = contract.scheduledDate >= startDateFilter && contract.scheduledDate <= endDateFilter;
             }

             return matchesSearch && matchesStatus && matchesTime;
         }).sort((a, b) => {
            const dateA = new Date(a.created_at || a.scheduledDate || 0).getTime();
            const dateB = new Date(b.created_at || b.scheduledDate || 0).getTime();
            return dateB - dateA;
         });
     }, [orders, searchTerm, statusFilter, startDateFilter, endDateFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, startDateFilter, endDateFilter]);

    const paginatedContracts = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredContracts.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredContracts, currentPage]);

    const totalPages = Math.ceil(filteredContracts.length / ITEMS_PER_PAGE);

    return (
        <div className="p-4 space-y-4 flex flex-col h-full bg-slate-50/20 font-poppins">
            <div className="flex justify-between items-center print:hidden">
                <div>
                    <div className="flex items-center gap-3"><Briefcase className="text-[#1c2d4f]" size={32} /><h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none">Gestão de Contratos</h1></div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase pl-11">Auditoria Jurídica, Comercial e Operacional Nexus Line.</p>
                </div>
                <Button 
                  onClick={() => {
                    setSelectedContract(null); 
                    setModalTab('technical'); 
                    setPendingAction('CREATE');
                    setSelectedCustomerId(''); 
                    setCustomerSearch('');
                    setChangeReason('');
                    setContractValue('0,00'); 
                    setIncludesParts(false); 
                    setVisitCount(1); 
                    setContractTerms('');
                    setGenerateBilling(false);
                    setBillingDurationMonths(12);
                    setIsModalOpen(true);
                  }} 
                  className="px-6 py-4 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-[10px] font-bold uppercase shadow-sm transition-all border border-[#1c2d4f] flex items-center gap-2"
                >
                  <Plus size={16} /> Novo Contrato
                </Button>
            </div>

            <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 flex flex-col min-h-0 print:hidden">
                {/* Toolbar de Filtros Unificada */}
                <div className="p-2 sm:p-3 bg-slate-50/30 border-b border-[#1c2d4f]/10">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
                            <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar pmoc, cliente ou título..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                                />
                            </div>

                            <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 shadow-sm'}`}
                                >
                                    <Filter size={14} /> <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Avançado'}</span>
                                </button>
                            </div>
                        </div>

                        {showFilters && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-white/60 rounded-xl border border-[#1c2d4f]/10 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">Período de Ciclo</label>
                                    <div className="flex items-center gap-2 bg-white border border-[#1c2d4f]/20 rounded-lg px-2 h-9 shadow-sm">
                                        <Calendar size={12} className="text-[#1c2d4f]" />
                                        <input type="date" value={startDateFilter} onChange={e => handleDateValidation(e.target.value, endDateFilter)} className="bg-transparent border-none text-[10px] font-bold text-slate-600 outline-none w-full" />
                                        <span className="text-[10px] text-slate-300">até</span>
                                        <input type="date" value={endDateFilter} onChange={e => handleDateValidation(startDateFilter, e.target.value)} className="bg-transparent border-none text-[10px] font-bold text-slate-600 outline-none w-full" />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">{t.common.status}</label>
                                    <div className="flex items-center bg-white border border-[#1c2d4f]/20 rounded-lg pl-2 pr-1 h-9 shadow-sm">
                                        <ListFilter size={12} className="text-slate-400 mr-2" />
                                        <select className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full cursor-pointer h-full" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                            <option value="ALL">Todos Status</option>
                                            <option value={OrderStatus.PENDING}>Ativos</option>
                                            <option value={OrderStatus.CANCELED}>Inativos</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex items-end pb-0.5">
                                    <button
                                        onClick={() => {
                                            setSearchTerm(''); setStatusFilter('ALL'); setStartDateFilter(''); setEndDateFilter('');
                                        }}
                                        className="h-9 w-full px-4 text-[10px] font-bold bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors uppercase tracking-widest border border-rose-100"
                                    >
                                        Limpar Filtros
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Desktop View */}
                <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full border-separate border-spacing-y-0">
                        <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] text-center">
                            <tr className="border-b border-slate-200">
                                <th className="px-4 py-2">Código / PMOC</th>
                                <th className="px-4 py-2">Cliente</th>
                                <th className="px-4 py-2 font-bold uppercase">Mensalidade</th>
                                <th className="px-4 py-2">Dia</th>
                                <th className="px-4 py-2 text-center">{t.common.status}</th>
                                <th className="px-4 py-2 text-right pr-6">{t.common.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedContracts.length > 0 ? (
                                paginatedContracts.map(contract => (
                                    <tr key={contract.id} className="bg-white hover:bg-primary-50/40 border-b border-slate-200 transition-all group last:border-0 shadow-sm hover:shadow-md">
                                        <td className="px-4 py-1.5">
                                            <div className="flex flex-col truncate max-w-[120px]">
                                                <span className="text-[12px] font-medium text-primary-600 tracking-tighter truncate">{contract.pmocCode}</span>
                                                <span className="text-[11px] text-slate-400 truncate mt-0.5">{contract.title.replace('CONTRATO Master: ', '')}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-1.5 text-[12px] font-medium text-slate-900 truncate max-w-[150px]">{contract.customerName}</td>
                                        <td className="px-4 py-1.5 text-[12px] font-semibold text-emerald-600 whitespace-nowrap">R$ {contract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-1.5 text-center whitespace-nowrap"><span className="px-2 py-1 bg-primary-50 text-primary-600 rounded-lg text-[11px] font-medium">{contract.maintenanceDay || '1'}º</span></td>
                                        <td className="px-4 py-1.5 text-center whitespace-nowrap">
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-bold uppercase ${contract.status === OrderStatus.CANCELED ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                                <span className={`w-1 h-1 rounded-full animate-pulse ${contract.status === OrderStatus.CANCELED ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                {contract.status === OrderStatus.CANCELED ? 'Inativo' : 'Ativo'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2 text-right pr-6">
                                            <div className="flex justify-end gap-2 transition-all">
                                                <button onClick={() => { setSelectedContract(contract); setViewTab('details'); setIsViewModalOpen(true); }} className="p-3 bg-slate-50/50 text-slate-400 rounded-xl hover:text-slate-900 hover:bg-white shadow-sm border border-transparent hover:border-slate-200 transition-all active:scale-95" title="Detalhes"><Eye size={16} /></button>
                                                <button onClick={() => handleOpenEdit(contract)} className="p-3 bg-primary-50/50 text-primary-400 rounded-xl hover:text-primary-600 hover:bg-white shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95" title="Editar"><Edit3 size={16} /></button>
                                                <button onClick={() => initToggleStatus(contract)} className={`p-3 rounded-xl shadow-sm border border-transparent transition-all active:scale-95 ${contract.status === OrderStatus.CANCELED ? 'bg-emerald-50/50 text-emerald-500 hover:text-emerald-700 hover:bg-white hover:border-emerald-100' : 'bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white hover:border-rose-100'}`} title={contract.status === OrderStatus.CANCELED ? 'Reativar' : 'Suspender'}>
                                                    <ShieldAlert size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={6} className="py-20 text-center text-slate-300 font-bold uppercase text-[10px]">Nenhum contrato localizado com estes critérios</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards View (PWA) */}
                <div className="md:hidden flex-1 overflow-auto custom-scrollbar bg-slate-50/50 p-2.5 space-y-2.5 pb-28">
                    {paginatedContracts.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 font-bold uppercase text-[10px]">
                            Nenhum contrato localizado com estes critérios
                        </div>
                    ) : (
                        paginatedContracts.map(contract => (
                            <div key={contract.id} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2.5">
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md">
                                            {contract.pmocCode}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400">
                                            Dia {contract.maintenanceDay || '1'}º
                                        </span>
                                    </div>
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${contract.status === OrderStatus.CANCELED ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${contract.status === OrderStatus.CANCELED ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                        {contract.status === OrderStatus.CANCELED ? 'Inativo' : 'Ativo'}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-xs font-bold text-slate-800 uppercase line-clamp-1">
                                        {contract.title.replace('CONTRATO Master: ', '')}
                                    </h4>
                                    <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                                        {contract.customerName}
                                    </p>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <div>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Mensalidade</span>
                                        <span className="text-sm font-black text-emerald-600">
                                            R$ {contract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => { setSelectedContract(contract); setViewTab('details'); setIsViewModalOpen(true); }} className="p-2 text-slate-500 bg-slate-50 border border-slate-200 rounded-xl" title="Detalhes">
                                            <Eye size={15} />
                                        </button>
                                        <button onClick={() => handleOpenEdit(contract)} className="p-2 text-primary-600 bg-primary-50 border border-primary-100 rounded-xl" title="Editar">
                                            <Edit3 size={15} />
                                        </button>
                                        <button onClick={() => initToggleStatus(contract)} className={`p-2 rounded-xl border ${contract.status === OrderStatus.CANCELED ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-500 bg-rose-50 border-rose-100'}`} title={contract.status === OrderStatus.CANCELED ? 'Reativar' : 'Suspender'}>
                                            <ShieldAlert size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredContracts.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* EDIT/CREATE MODAL */}
            {isModalOpen && safeCreatePortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
                    <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-6xl h-full sm:h-auto sm:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 sm:border border-slate-200">
                        {/* HEADER */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0">
                                    <Layers size={18} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-sm sm:text-base font-bold text-slate-900 font-poppins truncate">
                                        {pendingAction === 'EDIT' ? 'Editar Contrato Master' : 'Novo Contrato'}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{pmocCode}</span>
                                        <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                                        <span className="text-[9px] font-bold text-primary-600 uppercase tracking-widest hidden sm:inline">Protocolo Nexus Line</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => {
                                        if (selectedEquipIds.length === 0) {
                                            alert("⚠️ Selecione pelo menos um equipamento no 'Dados Técnicos' para prosseguir.");
                                            return;
                                        }
                                        setIsAuditModalOpen(true);
                                    }}
                                    className={`hidden sm:flex h-9 px-4 bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold rounded-xl shadow-md transition-all items-center gap-1.5 ${selectedEquipIds.length === 0 ? 'opacity-50 grayscale' : ''}`}
                                >
                                    <Save size={14} /> Salvar
                                </button>
                                <button 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                            {/* TABS */}
                            <div className="hidden md:flex flex-col w-56 border-r border-slate-200 bg-slate-50/80 p-4 gap-2 overflow-y-auto custom-scrollbar shrink-0">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Navegação</div>
                            {[
                                { id: 'technical', label: 'Dados Técnicos', icon: Settings2 },
                                { id: 'commercial', label: 'Comercial & Termos', icon: DollarSign },
                                { id: 'monitoring', label: 'Monitoramento', icon: BellRing }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setModalTab(tab.id as any)}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all w-full text-left font-poppins
                                        ${modalTab === tab.id
                                            ? 'bg-[#1c2d4f] text-white shadow-md ring-1 ring-[#1c2d4f]'
                                            : 'text-slate-500 hover:bg-white hover:text-[#1c2d4f] hover:shadow-sm'}`}
                                >
                                    <tab.icon size={15} className={modalTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} />
                                    <span className="flex-1 truncate">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        {/* MOBILE TABS */}
                        <div className="md:hidden border-b border-slate-200 bg-white px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                            {[
                                { id: 'technical', label: 'Dados Técnicos', icon: Settings2 },
                                { id: 'commercial', label: 'Comercial', icon: DollarSign },
                                { id: 'monitoring', label: 'Monitor.', icon: BellRing }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setModalTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap font-poppins
                                        ${modalTab === tab.id
                                            ? 'bg-[#1c2d4f] text-white shadow-md'
                                            : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                >
                                    <tab.icon size={13} className={modalTab === tab.id ? 'text-white' : 'text-slate-400'} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* CONTENT AREA */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/30 custom-scrollbar">
                            {modalTab === 'technical' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 animate-fade-in">
                                    <div className="space-y-6">
                                        <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <div className="space-y-6">
                                                <div className="relative">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">Cliente Responsável</label>
                                                    
                                                    {selectedContract ? (
                                                        <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 uppercase opacity-70">
                                                            {selectedCustomerId || 'Cliente não selecionado'}
                                                        </div>
                                                    ) : (
                                                        <div className="relative">
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Buscar por nome ou documento..."
                                                                    value={customerSearch || selectedCustomerId}
                                                                    onChange={(e) => {
                                                                        setCustomerSearch(e.target.value);
                                                                        setIsCustomerListOpen(true);
                                                                        if (!e.target.value) setSelectedCustomerId('');
                                                                    }}
                                                                    onFocus={() => setIsCustomerListOpen(true)}
                                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-slate-700 uppercase outline-none focus:ring-2 focus:ring-primary-100 transition-all shadow-inner"
                                                                />
                                                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                            </div>

                                                            {isCustomerListOpen && (
                                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[1000] max-h-[250px] overflow-y-auto custom-scrollbar p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                    {customers
                                                                        .filter(c => 
                                                                            c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
                                                                            (c.document && c.document.includes(customerSearch))
                                                                        )
                                                                        .map(c => (
                                                                            <button
                                                                                key={c.id}
                                                                                onClick={() => {
                                                                                    setSelectedCustomerId(c.name);
                                                                                    setCustomerSearch(c.name);
                                                                                    setIsCustomerListOpen(false);
                                                                                }}
                                                                                className="w-full text-left p-3 rounded-xl hover:bg-slate-50 transition-all group flex flex-col gap-0.5 border border-transparent hover:border-slate-100"
                                                                            >
                                                                                <span className="text-[11px] font-bold text-slate-700 uppercase group-hover:text-primary-600 truncate">{c.name}</span>
                                                                                <span className="text-[9px] font-medium text-slate-400 uppercase">{c.document || 'S/ DOCUMENTO'}</span>
                                                                            </button>
                                                                        ))}
                                                                    {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.document && c.document.includes(customerSearch))).length === 0 && (
                                                                        <div className="py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum cliente encontrado</div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">Título do Contrato</label>
                                                    <input 
                                                        type="text" 
                                                        value={contractTitle} 
                                                        onChange={e => setContractTitle(e.target.value)} 
                                                        placeholder="Ex: Manutenção Central de Ar"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all shadow-inner" 
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">Início do Ciclo</label>
                                                        <input 
                                                            type="date" 
                                                            value={startDate} 
                                                            onChange={e => setStartDate(e.target.value)} 
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all" 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">Periodicidade</label>
                                                        <select 
                                                            value={periodicity} 
                                                            onChange={e => setPeriodicity(e.target.value)} 
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                                                        >
                                                            <option>Mensal</option>
                                                            <option>Trimestral</option>
                                                            <option>Semestral</option>
                                                            <option>Anual</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-3 block tracking-widest">Dia de Visita Preferencial</label>
                                            <div className="grid grid-cols-7 gap-1.5">
                                                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                                    <button 
                                                        key={d} 
                                                        onClick={() => setMaintenanceDay(d)} 
                                                        className={`py-2 rounded-lg text-[10px] font-bold transition-all ${maintenanceDay === d ? 'bg-[#1c2d4f] text-white shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'}`}
                                                    >
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col h-full space-y-4">
                                        <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex-1 flex flex-col min-h-0">
                                            <div className="flex items-center justify-between mb-4">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ativos Vinculados ({selectedEquipIds.length})</label>
                                                <span className="text-[9px] font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded">Controle PMOC</span>
                                            </div>
                                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                                {customerEquipments.length > 0 ? (
                                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 border-b border-slate-200">
                                                                <tr>
                                                                    <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Modelo / Nº Série</th>
                                                                    <th className="py-2.5 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center w-20">Vincular</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {customerEquipments.map(equip => (
                                                                    <tr 
                                                                        key={equip.id} 
                                                                        onClick={() => setSelectedEquipIds(prev => prev.includes(equip.id) ? prev.filter(id => id !== equip.id) : [...prev, equip.id])} 
                                                                        className={`cursor-pointer transition-all hover:bg-slate-50 group ${selectedEquipIds.includes(equip.id) ? 'bg-[#1c2d4f]/[0.02]' : ''}`}
                                                                    >
                                                                        <td className="py-3 px-4">
                                                                            <p className={`text-[11px] font-bold uppercase transition-colors ${selectedEquipIds.includes(equip.id) ? 'text-[#1c2d4f]' : 'text-slate-700'}`}>{equip.model}</p>
                                                                            <p className="text-[9px] font-medium text-slate-400 uppercase mt-0.5">S/N: {equip.serialNumber}</p>
                                                                        </td>
                                                                        <td className="py-3 px-4 text-center">
                                                                            <div className={`mx-auto w-6 h-6 rounded-md flex items-center justify-center transition-all ${selectedEquipIds.includes(equip.id) ? 'bg-[#1c2d4f] text-white shadow-md scale-110' : 'bg-slate-100 text-slate-400 group-hover:bg-[#1c2d4f]/10 group-hover:text-[#1c2d4f]'}`}>
                                                                                {selectedEquipIds.includes(equip.id) ? <Check size={12} strokeWidth={3} /> : <Plus size={12} />}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center h-full py-10 text-center opacity-60">
                                                        <Box size={24} className="text-slate-400 mb-2" />
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nenhum ativo selecionável</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalTab === 'commercial' && (
                                <div className="space-y-8 animate-fade-in max-w-4xl mx-auto w-full">
                                    {/* AUTO-BILLING NO TOPO DA ABA COMERCIAL */}
                                    <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-xl ${pendingAction === 'CREATE' ? (generateBilling ? 'bg-emerald-500' : 'bg-slate-100') : 'bg-[#1c2d4f]'} transition-colors shadow-sm`}>
                                                    <DollarSign size={22} className={pendingAction === 'CREATE' ? (generateBilling ? 'text-white' : 'text-slate-300') : 'text-white'} />
                                                </div>
                                                <div>
                                                    <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-tight">
                                                        {pendingAction === 'CREATE' ? 'Gerar Cobranças Automaticamente' : 'Faturamento e Lançamentos'}
                                                    </h4>
                                                    <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase">Lançar mensalidades no módulo financeiro</p>
                                                </div>
                                            </div>
                                            {pendingAction === 'CREATE' ? (
                                                <button onClick={() => setGenerateBilling(!generateBilling)} className={`w-14 h-8 rounded-full relative transition-all ${generateBilling ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${generateBilling ? 'left-7' : 'left-1'}`} />
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={handleManualInstallments} 
                                                    disabled={isSubmitting || isAlreadyBilled}
                                                    className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-2 shadow-md ${isAlreadyBilled ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border border-slate-300' : 'bg-[#1c2d4f] hover:bg-[#253a66] text-white disabled:opacity-50'}`}
                                                >
                                                    <CalendarClock size={14} /> {isAlreadyBilled ? 'Faturamento Lançado' : 'Lançar Mensalidades'}
                                                </button>
                                            )}
                                        </div>

                                        {(generateBilling || pendingAction === 'EDIT') && (
                                            <div className="space-y-5 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Duração do Contrato (em meses)</label>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                        {[6, 12, 24, 36].map(m => (
                                                            <button
                                                                key={m}
                                                                onClick={() => setBillingDurationMonths(m)}
                                                                className={`py-3 rounded-xl text-[11px] font-bold transition-all ${billingDurationMonths === m ? 'bg-[#1c2d4f] text-white shadow-lg' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-200'}`}
                                                            >
                                                                {m} meses
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Preview */}
                                                {parsedValue > 0 && (
                                                    <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                        <div className="flex items-start gap-3">
                                                            <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                                                            <div className="space-y-1.5">
                                                                <p className="text-[11px] font-bold text-emerald-800 uppercase">
                                                                    {(() => {
                                                                        const pm: Record<string, number> = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12 };
                                                                        const interval = pm[periodicity] || 1;
                                                                        const total = Math.floor(billingDurationMonths / interval);
                                                                        return `Serão geradas ${total} cobranças de R$ ${parsedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                                                    })()}
                                                                </p>
                                                                <p className="text-[10px] text-emerald-600 font-medium">
                                                                    {(() => {
                                                                        const pm: Record<string, number> = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12 };
                                                                        const interval = pm[periodicity] || 1;
                                                                        const total = Math.floor(billingDurationMonths / interval);
                                                                        const totalValue = total * parsedValue;
                                                                        return `Periodicidade: ${periodicity} • Duração: ${billingDurationMonths} meses • Total acumulado: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                                                    })()}
                                                                </p>
                                                                <p className="text-[9px] text-emerald-500 font-medium mt-1">
                                                                    Vencimento no dia {maintenanceDay} de cada período • Lançamento na tela de Financeiro
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                                        <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-4 block tracking-widest">Mensalidade do Contrato</label>
                                            <div className="relative">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-lg">R$</div>
                                                <input 
                                                    type="text" 
                                                    value={contractValue} 
                                                    onChange={handleValueChange} 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-6 py-5 text-2xl font-bold text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-50 transition-all shadow-inner" 
                                                    placeholder="0,00" 
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-center">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-6 block tracking-widest text-center">Visitas Programadas p/ Ciclo</label>
                                            <div className="flex items-center justify-center gap-6">
                                                <button onClick={() => setVisitCount(Math.max(1, visitCount - 1))} className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full border border-slate-200 flex items-center justify-center hover:bg-white hover:text-slate-600 transition-all">-</button>
                                                <span className="text-4xl font-bold text-slate-900 font-poppins">{visitCount}</span>
                                                <button onClick={() => setVisitCount(visitCount + 1)} className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full border border-slate-200 flex items-center justify-center hover:bg-white hover:text-slate-600 transition-all">+</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Peças e Componentes Inclusos?</h4>
                                                <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">Define se o contrato prevê substituição s/ custo</p>
                                            </div>
                                            <div className="flex gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
                                                <button onClick={() => setIncludesParts(true)} className={`px-8 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all ${includesParts ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Sim</button>
                                                <button onClick={() => setIncludesParts(false)} className={`px-8 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all ${!includesParts ? 'bg-white text-[#1c2d4f] border border-slate-200 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Não</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
                                        <div className="flex items-center gap-3">
                                            <FileSignature className="text-primary-600" size={18} />
                                            <label className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Termos e Acordos de Redação</label>
                                        </div>
                                        <textarea 
                                            value={contractTerms} 
                                            onChange={e => setContractTerms(e.target.value)} 
                                            placeholder="Descreva as cláusulas, exclusões e responsabilidades comerciais..." 
                                            className="w-full h-48 bg-slate-50 border border-slate-200 rounded-xl p-6 text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-primary-100 transition-all shadow-inner resize-none custom-scrollbar" 
                                        />
                                    </div>
                                </div>
                            )}

                            {modalTab === 'monitoring' && (
                                <div className="max-w-2xl mx-auto py-10 space-y-8 animate-fade-in">
                                    <div className="p-6 sm:p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-8">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-5">
                                                <div className={`p-4 rounded-2xl ${enableAlerts ? 'bg-[#1c2d4f]' : 'bg-slate-100'} text-white shadow-lg transition-colors`}>
                                                    <BellRing size={28} className={enableAlerts ? 'text-white' : 'text-slate-300'} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">Status do Monitoramento</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Gatilhos Automáticos Nexus</p>
                                                </div>
                                            </div>
                                            <button onClick={() => setEnableAlerts(!enableAlerts)} className={`w-14 h-8 rounded-full relative transition-all ${enableAlerts ? 'bg-[#1c2d4f]' : 'bg-slate-200'}`}>
                                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${enableAlerts ? 'left-7' : 'left-1'}`} />
                                            </button>
                                        </div>

                                        <div className={`space-y-8 ${enableAlerts ? 'opacity-100' : 'opacity-30 grayscale pointer-events-none transition-all'}`}>
                                            <div className="space-y-4">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block px-1">Gatilho de Antecipação (Dias antes do ciclo)</label>
                                                <div className="grid grid-cols-6 gap-2">
                                                    {[1, 3, 5, 7, 10, 15].map(d => (
                                                        <button key={d} onClick={() => setAlertDaysBefore(d)} className={`py-3 rounded-xl text-[10px] font-bold transition-all ${alertDaysBefore === d ? 'bg-[#1c2d4f] text-white shadow-lg' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-200'}`}>{d} Dias</button>
                                                    ))}
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-4">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block px-1">Frequência de Alertas Nexus</label>
                                                <div className="grid grid-cols-6 gap-2">
                                                    {[1, 2, 3, 4, 5, 0].map(f => (
                                                        <button key={f} onClick={() => setAlertFrequency(f)} className={`py-3 rounded-xl text-[10px] font-bold transition-all ${alertFrequency === f ? 'bg-[#1c2d4f] text-white shadow-lg' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-200'}`}>{f === 0 ? 'Off' : `${f}x p/ dia`}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-5 sm:p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-4">
                                        <ShieldAlert className="text-blue-500" size={24} />
                                        <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase">O Duno monitora o ciclo de faturamento e visitas preventivas automaticamente com base nestas configurações.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>

                        {/* FOOTER ACTIONS FOR MOBILE & DESKTOP */}
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                            >
                                <X size={15} /> Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (selectedEquipIds.length === 0) {
                                        alert("⚠️ Selecione pelo menos um equipamento no 'Dados Técnicos' para prosseguir.");
                                        return;
                                    }
                                    setIsAuditModalOpen(true);
                                }}
                                className={`flex-1 sm:flex-initial px-6 py-2.5 bg-[#1c2d4f] text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#253a66] transition-all shadow-md flex items-center justify-center gap-2 ${selectedEquipIds.length === 0 ? 'opacity-50 grayscale' : ''}`}
                            >
                                <Save size={15} /> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}


            {isAuditModalOpen && safeCreatePortal(
                <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center border border-slate-200">
                        <div className="w-14 h-14 bg-primary-50 text-primary-600 rounded-2xl mx-auto flex items-center justify-center mb-4"><MessageSquare size={28} /></div>
                        <h2 className="text-lg font-bold text-slate-900 uppercase mb-1 tracking-tighter">Protocolo de Auditoria</h2>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4 leading-relaxed">Justificativa obrigatória para registrar a transação no Nexus.</p>
                        <textarea autoFocus value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="Motivo da abertura/revisão deste PMOC..." className="w-full h-28 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium mb-4 outline-none shadow-inner" />
                        <div className="space-y-2">
                            <button onClick={handleConfirmAction} disabled={isSubmitting || !changeReason} className="w-full py-3.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-bold uppercase shadow-md flex items-center justify-center gap-2 transition-all">{isSubmitting && <Loader2 className="animate-spin" size={16} />} Confirmar Transação <ArrowUpRight size={16} /></button>
                            <button onClick={() => setIsAuditModalOpen(false)} className="w-full py-2.5 text-xs font-bold uppercase text-slate-400 hover:text-red-500 transition-colors">Abortar Transação</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {isViewModalOpen && selectedContract && safeCreatePortal(
                <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4 print:p-0 print:bg-white print:absolute print:top-0 print:left-0 print:right-0 print:h-auto print:block animate-in fade-in">
                    <style>{`
                        @media print {
                            @page { margin: 10mm; size: A4 portrait; }
                            body, html { overflow: visible !important; height: auto !important; background: white !important; }
                            .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
                        }
                    `}</style>
                    <div className="bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200 print:h-auto print:max-h-none print:shadow-none print:rounded-none print:w-full print:max-w-none print:overflow-visible print:border-none">
                        {/* HEADER - Nexus Premium Standard (Print Version Compatible) */}
                        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white print:hidden">
                            <div className="flex items-center gap-4">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0">
                                    <Briefcase size={18} />
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins truncate max-w-md">
                                        {selectedContract.customerName}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{selectedContract.pmocCode || selectedContract.display_id}</span>
                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                                        <StatusBadge status={selectedContract.status} />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <Button
                                    onClick={() => window.print()}
                                    variant="secondary"
                                    size="sm"
                                    className="h-10 px-6 gap-2 text-primary-600 border-primary-100 bg-primary-50/50"
                                >
                                    <Printer size={16} /> Imprimir PMOC
                                </Button>
                                <Button
                                    onClick={() => setIsViewModalOpen(false)}
                                    variant="secondary"
                                    size="sm"
                                    className="h-10 px-6 gap-2 text-slate-500 border-slate-200"
                                >
                                    <X size={16} /> Fechar
                                </Button>
                            </div>
                        </div>

                        {/* PRINT LAYOUT — Visible only when printing */}
                        <div className="hidden print:block p-0">
                            <ContractPrintLayout contract={selectedContract} tenant={tenant} equipments={equipments} />
                        </div>

                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden print:hidden">
                            {/* SIDEBAR TABS (desktop) — igual ao painel de OS */}
                            <div className="hidden md:flex flex-col w-56 border-r border-slate-200 bg-slate-50/80 p-4 gap-2 overflow-y-auto custom-scrollbar shrink-0 print:hidden">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Navegação</div>
                            {[
                                { id: 'details', label: 'Dados Técnicos', icon: Settings2 },
                                { id: 'terms', label: 'Comercial & Termos', icon: DollarSign },
                                { id: 'history', label: 'Histórico Nexus', icon: History }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setViewTab(tab.id as any)}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all w-full text-left font-poppins
                                        ${viewTab === tab.id
                                            ? 'bg-[#1c2d4f] text-white shadow-md ring-1 ring-[#1c2d4f]'
                                            : 'text-slate-500 hover:bg-white hover:text-[#1c2d4f] hover:shadow-sm'}`}
                                >
                                    <tab.icon size={15} className={viewTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} />
                                    <span className="flex-1 truncate">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        {/* MOBILE TABS */}
                        <div className="md:hidden border-b border-slate-200 bg-white px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar shrink-0 print:hidden">
                            {[
                                { id: 'details', label: 'Técnicos', icon: Settings2 },
                                { id: 'terms', label: 'Comercial', icon: DollarSign },
                                { id: 'history', label: 'Histórico', icon: History }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setViewTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap font-poppins
                                        ${viewTab === tab.id
                                            ? 'bg-[#1c2d4f] text-white shadow-md'
                                            : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                >
                                    <tab.icon size={13} className={viewTab === tab.id ? 'text-white' : 'text-slate-400'} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* CONTENT AREA */}
                        <div className="flex-1 p-4 sm:p-8 overflow-y-auto custom-scrollbar bg-slate-50/30">
                            {viewTab === 'details' ? (
                                <div className="space-y-8 animate-fade-in">
                                    {/* Informações do Cliente e Contrato */}
                                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-200">
                                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Briefcase size={14} /> Informações Gerais do Contrato</h5>
                                        </div>
                                        <div className="p-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                                <div>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cliente Responsável</p>
                                                    <p className="text-[13px] font-semibold text-slate-900">{selectedContract.customerName || 'N/D'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Endereço</p>
                                                    <p className="text-[13px] font-medium text-slate-600">{selectedContract.customerAddress || 'N/D'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Título do Contrato</p>
                                                    <p className="text-[13px] font-semibold text-slate-900">{selectedContract.title?.replace('CONTRATO Master: ', '') || 'N/D'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Código PMOC</p>
                                                    <p className="text-[13px] font-semibold text-primary-600">{selectedContract.pmocCode || selectedContract.display_id || 'N/D'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Cards de Dados Comerciais e Técnicos */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Mensalidade</p>
                                            <p className="text-base font-bold text-emerald-600">R$ {selectedContract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Periodicidade</p>
                                            <p className="text-base font-bold text-primary-600">{selectedContract.periodicity}</p>
                                        </div>
                                        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Início do Ciclo</p>
                                            <p className="text-base font-bold text-slate-900">{selectedContract.scheduledDate ? new Date(selectedContract.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/D'}</p>
                                        </div>
                                        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Dia de Visita</p>
                                            <p className="text-base font-bold text-slate-900">Dia {selectedContract.maintenanceDay || 1}</p>
                                        </div>
                                        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Visitas / Ciclo</p>
                                            <p className="text-base font-bold text-slate-900">{selectedContract.visitCount || 1}</p>
                                        </div>
                                        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Peças Inclusas</p>
                                            <p className={`text-base font-bold ${selectedContract.includesParts ? 'text-emerald-500' : 'text-red-400'}`}>{selectedContract.includesParts ? 'Sim' : 'Não'}</p>
                                        </div>
                                    </div>

                                    {/* Monitoramento / Alertas */}
                                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-200">
                                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><BellRing size={14} /> Configurações de Monitoramento</h5>
                                        </div>
                                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Alertas</p>
                                                <p className={`text-sm font-bold ${selectedContract.alertSettings?.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>{selectedContract.alertSettings?.enabled ? 'Ativados' : 'Desativados'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Antecipação</p>
                                                <p className="text-sm font-bold text-slate-900">{selectedContract.alertSettings?.daysBefore || 5} dias antes</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Frequência</p>
                                                <p className="text-sm font-bold text-slate-900">{selectedContract.alertSettings?.frequency || 1}x por dia</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Datas do Registro */}
                                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-200">
                                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={14} /> Registro do Contrato</h5>
                                        </div>
                                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Criado Em</p>
                                                <p className="text-sm font-medium text-slate-700">{selectedContract.createdAt ? new Date(selectedContract.createdAt).toLocaleString('pt-BR') : 'N/D'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Última Atualização</p>
                                                <p className="text-sm font-medium text-slate-700">{selectedContract.updatedAt ? new Date(selectedContract.updatedAt).toLocaleString('pt-BR') : 'N/D'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ativos Vinculados */}
                                    <div className="space-y-4">
                                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-4"><Box size={14} /> Ativos Vinculados ({selectedContract.equipmentIds?.length || 0})</h5>
                                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-slate-50 border-b border-slate-200">
                                                    <tr>
                                                        <th className="py-3 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modelo do Equipamento</th>
                                                        <th className="py-3 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Número de Série</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {selectedContract.equipmentIds?.map((id: string) => {
                                                        const eq = equipments.find(e => e.id === id);
                                                        return (
                                                            <tr key={id} className="hover:bg-slate-50 transition-colors group">
                                                                <td className="py-4 px-5">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 group-hover:bg-primary-50 transition-colors">
                                                                            <Box size={16} className="text-primary-400" />
                                                                        </div>
                                                                        <p className="text-[12px] font-semibold text-slate-900 uppercase">{eq?.model || 'Desconhecido'}</p>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-5">
                                                                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{eq?.serialNumber || 'N/D'}</p>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                            {(!selectedContract.equipmentIds || selectedContract.equipmentIds.length === 0) && (
                                                <div className="py-10 text-center flex flex-col items-center justify-center">
                                                    <Box size={24} className="text-slate-300 mb-2" />
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nenhum ativo vinculado a este contrato</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : viewTab === 'terms' ? (
                                <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
                                    <div className="flex items-center gap-4 border-b border-slate-200 pb-8"><FileSignature className="text-primary-600" size={24} /><h4 className="text-sm font-bold text-slate-900 uppercase tracking-tighter">Termos e Condições do Acordo</h4></div>
                                    <div className="bg-white p-12 rounded-[4rem] border border-slate-200 shadow-sm">
                                        <div className="bg-slate-50 p-16 rounded-[3rem] shadow-inner min-h-[400px] text-sm text-slate-700 font-medium leading-loose">
                                            {selectedContract.contractTerms || 'Nenhum termo adicional registrado para este contrato.'}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-12 animate-fade-in max-w-4xl mx-auto">
                                    <div className="flex items-center gap-4 border-b border-slate-200 pb-8"><History className="text-primary-600" size={24} /><h4 className="text-sm font-bold text-slate-900 uppercase tracking-tighter">Timeline de Auditoria Nexus</h4></div>
                                    <div className="relative border-l-2 border-slate-100 ml-6 space-y-12 pb-10">
                                        {(selectedContract.logs || []).slice().reverse().map((log: AuditLog, i: number) => (
                                            <div key={i} className="relative pl-12 animate-fade-in-up">
                                                <div className="absolute -left-[11px] top-1 w-5 h-5 bg-white border-2 border-primary-600 rounded-full flex items-center justify-center shadow-md"><div className="w-2 h-2 bg-primary-600 rounded-full" /></div>
                                                <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm transition-all hover:border-primary-200">
                                                    <div className="flex justify-between items-center mb-5"><span className="px-3 py-1 bg-primary-600 text-white text-[9px] font-bold uppercase rounded-lg tracking-widest">{log.action.replace(/_/g, ' ')}</span><span className="text-[9px] font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-xl">{new Date(log.timestamp).toLocaleString()}</span></div>
                                                    <p className="text-[13px] font-bold text-slate-900 leading-snug mb-5 uppercase tracking-tighter">{log.details}</p>
                                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-inner"><p className="text-[8px] font-bold text-primary-500 uppercase mb-2">Justificativa Operacional:</p><p className="text-[12px] font-bold text-slate-600 leading-relaxed">"{log.reason}"</p></div>
                                                    <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-200"><div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center shadow-sm"><UserIcon size={16} /></div><span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">{log.user}</span></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- CONTRACT PRINT LAYOUT ---
// --- CONTRACT PRINT LAYOUT ---
// Redeigned to match exactly the Order Service (OS) standard
const ContractPrintLayout: React.FC<{ contract: any, tenant: any, equipments: Equipment[] }> = ({ contract, tenant, equipments }) => {
    if (!contract || typeof document === 'undefined' || !document.body) return null;

    const companyName = tenant?.company_name || tenant?.name || 'Nexus Pro';
    const companyLogo = tenant?.logo_url;
    
    const companyAddress = React.useMemo(() => {
        if (!tenant) return '';
        const street = tenant.street || tenant.address || '';
        if (!street) return '';
        const parts = [street];
        if (tenant.number) parts.push(`, ${tenant.number}`);
        if (tenant.complement) parts.push(` - ${tenant.complement}`);
        if (tenant.neighborhood) parts.push(` - ${tenant.neighborhood}`);
        if (tenant.city) parts.push(`, ${tenant.city}`);
        if (tenant.state) parts.push(`/${tenant.state}`);
        return parts.join('');
    }, [tenant]);

    const companyPhone = tenant?.phone || '';
    const companyEmail = tenant?.admin_email || tenant?.email || '';
    const companyDoc = tenant?.cnpj || tenant?.document || '';

    const fmt = (d?: string) => {
        if (!d) return '—';
        const date = new Date(d);
        return date.toLocaleDateString('pt-BR');
    };

    return (
        <div className="bg-white text-[10px] leading-tight font-poppins p-4 print:p-2" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            {/* Print Header */}
            <div className="flex justify-between items-start pb-2 border-b-2 border-slate-800 mb-2">
                <div className="flex gap-3 items-center">
                    {companyLogo ? (
                        <img src={companyLogo} alt="Logo" className="h-12 w-auto object-contain" />
                    ) : (
                        <div className="bg-slate-900 p-1.5 rounded-lg flex items-center justify-center min-w-[50px] min-h-[50px] text-white">
                            <Layers size={24} className="text-white fill-white/10" />
                        </div>
                    )}
                    <div className="space-y-0.5">
                        <h1 className="text-lg font-bold text-slate-900 uppercase tracking-tight">{companyName}</h1>
                        <div className="text-[9px] text-slate-600 max-w-[400px]">
                            {companyAddress && <div className="leading-tight">{companyAddress}</div>}
                            <div className="flex gap-2 mt-0.5">
                                {companyPhone && <span className="font-semibold">Tel: {companyPhone}</span>}
                                {companyEmail && <span>Email: {companyEmail}</span>}
                            </div>
                            {companyDoc && <div className="mt-0.5 font-bold uppercase">CNPJ: {companyDoc}</div>}
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="border-2 border-slate-800 px-3 py-1 rounded-lg bg-slate-50">
                        <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Contrato de Manutenção</div>
                        <div className="text-xl font-bold text-slate-900 tracking-tighter">#{contract.pmocCode || contract.display_id}</div>
                    </div>
                    <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                        Emissão: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                {/* Dados do Contrato e Cliente */}
                <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                    <div className="grid grid-cols-12 divide-x divide-slate-200">
                        <div className="col-span-12 bg-slate-100 px-3 py-1 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Dados do Contrato e Cliente</div>
                        <div className="col-span-7 p-2 grid grid-cols-2 gap-x-4 gap-y-2">
                            <div className="col-span-2">
                                <label className="block text-[8px] font-bold text-slate-400 uppercase">Cliente</label>
                                <div className="font-bold text-slate-900 text-xs uppercase">{contract.customerName}</div>
                            </div>
                            <div className="col-span-2 flex flex-col gap-1">
                                <div>
                                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Endereço de Atendimento</label>
                                    <div className="font-medium text-slate-700 text-xs uppercase leading-tight">{contract.customerAddress || '—'}</div>
                                </div>
                            </div>
                        </div>
                        <div className="col-span-5 p-2 grid grid-cols-2 gap-2 bg-slate-50/50">
                            <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Abertura</label><div className="font-bold">{fmt(contract.scheduledDate)}</div></div>
                            <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Tipo</label><div className="font-bold uppercase text-[9px] text-primary-600">Contrato Preventivo</div></div>
                            <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Periodicidade</label><div className="font-bold uppercase text-[9px]">{contract.periodicity}</div></div>
                            <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Visitas/Ciclo</label><div className="font-bold uppercase text-[9px]">{contract.visitCount || 1} Visita(s)</div></div>
                            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-200/50">
                                <label className="text-[8px] font-bold text-slate-400 uppercase">Investimento Mensal</label>
                                <div className="font-black text-[10px] border border-slate-300 px-1.5 py-0.5 rounded bg-white uppercase text-emerald-600">R$ {contract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Equipamentos Vinculados */}
                <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                    <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-xs uppercase tracking-wider text-slate-700">
                        Ativos Vinculados ao Contrato ({contract.equipmentIds?.length || 0})
                    </div>
                    <div className="w-full">
                        <table className="w-full text-left break-words table-fixed">
                            <thead>
                                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                                    <th className="px-3 py-1.5 w-10 text-center">#</th>
                                    <th className="px-3 py-1.5">Equipamento</th>
                                    <th className="px-3 py-1.5">Modelo</th>
                                    <th className="px-3 py-1.5">Nº Série / ID</th>
                                    <th className="px-3 py-1.5">Família</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {contract.equipmentIds?.map((id: string, i: number) => {
                                    const eq = equipments.find(e => e.id === id);
                                    return (
                                        <tr key={id}>
                                            <td className="px-3 py-1.5 text-xs font-bold text-slate-400 text-center">{i + 1}</td>
                                            <td className="px-3 py-1.5 text-xs font-bold text-slate-900 uppercase">{eq?.name || eq?.model || 'EQUIPAMENTO'}</td>
                                            <td className="px-3 py-1.5 text-xs text-slate-600 uppercase">{eq?.model || '—'}</td>
                                            <td className="px-3 py-1.5 text-xs text-slate-600">{eq?.serialNumber || '—'}</td>
                                            <td className="px-3 py-1.5 text-xs text-slate-600 uppercase text-primary-600/80 font-semibold">{eq?.familyName || eq?.family || '—'}</td>
                                        </tr>
                                    );
                                })}
                                {(!contract.equipmentIds || contract.equipmentIds.length === 0) && (
                                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400 uppercase font-bold text-xs">Nenhum equipamento vinculado a este contrato</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Termos e Descrição */}
                <div className="border border-slate-300 rounded-lg overflow-hidden mt-4">
                    <div className="bg-slate-100 px-3 py-1 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Termos e Condições do Acordo</div>
                    <div className="p-3 bg-white text-[9px] text-slate-800 font-medium whitespace-pre-wrap leading-tight text-justify">
                        {contract.contractTerms || 'Os serviços serão executados de acordo com a Resolução RE nº 09 da ANVISA e as normas técnicas vigentes de manutenção de sistemas de climatização (ABNT). Este contrato prevê visitas preventivas programadas conforme a periodicidade selecionada.'}
                    </div>
                </div>

                {/* Validation & Signatures */}
                <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-4">
                    <div className="grid grid-cols-2 divide-x divide-slate-200">
                        <div className="col-span-2 bg-slate-100 px-3 py-1 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Validação e Assinaturas</div>
                        
                        <div className="p-4 flex flex-col items-center justify-center gap-3 bg-white">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Responsável Técnico</p>
                            <div className="h-[60px] flex flex-col items-center justify-center text-center">
                                <div className="text-primary-600/60 text-[10px] font-bold uppercase tracking-widest leading-none">
                                    Validação Eletrônica no Sistema
                                </div>
                                <div className="text-[8px] font-bold text-slate-300 uppercase mt-1">Protocolo Autenticado</div>
                            </div>
                            <div className="w-full border-t border-slate-300 pt-2 text-center">
                                <p className="text-xs font-bold text-slate-900 uppercase">{companyName}</p>
                            </div>
                        </div>

                        <div className="p-4 flex flex-col items-center justify-center gap-3 bg-white">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Responsável pela Conformidade (Cliente)</p>
                            <div className="h-[60px] flex flex-col items-center justify-center text-center">
                                <span className="text-slate-300 text-[10px] font-bold uppercase tracking-widest leading-none">
                                    Aguardando Formalização
                                </span>
                                <span className="text-[8px] font-bold text-slate-300 uppercase mt-1">Protocolo Digital Pendente</span>
                            </div>
                            <div className="w-full border-t border-slate-300 pt-2 text-center">
                                <p className="text-xs font-bold text-slate-900 uppercase">{contract.customerName}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Footer */}
            <div className="mt-8 pt-4 border-t-2 border-slate-800 flex justify-between items-center text-slate-500">
                <div className="flex items-center gap-2">
                    <img src="/nexus-logo.png" alt="Nexus" className="h-[17px] w-auto object-contain opacity-80" />
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#1c2d4f]">Uma solução DUNO</p>
                    <p className="text-xs uppercase tracking-tight mt-0.5">Documento emitido eletronicamente. Auditável na plataforma central.</p>
                </div>
            </div>
        </div>
    );
};
