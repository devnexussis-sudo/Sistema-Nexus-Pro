import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, Clock,
  MessageCircle, Phone, RefreshCw, Search, User as UserIcon, X, XCircle, Eye, FileText, Package, Edit3, Save, Shield, Cpu, Filter, Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DataService } from '../../services/dataService';
import { CreateOrderModal } from './CreateOrderModal';
import { ServiceOrder, OrderStatus, OrderPriority } from '../../types';
import { Pagination } from '../ui/Pagination';

interface ServiceRequest {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  phone_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_document: string | null;
  equipment_serial: string | null;
  equipment_name: string | null;
  problem_description: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejection_reason?: string | null;
  created_at: string;
  accepted_at: string | null;
  order_id: string | null;
}

// Extended state with triage verification results
interface TriageState {
  customerFound: boolean;
  customerData: {
    id: string;
    name: string;
    document?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
    city?: string;
    number?: string;
  } | null;
  equipmentFound: boolean;
  equipmentData: {
    id: string;
    model: string;
    serial_number: string;
    family_name?: string;
    manufacture_date?: string;
    warranty_months?: number;
    description?: string;
  } | null;
  orderDisplayId: string | null;
  loading: boolean;
}

type FilterType = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'ALL';

const formatPhone = (p: string) => {
  if (!p) return '—';
  const d = p.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return p;
};

