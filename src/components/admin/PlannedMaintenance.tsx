
import React, { useState, useMemo, useEffect } from 'react';
import { ServiceOrder, User, OrderStatus, OrderPriority, Customer, Equipment, Contract } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge, PriorityBadge } from '../ui/StatusBadge';
import {
    FileText, CheckCircle2, Search, Calendar, Users,
    Box, Plus, X, ArrowRight, Check, Briefcase, ChevronRight,
    BellRing, Settings2, ArrowLeft, Bell, Clock, Edit3, ShieldAlert, Eye, Loader2,
    History, User as UserIcon, ListFilter, Activity, MessageSquare, AlertTriangle, ArrowUpRight,
    DollarSign, FileSignature, Layers
} from 'lucide-react';
import { DataService } from '../../services/dataService';
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [modalStep, setModalStep] = useState(1);
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
    const [changeReason, setChangeReason] = useState('');

    // New Step 2 States
    const [contractValue, setContractValue] = useState<string>('0,00');
    const [includesParts, setIncludesParts] = useState(false);
    const [visitCount, setVisitCount] = useState<number>(1);
    const [contractTerms, setContractTerms] = useState('');

    const [enableAlerts, setEnableAlerts] = useState(true);
    const [alertDaysBefore, setAlertDaysBefore] = useState(5);
    const [alertFrequency, setAlertFrequency] = useState(2);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

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

    const customerEquipments = useMemo(() => {
        const target = customers.find(c => c.name === selectedCustomerId || c.name === selectedContract?.customerName);
        return target ? equipments.filter(e => e.customerId === target.id || e.customerName === target.name) : [];
    }, [selectedCustomerId, customers, equipments, selectedContract]);

    const handleOpenEdit = (contract: any) => {
        setSelectedContract(contract);
        setSelectedCustomerId(contract.customerName);
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
        setModalStep(1);
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

            const contractPayload = {
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
                equipmentIds: selectedEquipIds.length > 0 ? selectedEquipIds : selectedContract?.equipmentIds,
                logs: updatedLogs,
                alertSettings: { enabled: enableAlerts, daysBefore: alertDaysBefore, frequency: alertFrequency },
                // New Fields
                contractValue: parsedValue,
                includesParts: includesParts,
                visitCount: visitCount,
                contractTerms: contractTerms
            };

            if (pendingAction === 'CREATE') await onCreateOrder(contractPayload);
            else await onEditOrder({ ...selectedContract!, ...contractPayload });

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

    // States para Filtros Unificados Nexus
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [startDateFilter, setStartDateFilter] = useState('');
    const [endDateFilter, setEndDateFilter] = useState('');

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
        <div className="p-4 space-y-4 animate-fade-in flex flex-col h-full bg-slate-50/20">
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-3"><Briefcase className="text-[#1c2d4f]" size={32} /><h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none">Gestão de Contratos</h1></div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase pl-11">Auditoria Jurídica, Comercial e Operacional Nexus Line.</p>
                </div>
                <button onClick={() => {
                    setSelectedContract(null); setModalStep(1); setPendingAction('CREATE');
                    setSelectedCustomerId(customers[0]?.name || ''); setChangeReason('');
                    setContractValue('0,00'); setIncludesParts(false); setVisitCount(1); setContractTerms('');
                    setIsModalOpen(true);
                }} className="px-6 py-4 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-[10px] font-bold uppercase shadow-sm transition-all border border-[#1c2d4f]">Novo Contrato</button>
            </div>

            <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 flex flex-col min-h-0">
                {/* Toolbar de Filtros Unificada */}
                <div className="p-6 border-b border-slate-50 bg-slate-50/30 space-y-4">
                    <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
                        <div className="relative w-full max-w-xl">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Pesquisar código, cliente ou título..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-6 py-3 text-[11px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                            />
                        </div>

                        <div className="flex items-center gap-3 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
                            <div className="flex items-center gap-2 px-2 border-r border-slate-100">
                                <Calendar size={16} className="text-[#1c2d4f]" />
                                <span className="text-[9px] font-bold uppercase text-slate-400">Ciclo</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} className="bg-slate-50 border-none text-[10px] font-bold uppercase text-slate-600 rounded-lg px-2 py-1 outline-none" />
                                <span className="text-[10px] font-bold text-slate-300">até</span>
                                <input type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} className="bg-slate-50 border-none text-[10px] font-bold uppercase text-slate-600 rounded-lg px-2 py-1 outline-none" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-10">
                            <ListFilter size={14} className="text-slate-400 mr-2" />
                            <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                <option value="ALL">Todos Status</option>
                                <option value={OrderStatus.PENDING}>Ativo</option>
                                <option value={OrderStatus.CANCELED}>Inativo</option>
                            </select>
                        </div>
                        <button
                            onClick={() => {
                                setSearchTerm(''); setStatusFilter('ALL'); setStartDateFilter(''); setEndDateFilter('');
                            }}
                            className="px-4 py-2 text-[9px] font-bold uppercase text-[#1c2d4f] hover:bg-slate-100 rounded-lg transition-colors border border-dashed border-slate-200"
                        >
                            Limpar Filtros
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full border-separate border-spacing-y-0">
                        <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                            <tr className="border-b border-slate-100">
                                <th className="px-4 py-6">Código / PMOC</th>
                                <th className="px-4 py-6">Cliente</th>
                                <th className="px-4 py-6 font-black uppercase">Mensalidade</th>
                                <th className="px-4 py-6">Dia</th>
                                <th className="px-4 py-6 text-center">Status</th>
                                <th className="px-4 py-6 text-right pr-6">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedContracts.length > 0 ? (
                                paginatedContracts.map(contract => (
                                    <tr key={contract.id} className="bg-white hover:bg-primary-50/40 border-b border-slate-50 transition-all group last:border-0 shadow-sm hover:shadow-md">
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col truncate max-w-[120px]">
                                                <span className="text-[11px] font-black uppercase italic text-primary-600 tracking-tighter truncate">{contract.pmocCode}</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase truncate mt-0.5 italic">{contract.title.replace('CONTRATO Master: ', '')}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-[10px] font-black uppercase italic truncate max-w-[150px]">{contract.customerName}</td>
                                        <td className="px-4 py-4 text-[11px] font-black text-emerald-600 whitespace-nowrap">R$ {contract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-4 text-center whitespace-nowrap"><span className="px-2 py-1 bg-primary-50 text-primary-600 rounded-lg text-[10px] font-black uppercase italic">{contract.maintenanceDay || '1'}º</span></td>
                                        <td className="px-4 py-4 text-center whitespace-nowrap">
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase ${contract.status === OrderStatus.CANCELED ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                                <span className={`w-1 h-1 rounded-full animate-pulse ${contract.status === OrderStatus.CANCELED ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                {contract.status === OrderStatus.CANCELED ? 'Inativo' : 'Ativo'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right pr-6">
                                            <div className="flex justify-end gap-2 transition-all">
                                                <button onClick={() => { setSelectedContract(contract); setViewTab('details'); setIsViewModalOpen(true); }} className="p-3 bg-slate-50/50 text-slate-400 rounded-xl hover:text-slate-900 hover:bg-white shadow-sm border border-transparent hover:border-slate-100 transition-all active:scale-95" title="Detalhes"><Eye size={16} /></button>
                                                <button onClick={() => handleOpenEdit(contract)} className="p-3 bg-primary-50/50 text-primary-400 rounded-xl hover:text-primary-600 hover:bg-white shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95" title="Editar"><Edit3 size={16} /></button>
                                                <button onClick={() => initToggleStatus(contract)} className={`p-3 rounded-xl shadow-sm border border-transparent transition-all active:scale-95 ${contract.status === OrderStatus.CANCELED ? 'bg-emerald-50/50 text-emerald-500 hover:text-emerald-700 hover:bg-white hover:border-emerald-100' : 'bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white hover:border-rose-100'}`} title={contract.status === OrderStatus.CANCELED ? 'Reativar' : 'Suspender'}>
                                                    <ShieldAlert size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={6} className="py-20 text-center text-slate-300 font-black uppercase text-[10px] italic">Nenhum contrato localizado com estes critérios</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredContracts.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                />
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
                    <div className="bg-white rounded-[3.5rem] w-full max-w-6xl shadow-2xl overflow-hidden animate-fade-in-up">
                        <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4"><div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white shadow-xl"><Layers size={24} /></div><div><h2 className="text-xl font-black text-slate-900 uppercase italic">Etapa {modalStep} de 3</h2><p className="text-[9px] text-slate-400 font-black uppercase tracking-widest leading-loose">{modalStep === 1 ? 'Configuração Técnica' : modalStep === 2 ? 'Comercial e Acordos' : 'Monitoramento Nexus'}</p></div></div>
                            <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-slate-400" /></button>
                        </div>

                        <div className="p-10">
                            {modalStep === 1 && (
                                <div className="grid grid-cols-2 gap-10">
                                    <div className="space-y-6">
                                        <div className="p-6 bg-primary-50 border border-primary-100 rounded-[2rem] shadow-inner"><label className="text-[9px] font-black text-primary-400 uppercase mb-2 block tracking-widest italic">Código PMOC Pro</label><p className="text-2xl font-black text-primary-600 uppercase italic tracking-tighter">{pmocCode}</p></div>
                                        <div><label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Cliente Responsável</label><select disabled={!!selectedContract} value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase">{customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                                        <div><label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Título do Contrato</label><input type="text" value={contractTitle} onChange={e => setContractTitle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase text-primary-600 outline-none" /></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="text-[8px] font-black text-slate-400 uppercase mb-1 block pl-2">Início Ciclo</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold" /></div>
                                            <div><label className="text-[8px] font-black text-slate-400 uppercase mb-1 block pl-2">Periodicidade</label><select value={periodicity} onChange={e => setPeriodicity(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black"><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></div>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block pl-2 italic">Dia Preferencial de Visita</label>
                                            <div className="grid grid-cols-7 gap-1.5 p-4 bg-slate-50 border border-slate-100 rounded-[2rem]">
                                                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                                    <button key={d} onClick={() => setMaintenanceDay(d)} className={`py-2 rounded-xl text-[9px] font-black transition-all ${maintenanceDay === d ? 'bg-primary-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{d}</button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-[3rem] p-8 h-[550px] border border-slate-100 shadow-inner flex flex-col">
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-4">Ativos Vinculados ao PMOC ({selectedEquipIds.length})</label>
                                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                            {customerEquipments.map(equip => (<div key={equip.id} onClick={() => setSelectedEquipIds(prev => prev.includes(equip.id) ? prev.filter(id => id !== equip.id) : [...prev, equip.id])} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedEquipIds.includes(equip.id) ? 'bg-primary-600 border-primary-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-primary-100'}`}><div><p className="text-[10px] font-black uppercase" style={{ color: selectedEquipIds.includes(equip.id) ? 'white' : '' }}>{equip.model}</p><p className="text-[8px] font-bold opacity-60">S/N: {equip.serialNumber}</p></div>{selectedEquipIds.includes(equip.id) && <Check size={12} />}</div>))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalStep === 2 && (
                                <div className="space-y-8 animate-fade-in">
                                    <div className="grid grid-cols-3 gap-6">
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2.5rem] shadow-sm">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-3 block italic tracking-widest">Valor Mensal (R$)</label>
                                            <div className="relative">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-lg italic">R$</div>
                                                <input type="text" value={contractValue} onChange={handleValueChange} className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-6 py-5 text-2xl font-black text-emerald-600 italic outline-none focus:ring-4 focus:ring-emerald-50 transition-all shadow-inner" placeholder="0,00" />
                                            </div>
                                        </div>
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col justify-center">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-3 block italic tracking-widest text-center">Quantas Visitas p/ Ciclo?</label>
                                            <div className="flex items-center justify-center gap-4">
                                                <button onClick={() => setVisitCount(Math.max(1, visitCount - 1))} className="p-3 bg-white text-slate-400 rounded-xl border border-slate-200">-</button>
                                                <span className="text-4xl font-black text-slate-900 italic">{visitCount}</span>
                                                <button onClick={() => setVisitCount(visitCount + 1)} className="p-3 bg-white text-slate-400 rounded-xl border border-slate-200">+</button>
                                            </div>
                                        </div>
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col justify-center items-center">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-3 block italic tracking-widest">Peças Inclusas?</label>
                                            <div className="flex gap-2 p-1.5 bg-white rounded-2xl border border-slate-100">
                                                <button onClick={() => setIncludesParts(true)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${includesParts ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-400'}`}>SIM</button>
                                                <button onClick={() => setIncludesParts(false)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${!includesParts ? 'bg-red-500 text-white shadow-lg' : 'text-slate-400'}`}>NÃO</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 border border-slate-100 rounded-[3rem] p-10 space-y-4">
                                        <div className="flex items-center gap-3"><FileSignature className="text-primary-600" size={24} /><label className="text-[11px] font-black text-slate-900 uppercase italic tracking-tighter">Termos e Acordos do Contrato (Painel de Redação)</label></div>
                                        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-inner min-h-[300px] flex flex-col">
                                            <textarea value={contractTerms} onChange={e => setContractTerms(e.target.value)} placeholder="Descreva aqui as cláusulas, exclusões, responsabilidades e observações técnicas comerciais acordadas..." className="w-full flex-1 text-sm font-medium text-slate-700 leading-relaxed outline-none border-none resize-none custom-scrollbar" />
                                        </div>
                                        <p className="text-[9px] font-bold text-slate-400 italic text-right">* Este campo suporta formatação de texto plano para inclusão em relatórios PMOC.</p>
                                    </div>
                                </div>
                            )}

                            {modalStep === 3 && (
                                <div className="max-w-xl mx-auto py-10 space-y-8 animate-fade-in">
                                    <div className="p-8 bg-primary-50/50 rounded-[2.5rem] border border-primary-100 flex items-center justify-between"><div className="flex items-center gap-4"><div className={`p-4 rounded-2xl ${enableAlerts ? 'bg-primary-600' : 'bg-slate-200'} text-white shadow-lg`}><BellRing size={32} /></div><div><h4 className="text-sm font-black text-slate-900 uppercase italic">Monitoramento</h4><p className="text-[10px] text-slate-500 font-bold uppercase">Alertas Ativos</p></div></div><button onClick={() => setEnableAlerts(!enableAlerts)} className={`w-14 h-8 rounded-full relative transition-all ${enableAlerts ? 'bg-primary-600' : 'bg-slate-300'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${enableAlerts ? 'left-7' : 'left-1'}`} /></button></div>
                                    <div className={`grid grid-cols-2 gap-6 ${enableAlerts ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}><div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl"><label className="text-[8px] font-black text-slate-400 uppercase mb-4 block">Gatilho (Dias)</label><div className="grid grid-cols-3 gap-2">{[1, 3, 5, 7, 10, 15].map(d => <button key={d} onClick={() => setAlertDaysBefore(d)} className={`py-2 rounded-xl text-[10px] font-black ${alertDaysBefore === d ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'bg-white shadow-sm'}`}>{d}d</button>)}</div></div><div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl"><label className="text-[8px] font-black text-slate-400 uppercase mb-4 block">Exibição P/ Dia</label><div className="grid grid-cols-3 gap-2">{[1, 2, 3, 4, 5, 0].map(f => <button key={f} onClick={() => setAlertFrequency(f)} className={`py-2 rounded-xl text-[10px] font-black ${alertFrequency === f ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'bg-white shadow-sm'}`}>{f === 0 ? 'Off' : `${f}x`}</button>)}</div></div></div>
                                </div>
                            )}
                        </div>

                        <div className="px-10 py-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <button onClick={() => setModalStep(modalStep - 1)} disabled={modalStep === 1} className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase transition-all ${modalStep === 1 ? 'opacity-0' : 'text-slate-400 hover:text-primary-600'}`}><ArrowLeft size={16} /> Passo Anterior</button>
                            <div className="flex gap-4">
                                <button onClick={() => setIsModalOpen(false)} className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Cancelar</button>
                                {modalStep < 3 ? (
                                    <button onClick={() => setModalStep(modalStep + 1)} className="px-10 py-4 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase italic shadow-lg shadow-primary-600/20">Próximo Passo <ArrowUpRight size={16} className="inline ml-1" /></button>
                                ) : (
                                    <button onClick={() => setIsAuditModalOpen(true)} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase italic shadow-lg shadow-emerald-900/10">Salvar e Registrar Log</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isAuditModalOpen && (
                <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/60 backdrop-blur-xl p-6">
                    <div className="bg-white rounded-[4rem] shadow-2xl p-12 max-w-sm w-full text-center animate-fade-in-up border border-primary-100">
                        <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-2xl mx-auto flex items-center justify-center mb-6"><MessageSquare size={32} /></div>
                        <h2 className="text-xl font-black text-slate-900 uppercase italic mb-2 tracking-tighter">Protocolo de Auditoria</h2>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 leading-loose underline decoration-primary-200 underline-offset-4">Justificativa obrigatória para registrar a transação no nexus.</p>
                        <textarea autoFocus value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="Motivo da abertura/revisão deste PMOC..." className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[2rem] p-6 text-[11px] font-medium mb-6 outline-none shadow-inner" />
                        <div className="space-y-3">
                            <button onClick={handleConfirmAction} disabled={isSubmitting || !changeReason} className="w-full py-5 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl flex items-center justify-center gap-2 hover:bg-primary-700 transition-all">{isSubmitting && <Loader2 className="animate-spin" size={16} />} Confirmar Transação <ArrowUpRight size={16} /></button>
                            <button onClick={() => setIsAuditModalOpen(false)} className="w-full py-4 text-[10px] font-black uppercase text-slate-400 hover:text-red-500 transition-colors">Abortar Transação</button>
                        </div>
                    </div>
                </div>
            )}

            {isViewModalOpen && selectedContract && (
                <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-6">
                    <div className="bg-white rounded-[4rem] w-full max-w-6xl shadow-2xl overflow-hidden animate-fade-in-up flex h-[750px]">
                        <div className="w-80 bg-slate-50 p-10 flex flex-col border-r border-slate-100">
                            <div className="text-center mb-10"><div className="w-20 h-20 bg-primary-600 rounded-[2.5rem] mx-auto flex items-center justify-center text-white mb-4 shadow-xl"><Briefcase size={32} /></div><p className="text-[11px] font-black text-primary-500 uppercase">{selectedContract.pmocCode}</p></div>
                            <nav className="space-y-2 flex-1">
                                <button onClick={() => setViewTab('details')} className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${viewTab === 'details' ? 'bg-white text-primary-600 shadow-lg translate-x-2' : 'text-slate-400'}`}><ListFilter size={18} /> Ativos</button>
                                <button onClick={() => setViewTab('terms')} className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${viewTab === 'terms' ? 'bg-white text-primary-600 shadow-lg translate-x-2' : 'text-slate-400'}`}><FileSignature size={18} /> Termos</button>
                                <button onClick={() => setViewTab('history')} className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${viewTab === 'history' ? 'bg-white text-primary-600 shadow-lg translate-x-2' : 'text-slate-400'}`}><History size={18} /> Histórico</button>
                            </nav>
                            <button onClick={() => setIsViewModalOpen(false)} className="py-5 bg-slate-900 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest">Fechar Módulo</button>
                        </div>
                        <div className="flex-1 p-12 overflow-y-auto custom-scrollbar bg-white">
                            {viewTab === 'details' ? (
                                <div className="space-y-10 animate-fade-in">
                                    <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 flex justify-between items-center"><div className="space-y-1"><h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plano Master Nexus</h4><p className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter truncate max-w-md">{selectedContract.customerName}</p></div><StatusBadge status={selectedContract.status} /></div>
                                    <div className="grid grid-cols-4 gap-4">
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Mensalidade</h5><p className="text-sm font-black text-emerald-600 italic">R$ {selectedContract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Período</h5><p className="text-sm font-black text-primary-600 uppercase italic">{selectedContract.periodicity}</p></div>
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Visitas/Ciclo</h5><p className="text-sm font-black text-slate-900 uppercase italic">{selectedContract.visitCount || 1} Visita(s)</p></div>
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Peças Incl.</h5><p className={`text-sm font-black uppercase italic ${selectedContract.includesParts ? 'text-emerald-500' : 'text-red-400'}`}>{selectedContract.includesParts ? 'Sim' : 'Não'}</p></div>
                                    </div>
                                    <div className="space-y-4">
                                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-4"><Box size={14} /> Ativos Vinculados ({selectedContract.equipmentIds?.length})</h5>
                                        <div className="grid grid-cols-2 gap-4">
                                            {selectedContract.equipmentIds?.map((id: string) => {
                                                const eq = equipments.find(e => e.id === id);
                                                return <div key={id} className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 flex items-center gap-5 transition-all hover:bg-white hover:shadow-xl group"><div className="p-3 bg-white rounded-2xl shadow-sm group-hover:bg-primary-50 transition-colors"><Box size={20} className="text-primary-400" /></div><div><p className="text-[12px] font-black text-slate-900 uppercase italic">{eq?.model}</p><p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">S/N: {eq?.serialNumber}</p></div></div>
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : viewTab === 'terms' ? (
                                <div className="space-y-8 animate-fade-in">
                                    <div className="flex items-center gap-4 border-b border-slate-100 pb-8"><FileSignature className="text-primary-600" size={24} /><h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter">Termos e Condições do Acordo</h4></div>
                                    <div className="bg-slate-50 p-12 rounded-[4rem] border border-slate-100 shadow-inner">
                                        <div className="bg-white p-16 rounded-[3rem] shadow-xl min-h-[400px] text-sm text-slate-700 font-medium leading-loose italic">
                                            {selectedContract.contractTerms || 'Nenhum termo adicional registrado para este contrato.'}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-12 animate-fade-in">
                                    <div className="flex items-center gap-4 border-b border-slate-100 pb-8"><Activity className="text-primary-600" size={24} /><h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter">Timeline de Auditoria Nexus</h4></div>
                                    <div className="relative border-l-2 border-slate-100 ml-6 space-y-12 pb-10">
                                        {(selectedContract.logs || []).slice().reverse().map((log: AuditLog, i: number) => (
                                            <div key={i} className="relative pl-12 animate-fade-in-up">
                                                <div className="absolute -left-[11px] top-1 w-5 h-5 bg-white border-2 border-primary-600 rounded-full flex items-center justify-center shadow-md"><div className="w-2 h-2 bg-primary-600 rounded-full" /></div>
                                                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-200 shadow-sm transition-all hover:border-primary-200">
                                                    <div className="flex justify-between items-center mb-5"><span className="px-3 py-1 bg-primary-600 text-white text-[9px] font-black uppercase italic rounded-lg tracking-widest">{log.action.replace(/_/g, ' ')}</span><span className="text-[9px] font-bold text-slate-400 bg-white border border-slate-100 px-3 py-1 rounded-xl">{new Date(log.timestamp).toLocaleString()}</span></div>
                                                    <p className="text-[13px] font-black text-slate-900 leading-snug mb-5 uppercase italic tracking-tighter">{log.details}</p>
                                                    <div className="p-6 bg-white rounded-[2rem] border border-primary-50 shadow-inner"><p className="text-[8px] font-black text-primary-500 uppercase mb-2 italic">Justificativa Operacional:</p><p className="text-[12px] font-bold text-slate-600 italic leading-relaxed">"{log.reason}"</p></div>
                                                    <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-100"><div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center shadow-sm"><UserIcon size={16} /></div><span className="text-[10px] font-black text-slate-900 uppercase italic tracking-widest">{log.user}</span></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
