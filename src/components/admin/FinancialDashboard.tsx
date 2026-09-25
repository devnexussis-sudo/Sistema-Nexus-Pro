import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { flushSync, createPortal } from 'react-dom';
import { ServiceOrder, OrderStatus, User, Quote, Customer } from '../../types';
import type { DbTenant } from '../../types/database';
import {
    Search, X, XCircle, Trash2, DollarSign, Calendar, Users, Tag,
    CreditCard, ArrowRight, CheckCircle2, FileText, Printer, ShieldCheck, MapPin,
    Layout as Layer, Info, UserCheck, Wallet, Smartphone, Layers, Wrench, Check, ArrowUpRight,
    TrendingUp, Clock, FileSpreadsheet, ChevronRight, ChevronDown, Plus, Slash, ArrowUp, ArrowDown, ArrowUpDown, Filter, Loader2, Share2, Copy, Hexagon, Paperclip, Image as ImageIcon, RefreshCw, Eye, Receipt, AlertTriangle, Calculator, Download, Edit2, Mail, ExternalLink
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { NexusBranding } from '../ui/NexusBranding';
import { DataService } from '../../services/dataService';
import { StorageService } from '../../services/storageService';
import XLSX from 'xlsx-js-style';
import { NexusQueryClient } from '../../hooks/nexusHooks';
import { usePermissions } from '../../hooks/usePermissions';
import { PaymentAuditModal } from './PaymentAuditModal';
import { supabase } from '../../lib/supabase';
import { PaymentService } from '../../services/paymentService';
import { AccountsPayableTab } from './AccountsPayableTab';
import { CashFlowTab } from './CashFlowTab';
import { CommissionsTab } from './CommissionsTab';
import { InvoiceReceiptTemplate } from './InvoiceReceiptTemplate';
import { formatInvoiceDisplayId } from '../../utils/invoiceUtils';

const formatAsaasDateTime = (dateVal: any): string => {
    if (!dateVal) return '';
    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    }
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(str) && !str.includes('Z') && !str.includes('+')) {
        const cleanStr = str.replace(' ', 'T');
        const [datePart, timePart] = cleanStr.split('T');
        const [y, m, d] = datePart.split('-');
        const timeSub = timePart.substring(0, 5);
        return `${d}/${m}/${y} às ${timeSub}`;
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
            const y = parsed.getUTCFullYear();
            const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
            const d = String(parsed.getUTCDate()).padStart(2, '0');
            return `${d}/${m}/${y}`;
        }
        return parsed.toLocaleString('pt-BR');
    }
    return str;
};