const formatDateDisplay = (dateString: string) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const SolicitacoesPage: React.FC = () => {
  const navigate = useNavigate();

  // Open the public OS page in a new tab
  const openOrderPublicPage = async (orderId: string) => {
    // Fetch the public_token from the orders table
    const { data } = await supabase
      .from('orders')
      .select('public_token, id')
      .eq('id', orderId)
      .maybeSingle();
    const token = data?.public_token || data?.id || orderId;
    window.open(`/#/order/view/${token}`, '_blank');
  };

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const getDefaultDates = () => {
    const dEnd = new Date();
    const dStart = new Date();
    dStart.setMonth(dStart.getMonth() - 6);
    return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
  };
  const { start: initStart, end: initEnd } = getDefaultDates();
  const [startDate, setStartDate] = useState(initStart);
  const [endDate, setEndDate] = useState(initEnd);
  const [selectedReq, setSelectedReq] = useState<ServiceRequest | null>(null);
  const [viewingReq, setViewingReq] = useState<ServiceRequest | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editingRejectId, setEditingRejectId] = useState<string | null>(null);
  const [editingRejectReason, setEditingRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [triage, setTriage] = useState<TriageState>({ customerFound: false, customerData: null, equipmentFound: false, equipmentData: null, orderDisplayId: null, loading: false });
  const realtimeRef = useRef<any>(null);

  const fetchRequests = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tid = DataService.getCurrentTenantId();
      if (!tid) return;
      const { data } = await supabase
        .from('whatsapp_service_requests')
        .select('*')
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false });
      if (data) setRequests(data as ServiceRequest[]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();

    const tid = DataService.getCurrentTenantId();
    if (!tid) return;
    realtimeRef.current = supabase
      .channel('whatsapp_service_requests_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_service_requests',
        filter: `tenant_id=eq.${tid}`
      }, () => fetchRequests(true))
      .subscribe();

    return () => {
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    };
  }, [fetchRequests]);

  // When a request is opened for viewing, run triage verification
  useEffect(() => {
    if (!viewingReq) {
      setTriage({ customerFound: false, customerData: null, equipmentFound: false, equipmentData: null, orderDisplayId: null, loading: false });
      return;
    }

    const runTriage = async () => {
      setTriage(prev => ({ ...prev, loading: true }));
      const tid = DataService.getCurrentTenantId();
      if (!tid) return;

      // 1. Check customer — busca dados completos
      let customerFound = !!viewingReq.customer_id;
      let matchedCustomerId = viewingReq.customer_id;
      let customerData: TriageState['customerData'] = null;

      const customerSelect = 'id, name, document, phone, whatsapp, email, address, city, number';

      // Se já tem customer_id direto, busca os dados completos
      if (customerFound && matchedCustomerId) {
        const { data: cDirect } = await supabase
          .from('customers')
          .select(customerSelect)
          .eq('id', matchedCustomerId)
          .maybeSingle();
        if (cDirect) customerData = cDirect as any;
      }

      if (!customerFound) {
        let orQuery = [];
        
        const cleanPhone = viewingReq.phone_number?.replace(/\D/g, '');
        if (cleanPhone) {
          orQuery.push(`phone.ilike.%${cleanPhone}%`, `whatsapp.ilike.%${cleanPhone}%`);
          // Se tiver código do país (ex: 55), tenta buscar sem ele também
          if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
            const localPhone = cleanPhone.substring(2);
            orQuery.push(`phone.ilike.%${localPhone}%`, `whatsapp.ilike.%${localPhone}%`);
          }
        }
        
        const cleanDoc = viewingReq.customer_document?.replace(/\D/g, '');
        if (cleanDoc) {
          orQuery.push(`document.eq.${cleanDoc}`, `document.ilike.%${cleanDoc}%`);
        }

        const cleanName = viewingReq.customer_name?.trim();
        if (cleanName) {
          orQuery.push(`name.ilike.%${cleanName}%`);
        }

        if (orQuery.length > 0) {
          const { data: cData } = await supabase
            .from('customers')
            .select(customerSelect)
            .eq('tenant_id', tid)
            .or(orQuery.join(','))
            .limit(1)
            .maybeSingle();
          
          if (cData) {
            customerFound = true;
            matchedCustomerId = cData.id;
            customerData = cData as any;
          }
        }
      }

      // 2. Check equipment (if any info was provided about it)
      let equipmentFound = true; // default: not required if no equipment info
      let equipmentData: TriageState['equipmentData'] = null;
      if (viewingReq.equipment_serial || viewingReq.equipment_name) {
        equipmentFound = false;
        
        let orFilters = [];
        if (viewingReq.equipment_serial) {
          const s = viewingReq.equipment_serial.trim();
          orFilters.push(`serial_number.ilike.%${s}%`, `serial_number.eq.${s}`);
        }
        if (viewingReq.equipment_name) {
          const n = viewingReq.equipment_name.trim();
          orFilters.push(`name.ilike.%${n}%`, `model.ilike.%${n}%`);
        }

        if (orFilters.length > 0) {
          const equipSelect = 'id, model, serial_number, family_name, manufacture_date, warranty_months, description';
          
          // Primeiro tenta achar o equipamento vinculado ao cliente localizado
          if (matchedCustomerId) {
            const { data: eDataUser } = await supabase
              .from('equipments')
              .select(equipSelect)
              .eq('tenant_id', tid)
              .eq('customer_id', matchedCustomerId)
              .or(orFilters.join(','))
              .limit(1)
              .maybeSingle();
            
            if (eDataUser) { equipmentFound = true; equipmentData = eDataUser as any; }
          }
          
          // Se não achou (ou não tinha cliente), busca globalmente
          if (!equipmentFound) {
            const { data: eDataGlobal } = await supabase
              .from('equipments')
              .select(equipSelect)
              .eq('tenant_id', tid)
              .or(orFilters.join(','))
              .limit(1)
              .maybeSingle();
              
            if (eDataGlobal) { equipmentFound = true; equipmentData = eDataGlobal as any; }
          }
        }
      }

      // 3. Fetch order display_id if order_id exists
      let orderDisplayId: string | null = null;
      if (viewingReq.order_id) {
        const { data: oData } = await supabase
          .from('orders')
          .select('display_id')
          .eq('id', viewingReq.order_id)
          .maybeSingle();
        orderDisplayId = oData?.display_id || viewingReq.order_id;
      }

      setTriage({ customerFound, customerData, equipmentFound, equipmentData, orderDisplayId, loading: false });
    };

    runTriage();
  }, [viewingReq]);

  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [isPageChanging, setIsPageChanging] = useState(false);

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;

  const filtered = requests.filter(r => {
    if (filter !== 'ALL' && r.status !== filter) return false;

    if (startDate || endDate) {
      const rDate = r.created_at.split('T')[0];
      if (startDate && rDate < startDate) return false;
      if (endDate && rDate > endDate) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace('#', '');
      const ticketCode = r.id.substring(0, 6).toLowerCase();
      const cName = r.customer_name ? r.customer_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
      const probDesc = r.problem_description ? r.problem_description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
      const formattedPhone = formatPhone(r.phone_number).toLowerCase();
      const phoneDigits = r.phone_number ? r.phone_number.replace(/\D/g, '') : '';
      const searchDigits = q.replace(/\D/g, '');

      if (
        !(cName.includes(q) ||
          (q.includes('nao identificado') && !r.customer_name) ||
          r.phone_number?.includes(q) ||
          formattedPhone.includes(q) ||
          (searchDigits && phoneDigits.includes(searchDigits)) ||
          r.customer_document?.includes(q) ||
          (searchDigits && r.customer_document?.replace(/\D/g, '').includes(searchDigits)) ||
          r.equipment_serial?.toLowerCase().includes(q) ||
          probDesc.includes(q) ||
          ticketCode.includes(q))
      ) return false;
    }
    return true;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, startDate, endDate]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pagedRequests = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleAccept = (req: ServiceRequest) => {
    setSelectedReq(req);
    setShowCreateModal(true);
  };

  const handleOrderCreated = async (order: ServiceOrder) => {
    if (!selectedReq) return;
    setActionLoading(selectedReq.id);
    try {
      await supabase.from('whatsapp_service_requests').update({
        status: 'ACCEPTED',
        accepted_at: new Date().toISOString(),
        order_id: order.id
      }).eq('id', selectedReq.id);
      setRequests(prev => prev.map(r => r.id === selectedReq.id ? {
        ...r, status: 'ACCEPTED', accepted_at: new Date().toISOString(), order_id: order.id
      } : r));
    } finally {
      setActionLoading(null);
      setSelectedReq(null);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setActionLoading(rejectId);
    try {
      await supabase.from('whatsapp_service_requests').update({
        status: 'REJECTED',
        rejection_reason: rejectReason.trim() || null
      }).eq('id', rejectId);
      setRequests(prev => prev.map(r => r.id === rejectId ? { ...r, status: 'REJECTED', rejection_reason: rejectReason.trim() || null } : r));
    } finally {
      setActionLoading(null);
      setRejectId(null);
      setRejectReason('');
    }
  };

  const handleSaveRejectionReason = async () => {
    if (!editingRejectId) return;
    setActionLoading(editingRejectId);
    try {
      const newReason = editingRejectReason.trim() || null;
      await supabase.from('whatsapp_service_requests').update({
        rejection_reason: newReason
      }).eq('id', editingRejectId);
      
      setRequests(prev => prev.map(r => r.id === editingRejectId ? { ...r, rejection_reason: newReason } : r));
      if (viewingReq && viewingReq.id === editingRejectId) {
        setViewingReq({ ...viewingReq, rejection_reason: newReason });
      }
      setEditingRejectId(null);
    } finally {
      setActionLoading(null);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'PENDING') return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"><Clock size={10} /> Pendente</span>;
    if (status === 'ACCEPTED') return <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"><CheckCircle2 size={10} /> Aceita</span>;
    if (status === 'REJECTED') return <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"><XCircle size={10} /> Rejeitada</span>;
    return null;
  };

  // Determine if this pending request can be accepted (both client and equipment verified)
  const canAccept = (req: ServiceRequest) => {
    if (req.status !== 'PENDING') return false;
    // Only applies to the currently viewed request with triage results
    if (viewingReq?.id === req.id) {
      return triage.customerFound && triage.equipmentFound && !triage.loading;
    }
    // For table row: only check customer_id as quick check
    return !!req.customer_id;
  };


  // Render the blocking requirements section for the detail modal
  const renderTriageBlockers = () => {
    if (viewingReq?.status !== 'PENDING') return null;
    if (triage.loading) return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
        <RefreshCw size={16} className="animate-spin text-slate-400 shrink-0" />
        <span className="text-xs text-slate-500">Verificando cadastros no sistema...</span>
      </div>
    );

    const missingClient = !triage.customerFound;
    const missingEquipment = viewingReq.equipment_serial && !triage.equipmentFound;
    const hasBlockers = missingClient || missingEquipment;

    if (!hasBlockers) return null;

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide">
            Cadastros Obrigatórios Pendentes
          </h4>
        </div>
        <p className="text-xs text-amber-700 leading-relaxed">
          Para aceitar e abrir uma OS, o <strong>cliente</strong> e o <strong>ativo (equipamento)</strong> devem estar previamente cadastrados no sistema.
          Regularize o(s) item(ns) abaixo antes de prosseguir:
        </p>
        <div className="space-y-2">
          {missingClient && (
            <div className="bg-white border border-rose-200 rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <XCircle size={15} className="text-rose-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-rose-700">Cliente não cadastrado</p>
                  <p className="text-[10px] text-rose-500 mt-0.5">
                    {viewingReq.customer_name || 'Nome não informado'} — {formatPhone(viewingReq.phone_number)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => navigate('/admin/customers')}
                  className="text-[10px] font-bold text-white bg-rose-500 hover:bg-rose-600 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1"
                >
                  <UserIcon size={11} /> Cadastrar Cliente
                </button>
                <button
                  onClick={() => { setViewingReq(null); navigate('/admin/whatsapp', { state: { selectedConvId: viewingReq.conversation_id } }); }}
                  className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1 border border-blue-200"
                >
                  <MessageCircle size={11} /> Ver Conversa
                </button>
              </div>
            </div>
          )}
          {missingEquipment && (
            <div className="bg-white border border-orange-200 rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <XCircle size={15} className="text-orange-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-orange-700">Ativo não cadastrado</p>
                  <p className="text-[10px] text-orange-500 mt-0.5">
                    {viewingReq.equipment_name || 'Equipamento não identificado'} — SN: <span className="font-mono">{viewingReq.equipment_serial}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin/equipments')}
                className="text-[10px] font-bold text-white bg-orange-500 hover:bg-orange-600 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap flex items-center gap-1 shrink-0"
              >
                <Package size={11} /> Cadastrar Ativo
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-2 sm:p-4 animate-fade-in flex flex-col h-full bg-slate-50 overflow-hidden">
      
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1c2d4f] flex items-center justify-center shadow-sm">
            <ClipboardCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Solicitações de Atendimento</h1>
            <p className="text-xs text-slate-400 font-medium">Triagem de chamados e solicitações recebidas via WhatsApp</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="relative z-30 mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        <div className="flex flex-col xl:flex-row flex-wrap items-stretch xl:items-center justify-between gap-3">
          
          <div className="relative flex-1 min-w-[240px] xl:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por ticket, cliente, documento, telefone, problema..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end shrink-0">
            <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border transition-all text-[10px] ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 shadow-sm'}`}
            >
                <Filter size={14} /> <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Filtros'}</span>
            </button>

            <button
              onClick={() => fetchRequests()}
              disabled={loading}
              className={`group h-10 px-4 flex items-center gap-2 rounded-xl border transition-all duration-300 shadow-sm active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed ${loading ? 'bg-primary-50 border-primary-200 text-primary-600' : 'bg-white hover:bg-slate-50 border-[#1c2d4f]/20 text-[#1c2d4f] hover:text-primary-600 hover:border-primary-300 hover:shadow-md'}`}
              title="Atualizar dados"
            >
              <div className="relative flex items-center justify-center">
                <RefreshCw size={16} className={`${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Collapsible Filters */}
        {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-white/60 rounded-xl border border-[#1c2d4f]/10 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Date Range */}
                <div className="flex flex-col gap-1 lg:col-span-2">
                    <label className="text-[9px] text-slate-400 uppercase tracking-wider px-1">Período (criação)</label>
                    <div className="flex items-center gap-1 bg-white border border-[#1c2d4f]/20 p-1 rounded-lg shadow-sm h-9">
                        <Calendar size={13} className="text-slate-400 ml-1 shrink-0" />
                        <div className="flex items-center gap-1 px-1 flex-1 justify-between">
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                                className="bg-transparent border-none text-[10px] text-slate-600 outline-none focus:text-slate-900 w-full"
                            />
                            <span className="text-[9px] text-slate-300 uppercase mx-1">até</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
                                className="bg-transparent border-none text-[10px] text-slate-600 outline-none focus:text-slate-900 w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1 lg:col-span-2">
                    <label className="text-[9px] text-slate-400 uppercase tracking-wider px-1">Status</label>
                    <div className="flex bg-white border border-[#1c2d4f]/20 rounded-lg h-9 p-0.5 gap-0.5 shadow-sm">
                        {(['ALL', 'PENDING', 'ACCEPTED', 'REJECTED'] as FilterType[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => { setFilter(opt); setCurrentPage(1); }}
                                className={`flex-1 rounded-md text-[8px] font-medium uppercase tracking-wide transition-all whitespace-nowrap px-1 relative ${filter === opt
                                    ? opt === 'PENDING' ? 'bg-amber-500 text-white shadow-sm'
                                    : opt === 'ACCEPTED' ? 'bg-emerald-500 text-white shadow-sm'
                                    : opt === 'REJECTED' ? 'bg-rose-500 text-white shadow-sm'
                                    : 'bg-[#1c2d4f] text-white shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                    }`}
                            >
                                <div className="flex items-center justify-center gap-1">
                                  {opt === 'ALL' ? 'Todos' : opt === 'PENDING' ? 'Pendentes' : opt === 'ACCEPTED' ? 'Aceitas' : 'Rejeitadas'}
                                  {opt === 'PENDING' && pendingCount > 0 && (
                                     <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${filter === opt ? 'bg-white text-amber-600' : 'bg-amber-400 text-white'}`}>{pendingCount}</span>
                                  )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Table Area */}
      <div className="flex-1 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col relative os-table-container">
        {/* Table View (Desktop) */}
        <div className="hidden md:block overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100/90 backdrop-blur-md sticky top-0 z-20 border-b border-slate-200 shadow-xs font-poppins">
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <th className="px-3 py-2.5 whitespace-nowrap">Ticket</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 whitespace-nowrap">O.S. Atribuída</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Data / Hora</th>
                <th className="px-3 py-2.5 min-w-[140px]">Cliente</th>
                <th className="px-3 py-2.5 min-w-[120px]">Equipamento</th>
                <th className="px-3 py-2.5 min-w-[180px]">Problema Relatado</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody key={currentPage} className="divide-y divide-slate-100 animate-fade-in duration-200">
              {loading || isPageChanging ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <RefreshCw size={24} className="animate-spin text-primary-400 mx-auto mb-2" />
                    <span className="text-xs font-medium uppercase tracking-widest text-slate-400">Carregando solicitações...</span>
                  </td>
                </tr>
              ) : pagedRequests.length > 0 ? pagedRequests.map(req => {
                const isPending = req.status === 'PENDING';
                const isActing = actionLoading === req.id;
                return (
                  <tr 
                    key={req.id} 
                    onClick={() => setViewingReq(req)}
                    className={`transition-all border-b border-slate-100 hover:border-slate-200 group cursor-pointer ${isPending ? 'bg-amber-50/30' : 'bg-white hover:bg-slate-50'}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] font-mono text-slate-700 font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded" title="Número do Ticket gerado pelo Bot">
                        #{req.id.substring(0, 6).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {req.order_id ? (
                        <OSNumberCell orderId={req.order_id} tenantId={req.tenant_id} />
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600 font-medium whitespace-nowrap">
                      {formatDateDisplay(req.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800" title={req.customer_name || 'Não identificado'}>
                          {req.customer_name || <span className="text-slate-400 font-normal italic">Não identificado</span>}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{formatPhone(req.phone_number)}</span>
                          {req.customer_document && <span className="text-[9px] text-slate-500 font-mono bg-slate-100 px-1 py-0.5 rounded">{req.customer_document}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-slate-700">{req.equipment_name || '—'}</span>
                        {req.equipment_serial && <span className="text-[9px] text-slate-400 font-mono">SN: {req.equipment_serial}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed" title={req.problem_description}>{req.problem_description}</p>
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {isPending ? (
                        <div className="flex items-center justify-center gap-1 transition-opacity opacity-90 group-hover:opacity-100">
                          <button
                            onClick={() => navigate('/admin/whatsapp', { state: { selectedConvId: req.conversation_id } })}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-colors"
                            title="Abrir Conversa no WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </button>
                          
                          <button
                            onClick={() => setViewingReq(req)}
                            className="px-2 py-1 flex items-center gap-1 text-amber-700 bg-amber-50 rounded-lg border border-amber-200 text-[10px] font-bold uppercase hover:bg-amber-100 transition-colors"
                            title="Triar e Verificar Cadastros"
                          >
                            <AlertTriangle size={13} className="text-amber-500" /> Triagem
                          </button>
                          
                          <button
                            onClick={(e) => { e.stopPropagation(); setRejectId(req.id); setRejectReason(''); }}
                            disabled={isActing}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition-colors"
                            title="Rejeitar Solicitação"
                          >
                            <XCircle size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate('/admin/whatsapp', { state: { selectedConvId: req.conversation_id } }); }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Abrir Conversa no WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingReq(req); }}
                            className="p-1.5 text-slate-400 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Ver Detalhes"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} className="py-32 text-center bg-slate-50/30">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-lg shadow-slate-200/50">
                      <Search size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-500 uppercase tracking-widest">Nenhuma solicitação localizada</p>
                    <p className="text-xs text-slate-400 mt-1">Ajuste os filtros para encontrar o que procura</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (PWA) */}
        <div className="md:hidden flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-2.5 space-y-2.5 pb-28">
          {loading || isPageChanging ? (
            <div className="py-16 text-center">
              <RefreshCw size={24} className="animate-spin text-primary-400 mx-auto mb-2" />
              <span className="text-xs font-medium uppercase tracking-widest text-slate-400">Carregando solicitações...</span>
            </div>
          ) : pagedRequests.length > 0 ? (
            pagedRequests.map(req => {
              const isPending = req.status === 'PENDING';
              const isActing = actionLoading === req.id;
              return (
                <div
                  key={req.id}
                  onClick={() => setViewingReq(req)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 shadow-sm active:scale-[0.99] ${
                    isPending ? 'bg-amber-50/40 border-amber-200/80' : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Card Header: Ticket + Status */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-800 font-bold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                        #{req.id.substring(0, 6).toUpperCase()}
                      </span>
                      {req.order_id && <OSNumberCell orderId={req.order_id} tenantId={req.tenant_id} />}
                    </div>
                    <StatusBadge status={req.status} />
                  </div>

                  {/* Customer Info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {req.customer_name || <span className="text-slate-400 font-normal italic">Cliente não identificado</span>}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-mono">{formatPhone(req.phone_number)}</span>
                        {req.customer_document && (
                          <span className="font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-semibold">{req.customer_document}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">{formatDateDisplay(req.created_at)}</span>
                  </div>

                  {/* Equipment Info if exists */}
                  {(req.equipment_name || req.equipment_serial) && (
                    <div className="p-2 bg-slate-100/60 rounded-xl flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700 truncate">{req.equipment_name || 'Equipamento'}</span>
                      {req.equipment_serial && <span className="font-mono text-[9px] text-slate-400 shrink-0">SN: {req.equipment_serial}</span>}
                    </div>
                  )}

                  {/* Problem Description */}
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-white/70 p-2 rounded-xl border border-slate-100">
                    {req.problem_description}
                  </p>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => navigate('/admin/whatsapp', { state: { selectedConvId: req.conversation_id } })}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-[10px] font-bold flex items-center gap-1.5 border border-blue-200"
                    >
                      <MessageCircle size={13} /> Chat WhatsApp
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isPending ? (
                        <>
                          <button
                            onClick={() => setViewingReq(req)}
                            className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95"
                          >
                            <AlertTriangle size={12} /> Triagem
                          </button>
                          <button
                            onClick={() => { setRejectId(req.id); setRejectReason(''); }}
                            disabled={isActing}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl border border-rose-200"
                            title="Rejeitar"
                          >
                            <XCircle size={15} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setViewingReq(req)}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-[10px] font-bold flex items-center gap-1"
                        >
                          <Eye size={13} /> Detalhes
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
              <Search size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Nenhuma solicitação</p>
              <p className="text-[11px] text-slate-400 mt-1">Ajuste os filtros de busca</p>
            </div>
          )}
        </div>

        {/* Paginação Padrão do Sistema */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          itemsPerPage={PAGE_SIZE}
          onPageChange={(page) => {
            setIsPageChanging(true);
            setCurrentPage(page);
            setTimeout(() => {
              setIsPageChanging(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 200);
          }}
        />
      </div>

      {/* Reject Modal */}
      {rejectId && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <XCircle size={20} className="text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Rejeitar Solicitação</h3>
                <p className="text-xs text-slate-400">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-bold text-slate-500 block mb-1.5">Motivo (opcional)</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Ex: Fora da área de atendimento..."
                rows={3}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400 transition-all resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectId}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-all"
              >
                {actionLoading === rejectId ? <RefreshCw size={13} className="animate-spin" /> : <XCircle size={13} />} Confirmar Rejeição
              </button>
              <button
                onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="px-5 py-2.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CreateOrderModal */}
      {showCreateModal && selectedReq && (
        <CreateOrderModal
          onClose={() => { setShowCreateModal(false); setSelectedReq(null); }}
          onSubmit={async (order) => {
            const result = await DataService.createOrder(order as any);
            await handleOrderCreated(result as ServiceOrder);
            return result;
          }}
          prefill={{
            customerId: selectedReq.customer_id || triage.customerData?.id || undefined,
            customerName: selectedReq.customer_name || triage.customerData?.name || undefined,
            customerDocument: selectedReq.customer_document || triage.customerData?.document || undefined,
            equipmentSerial: selectedReq.equipment_serial || triage.equipmentData?.serial_number || undefined,
            equipmentName: selectedReq.equipment_name || triage.equipmentData?.model || undefined,
            description: selectedReq.problem_description || undefined,
          }}
        />
      )}

      {/* Detail Modal */}
      {viewingReq && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
          <div className="bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200">
            {/* HEADER */}
            <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 transition-colors bg-white">
              <div className="flex items-start sm:items-center gap-2 sm:gap-4 min-w-0 flex-1">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border transition-colors shrink-0 bg-slate-50 border-slate-200 text-slate-400">
                  <ClipboardCheck size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins truncate">
                      Ticket #{viewingReq.id.substring(0,6).toUpperCase()} — {formatDateDisplay(viewingReq.created_at)}
                    </h2>
                    <StatusBadge status={viewingReq.status} />
                    {viewingReq.status === 'ACCEPTED' && triage.orderDisplayId && (
                      <span className="text-[10px] font-bold font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                        {triage.orderDisplayId}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                    Triagem via WhatsApp
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <button
                  onClick={() => setViewingReq(null)}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 custom-scrollbar space-y-6">
              
              {/* Quick Actions Bar */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setViewingReq(null);
                    navigate('/admin/whatsapp', { state: { selectedConvId: viewingReq.conversation_id } });
                  }}
                  className="px-4 py-2 flex items-center gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-all text-xs font-bold shadow-sm"
                >
                  <MessageCircle size={16} /> Ir para Conversa (WhatsApp)
                </button>
                {viewingReq.status === 'ACCEPTED' && viewingReq.order_id && (
                  <button
                    onClick={() => {
                      const oid = viewingReq.order_id!;
                      setViewingReq(null);
                      openOrderPublicPage(oid);
                    }}
                    className="px-4 py-2 flex items-center gap-2 text-primary-600 bg-primary-50 hover:bg-primary-600 hover:text-white rounded-lg border border-primary-200 hover:border-primary-600 transition-all text-xs font-bold shadow-sm"
                  >
                    <Eye size={16} /> Ver OS {triage.orderDisplayId || ''}
                  </button>
                )}
              </div>

              {/* Triage Blockers — shown for PENDING requests with missing registrations */}
              {renderTriageBlockers()}

              {/* Rejection Reason (if rejected) */}
              {viewingReq.status === 'REJECTED' && (
                <div className="bg-rose-50 p-5 rounded-xl border border-rose-200 shadow-sm">
                  <h3 className="text-xs font-bold text-rose-900 mb-2 flex items-center justify-between uppercase tracking-wide">
                    <span className="flex items-center gap-2"><XCircle size={14} className="text-rose-500" /> Motivo da Rejeição</span>
                    {!editingRejectId && (
                      <button 
                        onClick={() => { setEditingRejectId(viewingReq.id); setEditingRejectReason(viewingReq.rejection_reason || ''); }}
                        className="text-rose-600 hover:bg-rose-100 p-1.5 rounded transition-colors"
                        title="Editar ou Adicionar Motivo"
                      >
                        <Edit3 size={14} />
                      </button>
                    )}
                  </h3>
                  
                  {editingRejectId === viewingReq.id ? (
                    <div className="mt-3 animate-in fade-in">
                      <textarea
                        value={editingRejectReason}
                        onChange={e => setEditingRejectReason(e.target.value)}
                        placeholder="Descreva o motivo pelo qual esta solicitação foi rejeitada..."
                        rows={3}
                        className="w-full px-3 py-2.5 bg-white border border-rose-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400 transition-all resize-none mb-3"
                      />
                      <div className="flex gap-2 justify-end">
                        <button 
                          onClick={() => setEditingRejectId(null)} 
                          className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-rose-100 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={handleSaveRejectionReason}
                          disabled={actionLoading === viewingReq.id}
                          className="px-4 py-2 text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors shadow-sm"
                        >
                          {actionLoading === viewingReq.id ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} 
                          Salvar Motivo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-rose-800">
                      {viewingReq.rejection_reason || <span className="italic text-rose-500/70">Nenhum motivo registrado. Clique no ícone de lápis acima para gravar um motivo.</span>}
                    </p>
                  )}
                </div>
              )}

              {/* Client Info */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <UserIcon size={14} className="text-slate-400" /> Informações do Cliente
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nome Informado pelo Cliente</label>
                    <div className="text-sm font-semibold text-slate-800">{viewingReq.customer_name || <span className="italic text-slate-400">Não identificado</span>}</div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Telefone (WhatsApp)</label>
                    <div className="text-sm font-semibold text-slate-800">{formatPhone(viewingReq.phone_number)}</div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Documento (CPF/CNPJ)</label>
                    <div className="text-sm font-semibold text-slate-800">{viewingReq.customer_document || '—'}</div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Vínculo no Sistema</label>
                    <div className="text-sm font-semibold text-slate-800">
                      {triage.loading ? (
                        <span className="text-slate-400 text-xs flex items-center gap-1.5"><RefreshCw size={12} className="animate-spin" /> Verificando...</span>
                      ) : triage.customerFound ? (
                        <span className="text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs border border-emerald-200 flex items-center gap-2 w-fit font-bold shadow-sm">
                          <CheckCircle2 size={16} /> Cliente Localizado (OK)
                        </span>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <span className="text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg text-xs border border-rose-200 flex items-center gap-2 w-fit font-bold shadow-sm">
                            <XCircle size={16} /> Cliente Não Localizado no Sistema
                          </span>
                          <button
                            onClick={() => {
                              setViewingReq(null);
                              navigate('/admin/whatsapp', { state: { selectedConvId: viewingReq.conversation_id } });
                            }}
                            className="text-xs text-blue-600 font-bold hover:underline self-start flex items-center gap-1.5"
                          >
                            Pedir dados no Chat para cadastrar <MessageCircle size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ficha do Cliente Localizado no Sistema */}
                {triage.customerData && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 animate-in fade-in">
                    <h4 className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <UserIcon size={12} /> Ficha do Cliente (Dados Cadastrais do Sistema)
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-blue-700/70 uppercase tracking-wider block mb-0.5">Nome Cadastrado</label>
                        <div className="text-xs font-bold text-blue-900">{triage.customerData.name || '—'}</div>
                      </div>
                      {triage.customerData.document && (
                        <div>
                          <label className="text-[9px] font-bold text-blue-700/70 uppercase tracking-wider block mb-0.5">Documento (CPF/CNPJ)</label>
                          <div className="text-xs font-bold text-blue-900 font-mono">{triage.customerData.document}</div>
                        </div>
                      )}
                      {(triage.customerData.phone || triage.customerData.whatsapp) && (
                        <div>
                          <label className="text-[9px] font-bold text-blue-700/70 uppercase tracking-wider block mb-0.5">Telefone Cadastrado</label>
                          <div className="text-xs font-bold text-blue-900">{formatPhone(triage.customerData.phone || triage.customerData.whatsapp || '')}</div>
                        </div>
                      )}
                      {triage.customerData.email && (
                        <div>
                          <label className="text-[9px] font-bold text-blue-700/70 uppercase tracking-wider block mb-0.5">E-mail</label>
                          <div className="text-xs font-bold text-blue-900 truncate">{triage.customerData.email}</div>
                        </div>
                      )}
                      {triage.customerData.address && (
                        <div className="col-span-full">
                          <label className="text-[9px] font-bold text-blue-700/70 uppercase tracking-wider block mb-0.5">Endereço</label>
                          <div className="text-xs text-blue-900">
                            {triage.customerData.address}{triage.customerData.number ? `, ${triage.customerData.number}` : ''}{triage.customerData.city ? ` — ${triage.customerData.city}` : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Problem Info */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <ClipboardCheck size={14} className="text-slate-400" /> Detalhes do Chamado
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Equipamento Informado pelo Cliente</label>
                      <div className="text-sm font-semibold text-slate-800">{viewingReq.equipment_name || '—'}</div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nº de Série Informado</label>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 inline-block">{viewingReq.equipment_serial || '—'}</div>
                        {viewingReq.equipment_serial && !triage.loading && (
                          triage.equipmentFound ? (
                            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-200 flex items-center gap-1 font-bold">
                              <CheckCircle2 size={11} /> Ativo Localizado
                            </span>
                          ) : (
                            <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded text-[10px] border border-orange-200 flex items-center gap-1 font-bold">
                              <XCircle size={11} /> Ativo Não Cadastrado
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dados do Equipamento Localizado no Sistema */}
                  {triage.equipmentData && (
                    <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 animate-in fade-in">
                      <h4 className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Cpu size={12} /> Ficha Técnica do Ativo (Dados do Sistema)
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-emerald-700/70 uppercase tracking-wider block mb-0.5">Modelo Cadastrado</label>
                          <div className="text-xs font-bold text-emerald-900">{triage.equipmentData.model || '—'}</div>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-emerald-700/70 uppercase tracking-wider block mb-0.5">Nº de Série (Sistema)</label>
                          <div className="text-xs font-bold text-emerald-900 font-mono">{triage.equipmentData.serial_number || '—'}</div>
                        </div>
                        {triage.equipmentData.family_name && (
                          <div>
                            <label className="text-[9px] font-bold text-emerald-700/70 uppercase tracking-wider block mb-0.5">Família</label>
                            <div className="text-xs font-bold text-emerald-900">{triage.equipmentData.family_name}</div>
                          </div>
                        )}
                        {triage.equipmentData.manufacture_date && (
                          <div>
                            <label className="text-[9px] font-bold text-emerald-700/70 uppercase tracking-wider block mb-0.5">Data de Fabricação</label>
                            <div className="text-xs font-bold text-emerald-900">
                              {new Date(triage.equipmentData.manufacture_date).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="text-[9px] font-bold text-emerald-700/70 uppercase tracking-wider block mb-0.5">Garantia</label>
                          <div className="flex items-center gap-1.5">
                            {(() => {
                              if (triage.equipmentData!.warranty_months == null) {
                                return (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 bg-slate-100 text-slate-500 border-slate-200">
                                    <Shield size={10} /> Sem informações de garantia
                                  </span>
                                );
                              }
                              if (!triage.equipmentData!.manufacture_date) {
                                return (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 bg-slate-100 text-slate-500 border-slate-200">
                                    <Shield size={10} /> {triage.equipmentData!.warranty_months} meses (sem data de fabricação)
                                  </span>
                                );
                              }
                              const expiry = new Date(triage.equipmentData!.manufacture_date);
                              expiry.setMonth(expiry.getMonth() + triage.equipmentData!.warranty_months);
                              const inWarranty = expiry >= new Date();
                              return (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${inWarranty ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                                  <Shield size={10} />
                                  {inWarranty
                                    ? `Em Garantia (até ${expiry.toLocaleDateString('pt-BR')})`
                                    : `Fora de Garantia (venceu ${expiry.toLocaleDateString('pt-BR')})`}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        {triage.equipmentData.description && (
                          <div className="col-span-full">
                            <label className="text-[9px] font-bold text-emerald-700/70 uppercase tracking-wider block mb-0.5">Observações</label>
                            <div className="text-xs text-emerald-900">{triage.equipmentData.description}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Descrição do Problema (Transcrição)</label>
                    <div className="text-sm font-medium text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap leading-relaxed shadow-inner">
                      {viewingReq.problem_description}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer (Actions for PENDING) */}
            {viewingReq.status === 'PENDING' && (
              <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => { setRejectId(viewingReq.id); setRejectReason(''); setViewingReq(null); }}
                  className="px-5 py-2.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2"
                >
                  <XCircle size={16} /> Rejeitar
                </button>
                {triage.loading ? (
                  <div className="px-5 py-2.5 text-slate-500 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold uppercase flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Verificando...
                  </div>
                ) : triage.customerFound && triage.equipmentFound ? (
                  <button
                    onClick={() => { setViewingReq(null); handleAccept(viewingReq); }}
                    className="px-6 py-2.5 text-white bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 rounded-xl shadow-md shadow-emerald-500/20 text-xs font-bold uppercase transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} /> Aceitar e Abrir OS
                  </button>
                ) : (
                  <div className="px-5 py-2.5 text-slate-500 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold uppercase flex items-center gap-2 cursor-not-allowed opacity-80" title="Regularize os cadastros pendentes acima antes de aceitar.">
                    <AlertTriangle size={16} className="text-amber-500" /> Regularize os Cadastros
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      , document.body)}
    </div>
  );
};

// Sub-component to async-fetch display_id from orders table
const OSNumberCell: React.FC<{ orderId: string; tenantId: string }> = ({ orderId, tenantId }) => {
  const [displayId, setDisplayId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('orders')
      .select('display_id')
      .eq('id', orderId)
      .maybeSingle()
      .then(({ data }) => setDisplayId(data?.display_id || orderId));
  }, [orderId]);

  if (!displayId) return <RefreshCw size={12} className="animate-spin text-slate-300" />;

  return (
    <span className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
      {displayId}
    </span>
  );
};
