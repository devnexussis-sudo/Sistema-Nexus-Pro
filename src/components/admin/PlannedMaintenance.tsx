
import React, { useState, useMemo, useEffect } from 'react';
import { ServiceOrder, User, OrderStatus, OrderPriority, Customer, Equipment, Contract } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge, PriorityBadge } from '../ui/StatusBadge';
import {
    FileText, CheckCircle2, Search, Calendar, Users,
    Box, Plus, X, ArrowRight, Check, Briefcase, ChevronRight,
    BellRing, Settings2, ArrowLeft, Bell, Clock, Edit3, ShieldAlert, Eye, Loader2,
    History, User as UserIcon, ListFilter, Activity, MessageSquare, AlertTriangle, ArrowUpRight,
    DollarSign, FileSignature, Layers, Filter, Save, Printer
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

    const [enableAlerts, setEnableAlerts] = useState(true);
    const [alertDaysBefore, setAlertDaysBefore] = useState(5);
    const [alertFrequency, setAlertFrequency] = useState(2);

    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);

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

            if (pendingAction === 'CREATE' || pendingAction === 'EDIT') {
                if (contractPayload.equipmentIds.length === 0) {
                    throw new Error('Selecione pelo menos um equipamento para este contrato.');
                }
            }

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
    const getDefaultDates = () => {
        const dEnd = new Date();
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 2);
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
        <div className="p-4 space-y-4 animate-fade-in flex flex-col h-full bg-slate-50/20 font-poppins">
            <div className="flex justify-between items-center">
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
                    setIsModalOpen(true);
                  }} 
                  className="px-6 py-4 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-[10px] font-bold uppercase shadow-sm transition-all border border-[#1c2d4f] flex items-center gap-2"
                >
                  <Plus size={16} /> Novo Contrato
                </Button>
            </div>

            <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 flex flex-col min-h-0">
                {/* Toolbar de Filtros Unificada */}
                <div className="p-6 border-b border-slate-200 bg-slate-50/30 space-y-4">
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

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-4 h-[42px] rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
                          >
                            <Filter size={14} /> {showFilters ? 'Ocultar Filtros' : 'Filtros'}
                          </button>
                        </div>
                    </div>

                    {showFilters && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex flex-col lg:flex-row gap-4">
                          <div className="flex items-center gap-3 bg-white border border-slate-200 p-1.5 rounded-xl shadow-lg shadow-slate-200/50">
                              <div className="flex items-center gap-2 px-2 border-r border-slate-100">
                                  <Calendar size={16} className="text-[#1c2d4f]" />
                                  <span className="text-[9px] font-bold uppercase text-slate-400">Ciclo</span>
                              </div>
                              <div className="flex items-center gap-2">
                                  <input type="date" value={startDateFilter} onChange={e => handleDateValidation(e.target.value, endDateFilter)} className="bg-slate-50 border-none text-[10px] font-bold uppercase text-slate-600 rounded-lg px-2 py-1 outline-none" />
                                  <span className="text-[10px] font-bold text-slate-300">até</span>
                                  <input type="date" value={endDateFilter} onChange={e => handleDateValidation(startDateFilter, e.target.value)} className="bg-slate-50 border-none text-[10px] font-bold uppercase text-slate-600 rounded-lg px-2 py-1 outline-none" />
                              </div>
                          </div>

                          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-lg shadow-slate-200/50 h-10">
                              <ListFilter size={14} className="text-slate-400 mr-2" />
                              <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                  <option value="ALL">Todos Status</option>
                                  <option value={OrderStatus.PENDING}>Ativo</option>
                                  <option value={OrderStatus.CANCELED}>Inativo</option>
                              </select>
                          </div>
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
                    )}
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full border-separate border-spacing-y-0">
                        <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                            <tr className="border-b border-slate-200">
                                <th className="px-4 py-2">Código / PMOC</th>
                                <th className="px-4 py-2">Cliente</th>
                                <th className="px-4 py-2 font-black uppercase">Mensalidade</th>
                                <th className="px-4 py-2">Dia</th>
                                <th className="px-4 py-2 text-center">Status</th>
                                <th className="px-4 py-2 text-right pr-6">Ações</th>
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
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase ${contract.status === OrderStatus.CANCELED ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
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

            {/* EDIT/CREATE MODAL - STANDARDIZED TO OS STYLE */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-6xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col h-[85vh]">
                        {/* HEADER - Nexus Premium Standard */}
                        <div className="px-10 py-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-[#1c2d4f] rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary-900/20">
                                    <Layers size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                                        {pendingAction === 'EDIT' ? 'Editar Contrato Master' : 'Novo Registro de Contrato'}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{pmocCode}</span>
                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                                        <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest">Protocolo Nexus Line</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <Button
                                    onClick={() => setIsModalOpen(false)}
                                    variant="secondary"
                                    size="sm"
                                    className="h-10 px-6 gap-2 text-slate-500 border-slate-200"
                                >
                                    <X size={16} /> Cancelar
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (selectedEquipIds.length === 0) {
                                            alert("⚠️ Selecione pelo menos um equipamento no 'Dados Técnicos' para prosseguir.");
                                            return;
                                        }
                                        setIsAuditModalOpen(true);
                                    }}
                                    variant="primary"
                                    size="sm"
                                    className={`h-10 px-8 gap-2 bg-[#1c2d4f] hover:bg-[#253a66] shadow-lg shadow-primary-900/20 ${selectedEquipIds.length === 0 ? 'opacity-50 grayscale' : ''}`}
                                >
                                    <Save size={16} /> Salvar Alterações
                                </Button>
                            </div>
                        </div>

                        {/* TABS - Nexus Premium Standard */}
                        <div className="px-10 border-b border-slate-200 bg-white flex gap-8 shrink-0">
                            {[
                                { id: 'technical', label: 'Dados Técnicos', icon: Settings2 },
                                { id: 'commercial', label: 'Comercial & Termos', icon: DollarSign },
                                { id: 'monitoring', label: 'Monitoramento', icon: BellRing }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setModalTab(tab.id as any)}
                                    className={`flex items-center gap-2 py-4 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all
                                        ${modalTab === tab.id ? 'border-[#1c2d4f] text-[#1c2d4f]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    <tab.icon size={14} /> {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* CONTENT AREA */}
                        <div className="flex-1 overflow-y-auto p-10 bg-slate-50/30 custom-scrollbar">
                            {modalTab === 'technical' && (
                                <div className="grid grid-cols-2 gap-10 animate-fade-in">
                                    <div className="space-y-6">
                                        <div className="p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm">
                                            <div className="space-y-6">
                                                <div className="relative">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Cliente Responsável</label>
                                                    
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
                                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] max-h-[250px] overflow-y-auto custom-scrollbar p-2 animate-in fade-in slide-in-from-top-2 duration-200">
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
                                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Título do Contrato</label>
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
                                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Início do Ciclo</label>
                                                        <input 
                                                            type="date" 
                                                            value={startDate} 
                                                            onChange={e => setStartDate(e.target.value)} 
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all" 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Periodicidade</label>
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

                                        <div className="p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-3 block tracking-widest">Dia de Visita Preferencial</label>
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
                                        <div className="p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex-1 flex flex-col min-h-0">
                                            <div className="flex items-center justify-between mb-4">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ativos Vinculados ({selectedEquipIds.length})</label>
                                                <span className="text-[9px] font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded italic">Controle PMOC</span>
                                            </div>
                                            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                {customerEquipments.map(equip => (
                                                    <div 
                                                        key={equip.id} 
                                                        onClick={() => setSelectedEquipIds(prev => prev.includes(equip.id) ? prev.filter(id => id !== equip.id) : [...prev, equip.id])} 
                                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${selectedEquipIds.includes(equip.id) ? 'bg-[#1c2d4f] border-[#1c2d4f] text-white shadow-lg' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                                                    >
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase">{equip.model}</p>
                                                            <p className="text-[8px] font-medium opacity-60">S/N: {equip.serialNumber}</p>
                                                        </div>
                                                        {selectedEquipIds.includes(equip.id) ? <Check size={14} /> : <Plus size={14} className="opacity-20" />}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalTab === 'commercial' && (
                                <div className="space-y-8 animate-fade-in max-w-4xl mx-auto w-full">
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-4 block tracking-widest">Mensalidade do Contrato</label>
                                            <div className="relative">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-lg italic">R$</div>
                                                <input 
                                                    type="text" 
                                                    value={contractValue} 
                                                    onChange={handleValueChange} 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-6 py-5 text-2xl font-black text-emerald-600 italic outline-none focus:ring-2 focus:ring-emerald-50 transition-all shadow-inner" 
                                                    placeholder="0,00" 
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex flex-col justify-center">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-6 block tracking-widest text-center">Visitas Programadas p/ Ciclo</label>
                                            <div className="flex items-center justify-center gap-6">
                                                <button onClick={() => setVisitCount(Math.max(1, visitCount - 1))} className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full border border-slate-200 flex items-center justify-center hover:bg-white hover:text-slate-600 transition-all">-</button>
                                                <span className="text-4xl font-black text-slate-900 font-poppins">{visitCount}</span>
                                                <button onClick={() => setVisitCount(visitCount + 1)} className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full border border-slate-200 flex items-center justify-center hover:bg-white hover:text-slate-600 transition-all">+</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest italic">Peças e Componentes Inclusos?</h4>
                                                <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">Define se o contrato prevê substituição s/ custo</p>
                                            </div>
                                            <div className="flex gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
                                                <button onClick={() => setIncludesParts(true)} className={`px-8 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all ${includesParts ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Sim</button>
                                                <button onClick={() => setIncludesParts(false)} className={`px-8 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all ${!includesParts ? 'bg-white text-[#1c2d4f] border border-slate-200 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Não</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm space-y-4">
                                        <div className="flex items-center gap-3">
                                            <FileSignature className="text-primary-600" size={18} />
                                            <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Termos e Acordos de Redação</label>
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
                                    <div className="p-10 bg-white border border-slate-200 rounded-[2.5rem] shadow-sm space-y-10">
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
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">Gatilho de Antecipação (Dias antes do ciclo)</label>
                                                <div className="grid grid-cols-6 gap-2">
                                                    {[1, 3, 5, 7, 10, 15].map(d => (
                                                        <button key={d} onClick={() => setAlertDaysBefore(d)} className={`py-3 rounded-xl text-[10px] font-bold transition-all ${alertDaysBefore === d ? 'bg-[#1c2d4f] text-white shadow-lg' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-200'}`}>{d} Dias</button>
                                                    ))}
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-4">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">Frequência de Alertas Nexus</label>
                                                <div className="grid grid-cols-6 gap-2">
                                                    {[1, 2, 3, 4, 5, 0].map(f => (
                                                        <button key={f} onClick={() => setAlertFrequency(f)} className={`py-3 rounded-xl text-[10px] font-bold transition-all ${alertFrequency === f ? 'bg-[#1c2d4f] text-white shadow-lg' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-200'}`}>{f === 0 ? 'Off' : `${f}x p/ dia`}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-8 bg-blue-50 border border-blue-100 rounded-[2rem] flex items-center gap-4">
                                        <ShieldAlert className="text-blue-500" size={24} />
                                        <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase">O Nexus monitora o ciclo de faturamento e visitas preventivas automaticamente com base nestas configurações.</p>
                                    </div>
                                </div>
                            )}
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
                    <div className="bg-white rounded-[2.5rem] w-full max-w-6xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col h-[85vh]">
                        {/* HEADER - Nexus Premium Standard (Print Version Compatible) */}
                        <div className="px-10 py-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 print:hidden">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary-900/20">
                                    <Briefcase size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight truncate max-w-md">
                                        {selectedContract.customerName}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{selectedContract.pmocCode || selectedContract.display_id}</span>
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

                        {/* TABS - Synchronized with Create/Edit */}
                        <div className="px-10 border-b border-slate-200 bg-white flex gap-8 shrink-0 print:hidden">
                             {[
                                { id: 'details', label: 'Dados Técnicos', icon: Settings2 },
                                { id: 'terms', label: 'Comercial & Termos', icon: DollarSign },
                                { id: 'history', label: 'Histórico Nexus', icon: History }
                            ].map(tab => (
                                <button 
                                    key={tab.id}
                                    onClick={() => setViewTab(tab.id as any)}
                                    className={`flex items-center gap-2 py-4 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all
                                        ${viewTab === tab.id ? 'border-[#1c2d4f] text-[#1c2d4f]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    <tab.icon size={14} /> {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 p-12 overflow-y-auto custom-scrollbar bg-slate-50/30">
                            {viewTab === 'details' ? (
                                <div className="space-y-10 animate-fade-in">
                                    <div className="grid grid-cols-4 gap-4 print:grid-cols-2">
                                        <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Mensalidade</h5><p className="text-sm font-black text-emerald-600 italic">R$ {selectedContract.contractValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                                        <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Período</h5><p className="text-sm font-black text-primary-600 uppercase italic">{selectedContract.periodicity}</p></div>
                                        <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Visitas/Ciclo</h5><p className="text-sm font-black text-slate-900 uppercase italic">{selectedContract.visitCount || 1} Visita(s)</p></div>
                                        <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm"><h5 className="text-[8px] font-black text-slate-400 uppercase mb-2">Peças Incl.</h5><p className={`text-sm font-black uppercase italic ${selectedContract.includesParts ? 'text-emerald-500' : 'text-red-400'}`}>{selectedContract.includesParts ? 'Sim' : 'Não'}</p></div>
                                    </div>
                                    <div className="space-y-4">
                                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-4"><Box size={14} /> Ativos Vinculados ({selectedContract.equipmentIds?.length})</h5>
                                        <div className="grid grid-cols-2 gap-6 print:grid-cols-1">
                                            {selectedContract.equipmentIds?.map((id: string) => {
                                                const eq = equipments.find(e => e.id === id);
                                                return (
                                                    <div key={id} className="p-6 bg-white rounded-3xl border border-slate-200 flex items-center gap-5 transition-all shadow-sm group">
                                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 group-hover:bg-primary-50 transition-colors">
                                                            <Box size={20} className="text-primary-400" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-black text-slate-900 uppercase italic">{eq?.model}</p>
                                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">S/N: {eq?.serialNumber}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : viewTab === 'terms' ? (
                                <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
                                    <div className="flex items-center gap-4 border-b border-slate-200 pb-8"><FileSignature className="text-primary-600" size={24} /><h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter">Termos e Condições do Acordo</h4></div>
                                    <div className="bg-white p-12 rounded-[4rem] border border-slate-200 shadow-sm">
                                        <div className="bg-slate-50 p-16 rounded-[3rem] shadow-inner min-h-[400px] text-sm text-slate-700 font-medium leading-loose italic">
                                            {selectedContract.contractTerms || 'Nenhum termo adicional registrado para este contrato.'}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-12 animate-fade-in max-w-4xl mx-auto">
                                    <div className="flex items-center gap-4 border-b border-slate-200 pb-8 print:hidden"><History className="text-primary-600" size={24} /><h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter">Timeline de Auditoria Nexus</h4></div>
                                    <div className="relative border-l-2 border-slate-100 ml-6 space-y-12 pb-10">
                                        {(selectedContract.logs || []).slice().reverse().map((log: AuditLog, i: number) => (
                                            <div key={i} className="relative pl-12 animate-fade-in-up">
                                                <div className="absolute -left-[11px] top-1 w-5 h-5 bg-white border-2 border-primary-600 rounded-full flex items-center justify-center shadow-md print:hidden"><div className="w-2 h-2 bg-primary-600 rounded-full" /></div>
                                                <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm transition-all hover:border-primary-200">
                                                    <div className="flex justify-between items-center mb-5"><span className="px-3 py-1 bg-primary-600 text-white text-[9px] font-black uppercase italic rounded-lg tracking-widest">{log.action.replace(/_/g, ' ')}</span><span className="text-[9px] font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-xl">{new Date(log.timestamp).toLocaleString()}</span></div>
                                                    <p className="text-[13px] font-black text-slate-900 leading-snug mb-5 uppercase italic tracking-tighter">{log.details}</p>
                                                    <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner"><p className="text-[8px] font-black text-primary-500 uppercase mb-2 italic">Justificativa Operacional:</p><p className="text-[12px] font-bold text-slate-600 italic leading-relaxed">"{log.reason}"</p></div>
                                                    <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-200"><div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center shadow-sm"><UserIcon size={16} /></div><span className="text-[10px] font-black text-slate-900 uppercase italic tracking-widest">{log.user}</span></div>
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