interface FinancialDashboardProps {
    orders: ServiceOrder[];
    quotes: Quote[];
    techs: User[];
    customers?: Customer[];
    tenant?: DbTenant | null;
    currentUser?: any;
    onRefresh: () => Promise<void>;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ orders, quotes, techs, customers = [], tenant, currentUser, onRefresh }) => {
  const { t } = useI18n();
  const { showAlert } = useDialog();
  const { can } = usePermissions();

    const printRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [mainTab, setMainTab] = useState<'RECEIVABLES' | 'PAYABLES' | 'CASH_FLOW' | 'COMMISSIONS'>('RECEIVABLES');

    const getDefaultDates = () => {
        const dEnd = new Date();
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 6);
        return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
    };
    const { start: initStart, end: initEnd } = getDefaultDates();
    const [startDate, setStartDate] = useState(initStart);
    const [endDate, setEndDate] = useState(initEnd);

    const handleDateValidation = (start: string, end: string) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if ((d2.getTime() - d1.getTime()) > 31622400000) { // 366 dias
                showAlert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada.', 'warning');
                setStartDate(start);
                setEndDate(new Date(d1.getTime() + 31536000000).toISOString().split('T')[0]);
                setCurrentPage(1);
                return;
            }
        }
        setStartDate(start);
        setEndDate(end);
        setCurrentPage(1);
    };
    const [techFilter, setTechFilter] = useState('ALL');
    const [isTechDropdownOpen, setIsTechDropdownOpen] = useState(false);
    const [techSearchQuery, setTechSearchQuery] = useState('');
    const techDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (techDropdownRef.current && !techDropdownRef.current.contains(event.target as Node)) {
                setIsTechDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [dateFilterType, setDateFilterType] = useState<'createdAt' | 'paidAt' | 'dueDate'>('dueDate');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Faturas específicas states
    const [invSearchTerm, setInvSearchTerm] = useState('');
    const [invStartDate, setInvStartDate] = useState(initStart);
    const [invEndDate, setInvEndDate] = useState(initEnd);
    const [invStatusFilter, setInvStatusFilter] = useState('ALL');
    const [invDateFilterType, setInvDateFilterType] = useState<'createdAt' | 'paidAt' | 'dueDate'>('createdAt');

    const handleInvDateValidation = (start: string, end: string) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if (d2 < d1) return;
            const diffTime = Math.abs(d2.getTime() - d1.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 365) {
                showAlert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada.', 'warning');
                setInvStartDate(start);
                setInvEndDate(new Date(d1.getTime() + 31536000000).toISOString().split('T')[0]);
                setCurrentInvoicePage(1);
                return;
            }
        }
        setInvStartDate(start);
        setInvEndDate(end);
        setCurrentInvoicePage(1);
    };
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [detailTab, setDetailTab] = useState<'overview' | 'financial' | 'linked' | 'attachments'>('overview');
    const [printWithAttachment, setPrintWithAttachment] = useState(false);
    const [showAttachmentConfirmModal, setShowAttachmentConfirmModal] = useState(false);
    const [pendingPrintItem, setPendingPrintItem] = useState<any | null>(null);

    // Form de Baixa
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [printItem, setPrintItem] = useState<any | null>(null);

    // Modal Mercado Pago
    const [isAsaasModalOpen, setIsAsaasModalOpen] = useState(false);
    const [asaasModalItem, setAsaasModalItem] = useState<any | null>(null);

    // Modal de Detalhes da Fatura (Faturas Geradas)
    const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
    const [isInvoiceDetailModalOpen, setIsInvoiceDetailModalOpen] = useState(false);
    const [isEditingInvoiceValues, setIsEditingInvoiceValues] = useState(false);
    const [editInvoiceDiscount, setEditInvoiceDiscount] = useState(0);
    const [editInvoiceShipping, setEditInvoiceShipping] = useState(0);
    const [editInvoiceAdditions, setEditInvoiceAdditions] = useState(0);

    // Parcelas da Fatura
    const [invoiceDetailTab, setInvoiceDetailTab] = useState<'GERAL' | 'PARCELAS' | 'AUDITORIA'>('GERAL');
    const [invoiceInstallmentsList, setInvoiceInstallmentsList] = useState<any[]>([]);
    const [generatingInstallments, setGeneratingInstallments] = useState(false);
    const [installmentCount, setInstallmentCount] = useState(4);
    const [installmentInterval, setInstallmentInterval] = useState(30);
    const [syncingInstallmentId, setSyncingInstallmentId] = useState<string | null>(null);
    const [isSyncingAllInstallments, setIsSyncingAllInstallments] = useState(false);

    const translateStatusToPT = (s: string) => {
        if (!s) return 'Pendente';
        const map: Record<string, string> = {
            'PAID': 'Pago /\nLiquidado',
            'RECEIVED': 'Recebido /\nPago',
            'CONFIRMED': 'Confirmado /\nPago',
            'ANTICIPATED': 'Antecipado /\nLiquidado',
            'RECEIVED_IN_CASH': 'Recebido em\nDinheiro',
            'AUTHORIZED': 'Autorizado',
            'PENDING': 'Pendente',
            'BILLED': 'Faturado',
            'FATURADO': 'Faturado',
            'OVERDUE': 'Vencido /\nAtrasado',
            'CANCELED': 'Cancelado',
            'REFUNDED': 'Reembolsado',
            'DELETED': 'Excluído',
            'REFUND_REQUESTED': 'Reembolso\nSolicitado',
            'CHARGEBACK_REQUESTED': 'Estorno\nSolicitado',
            'CHARGEBACK_DISPUTE': 'Em Disputa',
            'AWAITING_CHARGEBACK_REVERSAL': 'Aguardando\nReversão',
            'DUNNING_REQUESTED': 'Recuperação\nSolicitada',
            'DUNNING_RECEIVED': 'Recuperação\nRecebida',
            'AWAITING_RISK_ANALYSIS': 'Em Análise\nde Risco'
        };
        return map[s.toUpperCase()] || s;
    };

    const getStatusStyle = (status: string, gatewayStatus?: string) => {
        const s = (status || '').toUpperCase();
        const gs = (gatewayStatus || '').toLowerCase();
        
        if (s === 'PAID' || s === 'RECEIVED' || s === 'CONFIRMED' || gs === 'approved') {
            return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
        }
        if (s === 'CANCELED' || s === 'REFUNDED' || s === 'CHARGEBACK_REQUESTED' || s === 'CHARGEBACK_DISPUTE' || s === 'DELETED') {
            return { bg: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-400' };
        }
        if (s === 'OVERDUE') {
            return { bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500 animate-pulse' };
        }
        if (s === 'BILLED' || s === 'FATURADO') {
            return { bg: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' };
        }
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500 animate-pulse' };
    };

    // Verifica se Mercado Pago está conectado (bloqueia botão se não estiver)
    const [isMpConnected, setIsMpConnected] = useState<boolean | null>(null);
    const [mpTooltipId, setMpTooltipId] = useState<string | null>(null);

    // Cancelar Fatura
    const [cancelInvoiceModal, setCancelInvoiceModal] = useState<{ isOpen: boolean; invoice: any | null }>({ isOpen: false, invoice: null });
    
    // Status Mercado Pago Check
    const [checkingInvoiceId, setCheckingInvoiceId] = useState<string | null>(null);

    // NFS-e (Nota Fiscal de Serviço) states
    const [emittingNfseId, setEmittingNfseId] = useState<string | null>(null);
    const [nfseDataMap, setNfseDataMap] = useState<Record<string, { status: string; pdfUrl?: string; xmlUrl?: string; number?: string; asaas_nfse_id?: string; error_message?: string }>>({});
    const [nfseDetailModal, setNfseDetailModal] = useState<{ isOpen: boolean; invoiceId: string | null; data: any | null }>({ isOpen: false, invoiceId: null, data: null });

    useEffect(() => {
        const checkMpConnection = async () => {
            try {
                const settings = await PaymentService.getAsaasSettings();
                setIsMpConnected(settings?.isActive === true);
            } catch {
                setIsMpConnected(false);
            }
        };
        checkMpConnection();
    }, []);

    // Modal de Auditoria do Gateway
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [auditModalItem, setAuditModalItem] = useState<any | null>(null);

    const [paymentMethod, setPaymentMethod] = useState('');
    const [boletoDueDate, setBoletoDueDate] = useState<string>('');
    const [installments, setInstallments] = useState(2);
    const [billingNotes, setBillingNotes] = useState('');
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [billingDiscount, setBillingDiscount] = useState(0);
    const [billingDiscountType, setBillingDiscountType] = useState<'fixed' | 'percent'>('fixed');
    const [billingShipping, setBillingShipping] = useState(0);
    const [billingOtherAdditions, setBillingOtherAdditions] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [editingDueDate, setEditingDueDate] = useState<string>('');

    const [optimisticDates, setOptimisticDates] = useState<Record<string, string>>({});

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    const tenantIdStr = tenant?.id || '';
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [spinningInvoiceId, setSpinningInvoiceId] = useState<string | null>(null);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [receivablesView, setReceivablesView] = useState<'items' | 'invoices'>('items');

    const loadInvoices = async () => {
        if (!tenantIdStr) return;
        try {
            const { data: inv } = await supabase.from('invoices').select('*').eq('tenant_id', tenantIdStr).order('created_at', { ascending: false });
            if (inv) setInvoices(inv);
            
            const { data: itms } = await supabase.from('invoice_items').select('*').eq('tenant_id', tenantIdStr);
            if (itms) setInvoiceItems(itms);

            const { data: usersData } = await supabase.from('users').select('id, name');
            if (usersData) setAllUsers(usersData);

            // Load NFS-e data
            try {
                const { data: nfseRecords } = await supabase
                    .from('invoice_nfse')
                    .select('invoice_id, status, nfse_number, pdf_url, xml_url, asaas_nfse_id, error_message')
                    .eq('tenant_id', tenantIdStr);
                if (nfseRecords && nfseRecords.length > 0) {
                    const map: Record<string, any> = {};
                    nfseRecords.forEach((rec: any) => {
                        map[rec.invoice_id] = {
                            status: rec.status,
                            pdfUrl: rec.pdf_url,
                            xmlUrl: rec.xml_url,
                            number: rec.nfse_number,
                            asaas_nfse_id: rec.asaas_nfse_id,
                            error_message: rec.error_message
                        };
                    });
                    setNfseDataMap(map);
                }
            } catch (nfseErr) {
                // Table may not exist yet — silently ignore
                console.warn('[NFS-e] Erro ao carregar dados de NFS-e (tabela pode não existir ainda):', nfseErr);
            }
        } catch (e) {
            console.error('Error loading invoices or users', e);
        }
    };

    const resolveUserOrTechName = (userIdOrId?: string, explicitName?: string): string => {
        if (userIdOrId) {
            const tech = techs.find(t => t.id === userIdOrId || t.name?.toLowerCase() === userIdOrId.toLowerCase());
            if (tech?.name && !['administrador', 'admin'].includes(tech.name.trim().toLowerCase())) {
                return tech.name;
            }

            const u = allUsers.find(u => u.id === userIdOrId || u.email === userIdOrId);
            if (u) {
                const uName = u.name || (u as any).full_name;
                if (uName && !['administrador', 'admin'].includes(uName.trim().toLowerCase())) {
                    return uName;
                }
                if (u.email) {
                    const prefix = u.email.split('@')[0];
                    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
                }
            }

            if (currentUser && (currentUser.id === userIdOrId || currentUser.email === userIdOrId)) {
                const cName = currentUser.name || currentUser.user_metadata?.full_name;
                if (cName && !['administrador', 'admin'].includes(cName.trim().toLowerCase())) {
                    return cName;
                }
                if (currentUser.email) {
                    const prefix = currentUser.email.split('@')[0];
                    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
                }
            }
        }

        if (explicitName && explicitName.trim() && !['administrador', 'admin', 'sistema'].includes(explicitName.trim().toLowerCase())) {
            return explicitName;
        }

        const activeUser = currentUser || (typeof window !== 'undefined' ? (JSON.parse(sessionStorage.getItem('user') || '{}') || JSON.parse(localStorage.getItem('user') || '{}')) : null);
        if (activeUser) {
            const actName = activeUser.name || activeUser.user_metadata?.full_name;
            if (actName && !['administrador', 'admin'].includes(actName.trim().toLowerCase())) {
                return actName;
            }
            if (activeUser.email) {
                const prefix = activeUser.email.split('@')[0];
                return prefix.charAt(0).toUpperCase() + prefix.slice(1);
            }
        }

        return explicitName || 'Técnico Responsável';
    };

    const getBilledUserName = (inv: any) => {
        if (!inv) return 'Sistema';
        // 1. Campos diretos de nome armazenados na fatura
        if (inv.billed_by_name && inv.billed_by_name !== 'Sistema') return inv.billed_by_name;
        if (inv.form_data?.billed_by && inv.form_data.billed_by !== 'Sistema') return inv.form_data.billed_by;
        if (inv.created_by_name && inv.created_by_name !== 'Sistema') return inv.created_by_name;

        // 2. Resolução por ID no banco (allUsers, techs, currentUser)
        const targetId = inv.billed_by || inv.form_data?.billed_by_id || inv.created_by || inv.user_id;
        if (targetId) {
            const uMatch = allUsers.find(u => u.id === targetId || u.email === targetId);
            if (uMatch?.name) return uMatch.name;

            const tMatch = techs.find(t => t.id === targetId || t.email === targetId);
            if (tMatch?.name) return tMatch.name;

            if (currentUser && (currentUser.id === targetId || currentUser.email === targetId)) {
                return currentUser.name || currentUser.user_metadata?.full_name || currentUser.email;
            }

            if (typeof targetId === 'string' && !targetId.includes('-') && targetId.length < 40) {
                return targetId;
            }
        }

        // 3. Fallback inteligente: buscar responsável no item vinculado (OS / Orçamento)
        const itemsOfInv = invoiceItems.filter(ii => ii.invoice_id === inv.id);
        for (const item of itemsOfInv) {
            if (item.reference_type === 'ORDER' || !item.reference_type) {
                const ord = orders.find(o => o.id === item.reference_id);
                if (ord) {
                    const ordTech = techs.find(t => t.id === ord.assignedTo || t.id === (ord as any).createdBy || t.id === (ord as any).authorId) || allUsers.find(u => u.id === ord.assignedTo || u.id === (ord as any).createdBy);
                    if (ordTech?.name) return ordTech.name;
                }
            } else if (item.reference_type === 'QUOTE') {
                const q = quotes.find(qt => qt.id === item.reference_id);
                if (q) {
                    const qTech = techs.find(t => t.id === (q as any).createdBy || t.id === (q as any).authorId) || allUsers.find(u => u.id === (q as any).createdBy);
                    if (qTech?.name) return qTech.name;
                }
            }
        }

        // 4. Usuário da sessão ativa atual
        const activeUser = currentUser || (typeof window !== 'undefined' ? (JSON.parse(sessionStorage.getItem('user') || '{}') || JSON.parse(localStorage.getItem('user') || '{}')) : null);
        if (activeUser?.name || activeUser?.user_metadata?.full_name || activeUser?.email) {
            return activeUser.name || activeUser.user_metadata?.full_name || activeUser.email;
        }

        return 'Sistema';
    };

    const getInvoicePaymentMethodLabel = (inv: any) => {
        if (!inv) return { label: 'Não Definido', badge: 'bg-slate-100 text-slate-500 border-slate-200' };
        const methodRaw = String(
            inv.payment_method || 
            inv.paymentMethod || 
            inv.gateway_payment_method || 
            inv.form_data?.payment_method || 
            inv.form_data?.paymentMethod || 
            (inv.notes && typeof inv.notes === 'string' && inv.notes.includes('payment_method') ? (JSON.parse(inv.notes)?.payment_method) : null) || 
            ''
        ).trim().toLowerCase();

        if (methodRaw.includes('pix')) {
            return { label: 'Pix', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 font-bold' };
        }
        if (methodRaw.includes('boleto') || methodRaw.includes('ticket') || methodRaw.includes('bolbradesco')) {
            return { label: 'Boleto', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80 font-bold' };
        }
        if (methodRaw.includes('credit_card') || methodRaw.includes('cartao') || methodRaw.includes('cartão') || methodRaw.includes('card') || methodRaw.includes('credit')) {
            return { label: 'Cartão de Crédito', badge: 'bg-purple-50 text-purple-700 border-purple-200/80 font-bold' };
        }
        if (methodRaw.includes('deposit') || methodRaw.includes('deposito') || methodRaw.includes('depósito')) {
            return { label: 'Depósito Bancário', badge: 'bg-blue-50 text-blue-700 border-blue-200/80 font-bold' };
        }
        if (methodRaw.includes('transfer') || methodRaw.includes('ted') || methodRaw.includes('doc') || methodRaw.includes('transferencia') || methodRaw.includes('transferência')) {
            return { label: 'Transferência', badge: 'bg-[#009EE3]/10 text-[#009EE3] border-[#009EE3]/30 font-bold' };
        }
        if (methodRaw.includes('cash') || methodRaw.includes('dinheiro') || methodRaw.includes('espécie') || methodRaw.includes('especie')) {
            return { label: 'Dinheiro', badge: 'bg-teal-50 text-teal-700 border-teal-200/80 font-bold' };
        }

        if (inv.payment_method) {
            return { label: inv.payment_method, badge: 'bg-slate-100 text-slate-700 border-slate-200 font-semibold' };
        }

        return { label: 'Pix', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 font-bold' };
    };

    // Supabase Realtime & BroadcastChannel: Atualização instantânea na tela assim que o pagamento for liquidado
    useEffect(() => {
        const handlePaymentUpdate = () => {
            console.log('⚡ [Realtime Financial] Pagamento/Mudança financeira detectada!');
            onRefresh();
            loadInvoices();
            window.dispatchEvent(new Event('refresh_invoices'));
        };

        const channel = supabase
            .channel('realtime_financial_dashboard_gateway')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handlePaymentUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, handlePaymentUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, handlePaymentUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_installments' }, handlePaymentUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_flow' }, handlePaymentUpdate)
            .on('broadcast', { event: 'PAYMENT_APPROVED' }, handlePaymentUpdate)
            .on('broadcast', { event: 'INVOICE_UPDATED' }, handlePaymentUpdate)
            .subscribe();

        let tenantChannel: any = null;
        if (tenantIdStr) {
            tenantChannel = supabase
                .channel(`nexus-realtime-${tenantIdStr}`)
                .on('broadcast', { event: 'PAYMENT_APPROVED' }, handlePaymentUpdate)
                .on('broadcast', { event: 'INVOICE_UPDATED' }, handlePaymentUpdate)
                .subscribe();
        }

        let bc: BroadcastChannel | null = null;
        try {
            bc = new BroadcastChannel('nexus_payment_sync');
            bc.onmessage = (msg) => {
                if (msg.data?.type === 'PAYMENT_APPROVED') {
                    console.log('⚡ [BroadcastChannel] Pagamento aprovado em outra aba!');
                    handlePaymentUpdate();
                }
            };
        } catch (e) {}

        return () => {
            supabase.removeChannel(channel);
            if (tenantChannel) supabase.removeChannel(tenantChannel);
            if (bc) bc.close();
        };
    }, [tenantIdStr, onRefresh]);

    const handleCancelInvoice = async () => {
        if (!cancelInvoiceModal.invoice) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase.from('invoices').update({
                status: 'CANCELED',
                notes: JSON.stringify({ ...(cancelInvoiceModal.invoice.notes ? JSON.parse(cancelInvoiceModal.invoice.notes) : {}), gateway_status: 'cancelled' })
            }).eq('id', cancelInvoiceModal.invoice.id);
            
            if (error) throw error;
            
            // Reverter status dos itens
            const invoiceId = cancelInvoiceModal.invoice.id;
            const items = invoiceItems.filter(ii => ii.invoice_id === invoiceId);
            for (const item of items) {
                if (item.reference_type === 'ORDER') {
                    const os = orders.find(o => o.id === item.reference_id);
                    if (os) await DataService.updateOrder({ ...os, billingStatus: 'PENDING' });
                } else if (item.reference_type === 'QUOTE') {
                    const q = quotes.find(q => q.id === item.reference_id);
                    if (q) await DataService.updateQuote({ ...q, billingStatus: 'PENDING' });
                }
            }
            
            showAlert('Fatura cancelada com sucesso!', 'success');
            setCancelInvoiceModal({ isOpen: false, invoice: null });
            setIsInvoiceDetailModalOpen(false);
            
            const currentTenantId = tenant?.id || tenantIdStr;
            if (currentTenantId) {
                await fetchOrders(currentTenantId);
                await fetchQuotes(currentTenantId);
                await loadInvoices();
            }
        } catch (err: any) {
            console.error('Error canceling invoice:', err);
            showAlert(`Erro ao cancelar fatura: ${err.message}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const loadInvoiceInstallments = async (invoiceId: string) => {
        try {
            const { data } = await supabase.from('invoice_installments').select('*').eq('invoice_id', invoiceId).order('installment_number', { ascending: true });
            setInvoiceInstallmentsList(data || []);
        } catch (e) {
            console.error('Error loading installments', e);
        }
    };

    const handleOpenInvoiceDetail = (inv: any) => {
        setSelectedInvoice(inv);
        setEditInvoiceDiscount(inv.discount_amount || 0);
        setEditInvoiceShipping(inv.shipping_amount || 0);
        setEditInvoiceAdditions(inv.other_additions_amount || 0);
        setIsEditingInvoiceValues(false);
        setInvoiceDetailTab('GERAL');
        setInvoiceInstallmentsList([]);
        loadInvoiceInstallments(inv.id);
        setIsInvoiceDetailModalOpen(true);
    };

    // =========================================================================
    // 🏗️ UTILITY: Resolução centralizada de cliente para faturamento
    // Single Source of Truth — busca por ID → CPF/CNPJ → Nome
    // Retorna o cliente validado ou um erro claro e acionável.
    // =========================================================================
    const resolveCustomerForBilling = async (params: {
        customerId?: string;
        customerName?: string;
        customerDocument?: string;
    }): Promise<{ customer: any; error?: string }> => {
        const { customerId, customerName, customerDocument } = params;

        // 1. Busca por ID (chave primária — mais confiável)
        if (customerId) {
            let found = customers.find(c => c.id === customerId);
            if (!found) {
                const { data } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
                if (data) found = data;
            }
            if (found) {
                const doc = (found.document || found.cpf || found.cnpj || '')?.toString().replace(/\D/g, '');
                if (!doc) return { customer: found, error: `Cliente "${found.name}" não possui CPF/CNPJ cadastrado. Atualize o cadastro do cliente antes de faturar.` };
                return { customer: found };
            }
        }

        // 2. Busca por CPF/CNPJ
        if (customerDocument) {
            const cleanDoc = customerDocument.toString().replace(/\D/g, '');
            if (cleanDoc) {
                const found = customers.find(c => {
                    const cDoc = (c.document || c.cpf || c.cnpj || '').toString().replace(/\D/g, '');
                    return cDoc && cDoc === cleanDoc;
                });
                if (found) return { customer: found };
            }
        }

        // 3. Busca por nome (último recurso)
        if (customerName) {
            const found = customers.find(c => c.name?.toLowerCase().trim() === customerName.toLowerCase().trim());
            if (found) {
                const doc = (found.document || found.cpf || found.cnpj || '')?.toString().replace(/\D/g, '');
                if (!doc) return { customer: found, error: `Cliente "${found.name}" não possui CPF/CNPJ cadastrado. Atualize o cadastro do cliente antes de faturar.` };
                return { customer: found };
            }
        }

        return { customer: null, error: 'Cliente não encontrado. Vincule um cliente válido ao item antes de faturar.' };
    };

    const handleGenerateInstallments = async () => {
        if (!selectedInvoice) return;
        setGeneratingInstallments(true);
        try {
            // Pre-flight: Resolução centralizada do cliente
            const { customer: billingCustomer, error: custError } = await resolveCustomerForBilling({
                customerId: selectedInvoice.customer_id,
                customerName: selectedInvoice.customer_name,
                customerDocument: selectedInvoice.customer_document,
            });
            if (custError || !billingCustomer) {
                showAlert(custError || 'Cliente não encontrado.', 'error');
                setGeneratingInstallments(false);
                return;
            }

            const liquidAmount = Math.max(
                0,
                Number(selectedInvoice.total_amount || 0) -
                Number(selectedInvoice.discount_amount || 0) +
                Number(selectedInvoice.shipping_amount || 0) +
                Number(selectedInvoice.other_additions_amount || 0)
            );

            const result = await PaymentService.createAsaasCharge({
                itemType: 'INVOICE',
                itemId: selectedInvoice.id,
                displayId: selectedInvoice.display_id,
                amount: liquidAmount > 0 ? liquidAmount : selectedInvoice.total_amount,
                paymentMethodType: 'boleto',
                customerName: billingCustomer.name,
                customerDocument: billingCustomer.document || billingCustomer.cpf || billingCustomer.cnpj,
                customerId: billingCustomer.id,
                customerEmail: billingCustomer.email,
                installments: installmentCount
            });

            if (result.success) {
                showAlert(result.message, 'success');
                await loadInvoiceInstallments(selectedInvoice.id);
                await loadInvoices();
                
                // Atualiza o estado local imediatamente para o botão mostrar o link novo
                setSelectedInvoice((prev: any) => prev ? ({
                    ...prev,
                    gateway_ticket_url: result.ticketUrl || result.hostedCheckoutUrl,
                    ticket_url: result.ticketUrl || result.hostedCheckoutUrl,
                    gateway_payment_id: result.paymentId,
                    gateway_pix_code: result.pixCopiaECola || result.qrCodeBase64
                }) : prev);

            } else {
                showAlert(result.message, 'error');
            }
        } catch (err: any) {
            showAlert(`Erro: ${err.message}`, 'error');
        } finally {
            setGeneratingInstallments(false);
        }
    };

    const handleCancelInstallment = async (installment: any) => {
        const paymentId = installment.gateway_payment_id || installment.payment_gateway_id;
        
        if (!paymentId) {
            showAlert('Esta parcela não possui um ID de pagamento válido para cancelamento.', 'error');
            return;
        }

        if (window.confirm(`Tem certeza que deseja cancelar a parcela ${installment.installment_number}? O boleto no Asaas será cancelado.`)) {
            try {
                const result = await PaymentService.cancelInstallment(paymentId, tenantIdStr);
                if (result.success) {
                    showAlert(result.message, 'success');
                    if (selectedInvoice) {
                        await loadInvoiceInstallments(selectedInvoice.id);
                        loadInvoices();
                    }
                } else {
                    showAlert(result.message, 'error');
                }
            } catch (err: any) {
                showAlert(`Erro ao cancelar: ${err.message}`, 'error');
            }
        }
    };


    const handleSaveInvoiceAdjustments = async () => {
        if (!selectedInvoice) return;
        try {
            const { error } = await supabase.from('invoices').update({
                discount_amount: editInvoiceDiscount,
                shipping_amount: editInvoiceShipping,
                other_additions_amount: editInvoiceAdditions
            }).eq('id', selectedInvoice.id);

            if (error) throw error;

            showAlert('Valores atualizados! Se usar Mercado Pago, clique em Refaturar para gerar novo link.', 'success');
            
            setSelectedInvoice((prev: any) => prev ? ({
                ...prev,
                discount_amount: editInvoiceDiscount,
                shipping_amount: editInvoiceShipping,
                other_additions_amount: editInvoiceAdditions
            }) : null);
            setIsEditingInvoiceValues(false);
            await loadInvoices();
        } catch (err: any) {
            showAlert(`Erro ao salvar ajustes da fatura: ${err.message}`, 'error');
        }
    };

    useEffect(() => {
        const handler = (e: any) => { 
            const updatedId = e.detail?.id;
            if (updatedId) {
                setSpinningInvoiceId(updatedId);
                setTimeout(() => setSpinningInvoiceId(null), 2000);
            }
            if (mainTab === 'RECEIVABLES') loadInvoices(); 
        };
        window.addEventListener('refresh_invoices', handler);
        
        if (mainTab === 'RECEIVABLES') {
            loadInvoices();
        }
        
        return () => window.removeEventListener('refresh_invoices', handler);
    }, [tenantIdStr, mainTab, isRefreshing]);

    // Polling automático inteligente e verificação de NFS-e pendentes em background
    useEffect(() => {
        if (mainTab !== 'RECEIVABLES' || !tenantIdStr) return;

        const intervalId = setInterval(() => {
            loadInvoices();

            // Se existirem notas pendentes (SCHEDULED ou SYNCHRONIZED), consulta status no Asaas em background
            if (nfseDataMap) {
                Object.entries(nfseDataMap).forEach(([invoiceId, nfse]) => {
                    if (nfse && (nfse.status === 'SCHEDULED' || nfse.status === 'SYNCHRONIZED')) {
                        PaymentService.checkNfseStatus(invoiceId, nfse.asaas_nfse_id, tenantIdStr)
                            .then((res) => {
                                if (res.success && res.nfse && res.nfse.status !== nfse.status) {
                                    setNfseDataMap(prev => ({
                                        ...prev,
                                        [invoiceId]: {
                                            status: res.nfse.status,
                                            pdfUrl: res.nfse.pdfUrl,
                                            xmlUrl: res.nfse.xmlUrl,
                                            number: res.nfse.number,
                                            asaas_nfse_id: res.nfse.id
                                        }
                                    }));
                                    loadInvoices();
                                }
                            })
                            .catch(() => {});
                    }
                });
            }
        }, 60000); // 60s fallback — atualizações imediatas são tratadas via Supabase Realtime

        return () => clearInterval(intervalId);
    }, [mainTab, tenantIdStr, nfseDataMap]);

    // Recarrega as parcelas automaticamente quando ocorre um evento realtime
    useEffect(() => {
        const handler = (e: any) => {
            const updatedId = e.detail?.id;
            if (selectedInvoice?.id && (!updatedId || updatedId === selectedInvoice.id)) {
                loadInvoiceInstallments(selectedInvoice.id);
            }
        };
        window.addEventListener('refresh_invoices', handler);
        return () => window.removeEventListener('refresh_invoices', handler);
    }, [selectedInvoice]);

    // Atualiza o modal de fatura se o status mudar em background
    useEffect(() => {
        if (selectedInvoice) {
            const updated = invoices.find(inv => inv.id === selectedInvoice.id);
            if (updated && updated.status !== selectedInvoice.status) {
                setSelectedInvoice(updated);
            }
        }
    }, [invoices, selectedInvoice]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try { 
            await onRefresh(); 
            await loadInvoices();
        } finally { setIsRefreshing(false); }
    };

    // Removido o useEffect que chamava window.print() automaticamente,
    // pois causava conflito com o executePrint e abria duas telas de impressão.
    // Agora a impressão é controlada exclusivamente pela função executePrint.

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'createdAt',
        direction: 'desc'
    });

    // Orçamentos disponíveis para vincular
    const availableQuotesForClient = useMemo(() => {
        if (!selectedItem || selectedItem.type !== 'ORDER') return [];
        return quotes.filter(q =>
            q.customerName === selectedItem.customerName &&
            (q.status === 'APROVADO' || q.status === 'CONVERTIDO') &&
            !selectedItem.original.linkedQuotes?.includes(q.id)
        );
    }, [selectedItem, quotes]);

    const handleLinkQuote = async (quoteId: string) => {
        if (!selectedItem || selectedItem.type !== 'ORDER') return;
        setIsProcessing(true);
        try {
            const currentLinks = selectedItem.original.linkedQuotes || [];
            const isOrderPaid = selectedItem.status === 'PAID';
            const paidAt = selectedItem.original.paidAt || new Date().toISOString();
            const paymentMethod = selectedItem.original.paymentMethod || 'Vinculado a O.S. Faturada';

            // 1. Atualiza a O.S. com o novo vínculo
            await DataService.updateOrder({
                ...selectedItem.original,
                linkedQuotes: [...currentLinks, quoteId]
            });

            // 2. Se a O.S. já estiver faturada, fatura o orçamento automaticamente
            if (isOrderPaid) {
                const qOrigin = quotes.find(q => q.id === quoteId);
                if (qOrigin) {
                    await DataService.updateQuote({
                        ...qOrigin,
                        status: 'FATURADO',
                        billingStatus: 'PAID',
                        paymentMethod: paymentMethod,
                        billingNotes: `Faturado via vínculo automático (O.S. ${selectedItem.displayId || selectedItem.id.slice(0,8)} já estava paga)`,
                        paidAt: paidAt
                    });

                    // Registra no fluxo de caixa o valor do orçamento vinculado
                    try {
                        await DataService.registerCashFlow({
                            type: 'INCOME',
                            category: 'Venda (Orçamento)',
                            amount: Number(qOrigin.totalValue) || 0,
                            description: `Faturamento automático (Vínculo) - Orçamento ${qOrigin.displayId || qOrigin.id.slice(0,8)} na O.S. ${selectedItem.displayId || selectedItem.id.slice(0,8)}`,
                            referenceId: qOrigin.id,
                            referenceType: 'QUOTE',
                            paymentMethod: paymentMethod,
                            entryDate: paidAt,
                            customerId: qOrigin.customerId || selectedItem.original?.customerId || undefined,
                            technicianId: qOrigin.createdBy || selectedItem.original?.assignedTo || undefined
                        });
                    } catch (e) { console.warn('Cash flow error (non-blocking):', e); }
                }
            }

            await onRefresh();
            setSelectedItem((prev: any) => ({
                ...prev,
                value: Number(prev.value) + Number(quotes.find(q => q.id === quoteId)?.totalValue || 0),
                original: { ...prev.original, linkedQuotes: [...currentLinks, quoteId] }
            }));
        } catch (error) {
            console.error(error);
            showAlert('Erro ao vincular orçamento.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    // 1. Preparar Dados Unificados
    const allItems = useMemo(() => {
        // Coletar apenas vínculos de O.S. que já constam na lista de faturamento (Concluídas)
        // Isso permite que os orçamentos apareçam "soltos" enquanto a O.S. estiver em andamento.
        const linkedToCompletedOrders = new Set<string>();
        orders.forEach(o => {
            if (o.status === OrderStatus.COMPLETED && o.linkedQuotes) {
                o.linkedQuotes.forEach(id => linkedToCompletedOrders.add(id));
            }
        });

        const computeFinancialValues = (
            storedVal: number,
            discVal: number,
            discType: string,
            _isPaid?: boolean,
            originalGross?: number
        ) => {
            let grossValue = originalGross && originalGross > 0 ? originalGross : storedVal;
            let discountAmount = 0;

            const cleanDiscType = String(discType || 'fixed').toLowerCase();

            if (discVal > 0) {
                if (cleanDiscType === 'percent') {
                    discountAmount = grossValue * (discVal / 100);
                } else {
                    discountAmount = discVal;
                }
            }

            const netValue = Math.max(0, grossValue - discountAmount);

            return {
                grossValue: Math.round(grossValue * 100) / 100,
                discountAmount: Math.round(discountAmount * 100) / 100,
                netValue: Math.round(netValue * 100) / 100
            };
        };

        const approvedQuotes = quotes
            .filter(q => {
                const bSt = q.billingStatus?.toUpperCase() || '';
                const st = q.status?.toUpperCase() || '';
                
                // Exibe incondicionalmente se já foi liquidado
                if (bSt === 'PAID' || st === 'PAID') return true;
                
                // Se não foi liquidado, exige status adequado (aprovado/convertido/faturado)
                if (st !== 'APROVADO' && st !== 'CONVERTIDO' && st !== 'FATURADO') return false;

                // Esconde apenas se a O.S. vinculada já for uma O.S. concluída visível na tabela
                // para não causar dupla contagem de valores simultâneos e pendentes
                if (linkedToCompletedOrders.has(q.id)) return false;

                return true;
            })
            .map(q => {
                const isLinkedInvPaid = invoiceItems.some(invItem => invItem.reference_id === q.id && invoices.some(inv => inv.id === invItem.invoice_id && (inv.status === 'PAID' || inv.gateway_status === 'approved')));
                const isPaid = (q.billingStatus || '').toUpperCase() === 'PAID' || (q as any).gateway_status === 'approved' || isLinkedInvPaid;
                const itemsGross = q.items?.reduce((acc: number, i: any) => acc + (Number(i.total) || 0), 0) || 0;
                const storedVal = Number(q.totalValue) || 0;
                
                const discVal = Number(q.discount || (q as any).discount || (q as any).discount_amount || (q.formData as any)?.billingDiscount || 0);
                const discType = q.discountType || (q as any).discount_type || (q.formData as any)?.billingDiscountType || 'fixed';
                const shippingVal = Number((q as any).shipping || (q as any).shipping_amount || (q.formData as any)?.billingShipping || 0);
                const additionsVal = Number((q as any).otherAdditions || (q as any).other_additions_amount || (q.formData as any)?.billingOtherAdditions || 0);

                let grossValue = itemsGross > 0 ? itemsGross : storedVal;
                let discountAmount = 0;

                if (discVal > 0) {
                    if (String(discType).toLowerCase() === 'percent') {
                        discountAmount = grossValue * (discVal / 100);
                    } else {
                        discountAmount = discVal;
                    }
                } else if (itemsGross > 0 && storedVal > 0 && itemsGross > storedVal) {
                    discountAmount = itemsGross - storedVal;
                }

                let netValue = Math.max(0, grossValue - discountAmount + shippingVal + additionsVal);
                if (itemsGross === 0 && discVal === 0 && storedVal > 0) {
                    netValue = Math.max(0, storedVal + shippingVal + additionsVal);
                }
                
                grossValue = Math.round(grossValue * 100) / 100;
                discountAmount = Math.round(discountAmount * 100) / 100;
                netValue = Math.round(netValue * 100) / 100;

                const linkedInv = invoices.find(inv => invoiceItems.some(invItem => invItem.reference_id === q.id && invItem.invoice_id === inv.id)) || null;

                const fullCustQ = customers.find(c => c.id === (q as any).customer_id || c.id === (q as any).customerId || c.name?.toLowerCase().trim() === q.customerName?.toLowerCase().trim());
                const actualCustomerNameQ = fullCustQ?.name || q.customerName;

                return {
                    type: 'QUOTE' as const,
                    id: q.id,
                    displayId: q.displayId || null,
                    customerName: actualCustomerNameQ,
                    customerAddress: q.customerAddress,
                    title: q.title,
                    description: q.description,
                    date: optimisticDates[q.id] || q.approvedAt || (q as any).updatedAt || q.createdAt,
                    dueDate: optimisticDates[q.id] || q.approvedAt || q.validUntil || (q as any).updatedAt || q.createdAt,
                    createdAt: q.createdAt,
                    updatedAt: (q as any).updatedAt || q.createdAt,
                    paidAt: q.paidAt || linkedInv?.paid_at || null,
                    value: netValue,
                    grossValue,
                    discountAmount,
                    netValue,
                    status: isPaid ? 'PAID' : (q.billingStatus || 'PENDING').toUpperCase(),
                    original: q,
                    billingDiscount: discVal,
                    billingDiscountType: discType,
                    paymentMethod: q.paymentMethod || (q as any).payment_method || linkedInv?.payment_method || (q.approvalMetadata as any)?.paymentMethod || (q.approvalMetadata as any)?.payment_method || (q.formData as any)?.paymentMethod || (q.formData as any)?.payment_method || null,
                    installments: (q as any).installments || (q.formData as any)?.mpInstallments || (q.formData as any)?.installments || (q.approvalMetadata as any)?.mpInstallments || (q.approvalMetadata as any)?.installments || (q.formData as any)?.max_installments || (q.approvalMetadata as any)?.max_installments || null,
                    gatewayProvider: q.gatewayProvider || (q as any).gateway_provider || linkedInv?.gateway_provider || 'Mercado Pago Connect OAuth 2.0',
                    gatewayPaymentId: q.gatewayPaymentId || (q as any).gateway_payment_id || linkedInv?.gateway_payment_id || linkedInv?.payment_gateway_id || null,
                    gatewayStatus: q.gatewayStatus || (q as any).gateway_status || linkedInv?.gateway_status || 'pending',
                    gatewayPixCode: (q as any).gatewayPixCode || (q as any).gateway_pix_code || linkedInv?.gateway_pix_code || null,
                    gatewayTicketUrl: (q as any).gatewayTicketUrl || (q as any).gateway_ticket_url || linkedInv?.gateway_ticket_url || null,
                    technician: resolveUserOrTechName((q as any).createdBy || (q as any).authorId || (q as any).technicianId, techs.find(t => t.id === (q as any).createdBy || t.id === (q as any).authorId)?.name || allUsers.find(u => u.id === (q as any).createdBy || u.id === (q as any).authorId)?.name)
                };
            });

        const completedOrders = orders
            .filter(o => o.status === OrderStatus.COMPLETED)
            .map(order => {
                const itemsValue = order.items?.reduce((acc, i) => acc + (Number(i.total) || 0), 0) || 0;
                const formVal = Number((order.formData as any)?.totalValue || (order.formData as any)?.price || 0);
                const dbTotal = Number((order as any).total_value || (order as any).totalValue || 0);
                
                const discVal = Number(order.discount || (order as any).discount || (order as any).discount_amount || (order.formData as any)?.billingDiscount || 0);
                const discType = order.discountType || (order as any).discount_type || (order.formData as any)?.billingDiscountType || 'fixed';
                const shippingVal = Number((order as any).shipping || (order as any).shipping_amount || (order.formData as any)?.billingShipping || 0);
                const additionsVal = Number((order as any).otherAdditions || (order as any).other_additions_amount || (order.formData as any)?.billingOtherAdditions || 0);
                const isFromQuote = !!((order as any).quote_id || (order.formData as any)?.isFromQuote);

                let grossValue = 0;
                let netValue = 0;
                let discountAmount = 0;

                if (itemsValue > 0) {
                    grossValue = itemsValue;
                    if (discVal > 0) {
                        if (String(discType).toLowerCase() === 'percent') {
                            discountAmount = grossValue * (discVal / 100);
                        } else {
                            discountAmount = discVal;
                        }
                    }
                    netValue = Math.max(0, grossValue - discountAmount + shippingVal + additionsVal);
                } else if (dbTotal > 0 || formVal > 0) {
                    const baseVal = dbTotal || formVal;
                    if ((isFromQuote || discVal > 0) && discVal > 0) {
                        netValue = baseVal;
                        if (String(discType).toLowerCase() === 'percent' && discVal < 100) {
                            grossValue = netValue / (1 - (discVal / 100));
                        } else {
                            grossValue = netValue + discVal;
                        }
                        discountAmount = grossValue - netValue;
                        netValue = Math.max(0, netValue + shippingVal + additionsVal);
                    } else {
                        grossValue = baseVal;
                        netValue = Math.max(0, baseVal + shippingVal + additionsVal);
                    }
                }

                if (order.linkedQuotes && order.linkedQuotes.length > 0) {
                    order.linkedQuotes.forEach(qId => {
                        const q = quotes.find(q => q.id === qId);
                        if (order.billingStatus !== 'PAID' && q?.billingStatus === 'PAID') return;
                        if (q) {
                            const qNet = Number(q.totalValue) || 0;
                            const qGross = q.items?.reduce((acc, i) => acc + (Number(i.total) || 0), 0) || qNet;
                            netValue += qNet;
                            grossValue += qGross;
                            discountAmount += (qGross - qNet);
                        }
                    });
                }

                grossValue = Math.round(grossValue * 100) / 100;
                discountAmount = Math.round(discountAmount * 100) / 100;
                netValue = Math.round(netValue * 100) / 100;

                const techObj = techs.find(t => t.id === order.assignedTo);
                const isLinkedInvPaid = invoiceItems.some(invItem => invItem.reference_id === order.id && invoices.some(inv => inv.id === invItem.invoice_id && (inv.status === 'PAID' || inv.gateway_status === 'approved')));
                const isPaid = (order.billingStatus || '').toUpperCase() === 'PAID' || (order as any).gateway_status === 'approved' || isLinkedInvPaid;
                const linkedInv = invoices.find(inv => invoiceItems.some(invItem => invItem.reference_id === order.id && invItem.invoice_id === inv.id)) || null;

                const fullCustO = customers.find(c => c.id === (order as any).customer_id || c.id === (order as any).customerId || c.name?.toLowerCase().trim() === order.customerName?.toLowerCase().trim());
                const actualCustomerNameO = fullCustO?.name || order.customerName;

                return {
                    type: 'ORDER' as const,
                    id: order.id,
                    displayId: order.displayId || null,
                    customerName: actualCustomerNameO,
                    customerAddress: order.customerAddress,
                    title: order.title,
                    description: order.description,
                    date: optimisticDates[order.id] || order.updatedAt,
                    dueDate: optimisticDates[order.id] || order.scheduledDate || order.updatedAt,
                    createdAt: order.createdAt,
                    updatedAt: order.updatedAt,
                    paidAt: order.paidAt || linkedInv?.paid_at || null,
                    value: netValue,
                    grossValue,
                    discountAmount,
                    netValue,
                    status: isPaid ? 'PAID' : (order.billingStatus || 'PENDING').toUpperCase(),
                    original: order,
                    billingDiscount: discVal,
                    billingDiscountType: discType,
                    paymentMethod: order.paymentMethod || (order as any).payment_method || linkedInv?.payment_method || (order.formData as any)?.paymentMethod || (order.formData as any)?.payment_method || null,
                    installments: (order as any).installments || (order.formData as any)?.mpInstallments || (order.formData as any)?.installments || (order.approvalMetadata as any)?.mpInstallments || (order.approvalMetadata as any)?.installments || (order.formData as any)?.max_installments || (order.approvalMetadata as any)?.max_installments || null,
                    gatewayProvider: order.gatewayProvider || (order as any).gateway_provider || linkedInv?.gateway_provider || 'Mercado Pago Connect OAuth 2.0',
                    gatewayPaymentId: order.gatewayPaymentId || (order as any).gateway_payment_id || linkedInv?.gateway_payment_id || linkedInv?.payment_gateway_id || null,
                    gatewayStatus: order.gatewayStatus || (order as any).gateway_status || linkedInv?.gateway_status || 'pending',
                    gatewayPixCode: (order as any).gatewayPixCode || (order as any).gateway_pix_code || linkedInv?.gateway_pix_code || null,
                    gatewayTicketUrl: (order as any).gatewayTicketUrl || (order as any).gateway_ticket_url || linkedInv?.gateway_ticket_url || null,
                    technician: resolveUserOrTechName(order.assignedTo || (order as any).createdBy || (order as any).authorId, techObj?.name || allUsers.find(u => u.id === order.assignedTo || u.id === order.createdBy || u.id === (order as any).authorId)?.name)
                };
            })
            .filter(item => item.value > 0);

        return [...approvedQuotes, ...completedOrders].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [orders, quotes, techs, invoices, invoiceItems, allUsers]);

    // 2. Aplicar Filtros
    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            let targetDate = item.dueDate || item.date;
            if (dateFilterType === 'createdAt') targetDate = item.createdAt;
            if (dateFilterType === 'paidAt') targetDate = item.paidAt;

            let itemDate = '';
            if (targetDate) {
                itemDate = new Date(targetDate).toISOString().split('T')[0];
            }

            const matchesSearch =
                item.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesTech = techFilter === 'ALL' || item.technician === techFilter;
            const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
            const matchesDate =
                (!startDate && !endDate) || 
                (targetDate && (!startDate || itemDate >= startDate) && (!endDate || itemDate <= endDate));
            return matchesSearch && matchesTech && matchesStatus && matchesDate;
        });
    }, [allItems, searchTerm, startDate, endDate, techFilter, statusFilter, dateFilterType]);

    const sortedItems = useMemo(() => {
        let sortableItems = [...filteredItems];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof typeof a];
                let bValue: any = b[sortConfig.key as keyof typeof b];

                if (sortConfig.key === 'displayId') {
                    aValue = a.displayId || a.id;
                    bValue = b.displayId || b.id;
                } else if (sortConfig.key === 'customerName') {
                    aValue = a.customerName?.toLowerCase() || '';
                    bValue = b.customerName?.toLowerCase() || '';
                } else if (sortConfig.key === 'title') {
                    aValue = a.title?.toLowerCase() || '';
                    bValue = b.title?.toLowerCase() || '';
                } else if (sortConfig.key === 'technician') {
                    aValue = a.technician?.toLowerCase() || '';
                    bValue = b.technician?.toLowerCase() || '';
                } else if (sortConfig.key === 'date') {
                    aValue = new Date(a.date).getTime();
                    bValue = new Date(b.date).getTime();
                } else if (sortConfig.key === 'createdAt') {
                    aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                } else if (sortConfig.key === 'paidAt') {
                    aValue = a.paidAt ? new Date(a.paidAt).getTime() : 0;
                    bValue = b.paidAt ? new Date(b.paidAt).getTime() : 0;
                } else if (sortConfig.key === 'value') {
                    aValue = Number(a.value);
                    bValue = Number(b.value);
                } else if (sortConfig.key === 'status') {
                    aValue = a.status;
                    bValue = b.status;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredItems, sortConfig]);

    const filteredInvoices = useMemo(() => {
        const term = invSearchTerm.toLowerCase().trim();
        return invoices.filter(inv => {
            const operator = getBilledUserName(inv).toLowerCase();
            const pMethodObj = getInvoicePaymentMethodLabel(inv);
            const pMethod = pMethodObj.label.toLowerCase();
            const invNum = String(inv.invoice_number || inv.asaas_invoice_number || '').toLowerCase();
            const gtwId = String(inv.gateway_payment_id || inv.payment_gateway_id || '').toLowerCase();
            const displayId = String(inv.display_id || '').toLowerCase();
            const custName = String(inv.customer_name || '').toLowerCase();
            const custDoc = String(inv.customer_document || '').toLowerCase();
            const amountStr = String(inv.total_amount || '').toLowerCase();
            const notesStr = typeof inv.notes === 'string' ? inv.notes.toLowerCase() : '';

            const matchesSearch = !term ||
                custName.includes(term) ||
                custDoc.includes(term) ||
                displayId.includes(term) ||
                invNum.includes(term) ||
                gtwId.includes(term) ||
                operator.includes(term) ||
                pMethod.includes(term) ||
                amountStr.includes(term) ||
                notesStr.includes(term);
                
            let targetDate = inv.created_at;
            if (invDateFilterType === 'paidAt') targetDate = inv.paid_at || (inv.status === 'PAID' ? inv.updated_at : null);
            if (invDateFilterType === 'dueDate') targetDate = inv.due_date;

            let itemDate = '';
            if (targetDate) {
                try {
                    itemDate = new Date(targetDate).toISOString().split('T')[0];
                } catch {
                    itemDate = String(targetDate).split('T')[0];
                }
            }
            
            const matchesDate =
                (!invStartDate && !invEndDate) || 
                (targetDate && (!invStartDate || itemDate >= invStartDate) && (!invEndDate || itemDate <= invEndDate));
                
            const matchesStatus = invStatusFilter === 'ALL' || 
                (invStatusFilter === 'PAID' && (inv.status === 'PAID' || inv.gateway_status === 'approved')) ||
                (invStatusFilter === 'PENDING' && (inv.status !== 'PAID' && inv.gateway_status !== 'approved'));
                
            return matchesSearch && matchesDate && matchesStatus;
        });
    }, [invoices, invSearchTerm, invStartDate, invEndDate, invStatusFilter, invDateFilterType, allUsers, invoiceItems, orders, quotes, techs]);

    // Scanner automático removido: O sistema agora confia 100% na arquitetura orientada a eventos.
    // O Webhook do Mercado Pago recebe a notificação, valida a veracidade diretamente na API do MP,
    // atualiza o banco de dados e o Supabase Realtime empurra a atualização para a tela instantaneamente.
    // Isso elimina o consumo desnecessário de rede e CPU no navegador.

    // 🛡️ RECONCILIADOR DE SEGURANÇA — REMOVIDO (Auditoria Arquitetural Set/2026)
    // ─────────────────────────────────────────────────────────────────────────
    // O reconciliador client-side foi removido porque:
    //   1. Causava flickering infinito (invalidava queries a cada render)
    //   2. Competia com o Webhook do Mercado Pago, gerando race conditions
    //   3. O browser NUNCA deve ser a autoridade para status financeiro
    // A reconciliação agora é feita exclusivamente pelo webhook server-side.
    // ─────────────────────────────────────────────────────────────────────────

    const [isPageChanging, setIsPageChanging] = useState(false);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedItems.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedItems, currentPage]);

    const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);

    const [currentInvoicePage, setCurrentInvoicePage] = useState(1);
    
    // Volta pra página 1 sempre que os filtros mudarem
    useEffect(() => { setCurrentInvoicePage(1); }, [searchTerm, startDate, endDate, statusFilter]);

    const paginatedInvoices = useMemo(() => {
        const start = (currentInvoicePage - 1) * ITEMS_PER_PAGE;
        return filteredInvoices.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredInvoices, currentInvoicePage]);
    
    const totalInvoicePages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);

    // 3. Estatísticas
    const stats = useMemo(() => {
        const totalFaturado = filteredItems.filter(i => i.status === 'PAID').reduce((acc, i) => acc + i.value, 0);
        const totalPendente = filteredItems.filter(i => i.status !== 'PAID').reduce((acc, i) => acc + i.value, 0);
        const techBilling: Record<string, number> = {};
        filteredItems.forEach(item => {
            techBilling[item.technician] = (techBilling[item.technician] || 0) + item.value;
        });
        const topTech = Object.entries(techBilling).sort((a, b) => b[1] - a[1])[0] || ['Nenhum', 0];
        return { totalFaturado, totalPendente, topTech };
    }, [filteredItems]);

    // 4. Seleção
    const toggleSelect = (id: string) => {
        const link = invoiceItems.find(ii => ii.reference_id === id);
        let idsToToggle = [id];
        
        if (link) {
            const pendingInv = invoices.find(inv => inv.id === link.invoice_id && inv.status === 'PENDING');
            if (pendingInv) {
                const allLinks = invoiceItems.filter(ii => ii.invoice_id === pendingInv.id);
                idsToToggle = allLinks.map(ii => ii.reference_id);
            }
        }

        setSelectedIds(prev => {
            const isCurrentlySelected = prev.includes(id);
            if (isCurrentlySelected) {
                return prev.filter(i => !idsToToggle.includes(i));
            } else {
                return Array.from(new Set([...prev, ...idsToToggle]));
            }
        });
    };
    const selectedTotal = useMemo(() => {
        return allItems.filter(i => selectedIds.includes(i.id)).reduce((acc, i) => {
            if (selectedItem && selectedItem.id === i.id) return acc + Number(selectedItem.value);
            return acc + Number(i.value);
        }, 0);
    }, [allItems, selectedIds, selectedItem]);

    // 5. Handlers
    const handleInvoiceBatch = () => {
        if (selectedIds.length === 0) return;

        const hasPaidItems = selectedIds.some(id => {
            const item = filteredItems.find(i => i.id === id);
            return item?.status === 'PAID' || item?.original?.billingStatus === 'PAID' || item?.original?.billing_status === 'PAID';
        });

        if (hasPaidItems) {
            showAlert('Não é possível faturar itens que já constam como faturados/pagos.', 'error');
            return;
        }

        if (selectedIds.length > 1) {
            const getCustomerIdentifiers = (item: any) => {
                const id = item?.original?.customerId || item?.original?.customer_id;
                const name = (item?.customerName || item?.original?.customer_name || '').trim().toLowerCase();
                const doc = ((item as any)?.customerDocument || item?.original?.customer_document || item?.original?.customerDocument || '')
                    .toString().replace(/\D/g, '');
                return { id, name, doc };
            };

            const firstItem = filteredItems.find(i => i.id === selectedIds[0]);
            const firstCust = getCustomerIdentifiers(firstItem);

            const sameCustomer = selectedIds.every(id => {
                const item = filteredItems.find(i => i.id === id);
                const cust = getCustomerIdentifiers(item);

                if (firstCust.id && cust.id) return firstCust.id === cust.id;
                if (firstCust.doc && cust.doc) return firstCust.doc === cust.doc;
                if (firstCust.name && cust.name) return firstCust.name === cust.name;

                return true;
            });

            if (!sameCustomer) {
                showAlert('O faturamento agrupado só é permitido para itens do mesmo cliente.', 'error');
                return;
            }
        }

        setBillingDiscount(0);
        setBillingDiscountType('fixed');
        setBillingShipping(0);
        setBillingOtherAdditions(0);

        setIsInvoiceModalOpen(true);
    };

    const getPaymentMethodLabel = () => {
        if (paymentMethod === 'Cartão Crédito') return `Cartão Crédito ${installments}x`;
        return paymentMethod;
    };

    const confirmInvoice = async () => {
        if (!paymentMethod) {
            showAlert('Por favor, selecione uma forma de pagamento antes de faturar.', 'error');
            return;
        }
        setIsProcessing(true);
        const finalMethod = getPaymentMethodLabel();
        const paidAt = new Date().toISOString();
        const targetRawItem = filteredItems.find(i => selectedIds.includes(i.id)) || (selectedItem && selectedIds.includes(selectedItem.id) ? selectedItem : null);
        
        const itemsBaseTotal = selectedTotal;
        const discountValue = billingDiscountType === 'percent' ? (itemsBaseTotal * billingDiscount / 100) : billingDiscount;
        const finalAmount = Math.max(0, itemsBaseTotal - discountValue + billingShipping + billingOtherAdditions);
        const baseAmount = itemsBaseTotal;
        const isMpIntegrationTriggered = isMpConnected && (paymentMethod === 'Pix' || paymentMethod === 'Cartão Crédito' || paymentMethod === 'Boleto');
        
        try {
            const currentTenantId = tenant?.id || tenantIdStr || '';
            const firstItem = allItems.find(i => i.id === selectedIds[0]);
            // Big Tech Standard: Busca EXCLUSIVA por ID para evitar colisão em multi-tenant.
            // Tenta pegar o customer_id da fatura existente, ou da OS/Orçamento.
            const targetCustomerId = selectedInvoice?.customer_id || firstItem?.original?.customerId || firstItem?.original?.customer_id;
            const targetCustomerName = firstItem?.customerName || firstItem?.original?.customer_name || firstItem?.original?.customerName || '';
            const targetCustomerDoc = (firstItem as any)?.customerDocument || firstItem?.original?.customer_document || firstItem?.original?.customerDocument || '';

            // Busca hierárquica: por ID → por CPF/CNPJ → por nome → cria um objeto sintético com os dados disponíveis
            let fullCust: any = customers.find(c => c.id === targetCustomerId);
            if (!fullCust && targetCustomerDoc) {
                const cleanDoc = targetCustomerDoc.toString().replace(/\D/g, '');
                fullCust = customers.find(c => {
                    const cDoc = ((c as any).document || (c as any).cpf || (c as any).cnpj || '').toString().replace(/\D/g, '');
                    return cDoc && cDoc === cleanDoc;
                });
            }
            if (!fullCust && targetCustomerName) {
                fullCust = customers.find(c => c.name?.toLowerCase().trim() === targetCustomerName.toLowerCase().trim());
            }
            // Fallback sintético: usa os dados que já estão no item para não bloquear o faturamento
            if (!fullCust && targetCustomerName) {
                fullCust = {
                    id: targetCustomerId || '',
                    name: targetCustomerName,
                    document: targetCustomerDoc,
                    email: firstItem?.original?.customer_email || firstItem?.original?.customerEmail || '',
                    phone: firstItem?.original?.customer_phone || firstItem?.original?.customerPhone || '',
                };
            }
            
            if (!fullCust) {
                showAlert('Falha de Integridade: Cliente não identificado pelo ID. Verifique se a Ordem/Orçamento possui um cliente vinculado.', 'error');
                setIsProcessing(false);
                return;
            }

            const customerDoc = (firstItem as any)?.customerDocument || fullCust?.document || (fullCust as any)?.cpf || (fullCust as any)?.cnpj || firstItem?.original?.customer_document || firstItem?.original?.customerDocument;
            
            const invoiceStatus = isMpIntegrationTriggered ? 'PENDING' : 'PAID';

            // Verifica se os itens já pertencem a UMA ÚNICA fatura PENDENTE
            const existingLinks = invoiceItems.filter(ii => selectedIds.includes(ii.reference_id));
            const existingInvoiceIds = Array.from(new Set(existingLinks.map(ii => ii.invoice_id)));
            const existingPendingInvoices = invoices.filter(inv => existingInvoiceIds.includes(inv.id) && inv.status === 'PENDING');
            
            let targetInvoice = null;

            if (existingPendingInvoices.length === 1) {
                const pendingInv = existingPendingInvoices[0];
                const itemsOfThisInvoice = invoiceItems.filter(ii => ii.invoice_id === pendingInv.id);
                const hasAllExisting = itemsOfThisInvoice.every(ii => selectedIds.includes(ii.reference_id));
                
                if (hasAllExisting) {
                    targetInvoice = pendingInv;
                } else {
                    showAlert(`Alguns itens pertencem à fatura pendente ${pendingInv.display_id || pendingInv.id.slice(0,6)}. Você deve selecionar todos os itens dessa fatura para atualizá-la, ou excluir a fatura anterior.`, 'error');
                    setIsProcessing(false);
                    return;
                }
            } else if (existingPendingInvoices.length > 1) {
                showAlert('Os itens selecionados pertencem a múltiplas faturas pendentes. Por favor, cancele as faturas anteriores antes de prosseguir.', 'error');
                setIsProcessing(false);
                return;
            }

            let invoice;
            const operatorName = currentUser?.name || currentUser?.user_metadata?.full_name || currentUser?.email || (typeof window !== 'undefined' ? (JSON.parse(sessionStorage.getItem('user') || '{}').name || JSON.parse(localStorage.getItem('user') || '{}').name) : null) || 'Operador do Painel';
            const operatorId = currentUser?.id || currentUser?.user_metadata?.sub || 'system';

            if (targetInvoice) {
                // ATUALIZA Fatura Existente
                const updatePayload: any = {
                    total_amount: baseAmount,
                    discount_amount: discountValue,
                    shipping_amount: billingShipping,
                    other_additions_amount: billingOtherAdditions,
                    payment_method: finalMethod,
                    status: invoiceStatus,
                    paid_at: isMpIntegrationTriggered ? null : paidAt,
                    billed_by: operatorId,
                    billed_by_name: operatorName,
                    created_by: operatorName
                };

                let updatedInv = null;
                let { data: resData, error: updError } = await supabase.from('invoices').update(updatePayload).eq('id', targetInvoice.id).select('*').single();
                
                if (updError) {
                    delete updatePayload.billed_by;
                    delete updatePayload.billed_by_name;
                    delete updatePayload.created_by;
                    delete updatePayload.form_data;
                    const retryRes = await supabase.from('invoices').update(updatePayload).eq('id', targetInvoice.id).select('*').single();
                    if (retryRes.error) throw retryRes.error;
                    updatedInv = retryRes.data;
                } else {
                    updatedInv = resData;
                }
                invoice = updatedInv;

                // Insere apenas os novos itens (caso o usuário tenha adicionado mais)
                const itemsOfThisInvoice = invoiceItems.filter(ii => ii.invoice_id === targetInvoice.id);
                const existingItemIds = itemsOfThisInvoice.map(ii => ii.reference_id);
                const newIds = selectedIds.filter(id => !existingItemIds.includes(id));

                if (newIds.length > 0) {
                    const newInvoiceItemsData = newIds.map(id => {
                        const item = filteredItems.find(i => i.id === id);
                        return {
                            invoice_id: targetInvoice.id,
                            tenant_id: currentTenantId,
                            reference_type: item?.type || 'ORDER',
                            reference_id: id,
                            amount: item?.value || 0
                        };
                    });
                    await supabase.from('invoice_items').insert(newInvoiceItemsData);
                }
            } else {
                // 1. Sempre gera Nova Fatura
                const insertPayload: any = {
                    tenant_id: currentTenantId,
                    customer_id: fullCust?.id,
                    customer_name: fullCust?.name || firstItem?.customerName || 'Cliente',
                    customer_document: customerDoc,
                    total_amount: baseAmount,
                    discount_amount: discountValue,
                    shipping_amount: billingShipping,
                    other_additions_amount: billingOtherAdditions,
                    payment_method: finalMethod,
                    status: invoiceStatus,
                    paid_at: isMpIntegrationTriggered ? null : paidAt,
                    billed_by: operatorId,
                    billed_by_name: operatorName,
                    created_by: operatorName
                };

                let newInv = null;
                let { data: resData, error: invoiceError } = await supabase.from('invoices').insert([insertPayload]).select('*').single();
                
                if (invoiceError || !resData) {
                    delete insertPayload.billed_by;
                    delete insertPayload.billed_by_name;
                    delete insertPayload.created_by;
                    delete insertPayload.form_data;
                    const retryRes = await supabase.from('invoices').insert([insertPayload]).select('*').single();
                    if (retryRes.error || !retryRes.data) throw retryRes.error || new Error('Failed to create invoice');
                    newInv = retryRes.data;
                } else {
                    newInv = resData;
                }
                invoice = newInv;

                // 2. Sempre vincula itens à Fatura
                const invoiceItemsData = selectedIds.map(id => {
                    const item = filteredItems.find(i => i.id === id);
                    return {
                        invoice_id: invoice.id,
                        tenant_id: currentTenantId,
                        reference_type: item?.type || 'ORDER',
                        reference_id: id,
                        amount: item?.value || 0
                    };
                });

                await supabase.from('invoice_items').insert(invoiceItemsData);
            }

            // Garante que o estado local saiba dos itens recém-inseridos antes de tentar o MP (para não quebrar o Refaturar se o MP falhar)
            await loadInvoices();

            if (isMpIntegrationTriggered) {
                // Fluxo Asaas (Gera Link/Pix/Boleto ou Prepara Cartão)
                const asaasMethod = finalMethod === 'Pix' ? 'pix' : (finalMethod === 'Boleto' ? 'boleto' : 'credit_card');
                
                // PIX é estritamente à vista (1x). Boleto usa installmentCount. Cartão usa installments.
                const finalInstallments = asaasMethod === 'pix' ? 1 : (asaasMethod === 'credit_card' ? (installments || 1) : (installmentCount || 1));

                // Pre-flight: Validação obrigatória de CPF/CNPJ antes de chamar o gateway
                const resolvedDoc = customerDoc || fullCust?.document || (fullCust as any)?.cpf || (fullCust as any)?.cnpj;
                if (!resolvedDoc || !resolvedDoc.toString().replace(/\D/g, '')) {
                    showAlert(`Cliente "${fullCust?.name || invoice.customer_name}" não possui CPF/CNPJ cadastrado. Atualize o cadastro do cliente antes de faturar via gateway.`, 'error');
                    setIsProcessing(false);
                    return;
                }

                let asaasRes: any = { success: true, paymentId: '', pixCopiaECola: '', qrCode: '', ticketUrl: '', hostedCheckoutUrl: '' };

                asaasRes = await PaymentService.createAsaasCharge({
                    itemType: 'INVOICE',
                    itemId: invoice.id,
                    displayId: invoice.display_id,
                    title: selectedIds.length === 1 ? (firstItem?.title || 'Fatura') : `Fatura (${selectedIds.length} Itens)`,
                    amount: finalAmount,
                    customerName: fullCust?.name || invoice.customer_name,
                    customerDocument: resolvedDoc,
                    customerId: fullCust?.id || invoice.customer_id,
                    customerZip: fullCust?.zip || (fullCust as any)?.cep,
                    customerStreet: fullCust?.address || (fullCust as any)?.street,
                    customerNumber: fullCust?.number,
                    customerNeighborhood: fullCust?.neighborhood,
                    customerCity: fullCust?.city,
                    customerState: fullCust?.state,
                    paymentMethodType: asaasMethod,
                    installments: finalInstallments,
                    tenantId: currentTenantId
                });

                if (!asaasRes.success) {
                    showAlert(`Erro ao gerar fatura no Asaas: ${asaasRes.message || asaasRes.error}`, 'error');
                    setIsProcessing(false);
                    return;
                }

                const notesObj = {
                    gateway_provider: 'asaas',
                    gateway_payment_id: asaasRes.paymentId,
                    gateway_pix_code: asaasRes.pixCopiaECola || asaasRes.qrCode,
                    gateway_ticket_url: asaasRes.ticketUrl || asaasRes.hostedCheckoutUrl,
                    gateway_status: 'pending',
                    asaasInstallments: finalInstallments,
                    installments: finalInstallments,
                    max_installments: finalInstallments,
                    hasInstallments: finalInstallments > 1
                };
                
                await supabase.from('invoices').update({ 
                    payment_gateway_id: asaasRes.paymentId,
                    notes: JSON.stringify(notesObj)
                }).eq('id', invoice.id);

                for (const id of selectedIds) {
                    const rawItem = allItems.find(i => i.id === id);
                    if (!rawItem) continue;
                    if (rawItem.type === 'ORDER') {
                        await DataService.updateOrder({
                            ...(rawItem.original as ServiceOrder),
                            billingStatus: 'BILLED',
                            paymentMethod: finalMethod
                        });
                    } else {
                        await DataService.updateQuote({
                            ...rawItem.original,
                            status: 'FATURADO',
                            billingStatus: 'BILLED',
                            paymentMethod: finalMethod
                        });
                    }
                }

                setAsaasModalItem({
                    type: 'INVOICE',
                    id: invoice.id,
                    displayId: formatInvoiceDisplayId(invoice.display_id || invoice.id),
                    title: selectedIds.length === 1 ? (firstItem?.title || 'Fatura') : `Fatura (${selectedIds.length} Itens)`,
                    value: finalAmount,
                    customerName: invoice.customer_name,
                    customerDocument: invoice.customer_document,
                    gatewayPaymentId: asaasRes.paymentId,
                    gatewayPixCode: asaasRes.pixCopiaECola || asaasRes.qrCode,
                    gatewayTicketUrl: asaasRes.ticketUrl,
                    gatewayPaymentMethod: asaasMethod,
                    gatewayStatus: 'pending',
                    billingStatus: 'PENDING',
                    installments: finalInstallments,
                    asaasInstallments: finalInstallments,
                    notes: JSON.stringify(notesObj)
                });
                await loadInvoices();
                setIsInvoiceModalOpen(false);

                if (asaasMethod === 'credit_card') {
                    // Para cartão de crédito: abrir checkout automaticamente no painel interno
                    const checkoutUrl = `${window.location.origin}/#/checkout/invoice/${invoice.id}`;
                    window.open(checkoutUrl, '_blank');
                    showAlert('Fatura criada! O checkout foi aberto em uma nova aba para o cliente preencher o cartão.', 'success');
                    setInvoiceDetailTab('GERAL');
                    
                    const updatedInv = {
                        ...invoice,
                        gateway_ticket_url: asaasRes.ticketUrl || asaasRes.hostedCheckoutUrl,
                        ticket_url: asaasRes.ticketUrl || asaasRes.hostedCheckoutUrl,
                        gateway_payment_id: asaasRes.paymentId,
                        gateway_pix_code: asaasRes.pixCopiaECola || asaasRes.qrCode
                    };
                    setSelectedInvoice(updatedInv);
                    
                    await loadInvoices();
                    setIsInvoiceDetailModalOpen(true);
                } else {
                    setIsAsaasModalOpen(true);
                }
            } else {
                // Fluxo Manual (Dinheiro / Transferência)
                let uploadedReceiptUrl = '';
                if (receiptFile) {
                    try {
                        const folderId = invoice.id;
                        uploadedReceiptUrl = await StorageService.uploadFinancialReceipt(receiptFile, `financial/receipts/${folderId}`);
                    } catch (err) {
                        console.error("[FinancialDashboard] Error uploading receipt:", err);
                    }
                }

                for (const id of selectedIds) {
                    const rawItem = filteredItems.find(i => i.id === id);
                    if (!rawItem) continue;

                    const effectiveDiscount = billingDiscount > 0 ? billingDiscount : (rawItem.original?.discount || 0);
                    const effectiveDiscountType = billingDiscount > 0 ? billingDiscountType : (rawItem.original?.discountType || 'fixed');

                    if (rawItem.type === 'ORDER') {
                        await DataService.updateOrder({
                            ...(rawItem.original as ServiceOrder),
                            billingStatus: 'PAID',
                            paymentMethod: finalMethod,
                            billingNotes: billingNotes,
                            receiptUrl: uploadedReceiptUrl || rawItem.original?.receiptUrl,
                            discount: effectiveDiscount,
                            discountType: effectiveDiscountType,
                            paidAt
                        });

                        const linkedQuoteIds: string[] = rawItem.original.linkedQuotes ?? [];
                        for (const qId of linkedQuoteIds) {
                            const qOrigin = quotes.find(q => q.id === qId);
                            if (qOrigin) {
                                await DataService.updateQuote({
                                    ...qOrigin,
                                    status: 'FATURADO',
                                    billingStatus: 'PAID',
                                    paymentMethod: finalMethod,
                                    billingNotes: `Faturado via FAT ${invoice.display_id || invoice.id.slice(0, 8)}`,
                                    receiptUrl: uploadedReceiptUrl || qOrigin.receiptUrl,
                                    paidAt
                                });
                            }
                        }
                    } else {
                        await DataService.updateQuote({
                            ...rawItem.original,
                            status: 'FATURADO',
                            billingStatus: 'PAID',
                            paymentMethod: finalMethod,
                            billingNotes: billingNotes,
                            receiptUrl: uploadedReceiptUrl || rawItem.original?.receiptUrl,
                            discount: effectiveDiscount,
                            discountType: effectiveDiscountType,
                            paidAt
                        });
                    }

                    let itemNetValue = rawItem.value || 0;
                    if (billingDiscount > 0 && itemsBaseTotal > 0) {
                        if (effectiveDiscountType === 'percent') {
                            itemNetValue = itemNetValue * (1 - (effectiveDiscount / 100));
                        } else {
                            const weight = (rawItem.value || 0) / itemsBaseTotal;
                            itemNetValue = itemNetValue - (effectiveDiscount * weight);
                        }
                    }

                    try {
                        await DataService.registerCashFlow({
                            type: 'INCOME',
                            category: rawItem.type === 'ORDER' ? 'Serviço (O.S.)' : 'Venda (Orçamento)',
                            amount: itemNetValue,
                            description: `Faturamento (Manual) de ${rawItem.type === 'ORDER' ? 'O.S.' : 'Orçamento'} ${rawItem.displayId || '#' + rawItem.id.slice(0, 8)} — Cliente: ${rawItem.customerName}`,
                            referenceId: rawItem.id,
                            referenceType: rawItem.type,
                            paymentMethod: finalMethod,
                            entryDate: paidAt,
                            customerId: rawItem.original?.customerId || undefined,
                            technicianId: rawItem.type === 'ORDER' ? rawItem.original?.assignedTo : (rawItem.original?.createdBy || undefined)
                        });
                    } catch (e) { console.warn('Cash flow error:', e); }
                }

                if (selectedItem && selectedIds.includes(selectedItem.id)) {
                    setSelectedItem((prev: any) => prev ? ({
                        ...prev,
                        status: 'PAID',
                        original: { ...prev.original, billingStatus: 'PAID', paymentMethod: finalMethod, paidAt, discount: billingDiscount, discountType: billingDiscountType, receiptUrl: uploadedReceiptUrl || prev.original?.receiptUrl }
                    }) : null);
                }
                showAlert(`Faturamento e Baixa Financeira de ${selectedIds.length} item(s) realizado com sucesso!`, 'success');
                setIsInvoiceModalOpen(false);
                setReceiptFile(null);
                setPaymentMethod('');
                setInstallments(1);
                setBoletoDueDate('');
                setSelectedIds([]);
                await onRefresh();
                await loadInvoices();
            }
            

        } catch (error: any) {
            const rawMsg = String(error.message || error);
            if (!rawMsg.includes('Detalhe da API') && (rawMsg.includes('UNAUTHORIZED') || rawMsg.includes('unauthorized') || rawMsg.includes('não autorizadas'))) {
                showAlert('❌ Mercado Pago não autorizado!\n\nSuas credenciais expiraram ou o Access Token é inválido.\n\nAcesse Configurações > Integrações > Gateway de Pagamento, desconecte e reconecte informando o seu Access Token de Produção (APP_USR-...).', 'error');
            } else {
                showAlert(`Erro ao processar faturamento: ${rawMsg}`, 'error');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Handler de Impressão ──────────────────────────────────────────────────
    const handlePrint = (item: any) => {
        if (item.original?.receiptUrl) {
            // Mostra popup visual para escolha
            setPendingPrintItem(item);
            setShowAttachmentConfirmModal(true);
        } else {
            // Garante que o componente seja renderizado antes de imprimir
            flushSync(() => {
                setPrintWithAttachment(false);
                setPrintItem(item);
                setIsPrintModalOpen(true);
            });
            executePrint(false);
        }
    };

    const executePrint = (includeAttachment = false) => {
        const container = document.getElementById('print-container');
        if (!container) { window.print(); return; }

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            showAlert('Por favor, permita pop-ups neste site para imprimir.', 'warning');
            return;
        }

        const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map(el => el.outerHTML)
            .join('\n');

        printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <title>Recibo de Faturamento</title>
    ${styleLinks}
    <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { margin: 0 !important; padding: 0 !important; background: white; }
        /* Remove altura mínima artificial para evitar páginas em branco */
        #printable-receipt { min-height: unset !important; }
        /* Força quebra de página SOMENTE quando há comprovante na 2ª página */
        ${includeAttachment ? '#printable-receipt { page-break-after: always !important; break-after: page !important; }' : ''}
        @page { size: A4 portrait !important; margin: 10mm; }
        @media print {
            @page { size: A4 portrait !important; margin: 10mm; }
            body { margin: 0; padding: 0; }
            #printable-receipt { min-height: unset !important; }
            ${includeAttachment ? '#printable-receipt { page-break-after: always !important; break-after: page !important; }' : ''}
        }
    </style>
</head>
<body>
${container.innerHTML}
</body>
</html>`);

        printWindow.document.close();

        const doPrint = () => {
            printWindow.focus();
            printWindow.print();
            setTimeout(() => { 
                if (!printWindow.closed) printWindow.close(); 
                setIsPrintModalOpen(false);
                setPrintItem(null);
            }, 1000);
        };

        if (printWindow.document.readyState === 'complete') {
            setTimeout(doPrint, 300);
        } else {
            printWindow.onload = () => setTimeout(doPrint, 300);
            setTimeout(doPrint, 2500);
        }
    };

    const handleExportExcel = () => {
        if (selectedIds.length === 0) return;

        const itemsToExport = filteredItems.filter(i => selectedIds.includes(i.id));

        if (itemsToExport.length === 0) return;

        const formatDateTime = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch {
                return dateStr;
            }
        };

        const formatDate = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            try {
                const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            } catch {
                return dateStr;
            }
        };

        const headers = [
            'ID / Protocolo',
            'Tipo do Documento',
            'Data Agendada',
            'Hora Agendada',
            'Cliente',
            'Título',
            'Descrição',
            'Tipo de Atendimento',
            'Técnico',
            'Status Operacional',
            'Prioridade',
            'Valor Total',
            'Status Financeiro',
            'Data de Abertura',
            'Data de Conclusão / Baixa'
        ];

        const headerStyle = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '1C2D4F' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                top: { style: 'thin', color: { rgb: 'FFFFFF' } },
                bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
                left: { style: 'thin', color: { rgb: 'FFFFFF' } },
                right: { style: 'thin', color: { rgb: 'FFFFFF' } }
            }
        };

        const rows = itemsToExport.map(item => {
            const isOrder = item.type === 'ORDER';
            const orig: any = item.original || {};
            return [
                item.displayId || item.id.slice(0, 8).toUpperCase(),
                isOrder ? 'O.S.' : 'Orçamento',
                formatDate(orig.scheduledDate),
                orig.scheduledTime || 'N/A',
                item.customerName || 'N/A',
                item.title || 'N/A',
                item.description || 'N/A',
                orig.operationType || 'Não informado',
                item.technician || 'N/A',
                orig.status || 'N/A',
                orig.priority || 'N/A',
                item.value || 0,
                translateStatusToPT(item.status),
                formatDateTime(item.createdAt),
                formatDateTime(item.paidAt || item.updatedAt)
            ];
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws['!cols'] = [
            { wch: 15 }, // ID
            { wch: 18 }, // Tipo Documento
            { wch: 15 }, // Data Agendada
            { wch: 15 }, // Hora Agendada
            { wch: 30 }, // Cliente
            { wch: 30 }, // Título
            { wch: 40 }, // Descrição
            { wch: 20 }, // Tipo Atendimento
            { wch: 20 }, // Técnico
            { wch: 18 }, // Status Operacional
            { wch: 15 }, // Prioridade
            { wch: 15 }, // Valor Final
            { wch: 18 }, // Status Financeiro
            { wch: 20 }, // Abertura
            { wch: 20 }  // Conclusão
        ];

        const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: 0, c: C });
            if (!ws[address]) continue;
            ws[address].s = headerStyle;
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        XLSX.writeFile(wb, `Nexus_Financeiro_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const getItemNetValue = (item: any) => {
        if (!item) return 0;
        if (typeof item.netValue === 'number' && !isNaN(item.netValue)) return item.netValue;
        if (typeof item.value === 'number' && !isNaN(item.value)) return item.value;
        const totalVal = Number(item.original?.totalValue || item.original?.total_value || 0);
        if (totalVal > 0) return totalVal;
        return 0;
    };

    const renderInstallmentsDetails = (item: any) => {
        if (!item?.original?.paymentMethod) return null;
        const match = item.original.paymentMethod.match(/(\d+)x$/i);
        if (!match) return null;
        const numInstallments = parseInt(match[1], 10);
        if (numInstallments <= 1) return null;
        const netValue = getItemNetValue(item);
        return ` (${numInstallments}x de ${formatCurrency(netValue / numInstallments)})`;
    };

    const getDocLabel = (item: any) => {
        if (item.type === 'QUOTE') return item.displayId || `ORC-${item.id.slice(0, 8).toUpperCase()}`;
        return item.displayId || `OS-${item.id.slice(0, 8).toUpperCase()}`;
    };

    const paymentMethods = [
        { id: 'Pix', icon: <Smartphone size={20} />, label: 'Pix' },
        { id: 'Dinheiro', icon: <DollarSign size={20} />, label: 'Dinheiro' },
        { id: 'Cartão Débito', icon: <CreditCard size={20} />, label: 'Débito' },
        { id: 'Cartão Crédito', icon: <CreditCard size={20} />, label: 'Crédito' },
        { id: 'Boleto', icon: <FileText size={20} />, label: 'Boleto' },
        { id: 'Transferência', icon: <ArrowRight size={20} />, label: 'Transferência' },
    ];

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (columnKey: string) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown size={10} className="text-slate-300 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === 'asc' 
            ? <ArrowUp size={10} className="text-[#1c2d4f] ml-1.5" /> 
            : <ArrowDown size={10} className="text-[#1c2d4f] ml-1.5" />;
    };

    return (
        <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden relative font-sans">
            
            {/* ── TOP LEVEL TAB SWITCHER & SUB-VIEWS (Stripe / Linear Style) ── */}
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-0 mb-3 shrink-0">
                {/* Main Tabs (Stripe style underline tabs) */}
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => setMainTab('RECEIVABLES')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            mainTab === 'RECEIVABLES'
                                ? 'border-[#1c2d4f] text-[#1c2d4f]'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <TrendingUp size={16} className={mainTab === 'RECEIVABLES' ? 'text-[#1c2d4f]' : 'text-slate-400'} />
                        <span>Contas a Receber</span>
                    </button>

                    <button
                        onClick={() => setMainTab('PAYABLES')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            mainTab === 'PAYABLES'
                                ? 'border-amber-600 text-amber-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <ArrowUpRight size={16} className={mainTab === 'PAYABLES' ? 'text-amber-600' : 'text-slate-400'} />
                        <span>Contas a Pagar</span>
                    </button>

                    <button
                        onClick={() => setMainTab('CASH_FLOW')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            mainTab === 'CASH_FLOW'
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Wallet size={16} className={mainTab === 'CASH_FLOW' ? 'text-indigo-600' : 'text-slate-400'} />
                        <span>Giro de Caixa</span>
                    </button>
                    <button
                        onClick={() => setMainTab('COMMISSIONS')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            mainTab === 'COMMISSIONS'
                                ? 'border-teal-600 text-teal-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <UserCheck size={16} className={mainTab === 'COMMISSIONS' ? 'text-teal-600' : 'text-slate-400'} />
                        <span>Comissões</span>
                    </button>
                </div>
            </div>

            {/* Sub-View Switcher for Receivables (Sub-abas conectadas por guia visual à aba principal) */}
            {mainTab === 'RECEIVABLES' && (
                <div className="flex items-center gap-1.5 mb-3 shrink-0 pl-3">
                    {/* Linha/Haste de conexão visual "└" amarrando a aba principal às sub-abas */}
                    <div className="w-3.5 h-4 border-l-2 border-b-2 border-[#1c2d4f]/50 rounded-bl-md -mt-2 shrink-0" />

                    <div className="inline-flex p-1 bg-slate-200/60 rounded-lg border border-slate-200/80 shadow-inner">
                        <button
                            onClick={() => setReceivablesView('items')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                receivablesView === 'items'
                                    ? 'bg-[#1c2d4f] text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
                            }`}
                        >
                            <FileText size={13} className={receivablesView === 'items' ? 'text-white' : 'text-slate-400'} />
                            <span>Lançamentos (OS/Orçamentos)</span>
                        </button>

                        <button
                            onClick={() => setReceivablesView('invoices')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                receivablesView === 'invoices'
                                    ? 'bg-[#1c2d4f] text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
                            }`}
                        >
                            <Receipt size={13} className={receivablesView === 'invoices' ? 'text-white' : 'text-slate-400'} />
                            <span>Faturas Geradas</span>
                        </button>
                    </div>
                </div>
            )}

            {mainTab === 'PAYABLES' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-8">
                    <AccountsPayableTab tenantId={tenant?.id || ''} />
                </div>
            )}

            {mainTab === 'CASH_FLOW' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-8">
                    <CashFlowTab tenantId={tenant?.id || ''} receivables={allItems} />
                </div>
            )}

            {mainTab === 'COMMISSIONS' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-8">
                    <CommissionsTab techs={techs} />
                </div>
            )}

            {mainTab === 'RECEIVABLES' && (
                <>
                {/* ── HEADER DE AÇÕES ── */}

                        {/* ── FILTROS + STATS ── */}
                        <div className="flex-shrink-0 space-y-2.5 mb-2.5">
                            {/* Row 1: Search & Toggle & Export */}
                            <div className="flex flex-col xl:flex-row gap-2.5 items-center w-full">
                                <div className="flex w-full xl:w-auto flex-1 gap-2.5">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1c2d4f] transition-colors" size={14} />
                            <input
                                type="text"
                                placeholder={receivablesView === 'items' ? "Pesquisar por cliente, protocolo ou ORC..." : "Pesquisar por fatura ou cliente..."}
                                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 h-9 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f]/10 transition-all shadow-sm"
                                value={receivablesView === 'items' ? searchTerm : invSearchTerm}
                                onChange={e => { 
                                    if (receivablesView === 'items') {
                                        setSearchTerm(e.target.value); setCurrentPage(1); 
                                    } else {
                                        setInvSearchTerm(e.target.value); setCurrentInvoicePage(1);
                                    }
                                }}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-3 h-9 rounded-lg border transition-all text-[10px] font-medium ${showFilters ? 'bg-slate-800 border-slate-800 text-slate-200 shadow-inner' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
                        >
                            <Filter size={14} /> {showFilters ? 'Filtros (On)' : 'Filtros'}
                        </button>
                    </div>

                    <div className="flex items-center gap-2.5 ml-auto w-full xl:w-auto justify-end">
                        {/* Ações em Lote */}
                        {receivablesView === 'items' && selectedIds.length > 0 && (
                            <div className="flex items-center gap-3 px-3 py-1 bg-white border border-slate-200 rounded-lg shadow-sm animate-in fade-in h-9 mr-2">
                                <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase">Sel. ({selectedIds.length})</span>
                                    <span className="text-[11px] font-bold text-emerald-600">{formatCurrency(selectedTotal)}</span>
                                </div>

                                <button
                                    onClick={handleExportExcel}
                                    className="flex items-center gap-2 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-semibold uppercase transition-all"
                                    title="Exportar Seleção para Excel"
                                >
                                    <FileSpreadsheet size={13} /> Excel
                                </button>

                                <button
                                    onClick={() => {
                                        if (can('financial', 'invoice')) handleInvoiceBatch();
                                        else showAlert("Acesso Negado: Você não tem permissão para faturar.", 'warning');
                                    }}
                                    className={`flex items-center gap-2 px-3 py-1 text-white rounded text-[10px] font-semibold uppercase transition-all shadow-sm ${can('financial', 'invoice') ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 text-white/50 cursor-not-allowed'}`}
                                    title="Faturar Seleção"
                                >
                                    <DollarSign size={13} /> Faturar
                                </button>

                                <button
                                    onClick={() => setSelectedIds([])}
                                    className="p-1 ml-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-all"
                                    title="Limpar Seleção"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="group h-9 px-3 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-primary-600 shadow-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Atualizar dados financeiros"
                        >
                            {isRefreshing
                                ? <Loader2 size={16} className="animate-spin text-primary-500" />
                                : <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />}
                            {isRefreshing && <span className="text-[10px] font-medium text-primary-500">Atualizando...</span>}
                        </button>
                    </div>
                </div>

                {/* Collapsible Filters - Lançamentos */}
                {showFilters && receivablesView === 'items' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
                        {/* Tipo de Data */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Filtrar Data Por</label>
                            <select 
                                value={dateFilterType}
                                onChange={e => setDateFilterType(e.target.value as any)}
                                className="w-full bg-white border border-slate-200 text-xs font-semibold uppercase text-slate-700 outline-none cursor-pointer px-3 py-2 rounded-lg h-9 shadow-sm"
                            >
                                <option value="dueDate">Vencimento</option>
                                <option value="createdAt">Criação</option>
                                <option value="paidAt">Faturamento</option>
                            </select>
                        </div>

                        {/* Data Inicial (De) */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">De (Início)</label>
                            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg shadow-sm h-9 px-2.5">
                                <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={e => handleDateValidation(e.target.value, endDate)} 
                                    className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full" 
                                />
                            </div>
                        </div>

                        {/* Data Final (Até) */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Até (Fim)</label>
                            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg shadow-sm h-9 px-2.5">
                                <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={e => handleDateValidation(startDate, e.target.value)} 
                                    className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full" 
                                />
                            </div>
                        </div>

                        {/* Técnico / Responsável */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Técnico / Responsável</label>
                            <div className="relative w-full min-h-9" ref={techDropdownRef}>
                                <div 
                                    className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-6 text-xs font-medium text-slate-700 cursor-pointer shadow-sm flex items-center h-9 outline-none transition-all relative"
                                    onClick={() => setIsTechDropdownOpen(!isTechDropdownOpen)}
                                >
                                    <UserCheck size={13} className="absolute left-2.5 text-[#1c2d4f] shrink-0" />
                                    <span className="truncate uppercase">
                                        {techFilter === 'ALL' ? 'Técnicos (Todos)' : techFilter}
                                    </span>
                                    <ChevronDown size={14} className={`absolute right-2 text-slate-400 transition-transform ${isTechDropdownOpen ? 'rotate-180' : ''}`} />
                                </div>

                                {isTechDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
                                        <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                                            <div className="relative">
                                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Buscar técnico..." 
                                                    className="w-full bg-white border border-slate-200 rounded-lg pl-7 pr-2 py-1 text-xs font-medium outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
                                                    value={techSearchQuery}
                                                    onChange={e => setTechSearchQuery(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                            <div 
                                                className={`px-3 py-2 cursor-pointer text-xs font-medium uppercase hover:bg-slate-50 transition-colors ${techFilter === 'ALL' ? 'bg-primary-50 text-primary-700' : 'text-slate-700'}`}
                                                onClick={() => { setTechFilter('ALL'); setCurrentPage(1); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                                            >
                                                Técnicos (Todos)
                                            </div>
                                            {techs.filter(t => t.name.toLowerCase().includes(techSearchQuery.toLowerCase())).map(t => (
                                                <div 
                                                    key={t.id} 
                                                    className={`px-3 py-2 cursor-pointer text-xs font-medium uppercase transition-colors border-t border-slate-50 truncate ${techFilter === t.name ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                                    onClick={() => { setTechFilter(t.name); setCurrentPage(1); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                                                >
                                                    {t.name}
                                                </div>
                                            ))}
                                            {'administrador'.includes(techSearchQuery.toLowerCase()) && (
                                                <div 
                                                    className={`px-3 py-2 cursor-pointer text-xs font-medium uppercase transition-colors border-t border-slate-50 truncate ${techFilter === 'Administrador' ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                                    onClick={() => { setTechFilter('Administrador'); setCurrentPage(1); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                                                >
                                                    Administrador (Admin)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Estado do Lançamento */}
                        <div className="sm:col-span-2 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Estado do Lançamento</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full bg-white border border-slate-200 text-xs font-semibold uppercase text-slate-700 outline-none cursor-pointer px-3 py-2 rounded-lg h-9 shadow-sm"
                            >
                                <option value="ALL">Todos</option>
                                <option value="PENDING">Pendente</option>
                                <option value="PAID">Liquidada</option>
                            </select>
                        </div>

                        {/* Limpar Filtros */}
                        <div className="sm:col-span-2 lg:col-span-1 flex flex-col justify-end gap-1">
                            <button
                                onClick={() => {
                                    setDateFilterType('dueDate');
                                    const date = new Date();
                                    setStartDate(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]);
                                    setEndDate(new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]);
                                    setTechFilter('ALL');
                                    setStatusFilter('ALL');
                                    setSearchTerm('');
                                    setCurrentPage(1);
                                }}
                                className="h-9 w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                title="Limpar todos os filtros"
                            >
                                <X size={14} /> Limpar
                            </button>
                        </div>
                    </div>
                )}

                {/* Collapsible Filters - Faturas */}
                {showFilters && receivablesView === 'invoices' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
                        {/* Tipo de Data */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Filtrar Data Por</label>
                            <select 
                                value={invDateFilterType}
                                onChange={e => { setInvDateFilterType(e.target.value as any); setCurrentInvoicePage(1); }}
                                className="w-full bg-white border border-slate-200 text-xs font-semibold uppercase text-slate-700 outline-none cursor-pointer px-3 py-2 rounded-lg h-9 shadow-sm"
                            >
                                <option value="createdAt">Data Emissão</option>
                                <option value="paidAt">Data Pagamento</option>
                                <option value="dueDate">Data Vencimento</option>
                            </select>
                        </div>

                        {/* Data Inicial (De) */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">De (Início)</label>
                            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg shadow-sm h-9 px-2.5">
                                <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                                <input 
                                    type="date" 
                                    value={invStartDate} 
                                    onChange={e => handleInvDateValidation(e.target.value, invEndDate)} 
                                    className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full" 
                                />
                            </div>
                        </div>

                        {/* Data Final (Até) */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Até (Fim)</label>
                            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg shadow-sm h-9 px-2.5">
                                <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                                <input 
                                    type="date" 
                                    value={invEndDate} 
                                    onChange={e => handleInvDateValidation(invStartDate, e.target.value)} 
                                    className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full" 
                                />
                            </div>
                        </div>

                        {/* Estado da Fatura */}
                        <div className="sm:col-span-2 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Estado da Fatura</label>
                            <select
                                value={invStatusFilter}
                                onChange={(e) => { setInvStatusFilter(e.target.value); setCurrentInvoicePage(1); }}
                                className="w-full bg-white border border-slate-200 text-xs font-semibold uppercase text-slate-700 outline-none cursor-pointer px-3 py-2 rounded-lg h-9 shadow-sm"
                            >
                                <option value="ALL">Todas</option>
                                <option value="PENDING">Pendentes</option>
                                <option value="PAID">Pagas</option>
                            </select>
                        </div>

                        {/* Limpar Filtros */}
                        <div className="sm:col-span-2 lg:col-span-1 flex flex-col justify-end gap-1">
                            <button
                                onClick={() => {
                                    setInvDateFilterType('createdAt');
                                    const date = new Date();
                                    setInvStartDate(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]);
                                    setInvEndDate(new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]);
                                    setInvStatusFilter('ALL');
                                    setInvSearchTerm('');
                                    setCurrentInvoicePage(1);
                                }}
                                className="h-9 w-full flex items-center justify-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                title="Limpar todos os filtros"
                            >
                                <X size={14} /> Limpar
                            </button>
                        </div>
                    </div>
                )}

                {/* Stats Cards */}
                {receivablesView === 'items' && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                        { label: 'Total Recebido', value: formatCurrency(stats.totalFaturado), icon: <DollarSign size={14} />, color: 'from-emerald-500 to-emerald-600', textMain: 'text-white' },
                        { label: 'A Receber', value: formatCurrency(stats.totalPendente), icon: <Clock size={14} />, color: 'from-amber-500 to-amber-600', textMain: 'text-white' },
                        { label: 'Ticket Médio', value: formatCurrency(filteredItems.length > 0 ? (stats.totalFaturado + stats.totalPendente) / filteredItems.length : 0), icon: <TrendingUp size={14} />, color: 'from-[#1c2d4f] to-[#2a457a]', textMain: 'text-white' },
                        { label: 'Top Faturador', value: stats.topTech[0]?.toString() || '—', icon: <UserCheck size={14} />, color: 'from-slate-700 to-slate-900', textMain: 'text-white', truncate: true },
                    ].map((stat, i) => (
                        <div key={i} className={`bg-gradient-to-br ${stat.color} rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2.5`}>
                            <div className="w-7 h-7 rounded-md bg-white/15 flex items-center justify-center text-white shrink-0">
                                {stat.icon}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[8.5px] font-semibold text-white/70 uppercase tracking-wider leading-none mb-0.5">{stat.label}</p>
                                <p className={`text-[12.5px] font-bold ${stat.textMain} leading-none ${stat.truncate ? 'truncate' : ''}`}>{stat.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
                )}
            </div>

            {receivablesView === 'items' ? (
            <>
            {/* 💻 DESKTOP TABLE VIEW */}
            <div className="bg-white border border-slate-200 rounded-xl hidden md:flex flex-col overflow-hidden flex-1 min-h-0 shadow-sm relative financial-table-container">
                <div className="flex-1 overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-md z-10 border-b border-slate-200 shadow-xs font-poppins">
                            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                                <th className="px-2 py-2.5 w-8 text-center">
                                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-200 text-[#1c2d4f] cursor-pointer" checked={paginatedItems.length > 0 && paginatedItems.every(i => selectedIds.includes(i.id))} onChange={() => { 
                                        const unbilledPageItems = paginatedItems.filter(i => !invoiceItems.some(inv => inv.reference_id === i.id));
                                        const pageIds = unbilledPageItems.map(i => i.id);
                                        const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id));
                                        if (allSelected) {
                                            setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
                                        } else {
                                            setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
                                        }
                                     }} title="Selecionar página atual" />
                                </th>
                                <th className="px-2 py-2.5 cursor-pointer group select-none hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => requestSort('displayId')}>
                                    <div className="flex items-center gap-1">Protocolo {getSortIcon('displayId')}</div>
                                </th>
                                <th className="px-2 py-2.5 cursor-pointer group select-none hover:bg-slate-200/50 transition-colors whitespace-nowrap">
                                    <div className="flex items-center gap-1">Cód. FAT</div>
                                </th>
                                <th className="px-2 py-2.5 cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('customerName')}>
                                    <div className="flex items-center gap-1">Cliente {getSortIcon('customerName')}</div>
                                </th>
                                <th className="px-2 py-2.5 cursor-pointer group select-none hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => requestSort('createdAt')}>
                                    <div className="flex items-center gap-1">Data Criação {getSortIcon('createdAt')}</div>
                                </th>
                                <th className="px-2 py-2.5 cursor-pointer group select-none hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => requestSort('dueDate')}>
                                    <div className="flex items-center gap-1">Vencimento {getSortIcon('dueDate')}</div>
                                </th>
                                <th className="px-2 py-2.5 cursor-pointer group select-none hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => requestSort('paidAt')}>
                                    <div className="flex items-center gap-1">Pgto {getSortIcon('paidAt')}</div>
                                </th>
                                <th className="px-2 py-2.5 cursor-pointer group select-none hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => requestSort('value')}>
                                    <div className="flex items-center gap-1">Valor {getSortIcon('value')}</div>
                                </th>
                                <th className="px-2 py-2.5 text-center cursor-pointer group select-none hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => requestSort('status')}>
                                    <div className="flex items-center justify-center gap-1">Status {getSortIcon('status')}</div>
                                </th>
                                <th className="px-2 py-2.5 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center">Ações</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody key={currentPage} className="divide-y divide-slate-100 animate-fade-in duration-200">
                            {isRefreshing || isPageChanging ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 size={28} className="animate-spin text-primary-400" />
                                            <p className="text-xs font-medium text-slate-400">Carregando dados financeiros...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center">
                                        <DollarSign size={32} className="text-slate-200 mx-auto mb-3" />
                                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Nenhum lançamento encontrado</p>
                                    </td>
                                </tr>
                            ) : paginatedItems.map(item => {
                                const isFaturado = invoiceItems.some(invItem => invItem.reference_id === item.id);
                                const faturaId = isFaturado ? invoiceItems.find(invItem => invItem.reference_id === item.id)?.invoice_id : null;
                                const faturaDoc = faturaId ? invoices.find(inv => inv.id === faturaId)?.display_id : null;
                                return (
                                <tr
                                    key={item.id}
                                    className={`group hover:bg-slate-50 transition-all cursor-pointer ${selectedIds.includes(item.id) ? 'bg-[#1c2d4f]/5' : 'bg-white'}`}
                                    onClick={() => { setDetailTab('overview'); setSelectedItem(item); setEditingDueDate(''); setIsSidebarOpen(true); }}
                                >
                                    <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-[#1c2d4f] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" disabled={isFaturado} checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border w-fit block ${item.type === 'QUOTE' ? 'bg-[#1c2d4f]/10 text-[#1c2d4f] border-[#1c2d4f]/20' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                            {getDocLabel(item)}
                                        </span>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        {isFaturado && faturaDoc ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 block w-fit">
                                                    {faturaDoc}
                                                </span>
                                                {(() => {
                                                    const fatura = invoices.find(inv => invoiceItems.some(ii => ii.reference_id === item.id && ii.invoice_id === inv.id));
                                                    if (fatura) {
                                                        const invoiceNumber = fatura.invoice_number;
                                                        const gatewayId = fatura.gateway_payment_id || fatura.payment_gateway_id;
                                                        if (invoiceNumber) {
                                                            return (
                                                                <span className="text-[9px] text-slate-500 font-medium font-mono" title="Número da Fatura (Asaas)">
                                                                    Nº {invoiceNumber}
                                                                </span>
                                                            );
                                                        } else if (gatewayId) {
                                                            const displayGatewayId = gatewayId.startsWith('pay_') ? gatewayId.replace('pay_', '') : gatewayId;
                                                            return (
                                                                <span className="text-[9px] text-slate-400 font-medium font-mono truncate max-w-[100px] block" title={`ID Gateway: ${gatewayId}`}>
                                                                    ID: {displayGatewayId}
                                                                </span>
                                                            );
                                                        }
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-slate-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2">
                                        <p className="text-xs font-bold text-slate-800 truncate max-w-[120px] lg:max-w-[140px] 2xl:max-w-[200px]" title={item.customerName}>{item.customerName}</p>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] text-slate-700 font-medium">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '—'}</span>
                                            <span className="text-[9px] text-slate-400">Criação</span>
                                        </div>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-bold text-rose-600">
                                                {new Date((item.dueDate || item.date) + (!(item.dueDate || item.date).includes('T') ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')}
                                            </span>
                                            <span className="text-[9px] text-rose-400">Prazo</span>
                                        </div>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            {item.paidAt ? (
                                                <>
                                                    <span className="text-[11px] font-medium text-emerald-600">{new Date(item.paidAt).toLocaleDateString('pt-BR')}</span>
                                                    <span className="text-[9px] text-emerald-500">Liquidada</span>
                                                </>
                                            ) : (
                                                <span className="text-[11px] text-slate-300">—</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            {(item.discountAmount && item.discountAmount > 0) ? (
                                                <>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs font-bold text-emerald-600">
                                                            {formatCurrency(item.netValue || item.value)}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 line-through">
                                                            {formatCurrency(item.grossValue)}
                                                        </span>
                                                    </div>
                                                    <span className="text-[8px] text-rose-600 font-bold uppercase tracking-wider bg-rose-50 px-1 py-0.5 rounded border border-rose-200 inline-block w-fit">
                                                        Desc: -{formatCurrency(item.discountAmount)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-xs font-bold text-slate-900">
                                                    {formatCurrency(item.netValue || item.value)}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap">
                                            {(() => {
                                                const style = getStatusStyle(item.status, (item.original as any)?.gateway_status);
                                                return (
                                                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border whitespace-pre-line leading-tight ${style.bg}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                                                        {translateStatusToPT(item.status)}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    <td className="px-2 py-2 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                type="button"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (checkingInvoiceId === item.id) return;
                                                    setCheckingInvoiceId(item.id);
                                                    try {
                                                        const linkedInvoice = invoices.find(inv => invoiceItems.some(ii => ii.reference_id === item.id && ii.invoice_id === inv.id));
                                                        
                                                        if (!linkedInvoice) {
                                                            showAlert(`O.S./Orçamento #${getDocLabel(item)} não possui nenhuma Fatura (FAT) vinculada.`, 'warning');
                                                            return;
                                                        }

                                                        const fatIsPaid = linkedInvoice.status === 'PAID' || linkedInvoice.gateway_status === 'approved';
                                                        const newBillingStatus = fatIsPaid ? 'PAID' : 'PENDING';
                                                        const paidAtVal = fatIsPaid ? (linkedInvoice.paid_at || linkedInvoice.updated_at || new Date().toISOString()) : null;

                                                        // Atualiza no banco de dados Supabase
                                                        if (item.type === 'ORDER') {
                                                            await supabase
                                                                .from('orders')
                                                                .update({ 
                                                                    billing_status: newBillingStatus,
                                                                    paid_at: paidAtVal
                                                                })
                                                                .eq('id', item.id);
                                                        } else if (item.type === 'QUOTE') {
                                                            await supabase
                                                                .from('quotes')
                                                                .update({ 
                                                                    billing_status: newBillingStatus,
                                                                    status: fatIsPaid ? 'APPROVED' : (item.original as any)?.status || 'PENDING',
                                                                    paid_at: paidAtVal
                                                                })
                                                                .eq('id', item.id);
                                                        }

                                                        if (onRefresh) await onRefresh();
                                                        await loadInvoices();

                                                        if (fatIsPaid) {
                                                            showAlert(`Status do lançamento #${getDocLabel(item)} sincronizado com a Fatura ${linkedInvoice.display_id}: LIQUIDADO.`, 'success');
                                                        } else {
                                                            showAlert(`Status do lançamento #${getDocLabel(item)} sincronizado com a Fatura ${linkedInvoice.display_id}: PENDENTE.`, 'info');
                                                        }
                                                    } catch (err: any) {
                                                        showAlert(`Erro ao sincronizar status com a Fatura: ${err.message}`, 'error');
                                                    } finally {
                                                        setCheckingInvoiceId(null);
                                                    }
                                                }}
                                                disabled={checkingInvoiceId === item.id}
                                                className="p-1 text-sky-600 hover:text-sky-800 hover:bg-sky-50 rounded transition-colors disabled:opacity-50"
                                                title="Sincronizar status com a Fatura (FAT) vinculada"
                                            >
                                                {checkingInvoiceId === item.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                            </button>


                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAuditModalItem({
                                                        type: item.type,
                                                        id: item.id,
                                                        displayId: getDocLabel(item),
                                                        title: item.title,
                                                        amount: (item as any).netValue ?? item.value ?? getItemNetValue(item),
                                                        grossValue: (item as any).grossValue ?? (item.value + (item.billingDiscount || 0)),
                                                        discountAmount: (item as any).discountAmount ?? item.billingDiscount ?? 0,
                                                        netValue: (item as any).netValue ?? item.value,
                                                        billingDiscount: item.billingDiscount,
                                                        billingDiscountType: item.billingDiscountType,
                                                        customerName: item.customerName,
                                                        customerDocument: (item as any).customerDocument,
                                                        paymentMethod: (item as any).paymentMethod || (item as any).payment_method || (item.original as any)?.payment_method || (item.original as any)?.paymentMethod || (item as any).gatewayPaymentMethod || (item.original as any)?.gateway_payment_method || ((item as any).gatewayPaymentId || (item.original as any)?.gateway_payment_id ? 'credit_card' : null),
                                                        installments: (item as any).installments || (item as any).mpInstallments || (item.original as any)?.installments || (item.original as any)?.mpInstallments || (item.original as any)?.form_data?.mpInstallments || (item.original as any)?.form_data?.installments || (item.original as any)?.approval_metadata?.mpInstallments || (item.original as any)?.approval_metadata?.installments || null,
                                                        gatewayProvider: (item as any).gatewayProvider || (item.original as any)?.gateway_provider || (item.original as any)?.gatewayProvider,
                                                        gatewayPaymentId: (item.original as any)?.gateway_payment_id || (item.original as any)?.gatewayPaymentId || (item as any).gatewayPaymentId,
                                                        gatewayStatus: (item.original as any)?.gateway_status || (item.original as any)?.gatewayStatus || (item as any).gatewayStatus,
                                                        paidAt: (item as any).paidAt || (item.original as any)?.paid_at || (item.original as any)?.paidAt,
                                                        billingStatus: item.status,
                                                        createdAt: item.createdAt,
                                                        original: item.original
                                                    });
                                                    setIsAuditModalOpen(true);
                                                }}
                                                className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                                                title="Auditoria Gateway"
                                            >
                                                <ShieldCheck size={14} />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => { setDetailTab('overview'); setSelectedItem(item); setEditingDueDate(''); setIsSidebarOpen(true); }}
                                                className="p-1 text-slate-400 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                                                title="Ver Detalhes"
                                            >
                                                <Eye size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 📱 MOBILE CARDS VIEW */}
            <div className="md:hidden flex-1 overflow-auto custom-scrollbar bg-slate-50/50 p-2 space-y-2 pb-28">
                {isRefreshing ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Loader2 size={28} className="animate-spin text-primary-400 mb-3" />
                        <p className="text-xs font-medium">Carregando dados...</p>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <DollarSign size={32} className="text-slate-300 mb-3" />
                        <p className="text-xs font-medium uppercase tracking-widest">Nenhum lançamento encontrado</p>
                    </div>
                ) : (
                    paginatedItems.map(item => {
                        const isFaturado = invoiceItems.some(invItem => invItem.reference_id === item.id);
                        const faturaId = isFaturado ? invoiceItems.find(invItem => invItem.reference_id === item.id)?.invoice_id : null;
                        const faturaDoc = faturaId ? invoices.find(inv => inv.id === faturaId)?.display_id : null;
                        return (
                        <div 
                            key={item.id}
                            className={`bg-white p-3 rounded-2xl shadow-sm border ${selectedIds.includes(item.id) ? 'border-primary-400 ring-1 ring-primary-100' : 'border-slate-200/60'} active:scale-[0.98] transition-all flex flex-col gap-2 relative overflow-hidden`}
                            onClick={() => { setDetailTab('overview'); setSelectedItem(item); setEditingDueDate(''); setIsSidebarOpen(true); }}
                        >
                            {/* Checkbox absoluto para seleção rápida (Longo Press ou click direto) */}
                            <div 
                                className="absolute top-3 right-3 p-2 -m-2 z-10"
                                onClick={(e) => { e.stopPropagation(); if (!isFaturado) toggleSelect(item.id); }}
                            >
                                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#1c2d4f] disabled:opacity-30 disabled:cursor-not-allowed" disabled={isFaturado} checked={selectedIds.includes(item.id)} readOnly />
                            </div>

                            <div className="flex items-start justify-between gap-2 pr-8">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded w-max ${item.type === 'QUOTE' ? 'bg-[#1c2d4f]/10 text-[#1c2d4f]' : 'bg-slate-100 text-slate-600'}`}>
                                            {getDocLabel(item)}
                                        </span>
                                        {isFaturado && faturaDoc && (item.status === 'PAID' || item.gateway_status === 'approved') && (
                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                FAT: {faturaDoc}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{item.customerName}</h3>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Valor</span>
                                    <span className="text-sm font-bold text-slate-900">{formatCurrency(item.value)}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Vencimento</span>
                                    <span className="text-xs font-bold text-rose-600">{new Date((item.dueDate || item.date) + (!(item.dueDate || item.date).includes('T') ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{item.title}</span>
                                {(() => {
                                    const style = getStatusStyle(item.status, (item.original as any)?.gateway_status);
                                    return (
                                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border tracking-wide ${style.bg}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                            {translateStatusToPT(item.status)}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )
                })
                )}
            </div>
            
            <div className="bg-white border-t border-slate-200">
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredItems.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={(page) => {
                        setIsPageChanging(true);
                        setCurrentPage(page);
                        setTimeout(() => {
                            setIsPageChanging(false);
                            const container = document.querySelector('.financial-table-container .overflow-x-auto') || document.querySelector('.financial-table-container');
                            if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
                            const scrollableRoot = document.querySelector('.overflow-y-auto.custom-scrollbar');
                            if (scrollableRoot) scrollableRoot.scrollTo({ top: 0, behavior: 'smooth' });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }, 200);
                    }}
                />
            </div>
            </>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1 h-[calc(100vh-200px)]">
                    <div className="overflow-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                <tr>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Fatura</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Cliente</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap text-center">Forma de Pagamento</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Data Emissão</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Data Pagamento</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">Valor Total</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">Status</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedInvoices.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-500 text-sm">
                                            {invoices.length === 0 ? 'Nenhuma fatura gerada até o momento.' : 'Nenhuma fatura encontrada com os filtros atuais.'}
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedInvoices.map((inv: any) => (
                                        <tr 
                                            key={inv.id} 
                                            onClick={() => handleOpenInvoiceDetail(inv)}
                                            className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                        >
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-2 relative">
                                                        {spinningInvoiceId === inv.id ? (
                                                            <Loader2 size={16} className="text-[#009EE3] shrink-0 animate-spin" />
                                                        ) : (
                                                            <FileText size={16} className="text-[#009EE3] shrink-0" />
                                                        )}
                                                        <span className="font-semibold text-slate-800 text-xs whitespace-nowrap">
                                                            {inv.display_id}
                                                        </span>
                                                    </div>
                                                    {inv.invoice_number ? (
                                                        <span className="text-[10px] text-slate-500 font-mono font-medium ml-6">
                                                            Nº {inv.invoice_number}
                                                        </span>
                                                    ) : (inv.gateway_payment_id || inv.payment_gateway_id) ? (
                                                        <span className="text-[9px] text-slate-400 font-mono font-medium ml-6 truncate max-w-[120px] inline-block" title={`ID Gateway: ${inv.gateway_payment_id || inv.payment_gateway_id}`}>
                                                            ID: {(inv.gateway_payment_id || inv.payment_gateway_id).startsWith('pay_') ? (inv.gateway_payment_id || inv.payment_gateway_id).replace('pay_', '') : (inv.gateway_payment_id || inv.payment_gateway_id)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-semibold text-slate-700">{inv.customer_name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono">{inv.customer_document}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                {(() => {
                                                    const pMethod = getInvoicePaymentMethodLabel(inv);
                                                    return (
                                                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] border ${pMethod.badge}`}>
                                                            {pMethod.label}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                                {new Date(inv.created_at).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="py-3 px-4 text-xs font-semibold text-slate-700 whitespace-nowrap">
                                                {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('pt-BR') : <span className="text-slate-400 font-normal">—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                <span className="text-sm font-bold text-emerald-600">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.total_amount - (inv.discount_amount || 0) + (inv.shipping_amount || 0) + (inv.other_additions_amount || 0))}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                {(() => {
                                                    const style = getStatusStyle(inv.status, inv.gateway_status);
                                                    return (
                                                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border whitespace-pre-line leading-tight ${style.bg}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                                                            {translateStatusToPT(inv.status)}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (checkingInvoiceId === inv.id) return;
                                                            const rawMpId = inv.gateway_payment_id || inv.payment_gateway_id;
                                                            
                                                            setCheckingInvoiceId(inv.id);
                                                            try {
                                                                const res = await PaymentService.syncInstallment(rawMpId, undefined, inv.id, 'INVOICE');
                                                                
                                                                // Atualização otimista na tela (Faturas)
                                                                if (res.success && res.newStatus) {
                                                                    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: res.newStatus, gateway_status: res.newStatus === 'PAID' ? 'approved' : 'pending' } : i));
                                                                }
                                                                
                                                                await loadInvoices();
                                                                if (!res.success) {
                                                                    showAlert(res.message || 'Erro ao sincronizar fatura no banco.', 'error');
                                                                } else if (res.newStatus === 'PAID') {
                                                                    showAlert(`A Fatura ${inv.display_id} consta como PAGA / LIQUIDADA no Asaas.`, 'success');
                                                                } else {
                                                                    const statusPT = translateStatusToPT(res.newStatus || 'PENDING');
                                                                    showAlert(`A Fatura ${inv.display_id} consta como ${statusPT.toUpperCase()} no Asaas.`, 'info');
                                                                }
                                                            } catch (err: any) {
                                                                showAlert(`Erro ao consultar Asaas: ${err.message}`, 'error');
                                                            } finally {
                                                                setCheckingInvoiceId(null);
                                                            }
                                                        }}
                                                        disabled={checkingInvoiceId === inv.id}
                                                        className="p-1 text-sky-600 hover:text-sky-800 hover:bg-sky-50 rounded transition-colors disabled:opacity-50"
                                                        title="Consultar e atualizar status no Asaas"
                                                    >
                                                        {checkingInvoiceId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                    </button>
                                                    {/* NFS-e Button — only shows when invoice has at least one payment */}
                                                    {(inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID' || inv.gateway_status === 'approved') && (() => {
                                                        const nfse = nfseDataMap[inv.id];
                                                        const isEmitting = emittingNfseId === inv.id;
                                                        const isAuthorized = nfse?.status === 'AUTHORIZED';
                                                        const isPending = nfse && (nfse.status === 'SCHEDULED' || nfse.status === 'SYNCHRONIZED');
                                                        const hasError = nfse?.status === 'ERROR';

                                                        return (
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (isEmitting) return;

                                                                    if (isAuthorized) {
                                                                        // Open NFS-e detail modal
                                                                        setNfseDetailModal({ isOpen: true, invoiceId: inv.id, data: { ...nfse, invoiceDisplayId: inv.display_id, customerName: inv.customer_name } });
                                                                        return;
                                                                    }

                                                                    if (isPending) {
                                                                        // Check status
                                                                        setEmittingNfseId(inv.id);
                                                                        try {
                                                                            const res = await PaymentService.checkNfseStatus(inv.id, nfse?.asaas_nfse_id);
                                                                            if (res.success && res.nfse) {
                                                                                setNfseDataMap(prev => ({ ...prev, [inv.id]: { status: res.nfse.status, pdfUrl: res.nfse.pdfUrl, xmlUrl: res.nfse.xmlUrl, number: res.nfse.number, asaas_nfse_id: res.nfse.id } }));
                                                                                if (res.nfse.status === 'AUTHORIZED') {
                                                                                    showAlert(`✅ NFS-e #${res.nfse.number || ''} autorizada com sucesso! PDF e XML disponíveis.`, 'success');
                                                                                } else {
                                                                                    const statusMapPt: Record<string, string> = {
                                                                                        'SCHEDULED': 'AGENDADA',
                                                                                        'SYNCHRONIZED': 'ENVIADA À PREFEITURA',
                                                                                        'AUTHORIZED': 'AUTORIZADA',
                                                                                        'PROCESSING_CANCELLATION': 'PROCESSANDO CANCELAMENTO',
                                                                                        'CANCELED': 'CANCELADA',
                                                                                        'CANCELLATION_DENIED': 'CANCELAMENTO NEGADO',
                                                                                        'ERROR': 'ERRO'
                                                                                    };
                                                                                    const statusStr = statusMapPt[res.nfse.status] || res.nfse.status;
                                                                                    showAlert(`Status da NFS-e: ${statusStr}. Aguarde a autorização pela prefeitura.`, 'info');
                                                                                }
                                                                            } else {
                                                                                showAlert(res.message || 'Erro ao verificar status', 'error');
                                                                            }
                                                                        } catch (err: any) {
                                                                            showAlert(`Erro: ${err.message}`, 'error');
                                                                        } finally {
                                                                            setEmittingNfseId(null);
                                                                        }
                                                                        return;
                                                                    }

                                                                    // Emit new NFS-e
                                                                    setEmittingNfseId(inv.id);
                                                                    try {
                                                                        const res = await PaymentService.createNfse(inv.id);
                                                                        if (res.success) {
                                                                            let msg = res.message || 'NFS-e agendada com sucesso!';
                                                                            msg = msg.replace('SCHEDULED', 'AGENDADA')
                                                                                     .replace('SYNCHRONIZED', 'ENVIADA À PREFEITURA')
                                                                                     .replace('AUTHORIZED', 'AUTORIZADA')
                                                                                     .replace('ERROR', 'ERRO');
                                                                            showAlert(msg, 'success');
                                                                            if (res.nfse) {
                                                                                setNfseDataMap(prev => ({ ...prev, [inv.id]: { status: res.nfse.status || 'SCHEDULED', pdfUrl: res.nfse.pdfUrl, xmlUrl: res.nfse.xmlUrl, number: res.nfse.number, asaas_nfse_id: res.nfse.id } }));
                                                                            }
                                                                            await loadInvoices();
                                                                        } else {
                                                                            showAlert(res.message || 'Erro ao emitir NFS-e', 'error');
                                                                        }
                                                                    } catch (err: any) {
                                                                        showAlert(`Erro: ${err.message}`, 'error');
                                                                    } finally {
                                                                        setEmittingNfseId(null);
                                                                    }
                                                                }}
                                                                disabled={isEmitting}
                                                                className={`p-1 rounded transition-all disabled:opacity-50 ${
                                                                    isAuthorized 
                                                                        ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50' 
                                                                        : isPending 
                                                                            ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' 
                                                                            : hasError
                                                                                ? 'text-red-500 hover:text-red-700 hover:bg-red-50'
                                                                                : 'text-violet-500 hover:text-violet-700 hover:bg-violet-50'
                                                                }`}
                                                                title={
                                                                    isAuthorized 
                                                                        ? `NFS-e #${nfse?.number || ''} — Clique para ver PDF/XML` 
                                                                        : isPending 
                                                                            ? 'NFS-e aguardando autorização — Clique para verificar status' 
                                                                            : hasError
                                                                                ? `Erro na emissão: ${nfse?.error_message || 'Erro desconhecido'} — Clique para tentar novamente`
                                                                                : 'Emitir NFS-e (Nota Fiscal de Serviço)'
                                                                }
                                                            >
                                                                {isEmitting ? (
                                                                    <Loader2 size={14} className="animate-spin" />
                                                                ) : (
                                                                    <div className="relative">
                                                                        <Receipt size={14} />
                                                                        {isPending && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />}
                                                                        {isAuthorized && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                                                                    </div>
                                                                )}
                                                            </button>
                                                        );
                                                    })()}
                                                    <button
                                                        onClick={() => handleOpenInvoiceDetail(inv)}
                                                        className="p-1 text-slate-400 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                                                        title="Ver Fatura"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {totalInvoicePages > 0 && (
                        <div className="p-4 border-t border-slate-100 bg-white">
                            <Pagination
                                currentPage={currentInvoicePage}
                                totalPages={totalInvoicePages}
                                totalItems={filteredInvoices.length}
                                itemsPerPage={ITEMS_PER_PAGE}
                                onPageChange={(page) => {
                                    setIsPageChanging(true);
                                    setCurrentInvoicePage(page);
                                    setTimeout(() => {
                                        setIsPageChanging(false);
                                        const container = document.querySelector('.overflow-auto.custom-scrollbar');
                                        if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
                                    }, 200);
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* MOBILE FAB FOR BATCH ACTIONS */}
            {selectedIds.length > 0 && (
                <button
                    onClick={() => {
                        if (can('financial', 'invoice')) handleInvoiceBatch();
                        else showAlert("Acesso Negado: Você não tem permissão para faturar.", 'warning');
                    }}
                    className="md:hidden fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-tr from-emerald-500 to-emerald-600 text-white rounded-full shadow-[0_8px_30px_rgba(16,185,129,0.4)] flex items-center justify-center z-50 active:scale-90 transition-transform"
                >
                    <DollarSign size={24} />
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-slate-900 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white">{selectedIds.length}</span>
                </button>
            )}



            {/* ── PAINEL DE DETALHES — Idêntico à edição de OS ── */}
            {isSidebarOpen && selectedItem && createPortal(
                <div
                    className="fixed inset-0 z-[1200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-0 lg:p-4 animate-in fade-in"
                    onClick={() => setIsSidebarOpen(false)}
                >
                    <div
                        className="bg-white rounded-none lg:rounded-xl w-full max-w-[96vw] lg:max-w-6xl h-full lg:h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200 animate-scale-up font-poppins"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* HEADER — igual ao da OS */}
                        <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white">
                            <div className="flex items-start sm:items-center gap-2 sm:gap-4 min-w-0 flex-1">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-slate-400 shrink-0">
                                    {selectedItem.type === 'QUOTE' ? <FileText size={18} /> : <Wrench size={18} />}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                                        <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins truncate">
                                            {selectedItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'} #{getDocLabel(selectedItem)}
                                        </h2>
                                        {(() => {
                                            const style = getStatusStyle(selectedItem.status, (selectedItem.original as any)?.gateway_status);
                                            return (
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest border ${style.bg}`}>
                                                    {translateStatusToPT(selectedItem.status)}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                                        {selectedItem.customerName} • {selectedItem.title || (selectedItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                <button
                                    onClick={() => {
                                        const route = selectedItem.type === 'QUOTE' ? 'view-quote' : 'order/view';
                                        const token = selectedItem.original?.publicToken || selectedItem.id;
                                        window.open(`${window.location.origin}/#/${route}/${token}`, '_blank');
                                    }}
                                    className="h-9 px-2 sm:px-4 gap-1.5 border border-primary-200 text-primary-700 hover:bg-primary-50 rounded-lg text-xs font-medium transition-all flex items-center"
                                >
                                    <Share2 size={14} /> <span className="hidden sm:inline">Visualizar</span>
                                </button>
                                <button
                                    onClick={() => handlePrint(selectedItem)}
                                    className="h-9 px-2 sm:px-4 gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-all flex items-center"
                                >
                                    <Printer size={14} /> <span className="hidden sm:inline">Imprimir</span>
                                </button>

                                <div className="h-6 w-px bg-slate-200 mx-0.5 sm:mx-2" />
                                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* BODY — sidebar tabs + conteúdo */}
                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

                            {/* DESKTOP SIDEBAR TABS */}
                            <div className="hidden md:flex flex-col gap-1 w-48 p-4 border-r border-slate-100 bg-slate-50/50 shrink-0">
                                {[
                                    { id: 'overview', label: 'Visão Geral', icon: Info },
                                    { id: 'financial', label: 'Financeiro', icon: DollarSign },
                                    { id: 'audit', label: 'Auditoria Gateway', icon: ShieldCheck },
                                    { id: 'linked', label: selectedItem.type === 'ORDER' ? 'Vínculos' : 'Detalhes', icon: Layer },
                                    { id: 'attachments', label: 'Anexos', icon: Paperclip },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setDetailTab(tab.id as any)}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all w-full text-left font-poppins
                                            ${detailTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md ring-1 ring-[#1c2d4f]'
                                                : 'text-slate-500 hover:bg-white hover:text-[#1c2d4f] hover:shadow-sm'}`}
                                    >
                                        <tab.icon size={15} className={detailTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} />
                                        <span className="flex-1 truncate">{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* MOBILE TABS */}
                            <div className="md:hidden border-b border-slate-200 bg-white p-3 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                                {[
                                    { id: 'overview', label: 'Visão Geral', icon: Info },
                                    { id: 'financial', label: 'Financeiro', icon: DollarSign },
                                    { id: 'audit', label: 'Auditoria Gateway', icon: ShieldCheck },
                                    { id: 'linked', label: selectedItem.type === 'ORDER' ? 'Vínculos' : 'Detalhes', icon: Layer },
                                    { id: 'attachments', label: 'Anexos', icon: Paperclip },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setDetailTab(tab.id as any)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap font-poppins
                                            ${detailTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md'
                                                : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                    >
                                        <tab.icon size={14} className={detailTab === tab.id ? 'text-white' : 'text-slate-400'} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* CONTEÚDO DA ABA */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/80 custom-scrollbar">

                                {detailTab === 'overview' && (
                                    <div className="space-y-4">
                                        {/* Valores da Fatura (Enterprise Style) */}
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-poppins">
                                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600">
                                                        <DollarSign size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-800">Valores e Conciliação</h3>
                                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Detalhamento financeiro da fatura</p>
                                                    </div>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                                    selectedItem.status === 'PAID' 
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                                                        : 'bg-amber-50 text-amber-600 border-amber-200'
                                                }`}>
                                                    {selectedItem.status === 'PAID' ? 'Liquidado e Conciliado' : 'Aguardando Pagamento'}
                                                </span>
                                            </div>

                                            <div className="p-5 flex flex-col gap-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subtotal Bruto</span>
                                                    <span className="text-sm font-semibold text-slate-400 line-through text-right">
                                                        {formatCurrency((selectedItem as any).grossValue || (selectedItem.value + (selectedItem.billingDiscount || 0)))}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desconto Concedido</span>
                                                    <span className="text-sm font-semibold text-rose-500 text-right">
                                                        - {formatCurrency((selectedItem as any).discountAmount || selectedItem.billingDiscount || 0)} {selectedItem.billingDiscountType === 'percent' ? `(${selectedItem.billingDiscount}%)` : ''}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1">
                                                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Valor Líquido (Total a Pagar)</span>
                                                    <span className="text-xl font-bold text-emerald-600 text-right">
                                                        {formatCurrency((selectedItem as any).netValue || selectedItem.value)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card de Cobrança Mercado Pago Salva / Ativa no Drawer */}
                                        {selectedItem.status !== 'PAID' && (selectedItem.original?.gateway_ticket_url || (selectedItem.original as any)?.gatewayTicketUrl || selectedItem.original?.gateway_pix_code || (selectedItem.original as any)?.gatewayPixCode) && (
                                            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 shadow-sm font-poppins mt-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2 text-sm font-semibold text-[#009EE3]">
                                                        <CreditCard size={16} /> Cobrança Ativa Pronta para Reenvio
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    {selectedItem.original?.gateway_pix_code && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(selectedItem.original.gateway_pix_code || (selectedItem.original as any)?.gatewayPixCode);
                                                                alert('Código Pix Copia e Cola copiado para a área de transferência!');
                                                            }}
                                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shadow-sm"
                                                        >
                                                            📋 Copiar Pix
                                                        </button>
                                                    )}

                                                    {(selectedItem.original?.gateway_ticket_url || (selectedItem.original as any)?.gatewayTicketUrl) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const isOrderOrQuote = ['ORDER', 'QUOTE', 'INVOICE'].includes(selectedItem.type);
                                                                const checkoutUrl = isOrderOrQuote 
                                                                    ? `${window.location.origin}/#/checkout/${selectedItem.type.toLowerCase()}/${selectedItem.original?.id || selectedItem.id}`
                                                                    : (selectedItem.original?.gateway_ticket_url || (selectedItem.original as any)?.gatewayTicketUrl);
                                                                window.open(checkoutUrl, '_blank');
                                                            }}
                                                            className="px-4 py-2 bg-[#009EE3] hover:bg-[#0089c7] text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shadow-sm"
                                                        >
                                                            <Share2 size={14} /> Abrir Link / Boleto
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const fullCust = customers.find(c => c.id === selectedItem.original?.customerId || c.id === selectedItem.original?.customer_id);
                                                            const customerDoc = (selectedItem as any).customerDocument || fullCust?.document || (fullCust as any)?.cpf || (fullCust as any)?.cnpj || selectedItem.original?.customer_document || selectedItem.original?.customerDocument;
                                                            const customerEmail = selectedItem.original?.customerEmail || (selectedItem.original as any)?.customer_email || fullCust?.email;
                                                            const rawMethod = (selectedItem as any)?.paymentMethod || (selectedItem as any)?.payment_method || (selectedItem.original as any)?.gateway_payment_method || (selectedItem.original as any)?.payment_method || (selectedItem.original as any)?.gatewayPaymentMethod || (selectedItem.original as any)?.paymentMethod;
                                                            setAsaasModalItem({
                                                                type: selectedItem.type,
                                                                id: selectedItem.id,
                                                                displayId: selectedItem.displayId || getDocLabel(selectedItem),
                                                                title: selectedItem.title,
                                                                value: selectedItem.value,
                                                                customerName: selectedItem.customerName,
                                                                customerDocument: customerDoc,
                                                                customerEmail: customerEmail,
                                                                gatewayPixCode: (selectedItem.original as any)?.gateway_pix_code || (selectedItem.original as any)?.gatewayPixCode,
                                                                gatewayTicketUrl: (selectedItem.original as any)?.gateway_ticket_url || (selectedItem.original as any)?.gatewayTicketUrl,
                                                                gatewayStatus: (selectedItem.original as any)?.gateway_status || (selectedItem.original as any)?.gatewayStatus,
                                                                gatewayPaymentId: (selectedItem.original as any)?.gateway_payment_id || (selectedItem.original as any)?.gatewayPaymentId,
                                                                gatewayPaymentMethod: rawMethod,
                                                                billingStatus: selectedItem.status
                                                            });
                                                            setIsAsaasModalOpen(true);
                                                        }}
                                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shadow-sm"
                                                    >
                                                        <RefreshCw size={14} /> Checar Pagamento
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Dados do Cliente (Enterprise Style) */}
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-poppins mt-4">
                                            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
                                                <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600">
                                                    <Users size={16} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-semibold text-slate-800">Dados do Cliente</h3>
                                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Informações de contato e faturamento</p>
                                                </div>
                                            </div>
                                            
                                            <div className="p-5 flex flex-col gap-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome / Razão Social</span>
                                                    <span className="text-sm font-bold text-slate-800 text-right">{selectedItem.customerName}</span>
                                                </div>

                                                {(() => {
                                                    const fullCust = customers.find(c => c.name?.toLowerCase().trim() === selectedItem.customerName?.toLowerCase().trim());
                                                    let address = selectedItem.customerAddress;
                                                    if (!address || address.trim() === '') {
                                                        if (fullCust && fullCust.street) {
                                                            address = `${fullCust.street}, ${fullCust.number || 'S/N'} - ${fullCust.neighborhood || ''} - ${fullCust.city || ''}`;
                                                        }
                                                    }
                                                    return (
                                                        <>
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Endereço de Cobrança</span>
                                                                <span className="text-sm font-medium text-slate-700 text-right">{address || 'Não informado'}</span>
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Telefone / WhatsApp</span>
                                                                <span className="text-sm font-medium text-slate-700 text-right">{fullCust?.whatsapp || fullCust?.phone || 'Não informado'}</span>
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail Principal</span>
                                                                <span className="text-sm font-medium text-slate-700 text-right">{fullCust?.email || 'Não informado'}</span>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Contexto e Detalhes (Enterprise Style) */}
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-poppins mt-4">
                                            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
                                                <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600">
                                                    <Info size={16} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-semibold text-slate-800">Contexto e Detalhes</h3>
                                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Origem e descrição da cobrança</p>
                                                </div>
                                            </div>
                                            <div className="p-5 flex flex-col gap-4">
                                                {(() => {
                                                    const linkedInvoice = invoices.find(inv => invoiceItems.some(ii => ii.reference_id === selectedItem.id && ii.invoice_id === inv.id));
                                                    if (linkedInvoice) {
                                                        return (
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                                <span className="text-[10px] font-bold text-sky-700 uppercase tracking-widest">Faturado Por (Operador)</span>
                                                                <span className="text-sm font-bold text-sky-900 text-right">{getBilledUserName(linkedInvoice)}</span>
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsável (Emissor/Técnico)</span>
                                                            <span className="text-sm font-bold text-slate-800 text-right">{resolveUserOrTechName(selectedItem.original?.createdBy || selectedItem.original?.assignedTo || selectedItem.original?.authorId, selectedItem.technician)}</span>
                                                        </div>
                                                    );
                                                })()}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Referência Original</span>
                                                    <span className="text-sm font-bold text-slate-800 text-right">
                                                        {selectedItem.type === 'QUOTE' 
                                                            ? ((selectedItem.original?.status === 'APROVADO' || selectedItem.original?.approvedAt) ? `Orçamento Aprovado #${getDocLabel(selectedItem)}` : `Orçamento Emitido #${getDocLabel(selectedItem)}`) 
                                                            : `Ordem de Serviço Concluída #${getDocLabel(selectedItem)}`}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição do Lançamento</span>
                                                    <span className="text-sm font-bold text-slate-800 text-right">{selectedItem.title || 'Sem descrição cadastrada'}</span>
                                                </div>

                                                {selectedItem.original?.items && selectedItem.original.items.length > 0 && (
                                                    <div className="flex flex-col gap-2 pb-3 border-b border-slate-100/60">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens / Serviços Realizados</span>
                                                        <div className="flex flex-col gap-2 mt-1">
                                                            {selectedItem.original.items.map((it: any, idx: number) => (
                                                                <div key={idx} className="flex justify-between items-center text-sm font-medium bg-white border border-slate-200/60 shadow-sm p-3 rounded-lg">
                                                                    <span className="text-slate-700">{it.quantity}x {it.description || it.name}</span>
                                                                    <span className="text-slate-900 font-bold">{formatCurrency(it.total || (it.quantity * (it.unitPrice || it.price)))}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição Adicional</span>
                                                    <span className="text-sm font-medium text-slate-700 bg-white p-3 rounded-lg border border-slate-200 mt-2 min-h-[60px] shadow-sm whitespace-pre-wrap">
                                                        {(() => {
                                                            const desc = selectedItem.description || 
                                                                (selectedItem.original as any)?.description || 
                                                                (selectedItem.original as any)?.problem_description || 
                                                                (selectedItem.original as any)?.problemDescription || 
                                                                (selectedItem.original as any)?.notes || 
                                                                (selectedItem.original as any)?.observations || 
                                                                (selectedItem.original?.formData as any)?.description || 
                                                                (selectedItem.original?.formData as any)?.notes || 
                                                                (selectedItem.original?.formData as any)?.observations;
                                                            return desc && String(desc).trim() !== '' ? desc : 'Nenhuma descrição informada.';
                                                        })()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {detailTab === 'audit' && (
                                    <div className="space-y-4">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-poppins">
                                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                                        <ShieldCheck size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-800">Auditoria de Pagamento</h3>
                                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Dados rastreáveis do gateway</p>
                                                    </div>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                                    selectedItem.status === 'PAID' || selectedItem.gatewayStatus === 'approved'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                                }`}>
                                                    {selectedItem.status === 'PAID' || selectedItem.gatewayStatus === 'approved' ? 'Liquidado' : 'Pendente'}
                                                </span>
                                            </div>

                                            <div className="p-5 flex flex-col gap-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gateway Payment ID</span>
                                                    <code className="text-xs font-mono font-bold text-slate-800 bg-slate-50 px-2 py-1 rounded border border-slate-200 text-right break-all">{selectedItem.gatewayPaymentId || 'Sem transação gerada'}</code>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Método de Pagamento</span>
                                                    <span className="text-sm font-bold text-slate-800 text-right">
                                                        {(() => {
                                                            const raw = (selectedItem as any).original?.payment_method || selectedItem.original?.paymentMethod || (selectedItem as any).paymentMethod;
                                                            if (!raw) return '—';
                                                            const str = String(raw).toLowerCase();
                                                            if (str.includes('pix')) return 'Pix';
                                                            if (str.includes('boleto') || str.includes('ticket') || str.includes('bolbradesco')) return 'Boleto';
                                                            if (str.includes('cart') || str.includes('card') || str.includes('credit') || str.includes('visa') || str.includes('master') || str.includes('elo') || str.includes('amex')) {
                                                                return 'Cartão de Crédito';
                                                            }
                                                            if (str.includes('dinheiro') || str.includes('cash')) return 'Dinheiro';
                                                            return raw;
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-4 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data de Liquidação</span>
                                                    <span className="text-sm font-bold text-slate-800 text-right">
                                                        {selectedItem.paidAt ? new Date(selectedItem.paidAt).toLocaleDateString('pt-BR') : 'Pendente'}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setAuditModalItem({
                                                            type: selectedItem.type,
                                                            id: selectedItem.id,
                                                            displayId: getDocLabel(selectedItem),
                                                            title: selectedItem.title,
                                                            amount: (selectedItem as any).netValue ?? selectedItem.value ?? getItemNetValue(selectedItem),
                                                            grossValue: (selectedItem as any).grossValue ?? (selectedItem.value + (selectedItem.billingDiscount || 0)),
                                                            discountAmount: (selectedItem as any).discountAmount ?? selectedItem.billingDiscount ?? 0,
                                                            netValue: (selectedItem as any).netValue ?? selectedItem.value,
                                                            billingDiscount: selectedItem.billingDiscount,
                                                            billingDiscountType: selectedItem.billingDiscountType,
                                                            customerName: selectedItem.customerName,
                                                            customerDocument: selectedItem.customerDocument,
                                                            paymentMethod: selectedItem.paymentMethod || (selectedItem as any).payment_method || selectedItem.original?.payment_method || selectedItem.original?.paymentMethod || (selectedItem as any).gatewayPaymentMethod || selectedItem.original?.gateway_payment_method || (selectedItem.gatewayPaymentId || selectedItem.original?.gateway_payment_id ? 'credit_card' : null),
                                                            installments: (selectedItem as any).installments || (selectedItem as any).mpInstallments || (selectedItem.original as any)?.installments || (selectedItem.original as any)?.mpInstallments || (selectedItem.original as any)?.form_data?.mpInstallments || (selectedItem.original as any)?.form_data?.installments || (selectedItem.original as any)?.approval_metadata?.mpInstallments || (selectedItem.original as any)?.approval_metadata?.installments || null,
                                                            gatewayProvider: selectedItem.gatewayProvider || selectedItem.original?.gateway_provider || selectedItem.original?.gatewayProvider,
                                                            gatewayPaymentId: selectedItem.original?.gateway_payment_id || selectedItem.original?.gatewayPaymentId || selectedItem.gatewayPaymentId,
                                                            gatewayStatus: selectedItem.original?.gateway_status || selectedItem.original?.gatewayStatus || selectedItem.gatewayStatus,
                                                            paidAt: selectedItem.paidAt || selectedItem.original?.paid_at || selectedItem.original?.paidAt,
                                                            billingStatus: selectedItem.status,
                                                            createdAt: selectedItem.createdAt,
                                                            original: selectedItem.original
                                                        });
                                                        setIsAuditModalOpen(true);
                                                    }}
                                                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm mt-1"
                                                >
                                                    <Printer size={15} /> Abrir Comprovante de Auditoria Completo
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {detailTab === 'financial' && (
                                    <div className="space-y-4">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-poppins">
                                            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
                                                <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600">
                                                    <DollarSign size={16} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-semibold text-slate-800">Financeiro & Faturamento</h3>
                                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Informações de emissão e prazos</p>
                                                </div>
                                            </div>

                                            <div className="p-5 flex flex-col gap-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor Total</span>
                                                    <span className="text-sm font-bold text-slate-800 text-right">
                                                        {formatCurrency(selectedItem.netValue || selectedItem.value)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data de Emissão</span>
                                                    <span className="text-sm font-bold text-slate-800 text-right">
                                                        {new Date(selectedItem.createdAt || selectedItem.date).toLocaleDateString('pt-BR')}
                                                    </span>
                                                </div>
                                                {selectedItem.paidAt && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Data de Recebimento</span>
                                                        <span className="text-sm font-bold text-emerald-600 text-right">
                                                            {new Date(selectedItem.paidAt).toLocaleDateString('pt-BR')}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Edição de Vencimento */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100/60">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</span>
                                                    <div className="flex justify-end">
                                                        {selectedItem.status !== 'PAID' ? (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="date"
                                                                    disabled={!can('financial', 'update')}
                                                                    value={editingDueDate || (() => {
                                                                        const raw = selectedItem.dueDate || selectedItem.date;
                                                                        if (!raw) return '';
                                                                        try { return new Date(raw).toISOString().split('T')[0]; } catch { return ''; }
                                                                    })()}
                                                                    onChange={(e) => setEditingDueDate(e.target.value)}
                                                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 transition-all cursor-pointer shadow-sm"
                                                                />
                                                                {editingDueDate && (
                                                                    <button
                                                                        disabled={isProcessing || !can('financial', 'update')}
                                                                        onClick={async () => {
                                                                            if (!can('financial', 'update')) {
                                                                                showAlert("Acesso Negado", "warning"); return;
                                                                            }
                                                                            if (!editingDueDate) return;
                                                                            const newDateISO = new Date(editingDueDate + 'T12:00:00').toISOString();
                                                                            setIsProcessing(true);
                                                                            try {
                                                                                if (selectedItem.type === 'QUOTE') {
                                                                                    await DataService.updateQuote({
                                                                                        ...selectedItem.original,
                                                                                        validUntil: newDateISO,
                                                                                        approvedAt: newDateISO,
                                                                                    });
                                                                                } else {
                                                                                    await DataService.updateOrder({
                                                                                        ...selectedItem.original,
                                                                                        scheduledDate: editingDueDate,
                                                                                    });
                                                                                }
                                                                                setSelectedItem((prev: any) => prev ? ({
                                                                                    ...prev,
                                                                                    dueDate: newDateISO,
                                                                                    date: selectedItem.type === 'QUOTE' ? newDateISO : prev.date,
                                                                                    original: {
                                                                                        ...prev.original,
                                                                                        ...(selectedItem.type === 'QUOTE'
                                                                                            ? { validUntil: newDateISO, approvedAt: newDateISO }
                                                                                            : { scheduledDate: editingDueDate }
                                                                                        ),
                                                                                    }
                                                                                }) : null);
                                                                                setOptimisticDates(prev => ({ ...prev, [selectedItem.id]: editingDueDate }));
                                                                                setEditingDueDate('');
                                                                                await onRefresh();
                                                                            } catch (err: any) {
                                                                                console.error('Erro ao atualizar vencimento:', err);
                                                                                showAlert('Erro ao atualizar data de vencimento.', 'error');
                                                                            } finally {
                                                                                setIsProcessing(false);
                                                                            }
                                                                        }}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                                                    >
                                                                        {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm font-semibold text-slate-800">
                                                                {new Date(selectedItem.dueDate || selectedItem.date).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {selectedItem.original?.billingNotes && (
                                                    <div className="flex flex-col gap-1 mt-2">
                                                        <span className="text-sm text-slate-500 font-medium">Observações Fiscais</span>
                                                        <span className="text-sm font-medium text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                                                            {selectedItem.original.billingNotes}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {selectedItem.status === 'PAID' ? (
                                                <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-xl p-4 mt-4">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center border border-emerald-200"><Check size={16} className="text-emerald-600" /></div>
                                                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Baixa Realizada</p>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                        <div className="bg-white rounded-lg p-3 border border-emerald-100/50">
                                                            <p className="text-[9px] font-semibold text-emerald-500 uppercase mb-1">Forma de Pagamento</p>
                                                            <p className="text-xs font-bold text-emerald-800 uppercase">
                                                                {selectedItem.original?.paymentMethod || '—'}
                                                                {renderInstallmentsDetails(selectedItem)}
                                                            </p>
                                                        </div>
                                                        <div className="bg-white rounded-lg p-3 border border-emerald-100/50">
                                                            <p className="text-[9px] font-semibold text-emerald-500 uppercase mb-1">Desconto</p>
                                                            <p className="text-xs font-bold text-emerald-800 uppercase">
                                                                {(() => {
                                                                    const disc = Number(selectedItem.original?.discount) || 0;
                                                                    const subtotal = selectedItem.original?.items?.reduce((a: number, i: any) => a + (Number(i.total) || 0), 0) || selectedItem.value;
                                                                    const infer = subtotal > selectedItem.original?.totalValue ? subtotal - selectedItem.original?.totalValue : 0;
                                                                    const finalDisc = disc > 0 ? disc : infer;
                                                                    const type = disc > 0 ? (selectedItem.original?.discountType || 'fixed') : 'fixed';
                                                                    if (finalDisc > 0) return type === 'percent' ? `${finalDisc}%` : formatCurrency(finalDisc);
                                                                    return 'Sem desconto';
                                                                })()}
                                                            </p>
                                                        </div>
                                                        <div className="bg-white rounded-lg p-3 border border-emerald-100/50">
                                                            <p className="text-[9px] font-semibold text-emerald-500 uppercase mb-1">Data da Baixa</p>
                                                            <p className="text-xs font-bold text-emerald-800">{selectedItem.original?.paidAt ? new Date(selectedItem.original.paidAt).toLocaleDateString('pt-BR') : '—'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-amber-50/50 border border-amber-100/50 rounded-xl p-5 text-center mt-4">
                                                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                                        <Clock size={18} className="text-amber-600" />
                                                    </div>
                                                    <p className="text-sm font-semibold text-amber-800 mb-1">Aguardando Faturamento</p>
                                                    <p className="text-[11px] text-amber-600 font-medium mb-4">Valor de {formatCurrency(selectedItem.value)} ainda não liquidado no sistema.</p>
                                                    <button
                                                        onClick={() => { 
                                                            setSelectedIds([selectedItem.id]); 
                                                            setBillingDiscount(0);
                                                            setBillingDiscountType('fixed');
                                                            setBillingShipping(0);
                                                            setBillingOtherAdditions(0);
                                                            setIsInvoiceModalOpen(true); 
                                                        }}
                                                        className="mx-auto px-6 py-2.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
                                                    >
                                                        <DollarSign size={14} /> Confirmar Lançamento Financeiro
                                                    </button>
                                                </div>
                                            )}
                                    </div>
                                )}

                                {detailTab === 'linked' && (
                                    <div className="space-y-4">
                                        {selectedItem.type === 'ORDER' ? (
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-poppins">
                                                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600">
                                                        <Layer size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-800">Orçamentos Vinculados</h3>
                                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Histórico de propostas aprovadas</p>
                                                    </div>
                                                </div>
                                                <div className="p-5 flex flex-col gap-3">
                                                    {selectedItem.original?.linkedQuotes?.map((qId: string) => {
                                                        const q = quotes.find(quote => quote.id === qId);
                                                        return q ? (
                                                            <div key={qId} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center shadow-sm">
                                                                <div>
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{q.displayId || 'ORC-' + qId.slice(0, 8).toUpperCase()}</span>
                                                                    <p className="text-sm font-medium text-slate-800 mt-0.5 truncate max-w-[200px]">{q.title}</p>
                                                                </div>
                                                                <span className="text-sm font-semibold text-slate-900">{formatCurrency(q.totalValue)}</span>
                                                            </div>
                                                        ) : null;
                                                    })}
                                                    {(!selectedItem.original?.linkedQuotes || selectedItem.original.linkedQuotes.length === 0) && (
                                                        <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                                            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Nenhum orçamento vinculado</p>
                                                        </div>
                                                    )}
                                                    {availableQuotesForClient.length > 0 && selectedItem.status !== 'PAID' && (
                                                        <div className="pt-4 border-t border-slate-100/60 mt-2">
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Disponíveis para vincular</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {availableQuotesForClient.map(q => (
                                                                    <button key={q.id} onClick={() => handleLinkQuote(q.id)} disabled={isProcessing} className="px-3 py-2 bg-white border border-slate-200 rounded-xl flex items-center gap-2 hover:border-slate-300 hover:bg-slate-50 transition-all text-[11px] font-semibold text-slate-700 shadow-sm active:scale-95">
                                                                        {q.displayId || 'ORC-' + q.id.slice(0, 8).toUpperCase()} — {formatCurrency(q.totalValue)}
                                                                        <Plus size={12} className="text-slate-400" />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-poppins">
                                                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600">
                                                        <FileText size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-800">Itens do Orçamento</h3>
                                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Serviços e produtos detalhados</p>
                                                    </div>
                                                </div>
                                                <div className="p-5 flex flex-col">
                                                    {selectedItem.original?.items?.map((item: any, i: number) => (
                                                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-slate-100/60 last:border-0">
                                                            <div>
                                                                <p className="text-sm font-medium text-slate-800">{item.description}</p>
                                                                <p className="text-xs text-slate-500">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                                                            </div>
                                                            <span className="text-sm font-semibold text-slate-900 text-right">{formatCurrency(item.total)}</span>
                                                        </div>
                                                    ))}
                                                    {(!selectedItem.original?.items || selectedItem.original.items.length === 0) && (
                                                        <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 mt-2">
                                                            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Nenhum item encontrado.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {detailTab === 'attachments' && (
                                    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto w-full font-poppins animate-in slide-in-from-right-4 duration-300">
                                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                                <Paperclip size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold text-slate-800">Anexos</h3>
                                                <p className="text-xs font-medium text-slate-500">Documentos e comprovantes vinculados a esta transação.</p>
                                            </div>
                                        </div>

                                        {(!selectedItem.original?.receiptUrl && !selectedItem.original?.gateway_ticket_url && !(selectedItem.original as any)?.gatewayTicketUrl) ? (
                                            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center">
                                                <Paperclip size={32} className="text-slate-300 mb-3" />
                                                <p className="text-sm font-medium text-slate-500">Nenhum anexo encontrado</p>
                                                <p className="text-xs text-slate-400 mt-1">Os comprovantes e boletos anexados aparecerão aqui.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {(selectedItem.original?.gateway_ticket_url || (selectedItem.original as any)?.gatewayTicketUrl) && (
                                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 relative overflow-hidden">
                                                        <div className="absolute top-0 left-0 w-1 h-full bg-[#009EE3]"></div>
                                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                            <div className="flex items-center gap-2">
                                                                <FileText size={16} className="text-[#009EE3]" />
                                                                <h4 className="text-sm font-bold text-slate-800">Boleto / Checkout Mercado Pago</h4>
                                                            </div>
                                                            <a 
                                                                href={selectedItem.original.gateway_ticket_url || (selectedItem.original as any)?.gatewayTicketUrl} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="px-3 py-1.5 bg-[#009EE3] hover:bg-[#0089c7] text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                                                            >
                                                                Abrir Original
                                                            </a>
                                                        </div>
                                                        <div className="flex justify-center bg-slate-50 rounded-lg p-2 border border-slate-100">
                                                            <div className="w-full py-8 flex flex-col items-center justify-center text-center">
                                                                <FileText size={40} className="text-[#009EE3]/50 mb-3" />
                                                                <p className="text-sm font-medium text-slate-700">Documento de Cobrança (PDF / Link)</p>
                                                                <p className="text-xs text-slate-500 mt-1">Clique em "Abrir Original" para visualizar ou baixar o documento.</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {selectedItem.original?.receiptUrl && (
                                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                            <h4 className="text-sm font-medium text-slate-800">Comprovante de Faturamento</h4>
                                                            <a 
                                                                href={selectedItem.original.receiptUrl} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                                                            >
                                                                Abrir Original
                                                            </a>
                                                        </div>
                                                        <div className="flex justify-center bg-slate-50 rounded-lg p-2 border border-slate-100">
                                                            {selectedItem.original.receiptUrl.toLowerCase().includes('.pdf') ? (
                                                                <div className="w-full py-12 flex flex-col items-center justify-center text-center">
                                                                    <FileText size={48} className="text-slate-300 mb-4" />
                                                                    <p className="text-sm font-medium text-slate-600">Documento PDF anexado</p>
                                                                    <p className="text-xs text-slate-500 mt-1">Clique em "Abrir Original" para visualizar o arquivo completo.</p>
                                                                </div>
                                                            ) : (
                                                                <img 
                                                                    src={selectedItem.original.receiptUrl} 
                                                                    alt="Comprovante" 
                                                                    className="max-w-full max-h-[400px] object-contain rounded border border-slate-200 shadow-sm"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* ── MODAL DE FATURAMENTO (Padrão OS Big Tech) ── */}
            {isInvoiceModalOpen && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsInvoiceModalOpen(false)}>
                    <div className="bg-white rounded-xl w-full max-w-6xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
                        
                        {/* HEADER - Padrão OS */}
                        <div className="px-6 py-5 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500 shadow-sm">
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-semibold text-slate-800 font-poppins tracking-wide">Faturamento e Liquidação</h2>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-200">
                                            Módulo Financeiro
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-1">
                                        {selectedIds.length === 1 ? '1 Documento selecionado' : `${selectedIds.length} Documentos selecionados`} • Cliente: {selectedIds.length === 1 ? selectedItem?.customerName : allItems.find(i => i.id === selectedIds[0])?.customerName}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsInvoiceModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-800 transition-all rounded-lg hover:bg-slate-100">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* BODY - SCROLLABLE BG-SLATE-50 */}
                        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                            <div className="max-w-6xl mx-auto space-y-6">
                                
                                {/* Lado Esquerdo - Composição da Fatura */}
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                    <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                                        <Layers size={16} className="text-slate-400"/> Composição da Fatura
                                    </h3>
                                    <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                        <div className="max-h-[220px] overflow-y-auto bg-slate-50">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-slate-100 sticky top-0 text-slate-500 shadow-sm z-10">
                                                    <tr>
                                                        <th className="px-3 py-2.5 font-medium whitespace-nowrap">Documento</th>
                                                        <th className="px-3 py-2.5 font-medium whitespace-nowrap">Data de Conclusão ou Aprovação</th>
                                                        <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Valor</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {selectedIds.map(id => {
                                                        const it = filteredItems.find(i => i.id === id);
                                                        const dateStr = it?.original?.completion_date || it?.original?.approved_at || it?.original?.created_at;
                                                        const dateFmt = dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : '—';
                                                        return (
                                                            <tr key={id} className="bg-white hover:bg-slate-50 transition-colors group" title={it?.original?.problem_description || it?.original?.description || 'Sem descrição'}>
                                                                <td className="px-3 py-3 font-medium text-slate-700 cursor-help underline decoration-dashed decoration-slate-300 underline-offset-4">{it ? getDocLabel(it) : '—'}</td>
                                                                <td className="px-3 py-3 text-slate-500">{dateFmt}</td>
                                                                <td className="px-3 py-3 font-semibold text-slate-700 text-right">{formatCurrency(it?.value || 0)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="bg-white p-3 border-t border-slate-100 flex justify-between items-center text-xs">
                                            <span className="font-medium text-slate-500">Total Itens ({selectedIds.length})</span>
                                            <span className="font-semibold text-slate-800">{formatCurrency(selectedTotal)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* ROW 2: Pagamento e Ajustes (Fila em Linhas) */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Forma de Pagamento */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col">
                                        <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                            <CreditCard size={16} className="text-slate-400"/> Forma de Pagamento
                                        </h3>
                                        <div className="w-full relative">
                                            <select
                                                value={paymentMethod}
                                                onChange={e => setPaymentMethod(e.target.value)}
                                                className="w-full px-4 py-3 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled>Selecione a forma de pagamento</option>
                                                {paymentMethods.map(method => (
                                                    <option key={method.id} value={method.id}>{method.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>

                                        {/* Parcelas */}
                                        {paymentMethod === 'Cartão Crédito' && (
                                            <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in">
                                                <h4 className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-3">Opções de Parcelamento</h4>
                                                <div className="grid grid-cols-6 md:grid-cols-12 gap-2 mb-3">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setInstallments(n)}
                                                            className={`py-2 rounded-lg text-[11px] font-semibold transition-all ${installments === n ? 'bg-slate-800 text-white shadow-md scale-105' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-800 hover:text-slate-800'}`}
                                                        >
                                                            {n}x
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="p-3 bg-slate-50 rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 border border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Outro valor:</span>
                                                        <div className="relative">
                                                            <input
                                                                type="number" min={1} max={999}
                                                                value={installments || ''}
                                                                onChange={e => {
                                                                    const val = parseInt(e.target.value);
                                                                    if (!isNaN(val) && val > 0) setInstallments(val);
                                                                }}
                                                                className="w-16 px-2 pr-6 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all text-center"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">x</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest leading-none mb-1">Valor da Parcela</span>
                                                        <span className="text-sm font-semibold text-slate-800">
                                                            {(() => {
                                                                const base = selectedTotal;
                                                                const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount;
                                                                const finalAmount = Math.max(0, base - dv + billingShipping + billingOtherAdditions);
                                                                return `${installments}x de ${formatCurrency(finalAmount / (installments || 1))}`;
                                                            })()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Vencimento e Parcelamento Boleto */}
                                        {paymentMethod === 'Boleto' && (
                                            <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in space-y-4">
                                                <div>
                                                    <h4 className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-2">Opções de Parcelamento</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div>
                                                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nº de Parcelas (Boletos)</label>
                                                            <input 
                                                                type="number" 
                                                                min={1} 
                                                                max={12} 
                                                                value={installmentCount} 
                                                                onChange={e => setInstallmentCount(Number(e.target.value))} 
                                                                className="w-full px-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#009EE3]/20 focus:border-[#009EE3] transition-all"
                                                            />
                                                        </div>
                                                        {installmentCount > 1 ? (
                                                            <div>
                                                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Intervalo (Dias)</label>
                                                                <select 
                                                                    value={installmentInterval} 
                                                                    onChange={e => setInstallmentInterval(Number(e.target.value))}
                                                                    className="w-full px-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#009EE3]/20 focus:border-[#009EE3] transition-all appearance-none"
                                                                >
                                                                    <option value={15}>A cada 15 dias</option>
                                                                    <option value={30}>A cada 30 dias</option>
                                                                    <option value={60}>A cada 60 dias</option>
                                                                </select>
                                                            </div>
                                                        ) : <div className="hidden md:block"></div>}
                                                        <div>
                                                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                                                {installmentCount > 1 ? 'Vencimento da 1ª Parcela' : 'Vencimento do Boleto'}
                                                            </label>
                                                            <input
                                                                type="date"
                                                                value={boletoDueDate || (selectedItem?.dueDate ? selectedItem.dueDate.split('T')[0] : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])}
                                                                onChange={e => setBoletoDueDate(e.target.value)}
                                                                className="w-full px-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#009EE3]/20 focus:border-[#009EE3] transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                    
                                                    {installmentCount > 1 && (
                                                        <div className="mt-3 p-3 bg-sky-50 border border-sky-100 rounded-lg text-xs text-sky-800 flex items-center gap-2">
                                                            <Calculator size={14} className="shrink-0" />
                                                            <span>
                                                                Serão gerados <strong>{installmentCount} boletos</strong> de 
                                                                <strong> {formatCurrency(
                                                                    Math.max(0, (selectedTotal) - (billingDiscountType === 'percent' ? ((selectedTotal) * billingDiscount / 100) : billingDiscount)) / installmentCount
                                                                )}</strong> cada.
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Informação do PIX (Sempre à vista) */}
                                        {paymentMethod === 'Pix' && (
                                            <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in">
                                                <div className="p-3.5 bg-emerald-50/80 border border-emerald-200/60 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-xs">
                                                    <div className="flex items-center gap-2.5">
                                                        <Smartphone size={16} className="text-emerald-600 shrink-0" />
                                                        <span className="font-medium">
                                                            Pagamento <strong>à vista via PIX</strong> (QR Code e Copia e Cola gerados instantaneamente).
                                                        </span>
                                                    </div>
                                                    <span className="px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shrink-0 shadow-xs">À Vista (1x)</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Ajustes Financeiros */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col">
                                        <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                            <Tag size={16} className="text-slate-400"/> Ajustes Financeiros
                                        </h3>
                                        {can('financial', 'discounts') ? (
                                            <div className="flex flex-col gap-3 pt-3 border-t border-slate-100 flex-1 justify-center">
                                                {/* Desconto */}
                                                <div className="flex gap-2 w-full">
                                                    <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                        <button type="button" onClick={() => setBillingDiscountType('fixed')} className={`px-3 py-1.5 text-[10px] font-semibold transition-all ${billingDiscountType === 'fixed' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>R$</button>
                                                        <button type="button" onClick={() => setBillingDiscountType('percent')} className={`px-3 py-1.5 text-[10px] font-semibold transition-all ${billingDiscountType === 'percent' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>%</button>
                                                    </div>
                                                    <div className="relative flex-1">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{billingDiscountType === 'percent' ? '%' : 'R$'}</span>
                                                        <input type="number" min="0" max={billingDiscountType === 'percent' ? 100 : undefined} step={billingDiscountType === 'percent' ? "1" : "0.01"} value={billingDiscount || ''} onChange={(e) => setBillingDiscount(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-800/10 transition-all" placeholder="Desconto" />
                                                    </div>
                                                </div>
                                                
                                                {/* Frete */}
                                                <div className="flex gap-2 w-full">
                                                    <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0 w-[68px] justify-center bg-slate-50 items-center">
                                                        <span className="text-[10px] font-semibold text-slate-500">Frete</span>
                                                    </div>
                                                    <div className="relative flex-1">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">R$</span>
                                                        <input type="number" min="0" step="0.01" value={billingShipping || ''} onChange={(e) => setBillingShipping(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-800/10 transition-all" placeholder="0.00" />
                                                    </div>
                                                </div>

                                                {/* Outros Custos */}
                                                <div className="flex gap-2 w-full">
                                                    <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0 w-[68px] justify-center bg-slate-50 items-center">
                                                        <span className="text-[10px] font-semibold text-slate-500">Outros</span>
                                                    </div>
                                                    <div className="relative flex-1">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">R$</span>
                                                        <input type="number" min="0" step="0.01" value={billingOtherAdditions || ''} onChange={(e) => setBillingOtherAdditions(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-800/10 transition-all" placeholder="0.00" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-2 opacity-50">
                                                <ShieldCheck size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-slate-500 leading-relaxed">Você não tem permissão para ajustes.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ROW 3: Resumo Financeiro (Full width) */}
                                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm transition-all">
                                    <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                        <DollarSign size={16} className="text-slate-400"/> Resumo Financeiro
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500 font-medium tracking-wide">Subtotal</span>
                                            <span className="font-semibold text-slate-700">{formatCurrency(selectedTotal)}</span>
                                        </div>
                                        {(() => {
                                            const base = selectedTotal;
                                            const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount;
                                            return (
                                                <>
                                                    {dv > 0 && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-rose-500 font-medium tracking-wide">Desconto</span>
                                                            <span className="font-semibold text-rose-500">- {formatCurrency(dv)}</span>
                                                        </div>
                                                    )}
                                                    {billingShipping > 0 && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-slate-500 font-medium tracking-wide">Frete</span>
                                                            <span className="font-semibold text-slate-700">+ {formatCurrency(billingShipping)}</span>
                                                        </div>
                                                    )}
                                                    {billingOtherAdditions > 0 && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-slate-500 font-medium tracking-wide">Outros Acréscimos</span>
                                                            <span className="font-semibold text-slate-700">+ {formatCurrency(billingOtherAdditions)}</span>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                        <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between items-end">
                                            <span className="text-xs font-semibold text-slate-800 uppercase tracking-widest">Total a Receber</span>
                                            <span className="text-xl font-bold text-emerald-600 tracking-tight">{formatCurrency(Math.max(0, (() => { const base = selectedTotal; const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount; return base - dv + billingShipping + billingOtherAdditions; })()))}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* ROW 4: Observações e Comprovante (Full width) */}
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                    <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                        <FileText size={16} className="text-slate-400"/> Observações e Comprovante
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <textarea
                                            className="w-full min-h-[120px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all resize-none placeholder:text-slate-400"
                                            placeholder="Ex: Nº do comprovante transacional, código Pix, NSU da maquineta..."
                                            value={billingNotes}
                                            onChange={e => setBillingNotes(e.target.value)}
                                        />
                                        
                                        <div className="flex flex-col gap-2 justify-center">
                                            <label className="text-sm font-medium text-slate-600 flex flex-col items-center justify-center gap-3 cursor-pointer border-2 border-dashed border-slate-200 rounded-xl p-6 hover:border-slate-400 hover:bg-slate-50 transition-all min-h-[120px]">
                                                <Paperclip size={24} className="text-slate-400"/>
                                                <span>Anexar Comprovante (Imagem/PDF)</span>
                                                <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept="image/*,application/pdf"
                                                    onChange={e => {
                                                        if (e.target.files && e.target.files.length > 0) {
                                                            setReceiptFile(e.target.files[0]);
                                                        }
                                                    }}
                                                />
                                            </label>
                                            {receiptFile && (
                                                <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 mt-2 shadow-sm">
                                                    <span className="text-xs font-medium text-white truncate max-w-[200px]">{receiptFile.name}</span>
                                                    <button onClick={() => setReceiptFile(null)} className="text-slate-400 hover:text-rose-400 transition-colors">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* FOOTER - Padrão OS */}
                        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                            <button
                                onClick={() => setIsInvoiceModalOpen(false)}
                                className="h-10 px-5 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 font-medium transition-colors bg-white hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200"
                            >
                                <X size={16} /> Cancelar
                            </button>
                            <button
                                onClick={confirmInvoice}
                                disabled={isProcessing}
                                className="h-10 px-6 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-md shadow-emerald-600/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isProcessing ? (
                                    <><Loader2 size={16} className="animate-spin" /> Concluindo Baixa...</>
                                ) : (
                                    <><CheckCircle2 size={16} /> Confirmar Liquidação</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── MODAL DE IMPRESSÃO / RECIBO DE FATURAMENTO ── */}
            {isPrintModalOpen && printItem && createPortal(
                <div className="fixed inset-0 z-[99999] bg-white flex items-center justify-center p-4 opacity-0 pointer-events-none print:opacity-100 print:pointer-events-auto print:fixed print:inset-0">
                    <div className="bg-white w-full max-w-3xl max-h-[95vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">

                        {/* Barra de ação — oculta na impressão */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 print:hidden">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Pré-visualização do Recibo</p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={executePrint}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1c2d4f] text-white rounded-xl text-xs font-semibold uppercase shadow-md hover:bg-[#253a66] transition-all"
                                >
                                    <Printer size={14} /> Imprimir
                                </button>
                                <button
                                    onClick={() => { setIsPrintModalOpen(false); setPrintItem(null); }}
                                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* ─── Conteúdo do Recibo FORMAL SAAS (imprimível) ─── */}
                        <div id="print-container" className="w-full">
                            {printItem.type === 'INVOICE' ? (
                                <div id="printable-receipt" ref={printRef} className="print:w-full w-[210mm] mx-auto">
                                    <InvoiceReceiptTemplate 
                                        invoice={printItem} 
                                        invoiceItems={invoiceItems} 
                                        rawItems={[...orders, ...quotes]} 
                                        customers={customers}
                                        installments={invoiceInstallmentsList}
                                        tenantInfo={{
                                            name: tenant?.company_name || tenant?.trading_name || tenant?.name || 'Sua Empresa',
                                            document: tenant?.cnpj || tenant?.document,
                                            phone: tenant?.phone,
                                            email: tenant?.admin_email || tenant?.email,
                                            website: tenant?.website,
                                            address: (tenant?.address || tenant?.street) ? `${tenant.street || tenant.address}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ' - ' + tenant.neighborhood : ''}${tenant.city ? ', ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}` : undefined,
                                            logoUrl: tenant?.logo_url || tenant?.logoUrl
                                        }} 
                                    />
                                </div>
                            ) : (
                            <div id="printable-receipt" ref={printRef} className="bg-white text-[10px] leading-tight font-poppins p-6 print:p-0 print:break-inside-avoid min-h-[1056px] flex flex-col relative w-[210mm] mx-auto print:w-full" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                            {/* Marca D'Água (Status) */}
                            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none text-[8rem] font-semibold uppercase -rotate-45 tracking-widest whitespace-nowrap z-0`}>
                                {printItem.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE'}
                            </div>

                            <div className="relative z-10 flex-1 flex flex-col">
                                {/* Print Header */}
                                <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
                                    <div className="flex gap-4 items-center">
                                        {(tenant?.logo_url || tenant?.logoUrl) ? (
                                            <img
                                                src={tenant.logo_url || tenant.logoUrl}
                                                alt={tenant.company_name || tenant.name || 'Logo'}
                                                className="h-16 w-auto object-contain"
                                            />
                                        ) : (
                                            <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px] text-white">
                                                <Wallet size={32} className="text-white fill-white/10" />
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <h1 className="text-xl font-medium text-slate-900 uppercase tracking-tight">{tenant?.company_name || tenant?.trading_name || tenant?.name || 'Sua Empresa'}</h1>
                                            <div className="text-[9px] text-slate-600 max-w-[400px]">
                                                {((tenant?.address || tenant?.street) ? `${tenant.street || tenant.address}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ' - ' + tenant.neighborhood : ''}${tenant.city ? ', ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}` : 'Endereço da Empresa Não Informado')}
                                                <div className="flex flex-wrap gap-x-3 mt-0.5">
                                                    {tenant?.cnpj || tenant?.document ? <span>CNPJ: {tenant.cnpj || tenant.document}</span> : null}
                                                    {tenant?.phone && <span className="font-semibold">Tel: {tenant.phone}</span>}
                                                    {(tenant?.admin_email || tenant?.email) && <span>E-mail: {tenant.admin_email || tenant.email}</span>}
                                                    {tenant?.website && <span>Site: {tenant.website}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="border-2 border-slate-800 px-5 py-2 rounded-lg bg-slate-50 min-w-[160px]">
                                            <div className="text-[8px] font-semibold text-[#1c2d4f] uppercase tracking-wider mb-0.5 leading-tight">
                                                Comprovante de Faturamento
                                                <div className="text-[7px] font-medium text-slate-500 tracking-widest mt-0.5">
                                                    Referente a {printItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'}
                                                </div>
                                            </div>
                                            <div className="text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap mt-1">{getDocLabel(printItem)}</div>
                                        </div>
                                        <div className="text-[8px] font-medium text-slate-400 mt-2 uppercase tracking-wide">
                                            Emissão: {new Date().toLocaleDateString()} às {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {/* Dados do Cliente e Faturamento */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Dados do Cliente e Faturamento</div>
                                        <div className="grid grid-cols-12 divide-x divide-slate-200">
                                            <div className="col-span-7 p-2.5 space-y-2">
                                                {(() => {
                                                    const fullCust = customers.find(c => c.name?.toLowerCase().trim() === printItem.customerName?.toLowerCase().trim());
                                                    const doc = printItem.customerDocument || fullCust?.document || (fullCust as any)?.cpf || (fullCust as any)?.cnpj;
                                                    const phone = printItem.original?.customerPhone || (printItem as any).customerPhone || fullCust?.whatsapp || fullCust?.phone;
                                                    const email = printItem.original?.customerEmail || (printItem as any).customerEmail || fullCust?.email;
                                                    
                                                    let address = printItem.customerAddress;
                                                    if (!address || address.trim() === '') {
                                                        if (fullCust && fullCust.street) {
                                                            address = `${fullCust.street}, ${fullCust.number || 'S/N'} - ${fullCust.neighborhood || ''} - ${fullCust.city || ''}`;
                                                        } else {
                                                            address = 'Não informado';
                                                        }
                                                    }

                                                    return (
                                                        <>
                                                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Cliente / Razão Social</label><div className="font-medium text-slate-900 text-sm uppercase">{printItem.customerName || 'Cliente Não Identificado'}</div></div>
                                                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Endereço</label><div className="font-medium text-slate-700 text-xs uppercase">{address}</div></div>
                                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                                {doc && (
                                                                    <div><label className="block text-[8px] font-medium text-slate-400 uppercase">CPF / CNPJ</label><div className="font-medium text-slate-700 text-xs">{doc}</div></div>
                                                                )}
                                                                {phone && (
                                                                    <div><label className="block text-[8px] font-medium text-slate-400 uppercase">{t.common.phone}</label><div className="font-medium text-slate-700 text-xs">{phone}</div></div>
                                                                )}
                                                                {email && (
                                                                    <div className="col-span-2"><label className="block text-[8px] font-medium text-slate-400 uppercase">{t.common.email}</label><div className="font-medium text-slate-700 text-xs truncate">{email}</div></div>
                                                                )}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                            <div className="col-span-5 p-2.5 grid grid-cols-2 gap-3 bg-slate-50/30">
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Origem Ref.</label><div className="font-medium uppercase">{printItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'}</div></div>
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Vencimento</label><div className="font-medium uppercase">{new Date(printItem.date).toLocaleDateString('pt-BR')}</div></div>
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Status do Pgto</label><div className={`font-medium text-[9px] border px-1.5 py-0.5 rounded inline-block uppercase ${printItem.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{printItem.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE'}</div></div>
                                                {printItem.original?.paidAt && (
                                                    <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Data do Recebimento</label><div className="font-medium uppercase">{new Date(printItem.original.paidAt).toLocaleDateString('pt-BR')}</div></div>
                                                )}
                                                {printItem.original?.paymentMethod && (
                                                    <div className="col-span-2"><label className="block text-[8px] font-medium text-slate-400 uppercase">Forma de Pagamento / Parcelas</label><div className="font-medium uppercase text-slate-800">{printItem.original.paymentMethod}{renderInstallmentsDetails(printItem)}</div></div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Objeto / Descrição */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Objeto do Faturamento</div>
                                        <div className="p-3 bg-white space-y-2">
                                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Título / Referência</label><div className="font-medium text-slate-900 text-xs uppercase">{printItem.title || 'Serviços Prestados'}</div></div>
                                            {printItem.description && (
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase mt-2">Descrição Registrada</label><div className="text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{printItem.description}</div></div>
                                            )}
                                            {printItem.original?.billingNotes && (
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase mt-2">Observações Fiscais/Faturamento</label><div className="text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{printItem.original.billingNotes}</div></div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Itens / Composição */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Descritivo dos Lançamentos</div>
                                        <table className="w-full text-left table-fixed">
                                            <thead>
                                                <tr className="bg-slate-50 text-[8px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                                                    <th className="px-3 py-2 w-10">#</th>
                                                    <th className="px-3 py-2">Descrição do Lançamento</th>
                                                    <th className="px-3 py-2 text-center w-16">Tipo</th>
                                                    <th className="px-3 py-2 text-right w-24">V. Nominal</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200 bg-white">
                                                <tr className="break-inside-avoid">
                                                    <td className="px-3 py-2 text-[10px] font-medium text-slate-400 align-top">01</td>
                                                    <td className="px-3 py-2 text-[10px] uppercase font-medium text-slate-800 break-words whitespace-pre-wrap align-top">Valor Acordado ({printItem.type === 'QUOTE' ? 'Orçamento Base' : 'Ordem de Serviço Base'})</td>
                                                    <td className="px-3 py-2 text-[10px] text-center font-medium text-slate-600 align-top">{printItem.type === 'QUOTE' ? 'ORC' : 'O.S.'}</td>
                                                    <td className="px-3 py-2 text-[10px] text-right font-semibold text-slate-900 font-mono align-top">
                                                        {`R$ ${(printItem?.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                    </td>
                                                </tr>
                                                {printItem.type === 'ORDER' && printItem.original?.linkedQuotes?.length > 0 && (() => {
                                                    const linkedQts = (printItem.original.linkedQuotes as string[]).map((qId: string) => quotes.find(q => q.id === qId)).filter(Boolean);
                                                    return linkedQts.map((q: any, i) => (
                                                        <tr key={q.id} className="bg-slate-50/50 break-inside-avoid">
                                                            <td className="px-3 py-2 text-[10px] font-medium text-slate-400 align-top">0{i + 2}</td>
                                                            <td className="px-3 py-2 text-[10px] uppercase font-medium text-slate-700 break-words whitespace-pre-wrap align-top">Vínculo: {q.title || 'Orçamento Vinculado'} (Ref: {q.displayId || q.id.slice(0, 8)})</td>
                                                            <td className="px-3 py-2 text-[10px] text-center font-medium text-slate-500 align-top">SUB</td>
                                                            <td className="px-3 py-2 text-[10px] text-right font-medium text-slate-500 font-mono align-top">Incluso</td>
                                                        </tr>
                                                    ));
                                                })()}
                                            </tbody>
                                        </table>
                                        <div className="bg-slate-50 border-t border-slate-200 divide-y divide-slate-100">
                                            {(() => {

                                                const netValue = Math.max(0, grossValue - discountAmount);
                                                const hasDiscount = discountAmount > 0.01;

                                                return (
                                                    <>
                                                        <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                                            <span className="text-[8px] uppercase font-medium tracking-widest text-slate-400">Total Nominal / Bruto</span>
                                                            <span className="text-[10px] font-medium text-slate-600 font-mono">R$ {grossValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                        {hasDiscount && (
                                                            <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                                                <span className="text-[8px] uppercase font-medium tracking-widest text-rose-400 italic">Desconto Aplicado {discLabel}</span>
                                                                <span className="text-[10px] font-medium text-rose-500 font-mono italic">- R$ {discountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            </div>
                                                        )}
                                                        <div className="bg-slate-800 text-white px-6 py-3 flex justify-end gap-12 items-center">
                                                            <span className="text-[10px] uppercase font-semibold tracking-[0.2em] text-slate-300">Total Líquido do Faturamento</span>
                                                            <span className="text-xl font-semibold tracking-tighter font-mono">R$ {netValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Aceite e Conformidade / Assinaturas */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-4">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Autenticação e Assinaturas</div>
                                        <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white text-center">
                                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Emitente / Responsável</p>
                                                <div className="h-[60px] flex items-center justify-center text-slate-200 italic text-[10px] font-medium uppercase">
                                                    Visto Eletrônico Nexus
                                                </div>
                                                <div className="w-full border-t border-slate-300 pt-2">
                                                    <p className="text-[12px] font-semibold text-slate-900 uppercase">{tenant?.company_name || 'Assinatura Oficial'}</p>
                                                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Técnico: {printItem.technician || '—'}</p>
                                                </div>
                                            </div>
                                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">De Acordo / Assinatura do Cliente</p>
                                                <div className="h-[60px] flex items-center justify-center">
                                                    {printItem.status === 'PAID' ? (
                                                        <span className="text-emerald-300 italic text-[10px] font-medium uppercase">Liquidado Eletronicamente</span>
                                                    ) : (
                                                        <span className="text-slate-200 italic text-[10px] font-medium uppercase">—</span>
                                                    )}
                                                </div>
                                                <div className="w-full border-t border-slate-300 pt-2">
                                                    <p className="text-[12px] font-semibold text-slate-900 uppercase">{printItem.customerName || 'Cliente'}</p>
                                                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">{printItem.customerDocument ? `Doc: ${printItem.customerDocument}` : ''}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Minimalista SaaS */}
                                <div className="mt-8 pt-4 border-t-2 border-slate-800 flex justify-end items-center text-slate-500">
                                    <div className="text-right">
                                        <p className="text-[7px] uppercase tracking-tight mt-0.5">Recibo emitido eletronicamente. Auditável na plataforma central.</p>
                                    </div>
                                </div>
                            </div>
                            </div>
                            )}

                            {/* Página 2: Comprovante Anexo (dentro do print-container) */}
                            {(printItem.original?.receiptUrl && printWithAttachment) && (
                                <div className="bg-white text-[10px] leading-tight font-poppins p-6 print:p-0 flex flex-col relative w-[210mm] mx-auto print:w-full" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', pageBreakBefore: 'always', breakBefore: 'page' }}>
                                    <div className="border-b-2 border-slate-800 pb-4 mb-6">
                                        <h2 className="text-xl font-medium text-slate-900 uppercase tracking-tight">Comprovante de Transação</h2>
                                        <p className="text-[10px] text-slate-500 mt-1 uppercase">Anexo referente ao faturamento: {getDocLabel(printItem)}</p>
                                    </div>
                                    <div className="flex-1 flex flex-col items-center justify-start">
                                        {printItem.original.receiptUrl.toLowerCase().includes('.pdf') ? (
                                            <div className="w-full border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center text-center">
                                                <Paperclip size={48} className="text-slate-300 mb-4" />
                                                <p className="text-sm font-medium text-slate-600 mb-2">Comprovante em formato PDF anexado</p>
                                                <p className="text-[10px] text-slate-400">Os documentos PDF precisam ser impressos a partir do visualizador digital original.</p>
                                            </div>
                                        ) : (
                                            <img
                                                src={printItem.original.receiptUrl}
                                                alt="Comprovante"
                                                className="max-w-full object-contain border border-slate-200 rounded-lg shadow-sm"
                                                style={{ maxHeight: '85vh' }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── POPUP: Imprimir comprovante? ── */}
            {showAttachmentConfirmModal && pendingPrintItem && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden">
                        <div className="p-6">
                            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                                <Paperclip size={22} className="text-blue-600" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-800 text-center mb-1">Imprimir Comprovante?</h3>
                            <p className="text-xs text-slate-500 text-center font-medium">
                                Este faturamento possui um comprovante anexado.<br/>Deseja incluí-lo na impressão como segunda página?
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 px-6 pb-6">
                            <button
                                onClick={() => {
                                    const item = pendingPrintItem;
                                    flushSync(() => {
                                        setPrintWithAttachment(true);
                                        setPrintItem(item);
                                        setIsPrintModalOpen(true);
                                        setShowAttachmentConfirmModal(false);
                                        setPendingPrintItem(null);
                                    });
                                    executePrint(true);
                                }}
                                className="w-full py-3 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                            >
                                <Printer size={16} /> Imprimir comprovante junto
                            </button>
                            <button
                                onClick={() => {
                                    const item = pendingPrintItem;
                                    flushSync(() => {
                                        setPrintWithAttachment(false);
                                        setPrintItem(item);
                                        setIsPrintModalOpen(true);
                                        setShowAttachmentConfirmModal(false);
                                        setPendingPrintItem(null);
                                    });
                                    executePrint(false);
                                }}
                                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                            >
                                <FileText size={16} /> Não imprimir comprovante junto
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal de Cobrança Asaas (Em breve) */}

            {/* Modal de Auditoria da Transação / Gateway */}
            {isAuditModalOpen && auditModalItem && (
                <PaymentAuditModal
                    isOpen={isAuditModalOpen}
                    onClose={() => {
                        setIsAuditModalOpen(false);
                        setAuditModalItem(null);
                    }}
                    item={auditModalItem}
                />
            )}

            {/* Modal de Detalhes da Fatura Gerada */}
            {isInvoiceDetailModalOpen && selectedInvoice && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsInvoiceDetailModalOpen(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden border border-slate-200 flex flex-col" onClick={e => e.stopPropagation()}>
                        
                        {/* Modal Header */}
                        <div className="bg-white border-b border-slate-200 px-6 pt-5 pb-0 flex flex-col shrink-0 shadow-xs">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 rounded-2xl bg-[#009EE3]/10 flex items-center justify-center border border-[#009EE3]/20 text-[#009EE3] shadow-xs shrink-0">
                                        <FileText size={22} className="text-[#009EE3]" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                                                Fatura Consolidada {selectedInvoice.display_id}
                                            </h2>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                                selectedInvoice.status === 'PAID' 
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold' 
                                                    : 'bg-amber-50 text-amber-700 border border-amber-200/80 font-bold animate-pulse'
                                            }`}>
                                                {selectedInvoice.status === 'PAID' ? 'Liquidado / Pago' : 'Pendente de Pagamento'}
                                            </span>
                                        </div>
                                        {(() => {
                                            const paidAtRaw = selectedInvoice.paid_at || (invoiceInstallmentsList.find(i => i.paid_at)?.paid_at) || (selectedInvoice.status === 'PAID' ? selectedInvoice.updated_at : null);
                                            const paidAtFormatted = paidAtRaw ? formatAsaasDateTime(paidAtRaw) : null;
                                            const billedUser = getBilledUserName(selectedInvoice);

                                            return (
                                                <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 mt-1">
                                                    <span>
                                                        <strong className="text-slate-700 font-semibold">Emitida em:</strong> {selectedInvoice.created_at ? new Date(selectedInvoice.created_at).toLocaleString('pt-BR') : 'Data N/I'}
                                                    </span>
                                                    <span className="border-l border-slate-200 pl-3">
                                                        <strong className="text-sky-800 font-semibold">Faturado por:</strong> <span className="font-bold text-sky-900">{billedUser}</span>
                                                    </span>
                                                    {(selectedInvoice.status === 'PAID' || paidAtFormatted) && (
                                                        <span className="text-emerald-700 font-semibold border-l border-slate-200 pl-3">
                                                            <strong className="text-emerald-800 font-bold">Liquidada em:</strong> {paidAtFormatted || 'Data confirmada'}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsInvoiceDetailModalOpen(false)} 
                                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* TABS DO MODAL DE FATURA */}
                            <div className="flex items-center gap-6 mt-4 w-full border-t border-slate-100 pt-3">
                                <button
                                    onClick={() => setInvoiceDetailTab('GERAL')}
                                    className={`pb-3 text-sm font-bold transition-all flex items-center gap-2.5 border-b-2 group ${
                                        invoiceDetailTab === 'GERAL' 
                                            ? 'border-[#009EE3] text-[#009EE3]' 
                                            : 'border-transparent text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <div className={`p-1.5 rounded-lg transition-colors ${
                                        invoiceDetailTab === 'GERAL' 
                                            ? 'bg-[#009EE3]/15 text-[#009EE3]' 
                                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                                    }`}>
                                        <FileText size={17} />
                                    </div>
                                    <span>Geral</span>
                                </button>

                                {(() => {
                                    const methodStr = String(selectedInvoice.payment_method || '').toLowerCase();
                                    const isBoletoOrCard = methodStr.includes('boleto') || methodStr.includes('ticket') || methodStr.includes('cart') || methodStr.includes('card') || methodStr.includes('credit');
                                    const hasInsts = invoiceInstallmentsList.length > 0 || (selectedInvoice.notes && (selectedInvoice.notes.includes('installments') || selectedInvoice.notes.includes('hasInstallments')));
                                    return isBoletoOrCard || hasInsts;
                                })() && (
                                    <button
                                        onClick={() => setInvoiceDetailTab('PARCELAS')}
                                        className={`pb-3 text-sm font-bold transition-all flex items-center gap-2.5 border-b-2 group ${
                                            invoiceDetailTab === 'PARCELAS' 
                                                ? 'border-[#009EE3] text-[#009EE3]' 
                                                : 'border-transparent text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        <div className={`p-1.5 rounded-lg transition-colors ${
                                            invoiceDetailTab === 'PARCELAS' 
                                                ? 'bg-[#009EE3]/15 text-[#009EE3]' 
                                                : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                                        }`}>
                                            <Layers size={17} />
                                        </div>
                                        <span>Parcelamento & Status das Parcelas</span>
                                        {invoiceInstallmentsList.length > 0 && (
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                                                invoiceDetailTab === 'PARCELAS'
                                                    ? 'bg-[#009EE3]/15 text-[#009EE3] border-[#009EE3]/30'
                                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                            }`}>
                                                {invoiceInstallmentsList.filter(i => i.status === 'PAID').length}/{invoiceInstallmentsList.length} Pagas
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>


                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-slate-50/50">
                            
                            {invoiceDetailTab === 'GERAL' && (
                                <>
                                    {/* Grid 1: Informações Gerais do Cliente, Gateway e Cronograma de Datas */}
                                    {(() => {
                                        const cust = customers.find(c => c.id === selectedInvoice.customer_id);
                                        const phone = selectedInvoice.customer_phone || (selectedInvoice as any).customerPhone || cust?.phone || cust?.mobile_phone;
                                        const email = selectedInvoice.customer_email || (selectedInvoice as any).customerEmail || cust?.email;
                                        const addressParts = [
                                            selectedInvoice.customer_address || (selectedInvoice as any).customerAddress || cust?.address,
                                            cust?.address_number ? `Nº ${cust.address_number}` : null,
                                            cust?.complement,
                                            cust?.neighborhood,
                                            cust?.city && cust?.state ? `${cust.city}/${cust.state}` : (cust?.city || cust?.state),
                                            cust?.zip_code ? `CEP: ${cust.zip_code}` : null
                                        ].filter(Boolean);
                                        const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Endereço não cadastrado';

                                        const paidAtRaw = selectedInvoice.paid_at || (invoiceInstallmentsList.find(i => i.paid_at)?.paid_at) || (selectedInvoice.status === 'PAID' ? selectedInvoice.updated_at : null);
                                        const paidAtFormatted = paidAtRaw ? formatAsaasDateTime(paidAtRaw) : null;

                                        return (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Card Dados do Cliente Completo */}
                                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Dados do Cliente</span>
                                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
                                                            CPF/CNPJ: {selectedInvoice.customer_document || cust?.cpf_cnpj || cust?.cnpj || cust?.cpf || 'Não informado'}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-extrabold text-slate-800">{selectedInvoice.customer_name}</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                                                        <p className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-slate-400">📞 Tel:</span> 
                                                            <span className="font-mono">{phone || 'Não informado'}</span>
                                                        </p>
                                                        <p className="flex items-center gap-1.5 truncate">
                                                            <span className="font-semibold text-slate-400">✉️ Email:</span> 
                                                            <span className="truncate">{email || 'Não informado'}</span>
                                                        </p>
                                                    </div>
                                                    <div className="text-xs text-slate-600 border-t border-slate-100 pt-2 flex items-start gap-1.5">
                                                        <span className="font-semibold text-slate-400 shrink-0">📍 Endereço:</span> 
                                                        <span className="leading-relaxed">{fullAddress}</span>
                                                    </div>
                                                </div>

                                                {/* Card Forma & Gateway de Pagamento */}
                                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2 flex flex-col justify-between">
                                                    <div>
                                                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2">Forma & Gateway de Pagamento</span>
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-sm font-bold text-slate-800">
                                                                    {(() => {
                                                                    const raw = selectedInvoice.payment_method || 'Asaas';
                                                                    const s = String(raw).toLowerCase();
                                                                    let method = raw;
                                                                    if (s.includes('credit_card') || s.includes('cart') || s.includes('card')) method = 'Cartão de Crédito';
                                                                    else if (s.includes('pix')) method = 'Pix';
                                                                    else if (s.includes('ticket') || s.includes('boleto')) method = 'Boleto';
                                                                    else if (s.includes('cash') || s.includes('dinheiro')) method = 'Dinheiro';
                                                                    
                                                                    const match = raw.match(/(\d+)x/i);
                                                                    const rawCount = match ? parseInt(match[1]) : 0;
                                                                    
                                                                    const maxInst = invoiceInstallmentsList?.length > 0 ? invoiceInstallmentsList[0].total_installments : 0;
                                                                    const count = maxInst || invoiceInstallmentsList?.length || rawCount || 1;
                                                                    
                                                                    if (count > 1 && method !== 'Pix' && method !== 'Dinheiro') {
                                                                        return `${method} (${count}x)`;
                                                                    }
                                                                    return method;
                                                                    })()}
                                                                </span>
                                                                {selectedInvoice.status === 'PAID' ? (
                                                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                        ✓ Pago / Liquidado
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                                                        • Pendente
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {(() => {
                                                                const rawAsaasId = selectedInvoice.gateway_payment_id || selectedInvoice.payment_gateway_id;
                                                                const friendlyInvoiceNum = selectedInvoice.invoice_number || selectedInvoice.asaas_invoice_number || (selectedInvoice.notes ? (selectedInvoice.notes.match(/fatura[^\d]*(\d+)/i)?.[1]) : null);

                                                                return (
                                                                    <div className="space-y-1.5 pt-1">
                                                                        {friendlyInvoiceNum && (
                                                                            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs font-mono">
                                                                                <span className="text-slate-600 font-bold">Nº Fatura Asaas:</span>
                                                                                <span className="font-extrabold text-slate-900 select-all">{friendlyInvoiceNum}</span>
                                                                            </div>
                                                                        )}
                                                                        {rawAsaasId ? (
                                                                            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs font-mono">
                                                                                <span className="text-slate-600 font-bold">ID Transação ASAAS:</span>
                                                                                <span className="font-extrabold text-[#009EE3] select-all">#{rawAsaasId}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-[11px] text-slate-400 italic">
                                                                                Nenhum ID de Transação ASAAS associado ainda.
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card Cronograma de Datas (Emissão, Vencimento/Faturamento, Pagamento) */}
                                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2.5 md:col-span-2">
                                                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Cronograma & Datas da Cobrança</span>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Data da Emissão</span>
                                                            <span className="font-bold text-slate-800 font-mono mt-1 block">
                                                                {selectedInvoice.created_at ? new Date(selectedInvoice.created_at).toLocaleString('pt-BR') : 'Não informada'}
                                                            </span>
                                                        </div>
                                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Data do Faturamento / Vencimento</span>
                                                            <span className="font-bold text-slate-800 font-mono mt-1 block">
                                                                {selectedInvoice.due_date ? new Date(selectedInvoice.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'A Combinar'}
                                                            </span>
                                                        </div>
                                                        <div className={`p-3 rounded-xl border ${selectedInvoice.status === 'PAID' || paidAtFormatted ? 'bg-emerald-50/80 border-emerald-200' : 'bg-slate-50 border-slate-200/80'}`}>
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider block ${selectedInvoice.status === 'PAID' || paidAtFormatted ? 'text-emerald-700' : 'text-slate-400'}`}>Data de Pagamento / Liquidação</span>
                                                            <span className={`font-extrabold font-mono mt-1 block ${selectedInvoice.status === 'PAID' || paidAtFormatted ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                                {paidAtFormatted || 'Aguardando Pagamento'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                            {/* Card de Cobrança Gerada (Pix/Boleto/Checkout) no Detalhe da Fatura */}
                            {selectedInvoice.status !== 'PAID' && (selectedInvoice.gateway_ticket_url || selectedInvoice.ticket_url || selectedInvoice.gateway_pix_code || selectedInvoice.pix_code || selectedInvoice.gateway_payment_id || selectedInvoice.payment_gateway_id) && (
                                <div className="bg-sky-50/90 border border-sky-200 rounded-2xl p-4 space-y-3 shadow-xs font-poppins animate-fade-in">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-bold text-[#009EE3]">
                                            <CreditCard size={16} /> Cobrança Emitida (Pronta para Reenvio)
                                        </div>
                                        <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2.5 py-0.5 rounded-full border border-sky-200 uppercase tracking-wider">
                                            Link Ativo
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 leading-relaxed">
                                        Esta fatura já possui dados de cobrança gerados. Para reenviar ao cliente sem refaturar, utilize os botões abaixo:
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        {(selectedInvoice.gateway_pix_code || selectedInvoice.pix_code) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(selectedInvoice.gateway_pix_code || selectedInvoice.pix_code);
                                                    showAlert('Código Pix Copia e Cola copiado com sucesso!', 'success');
                                                }}
                                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
                                            >
                                                📋 Copiar Pix
                                            </button>
                                        )}

                                        {(selectedInvoice.gateway_ticket_url || selectedInvoice.ticket_url) && (
                                            <button
                                                type="button"
                                                onClick={() => window.open(selectedInvoice.gateway_ticket_url || selectedInvoice.ticket_url, '_blank')}
                                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
                                            >
                                                📄 Abrir Boleto PDF
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                const checkoutUrl = `${window.location.origin}/#/checkout/invoice/${selectedInvoice.id}`;
                                                window.open(checkoutUrl, '_blank');
                                            }}
                                            className="px-3 py-1.5 bg-[#009EE3] hover:bg-[#0089c7] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
                                        >
                                            <Share2 size={13} /> 🔗 Abrir Checkout
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                const companyName = tenant?.company_name || tenant?.name || 'NEXUS';
                                                const checkoutUrl = `${window.location.origin}/#/checkout/invoice/${selectedInvoice.id}`;
                                                const rawPhone = selectedInvoice.customer_phone || (selectedInvoice as any).customerPhone || '';
                                                const cleanPhone = String(rawPhone).replace(/\D/g, '');
                                                const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : '';
                                                const finalVal = selectedInvoice.total_amount - (selectedInvoice.discount_amount || 0) + (selectedInvoice.shipping_amount || 0) + (selectedInvoice.other_additions_amount || 0);
                                                const formattedAmount = finalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                const pixCode = selectedInvoice.gateway_pix_code || selectedInvoice.pix_code;

                                                const text = encodeURIComponent(
                                                    `🏢 *${companyName.toUpperCase()}*\n` +
                                                    `📌 *Faturamento Oficial • Fatura #${selectedInvoice.display_id}*\n\n` +
                                                    `Olá, *${selectedInvoice.customer_name}*!\n\n` +
                                                    `Segue o link oficial para pagamento no valor de *R$ ${formattedAmount}*:\n\n` +
                                                    (pixCode ? `⚡ *PIX Copia e Cola:*\n\`${pixCode}\`\n\n` : '') +
                                                    `🔗 *Link do Checkout Seguro:*\n${checkoutUrl}\n\n` +
                                                    `Qualquer dúvida, estamos à inteira disposição!`
                                                );
                                                const waUrl = phoneParam ? `https://wa.me/${phoneParam}?text=${text}` : `https://wa.me/?text=${text}`;
                                                window.open(waUrl, '_blank');
                                            }}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
                                        >
                                            📲 Reenviar WhatsApp
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Grid 2: Itens Agrupados na Fatura */}
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                                <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200 flex justify-between items-center">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Itens e Documentos Incluídos no Lote</h3>
                                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                        {invoiceItems.filter(ii => ii.invoice_id === selectedInvoice.id).length} Itens
                                    </span>
                                </div>
                                <div className="divide-y divide-slate-100 overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[600px]">
                                        <thead>
                                            <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                                <th className="py-2.5 px-4">Documento</th>
                                                <th className="py-2.5 px-4">Descrição / Título</th>
                                                <th className="py-2.5 px-4 text-right">Valor Nominal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(() => {
                                                const itemsInInv = invoiceItems.filter(ii => ii.invoice_id === selectedInvoice.id);
                                                if (itemsInInv.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td colSpan={3} className="py-4 text-center text-xs text-slate-400">
                                                                Nenhum detalhe de item encontrado.
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                return itemsInInv.map((ii, idx) => {
                                                    const raw = allItems.find(r => r.id === ii.reference_id);
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50">
                                                            <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700">
                                                                <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                                    {raw ? getDocLabel(raw) : (ii.reference_type === 'QUOTE' ? 'ORÇAMENTO' : 'O.S.')}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-xs text-slate-700 font-medium">
                                                                {raw?.title || raw?.original?.title || raw?.original?.description || 'Item da Fatura'}
                                                            </td>
                                                            <td className="py-3 px-4 text-xs font-bold text-slate-900 text-right">
                                                                {formatCurrency(ii.amount || raw?.value || 0)}
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Resumo Financeiro da Fatura e Ajustes */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Resumo Financeiro da Cobrança</h3>
                                    {selectedInvoice.status !== 'PAID' && (
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingInvoiceValues(!isEditingInvoiceValues)}
                                            className="text-xs text-[#009EE3] hover:underline font-semibold flex items-center gap-1"
                                        >
                                            {isEditingInvoiceValues ? 'Cancelar Edição' : '✏️ Editar Desconto / Adicionais'}
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 font-medium">Subtotal dos Itens:</span>
                                            <span className="font-bold text-slate-800">{formatCurrency(selectedInvoice.total_amount)}</span>
                                        </div>
                                        
                                        {/* Desconto */}
                                        <div className="flex justify-between items-center">
                                            <span className="text-rose-500 font-medium">Desconto:</span>
                                            {isEditingInvoiceValues ? (
                                                <input 
                                                    type="number"
                                                    value={editInvoiceDiscount}
                                                    onChange={e => setEditInvoiceDiscount(parseFloat(e.target.value) || 0)}
                                                    className="w-28 px-2 py-1 text-xs border border-rose-200 rounded font-mono text-right outline-none focus:ring-1 focus:ring-rose-400"
                                                />
                                            ) : (
                                                <span className="font-bold text-rose-500">- {formatCurrency(selectedInvoice.discount_amount || 0)}</span>
                                            )}
                                        </div>

                                        {/* Frete */}
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 font-medium">Frete:</span>
                                            {isEditingInvoiceValues ? (
                                                <input 
                                                    type="number"
                                                    value={editInvoiceShipping}
                                                    onChange={e => setEditInvoiceShipping(parseFloat(e.target.value) || 0)}
                                                    className="w-28 px-2 py-1 text-xs border border-slate-200 rounded font-mono text-right outline-none focus:ring-1 focus:ring-blue-400"
                                                />
                                            ) : (
                                                <span className="font-bold text-slate-800">+ {formatCurrency(selectedInvoice.shipping_amount || 0)}</span>
                                            )}
                                        </div>

                                        {/* Outros Acréscimos */}
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 font-medium">Outros Acréscimos:</span>
                                            {isEditingInvoiceValues ? (
                                                <input 
                                                    type="number"
                                                    value={editInvoiceAdditions}
                                                    onChange={e => setEditInvoiceAdditions(parseFloat(e.target.value) || 0)}
                                                    className="w-28 px-2 py-1 text-xs border border-slate-200 rounded font-mono text-right outline-none focus:ring-1 focus:ring-blue-400"
                                                />
                                            ) : (
                                                <span className="font-bold text-slate-800">+ {formatCurrency(selectedInvoice.other_additions_amount || 0)}</span>
                                            )}
                                        </div>

                                        {isEditingInvoiceValues && (
                                            <div className="pt-2 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={handleSaveInvoiceAdjustments}
                                                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                                >
                                                    Salvar Alterações
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Total Final */}
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-center items-end">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Valor Total da Fatura</span>
                                        <span className="text-2xl font-black text-[#009EE3] tracking-tight mt-1">
                                            {formatCurrency(
                                                selectedInvoice.total_amount - 
                                                (isEditingInvoiceValues ? editInvoiceDiscount : (selectedInvoice.discount_amount || 0)) + 
                                                (isEditingInvoiceValues ? editInvoiceShipping : (selectedInvoice.shipping_amount || 0)) + 
                                                (isEditingInvoiceValues ? editInvoiceAdditions : (selectedInvoice.other_additions_amount || 0))
                                            )}
                                        </span>
                                    </div>
                                    </div>
                                </div>
                                </>
                            )}
                            
                            {/* ABA DE PARCELAS E STATUS */}
                            {invoiceDetailTab === 'PARCELAS' && (() => {
                                const selectedInvoiceLiquid = Math.max(
                                    0,
                                    Number(selectedInvoice.total_amount || 0) -
                                    Number(selectedInvoice.discount_amount || 0) +
                                    Number(selectedInvoice.shipping_amount || 0) +
                                    Number(selectedInvoice.other_additions_amount || 0)
                                );
                                return (
                                <div className="space-y-6">
                                    {invoiceInstallmentsList.length === 0 ? (
                                        (selectedInvoice.notes && selectedInvoice.notes.includes('hasInstallments')) ? (
                                            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center animate-in fade-in">
                                                <Loader2 size={32} className="text-[#009EE3] animate-spin mb-4" />
                                                <h3 className="text-sm font-bold text-slate-800 mb-2">Processando Parcelas no Asaas</h3>
                                                <p className="text-[12px] text-slate-500 max-w-sm mb-6">
                                                    O gateway está gerando as cobranças. Isso leva apenas alguns segundos.
                                                </p>
                                                <button 
                                                    onClick={() => loadInvoiceInstallments(selectedInvoice.id)}
                                                    className="h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-xs"
                                                >
                                                    <RefreshCw size={14} /> Atualizar Lista
                                                </button>
                                            </div>
                                        ) : (
                                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-10 h-10 rounded-full bg-[#009EE3]/10 flex items-center justify-center text-[#009EE3]">
                                                    <Calculator size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-slate-800">Gerar Parcelamento Manual</h3>
                                                    <p className="text-[11px] text-slate-500">
                                                        Você pode dividir o valor total de {formatCurrency(selectedInvoiceLiquid)} em boletos ou cobranças.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 mt-6">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nº de Parcelas</label>
                                                    <input 
                                                        type="number" 
                                                        min={1} 
                                                        max={12} 
                                                        value={installmentCount} 
                                                        onChange={e => setInstallmentCount(Number(e.target.value))} 
                                                        className="w-full border border-slate-300 rounded-lg h-10 px-3 text-sm"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Intervalo (Dias)</label>
                                                    <select 
                                                        value={installmentInterval} 
                                                        onChange={e => setInstallmentInterval(Number(e.target.value))}
                                                        className="w-full border border-slate-300 rounded-lg h-10 px-3 text-sm bg-white"
                                                    >
                                                        <option value={15}>15 dias</option>
                                                        <option value={30}>30 dias</option>
                                                        <option value={60}>60 dias</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="mt-4">
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Vencimento da 1ª Parcela</label>
                                                <input
                                                    type="date"
                                                    value={boletoDueDate || new Date().toISOString().split('T')[0]}
                                                    onChange={e => setBoletoDueDate(e.target.value)}
                                                    className="w-full border border-slate-300 rounded-lg h-10 px-3 text-sm bg-white"
                                                />
                                            </div>
                                            <div className="mt-6">
                                                <button 
                                                    onClick={handleGenerateInstallments}
                                                    disabled={generatingInstallments || selectedInvoiceLiquid / installmentCount < 4}
                                                    className="w-full h-11 bg-[#009EE3] hover:bg-[#009EE3]/90 text-white font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {generatingInstallments ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
                                                    Gerar Boletos no Asaas
                                                </button>
                                                {selectedInvoiceLiquid / installmentCount < 4 && (
                                                    <p className="text-[11px] text-red-500 mt-2 text-center">
                                                        O valor de cada parcela deve ser maior que R$ 4,00.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        )
                                    ) : (
                                        <div className="space-y-4 animate-in fade-in">
                                            {/* Banner Resumo de Parcelas & Sincronização de Adiantamentos */}
                                            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <Layers size={18} className="text-[#009EE3]" />
                                                        <h3 className="text-sm font-bold text-white">Status do Parcelamento / Carnê</h3>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-white/10 text-slate-300">
                                                            {invoiceInstallmentsList.filter(i => i.status === 'PAID' || i.status === 'RECEIVED' || i.status === 'CONFIRMED' || i.status === 'ANTICIPATED').length} de {invoiceInstallmentsList.length} Liquidada(s)
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-300">
                                                        Valor Pago: <strong className="text-emerald-400">{formatCurrency(invoiceInstallmentsList.filter(i => i.status === 'PAID' || i.status === 'RECEIVED' || i.status === 'CONFIRMED' || i.status === 'ANTICIPATED').reduce((acc, i) => acc + (Number(i.amount) || 0), 0))}</strong> de <strong>{formatCurrency(selectedInvoiceLiquid)}</strong>
                                                    </p>
                                                </div>

                                                <button
                                                    disabled={isSyncingAllInstallments}
                                                    onClick={async () => {
                                                        setIsSyncingAllInstallments(true);
                                                        let successMessage = '';
                                                        let errorMessage = '';
                                                        try {
                                                            const tid = tenant?.id || tenantIdStr || '';
                                                            const gatewayId = selectedInvoice.gateway_payment_id || selectedInvoice.payment_gateway_id || selectedInvoice.id;
                                                            
                                                            // 1. Sincronizar Fatura Principal
                                                            const res = await PaymentService.syncInstallment(gatewayId, tid, selectedInvoice.id, 'INVOICE');

                                                            // 2. Sincronizar individualmente cada parcela existente na lista
                                                            if (invoiceInstallmentsList && invoiceInstallmentsList.length > 0) {
                                                                await Promise.all(
                                                                    invoiceInstallmentsList.map(inst => {
                                                                        const instGwId = inst.gateway_payment_id || inst.payment_gateway_id;
                                                                        if (instGwId) {
                                                                            return PaymentService.syncInstallment(instGwId, tid, selectedInvoice.id, 'INVOICE');
                                                                        }
                                                                        return Promise.resolve(null);
                                                                    })
                                                                );
                                                            }

                                                            const statusPT = translateStatusToPT(res.newStatus || 'PENDING');
                                                            await loadInvoiceInstallments(selectedInvoice.id);
                                                            await loadInvoices();
                                                            successMessage = `Todas as ${invoiceInstallmentsList.length || 1} parcelas foram sincronizadas! Status: ${statusPT}`;
                                                        } catch (err: any) {
                                                            errorMessage = err?.message || 'Erro ao sincronizar parcelas';
                                                        } finally {
                                                            setIsSyncingAllInstallments(false);
                                                        }

                                                        if (successMessage) {
                                                            showAlert(successMessage, 'success');
                                                        } else if (errorMessage) {
                                                            showAlert(errorMessage, 'error');
                                                        }
                                                    }}
                                                    className="h-10 px-4 bg-[#009EE3] hover:bg-[#009EE3]/90 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
                                                >
                                                    {isSyncingAllInstallments ? (
                                                        <Loader2 size={15} className="animate-spin" />
                                                    ) : (
                                                        <RefreshCw size={15} />
                                                    )}
                                                    {isSyncingAllInstallments ? 'Verificando Asaas...' : 'Sincronizar Todas as Parcelas'}
                                                </button>
                                            </div>

                                            {/* Tabela de Parcelas */}
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                                                <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 px-5 py-3.5">
                                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                        <span>Lista de Parcelas Geradas</span>
                                                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded-full font-bold">
                                                            {invoiceInstallmentsList.length} {invoiceInstallmentsList.length === 1 ? 'parcela' : 'parcelas'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                                                                <th className="px-4 py-3">Parcela</th>
                                                                <th className="px-4 py-3">Método</th>
                                                                <th className="px-4 py-3">Vencimento</th>
                                                                <th className="px-4 py-3">Pago em</th>
                                                                <th className="px-4 py-3">Valor</th>
                                                                <th className="px-4 py-3">Status</th>
                                                                <th className="px-4 py-3 text-right">Ações</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {invoiceInstallmentsList.map((inst) => {
                                                                const isPaid = inst.status === 'PAID' || inst.status === 'RECEIVED' || inst.status === 'CONFIRMED' || inst.status === 'ANTICIPATED';
                                                                const isOverdue = inst.status === 'OVERDUE';
                                                                const isCanceled = inst.status === 'CANCELED' || inst.status === 'REFUNDED' || inst.status === 'DELETED';
                                                                const isPending = !isPaid && !isOverdue && !isCanceled;

                                                                return (
                                                                    <tr key={inst.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
                                                                        <td className="px-4 py-4 text-xs font-bold text-slate-800 whitespace-nowrap">
                                                                            Parcela {inst.installment_number} de {inst.total_installments}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-xs text-slate-600 font-medium">
                                                                            {(() => {
                                                                                const m = String(inst.payment_method || selectedInvoice.payment_method || '').toLowerCase();
                                                                                if (m.includes('credit_card') || m.includes('cart') || m.includes('card')) return 'Cartão de Crédito';
                                                                                if (m.includes('pix')) return 'PIX';
                                                                                return 'Boleto Bancário';
                                                                            })()}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                                                                            {new Date(inst.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-xs whitespace-nowrap font-mono">
                                                                            {isPaid ? (
                                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                                                                    <Calendar size={12} className="text-emerald-600 shrink-0" />
                                                                                    {formatAsaasDateTime(inst.paid_at || inst.payment_date || (isPaid ? inst.updated_at : null)) || 'Data confirmada'}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-400 font-normal">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-sm font-bold text-slate-900 whitespace-nowrap">
                                                                            {formatCurrency(inst.amount)}
                                                                        </td>
                                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                                            {isPaid && (
                                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                                                                                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" /> Pago / Liquidado
                                                                                </span>
                                                                            )}
                                                                            {isOverdue && (
                                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs">
                                                                                    <AlertTriangle size={13} className="text-rose-600 shrink-0" /> Vencido
                                                                                </span>
                                                                            )}
                                                                            {isPending && (
                                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
                                                                                    <Clock size={13} className="text-amber-600 shrink-0" /> Pendente
                                                                                </span>
                                                                            )}
                                                                            {isCanceled && (
                                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-600 border border-slate-300 shadow-xs">
                                                                                    <XCircle size={13} className="text-slate-500 shrink-0" /> Cancelado
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right whitespace-nowrap">
                                                                            <div className="flex justify-end gap-1.5 items-center">
                                                                                {/* Botão 1: Atualizar / Sincronizar */}
                                                                                <button 
                                                                                    disabled={syncingInstallmentId === inst.id}
                                                                                    className="p-1.5 text-slate-500 hover:text-[#009EE3] hover:bg-[#009EE3]/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50" 
                                                                                    title="Atualizar / Sincronizar parcela com Asaas"
                                                                                    onClick={async () => {
                                                                                        setSyncingInstallmentId(inst.id);
                                                                                        let successMessage = '';
                                                                                        let errorMessage = '';
                                                                                        try {
                                                                                            const res = await PaymentService.syncInstallment(inst.gateway_payment_id || inst.payment_gateway_id, tenantIdStr, selectedInvoice?.id, 'INVOICE');
                                                                                            if (res.success) {
                                                                                                const statusPT = translateStatusToPT(res.newStatus || inst.status);
                                                                                                if (selectedInvoice?.id) await loadInvoiceInstallments(selectedInvoice.id);
                                                                                                await loadInvoices();
                                                                                                successMessage = `Status da Parcela ${inst.installment_number}: ${statusPT}`;
                                                                                            } else {
                                                                                                errorMessage = res.message || 'Erro ao sincronizar parcela';
                                                                                            }
                                                                                        } catch (err: any) {
                                                                                            errorMessage = err?.message || 'Erro ao sincronizar parcela';
                                                                                        } finally {
                                                                                            setSyncingInstallmentId(null);
                                                                                        }

                                                                                        if (successMessage) {
                                                                                            showAlert(successMessage, 'success');
                                                                                        } else if (errorMessage) {
                                                                                            showAlert(errorMessage, 'error');
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    {syncingInstallmentId === inst.id ? (
                                                                                        <Loader2 size={15} className="animate-spin text-[#009EE3]" />
                                                                                    ) : (
                                                                                        <RefreshCw size={15} />
                                                                                    )}
                                                                                </button>

                                                                                {/* Botão 2: Visualizar */}
                                                                                {(() => {
                                                                                    const viewUrl = inst.gateway_ticket_url || selectedInvoice?.gateway_ticket_url || selectedInvoice?.ticket_url;
                                                                                    return (
                                                                                        <button 
                                                                                            disabled={!viewUrl}
                                                                                            className="p-1.5 text-[#009EE3] hover:bg-[#009EE3]/10 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" 
                                                                                            title={viewUrl ? "Visualizar Boleto / Fatura no Asaas" : "Link de pagamento não disponível"}
                                                                                            onClick={() => {
                                                                                                if (viewUrl) window.open(viewUrl, '_blank');
                                                                                            }}
                                                                                        >
                                                                                            <Eye size={15} />
                                                                                        </button>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                );
                            })()}
                        </div>

                        {/* Modal Footer (Ações) */}
                        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                            <div className="flex items-center gap-2">
                                {selectedInvoice.payment_gateway_id && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const finalVal = selectedInvoice.total_amount - (selectedInvoice.discount_amount || 0) + (selectedInvoice.shipping_amount || 0) + (selectedInvoice.other_additions_amount || 0);
                                            setAuditModalItem({
                                                id: selectedInvoice.id,
                                                type: 'INVOICE',
                                                displayId: selectedInvoice.display_id,
                                                title: `Fatura ${selectedInvoice.display_id}`,
                                                amount: finalVal,
                                                customerName: selectedInvoice.customer_name,
                                                customerDocument: selectedInvoice.customer_document,
                                                paymentMethod: selectedInvoice.payment_method || selectedInvoice.paymentMethod || (selectedInvoice.gateway_payment_id || selectedInvoice.payment_gateway_id ? 'credit_card' : null),
                                                installments: (selectedInvoice as any).installments || (selectedInvoice as any).mpInstallments || (selectedInvoice.form_data as any)?.mpInstallments || (selectedInvoice.form_data as any)?.installments || null,
                                                gatewayProvider: selectedInvoice.gateway_provider || 'Mercado Pago',
                                                gatewayPaymentId: selectedInvoice.gateway_payment_id || selectedInvoice.payment_gateway_id,
                                                gatewayStatus: selectedInvoice.gateway_status,
                                                paidAt: selectedInvoice.paid_at,
                                                billingStatus: selectedInvoice.status,
                                                createdAt: selectedInvoice.created_at,
                                                original: selectedInvoice
                                            });
                                            setIsAuditModalOpen(true);
                                        }}
                                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                                    >
                                        <ShieldCheck size={15} /> Auditoria Gateway
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2.5">
                                {/* Botão Abrir Mercado Pago */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const asaasUrl = 
                                            selectedInvoice.gateway_ticket_url || 
                                            selectedInvoice.ticket_url || 
                                            selectedInvoice.gateway_invoice_url || 
                                            selectedInvoice.invoice_url || 
                                            (invoiceInstallmentsList && invoiceInstallmentsList.find(i => i.gateway_ticket_url)?.gateway_ticket_url);

                                        if (asaasUrl) {
                                            window.open(asaasUrl, '_blank');
                                        } else {
                                            const checkoutUrl = `${window.location.origin}/#/checkout/invoice/${selectedInvoice.id}`;
                                            window.open(checkoutUrl, '_blank');
                                        }
                                    }}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm cursor-pointer"
                                >
                                    <ExternalLink size={15} /> 
                                    Ver Cobrança Asaas
                                </button>

                                {/* Botão Refaturar */}
                                {selectedInvoice.status !== 'PAID' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (can('financial', 'invoice')) {
                                                const itemsInInv = invoiceItems.filter(ii => ii.invoice_id === selectedInvoice.id);
                                                const ids = itemsInInv.map(ii => ii.reference_id);
                                                setSelectedIds(ids);
                                                setIsInvoiceDetailModalOpen(false);
                                                setIsInvoiceModalOpen(true);
                                            } else {
                                                showAlert("Acesso Negado: Você não tem permissão para faturar.", 'warning');
                                            }
                                        }}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm"
                                    >
                                        <DollarSign size={15} /> Refaturar
                                    </button>
                                )}

                                {/* Botão Imprimir Fatura PDF */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        flushSync(() => {
                                            setPrintItem({ ...selectedInvoice, type: 'INVOICE' });
                                            setIsPrintModalOpen(true);
                                        });
                                        setTimeout(() => executePrint(false), 100);
                                    }}
                                    className="px-4 py-2 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm"
                                >
                                    <Printer size={15} /> Imprimir Fatura (PDF)
                                </button>
                            </div>
                        </div>

                    </div>
                </div>,
                document.body
            )}

            {/* Modal Cancelar Fatura */}
            {cancelInvoiceModal.isOpen && cancelInvoiceModal.invoice && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Cancelar Fatura</h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    Deseja realmente cancelar a fatura <span className="font-bold">{cancelInvoiceModal.invoice.display_id}</span>?
                                </p>
                            </div>
                        </div>
                        
                        <div className="p-6 bg-slate-50 space-y-3 text-sm text-slate-700">
                            <p className="font-bold text-slate-800">Consequências desta ação:</p>
                            <ul className="space-y-2 list-disc pl-5">
                                <li>O status desta fatura será alterado para <span className="font-bold text-rose-600">CANCELADO</span>.</li>
                                <li>Se houver uma cobrança pendente no Mercado Pago (Link/Pix/Boleto), ela será ignorada pelo sistema local. (Opcionalmente, você pode cancelá-la manualmente no painel do MP).</li>
                                <li>As OS e Orçamentos que estavam vinculados a esta fatura voltarão a ficar <span className="font-bold text-amber-600">PENDENTES</span> e disponíveis para serem faturados novamente.</li>
                            </ul>
                        </div>
                        
                        <div className="p-5 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setCancelInvoiceModal({ isOpen: false, invoice: null })}
                                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                Voltar
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelInvoice}
                                disabled={isProcessing}
                                className="px-4 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-2"
                            >
                                {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                                Confirmar Cancelamento
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* NFS-e Detail Modal */}
            {nfseDetailModal.isOpen && nfseDetailModal.data && createPortal(
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setNfseDetailModal({ isOpen: false, invoiceId: null, data: null })}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-in-right"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-slate-800 px-6 py-5 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                                        <Receipt size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold">NFS-e</h3>
                                        <p className="text-xs text-slate-300">Fatura {nfseDetailModal.data.invoiceDisplayId || ''}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setNfseDetailModal({ isOpen: false, invoiceId: null, data: null })}
                                    className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors border border-transparent hover:border-white/20"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4">
                            {/* Status Badge */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-600">Status</span>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                                    nfseDetailModal.data.status === 'AUTHORIZED' 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                        : nfseDetailModal.data.status === 'ERROR' 
                                            ? 'bg-red-50 text-red-700 border border-red-200'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                    <span className={`w-2 h-2 rounded-full ${
                                        nfseDetailModal.data.status === 'AUTHORIZED' 
                                            ? 'bg-emerald-500' 
                                            : nfseDetailModal.data.status === 'ERROR' 
                                                ? 'bg-red-500' 
                                                : 'bg-amber-500 animate-pulse'
                                    }`} />
                                    {nfseDetailModal.data.status === 'AUTHORIZED' ? 'Autorizada' 
                                        : nfseDetailModal.data.status === 'SCHEDULED' ? 'Agendada'
                                        : nfseDetailModal.data.status === 'SYNCHRONIZED' ? 'Enviada à Prefeitura'
                                        : nfseDetailModal.data.status === 'ERROR' ? 'Erro'
                                        : nfseDetailModal.data.status || 'Desconhecido'}
                                </span>
                            </div>

                            {/* NFS-e Number */}
                            {nfseDetailModal.data.number && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-slate-600">Número da NF</span>
                                    <span className="text-sm font-bold text-slate-800">#{nfseDetailModal.data.number}</span>
                                </div>
                            )}

                            {/* Customer */}
                            {nfseDetailModal.data.customerName && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-slate-600">Cliente</span>
                                    <span className="text-sm text-slate-700 truncate max-w-[200px]">{nfseDetailModal.data.customerName}</span>
                                </div>
                            )}

                            {/* Error Message */}
                            {nfseDetailModal.data.status === 'ERROR' && nfseDetailModal.data.error_message && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                                    <p className="text-xs text-red-700 font-medium">
                                        <AlertTriangle size={12} className="inline mr-1" />
                                        {nfseDetailModal.data.error_message}
                                    </p>
                                </div>
                            )}

                            {/* PDF/XML Download Buttons */}
                            {nfseDetailModal.data.status === 'AUTHORIZED' && (
                                <div className="space-y-2 pt-2">
                                    {nfseDetailModal.data.pdfUrl && (
                                        <a
                                            href={nfseDetailModal.data.pdfUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-slate-200/50 hover:shadow-slate-300/50"
                                        >
                                            <FileText size={16} />
                                            Abrir PDF da NFS-e
                                            <ExternalLink size={12} />
                                        </a>
                                    )}

                                    {nfseDetailModal.data.xmlUrl && (
                                        <a
                                            href={nfseDetailModal.data.xmlUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all border border-slate-200"
                                        >
                                            <Download size={16} />
                                            Baixar XML da NFS-e
                                            <ExternalLink size={12} />
                                        </a>
                                    )}

                                    {!nfseDetailModal.data.pdfUrl && !nfseDetailModal.data.xmlUrl && (
                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                            <p className="text-xs text-amber-700 font-medium text-center">
                                                NFS-e autorizada mas PDF/XML ainda não disponíveis. Tente verificar o status novamente.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Verify Status Button (for non-authorized) */}
                            {nfseDetailModal.data.status !== 'AUTHORIZED' && (
                                <button
                                    onClick={async () => {
                                        if (!nfseDetailModal.invoiceId) return;
                                        setEmittingNfseId(nfseDetailModal.invoiceId);
                                        try {
                                            const res = await PaymentService.checkNfseStatus(nfseDetailModal.invoiceId, nfseDetailModal.data?.asaas_nfse_id);
                                            if (res.success && res.nfse) {
                                                const updated = { status: res.nfse.status, pdfUrl: res.nfse.pdfUrl, xmlUrl: res.nfse.xmlUrl, number: res.nfse.number, asaas_nfse_id: res.nfse.id };
                                                setNfseDataMap(prev => ({ ...prev, [nfseDetailModal.invoiceId!]: updated }));
                                                setNfseDetailModal(prev => ({ ...prev, data: { ...prev.data, ...updated } }));
                                                if (res.nfse.status === 'AUTHORIZED') {
                                                    showAlert(`✅ NFS-e #${res.nfse.number || ''} autorizada com sucesso!`, 'success');
                                                } else {
                                                    showAlert(`Status atualizado: ${res.nfse.status}`, 'info');
                                                }
                                            } else {
                                                showAlert(res.message || 'Erro ao verificar', 'error');
                                            }
                                        } catch (err: any) {
                                            showAlert(`Erro: ${err.message}`, 'error');
                                        } finally {
                                            setEmittingNfseId(null);
                                        }
                                    }}
                                    disabled={emittingNfseId === nfseDetailModal.invoiceId}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-sky-200 disabled:opacity-50"
                                >
                                    {emittingNfseId === nfseDetailModal.invoiceId ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <RefreshCw size={16} />
                                    )}
                                    Verificar Status na Prefeitura
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .animate-slide-in-right { animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @media print {
                    @page { size: A4 portrait !important; margin: 10mm; }
                    .print\\:hidden { visibility: hidden !important; display: none !important; }
                }
            `}</style>
                </>
            )}
        </div>
    );
};
