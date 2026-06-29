
import {
  AlertTriangle, ArrowUpDown,
  Ban,
  Box,
  CalendarPlus,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  DollarSign,
  Edit3,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  LayoutDashboard,
  Loader2,
  MapPin,
  MessageCircle,
  PackageSearch,
  Play,
  Plus,
  PlusCircle,
  Printer,
  Save,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  UserCheck,
  User as UserIcon,
  Video,
  X,
  Link2,
  Unlink,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  Paperclip,
  Image as ImageIcon,
  Copy
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePagedOrders } from '../../hooks/nexusHooks';
import { usePermissions } from '../../hooks/usePermissions';
import { useOrderExport } from '../../hooks/useOrderExport';
import { supabase } from '../../lib/supabase';
import { DataService } from '../../services/dataService';
import { EquipmentService } from '../../services/equipmentService';
import { FormService } from '../../services/formService';
import { VisitService } from '../../services/visitService';
import { StorageService } from '../../services/storageService';
import { type Customer, OrderStatus, type ServiceOrder, type ServiceVisit, type User, VisitStatusEnum, type Quote } from '../../types';
import { PublicOrderView } from '../public/PublicOrderView';
import { OrderTimeline } from '../shared/OrderTimeline';
import { Button } from '../ui/Button';
import { Pagination } from '../ui/Pagination';
import { StatusBadge } from '../ui/StatusBadge';
import { SearchableSelect } from '../common/SearchableSelect';
import { CreateOrderModal } from './CreateOrderModal';
import { VisitHistoryTab } from './VisitHistoryTab';
import { DisplacementTab } from './DisplacementTab';
import { VisitFormsTab } from './VisitFormsTab';
import * as turf from '@turf/turf';
import { useTenant } from '../../hooks/nexusHooks';
import { getRegions } from '../../services/regionService';
import type { Region } from '../../types/region';

// NOTA DE ARQUITETURA:
// orders NÃO vem mais via prop — este componente busca seus próprios dados
// via usePagedOrders (server-side pagination com .range() no Supabase).
// techs e customers ainda vêm via prop pois são dados de referência pequenos.
interface AdminDashboardProps {
  techs: User[];
  customers: Customer[];
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
  onUpdateOrders: () => Promise<void>;
  onEditOrder: (order: ServiceOrder) => Promise<void>;
  onCreateOrder: (order: Partial<ServiceOrder>) => Promise<any>;
}

const checkWarrantyStatus = (manufactureDate?: string, warrantyMonths?: number) => {
  if (!manufactureDate || !warrantyMonths) return null;
  const mDate = new Date(manufactureDate);
  const expiryDate = new Date(mDate);
  expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
  const now = new Date();
  return expiryDate >= now;
};

const isVideoUrl = (url: string | null) => {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv', '.3gp'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.toLowerCase().startsWith('data:video/');
};

const VisitCountCell = ({ order }: { order: ServiceOrder }) => {
  // Puxamos diretamente a contagem que veio nativamente do JOIN com o banco.
  // Sem chamadas N+1 (Padrão Enterprise)
  const count = order.visitCount !== undefined ? order.visitCount : (order.scheduledDate ? 1 : 0);
  
  return (
    <div className="flex justify-center text-[12px] text-slate-500 tracking-wide font-medium">
      {count === 0 ? '---' : count}
    </div>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  techs, customers, startDate, endDate, onDateChange, onUpdateOrders, onEditOrder, onCreateOrder
}) => {
    const { t } = useI18n();
  const { showAlert, showConfirm } = useDialog();
  const { canCreate, canEdit, canDelete } = usePermissions();


  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<ServiceOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [ordersToPrint, setOrdersToPrint] = useState<ServiceOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'internal_notes' | 'equipments' | 'forms' | 'execution' | 'media' | 'audit' | 'costs' | 'visits' | 'history'>('overview');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [orderVisits, setOrderVisits] = useState<any[]>([]);
  const [orderImpediments, setOrderImpediments] = useState<OrderImpediment[]>([]);

  // ── Edição Inline ──────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<ServiceOrder>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [newInternalNote, setNewInternalNote] = useState('');
  const [internalNoteAttachments, setInternalNoteAttachments] = useState<any[]>([]);
  const [isUploadingNote, setIsUploadingNote] = useState(false);

  // ── Aba Visitas ────────────────────────────────────────────────
  const [visits, setVisits] = useState<ServiceVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [showNewVisitForm, setShowNewVisitForm] = useState(false);
  const [newVisitDraft, setNewVisitDraft] = useState({ technicianId: '', scheduledDate: '', scheduledTime: '', notes: '' });
  const [savingVisit, setSavingVisit] = useState(false);

  // ── Aba Equipamentos (do catálogo, vinculados via campos da OS) ────
  const [osEquipments, setOsEquipments] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]); // ServiceOrderEquipment[] — keep compat
  const [allEquipmentsCatalog, setAllEquipmentsCatalog] = useState<any[]>([]);
  const [equipmentsLoading, setEquipmentsLoading] = useState(false);


  // ── Aba Formulários ──────────────────────────────────────────
  const [activationRules, setActivationRules] = useState<any[]>([]);
  const [formTemplatesAll, setFormTemplatesAll] = useState<any[]>([]);
  const [formsTabLoading, setFormsTabLoading] = useState(false);

  // ── Edição de Agendamento de Visita ────────────────────────────
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [visitScheduleDraft, setVisitScheduleDraft] = useState<{
    scheduledDate: string; scheduledTime: string; technicianId: string;
  }>({ scheduledDate: '', scheduledTime: '', technicianId: '' });
  const [savingSchedule, setSavingSchedule] = useState(false);
  // Sort: campo e direção — passados para o servidor
  const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // ── Estoque para Peças ─
  const [allStockItems, setAllStockItems] = useState<any[]>([]);
  const [isStockPickerOpen, setIsStockPickerOpen] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  // ── Orçamentos Vinculados ────────────────────────────────────────
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteSearch, setQuoteSearch] = useState('');

  // ── Server-Side Pagination ─────────────────────────────────────────
  const { session, isAuthLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateTypeFilter, setDateTypeFilter] = useState<'scheduled' | 'created' | 'completed'>('scheduled');
  // techFilter armazena o techId (UUID), não o nome — enviado direto para o servidor
  const [techFilter, setTechFilter] = useState<string>('ALL');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isTechDropdownOpen, setIsTechDropdownOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');

  // --- Geofencing State & Computation ---
  const { data: tenant } = useTenant();
  const isGeofencingEnabled = tenant?.metadata?.enableGeofencing === true;
  const [regions, setRegions] = useState<Region[]>([]);
  const [newVisitTechSearch, setNewVisitTechSearch] = useState('');
  const [editVisitTechSearch, setEditVisitTechSearch] = useState('');

  useEffect(() => {
    if (isGeofencingEnabled) {
      getRegions()
        .then(r => setRegions(r || []))
        .catch(err => console.error("Erro ao carregar regiões:", err));
    }
  }, [isGeofencingEnabled]);

  const allowedTechIds = useMemo(() => {
    if (!isGeofencingEnabled) return null; // Bypass filter se a configuração estiver desativada
    if (!selectedOrder) return null;
    
    // Encontrar o cliente da OS selecionada
    const client = customers.find(cust => cust.id === selectedOrder.customerId || cust.name === selectedOrder.customerName);
    if (!client || !client.latitude || !client.longitude) return null;

    const pt = turf.point([client.longitude, client.latitude]);
    
    // Verifica regiões ativas com polígono
    const activeRegions = regions.filter(r => r.is_active && r.polygon_geojson);
    const matchingRegions = activeRegions.filter(r => {
      try {
        return turf.booleanPointInPolygon(pt, r.polygon_geojson as any);
      } catch (e) {
        return false;
      }
    });

    if (matchingRegions.length === 0) return null; // Nenhuma região cobre, todos liberados

    // Se estiver em uma ou mais regiões, libera apenas técnicos associados a elas
    const techIds = new Set<string>();
    matchingRegions.forEach(r => {
      if (r.technician_ids) {
        r.technician_ids.forEach(id => techIds.add(id));
      }
    });

    return Array.from(techIds);
  }, [isGeofencingEnabled, selectedOrder, customers, regions]);


  // Filtros memorizados para evitar re-renders desnecessários
  const serverFilters = useMemo(() => ({
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    technicianId: techFilter !== 'ALL' ? techFilter : undefined,
    search: [
      searchTerm.trim() || undefined,
      customerFilter !== 'ALL' ? customerFilter : undefined
    ].filter(Boolean).join(' ') || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    dateType: dateTypeFilter,
  }), [statusFilter, techFilter, searchTerm, customerFilter, startDate, endDate, dateTypeFilter]);

  const { auth } = useAuth();
  
  const {
    data: pageResult,
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    refetch: ordersRefetch,
  } = usePagedOrders(currentPage, serverFilters, auth.isAuthenticated);

  const pagedOrders: ServiceOrder[] = pageResult?.data ?? [];
  const totalOrders = pageResult?.total ?? 0;
  const totalPages = pageResult?.lastPage ?? 1;

  const handleManualRefresh = async () => {
    setIsManualSyncing(true);
    try {
      await Promise.all([
        ordersRefetch(),
        onUpdateOrders && onUpdateOrders()
      ]);
      await new Promise(resolve => setTimeout(resolve, 600));
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
    } finally {
      setIsManualSyncing(false);
    }
  };


  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={12} className="ml-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />;
    return sortConfig.direction === 'asc'
      ? <ChevronUp size={14} className="ml-2 text-primary-600 animate-in fade-in zoom-in-50 duration-300" />
      : <ChevronDown size={14} className="ml-2 text-primary-600 animate-in fade-in zoom-in-50 duration-300" />;
  };

  // Hook de Exportação (Refatorado - Big Tech Standard)
  const { handleExportExcel: exportToExcel } = useOrderExport();

  const handleExportExcel = () => {
    if (selectedOrderIds.length === 0) return;

    // Exporta apenas os itens selecionados
    exportToExcel({
      orders: pagedOrders,
      filteredOrders: pagedOrders.filter(o => selectedOrderIds.includes(o.id)),
      selectedOrderIds,
      techs,
      customers
    });
  };

  const handleBatchPrint = async () => {
    let toPrint: ServiceOrder[] = [];
    if (selectedOrderIds.length > 0) {
      const local = pagedOrders.filter(o => selectedOrderIds.includes(o.id));
      if (local.length === selectedOrderIds.length) {
        toPrint = local;
      } else {
        try {
          const chunks = [];
          for (let i = 0; i < selectedOrderIds.length; i += 100) chunks.push(selectedOrderIds.slice(i, i + 100));
          let allFetched: ServiceOrder[] = [];
          const { OrderService } = await import('../../services/orderService');
          for (const chunk of chunks) {
            const { data } = await supabase.from('orders').select('*').in('id', chunk);
            if (data) {
              allFetched = [...allFetched, ...data.map((d: any) => OrderService._mapOrderFromDB(d))];
            }
          }
          if (allFetched.length > 0) {
            toPrint = allFetched;
          } else {
            toPrint = local;
          }
        } catch {
          toPrint = local;
        }
      }
    } else {
      toPrint = pagedOrders;
    }

    setOrdersToPrint(toPrint);
    setIsBatchPrinting(true);
    document.body.classList.add('is-printing');
    // Tempo maior para garantir renderização de imagens e componentes
    setTimeout(() => {
      window.print();
      // Em alguns browsers o print é non-blocking, então usamos listener para garantir
      const cleanup = () => {
        setIsBatchPrinting(false);
        setOrdersToPrint([]);
        document.body.classList.remove('is-printing');
        window.removeEventListener('afterprint', cleanup);
      };

      // Se for blocking (Chrome/Firefox), isso roda depois do dialog fechar
      // Se for non-blocking (Safari), precisamos do listener
      window.addEventListener('afterprint', cleanup);

      // Fallback para browsers que não disparam afterprint corretamente ou se user cancelar rápido
      setTimeout(cleanup, 5000);
    }, 1500);
  };

  const handlePrintOrder = (orderId: string) => {
    const orderToPrint = pagedOrders.find(o => o.id === orderId) || selectedOrder;
    if (!orderToPrint) return;

    const publicUrl = `${window.location.origin}/#/order/view/${orderToPrint.publicToken || orderToPrint.id}?print=true`;
    console.log('[AdminDashboard] Abrindo viewer público para impressão:', publicUrl);
    window.open(publicUrl, '_blank');
  };

  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  useEffect(() => {
    if (selectedOrder) {
      // Reset estados de edição ao abrir nova OS
      setIsEditing(false);
      setEditDraft({});
      setActiveTab('overview');
      setShowNewVisitForm(false);
      setEditingVisitId(null);
      setEquipments([]);

      // Busca o técnicos da OS via RPC secundário (não bloqueante)
      VisitService.getVisitsByOrderId(selectedOrder.id).then(v => {
        setOrderVisits(v);
      });

      // Busca histórico estruturado de impedimentos (Nova Tabela Master)
      supabase.from('order_impediments')
        .select('*')
        .eq('order_id', selectedOrder.id)
        .order('created_at', { ascending: true })
        .then(({ data }) => {
          if (data) setOrderImpediments(data);
        });

      // Busca Orçamentos para aba de vínculos
      DataService.getQuotes().then(q => setQuotes(q || []));

      // Busca o template para mapear IDs para Labels no checklist
      if (selectedOrder.formId) {
        import('../../services/formService').then(mod => {
          mod.FormService.getFormTemplates().then(templates => {
            const template = templates.find(t => t.id === selectedOrder.formId);
            setSelectedTemplate(template || null);
          });
        });
      } else {
        setSelectedTemplate(null);
      }
    } else {
      setOrderVisits([]);
      setSelectedTemplate(null);
      setIsEditing(false);
      setEditDraft({});
      setEditingVisitId(null);
      setEquipments([]);
    }
  }, [selectedOrder]);

  // Listener para abrir OS a partir de outros componentes (ex: aba de ativos)
  useEffect(() => {
    const handleOpenOrder = async (e: any) => {
      const orderId = e.detail?.orderId;
      if (!orderId) return;
      
      const localOrder = pagedOrders.find(o => o.id === orderId);
      if (localOrder) {
        setSelectedOrder(localOrder);
      } else {
        try {
          const { OrderService } = await import('../../services/orderService');
          const fetched = await OrderService.getPublicOrderById(orderId);
          if (fetched) setSelectedOrder(fetched);
        } catch (error) {
          console.error("Erro ao buscar detalhes da OS:", error);
        }
      }
    };
    window.addEventListener('NEXUS_OPEN_ORDER', handleOpenOrder);
    return () => window.removeEventListener('NEXUS_OPEN_ORDER', handleOpenOrder);
  }, [pagedOrders]);

  // Lazy load: quando abre aba equipamentos — service_order_equipments é fonte principal
  useEffect(() => {
    if (activeTab === 'equipments' && selectedOrder) {
      setEquipmentsLoading(true);
      Promise.all([
        VisitService.getOrderEquipments(selectedOrder.id),
        EquipmentService.getEquipments(),
      ]).then(([soeList, catalog]) => {
        setAllEquipmentsCatalog(catalog);
        // Fonte primária: service_order_equipments (suporta múltiplos)
        let list: any[] = soeList.map(s => {
          const found = catalog.find(c => c.serialNumber === s.equipmentSerial || c.model === s.equipmentModel);
          return { ...s, equipmentFamily: s.equipmentFamily || found?.familyName || '' };
        });

        // Fallback legacy: campos diretos da OS se tabela vazia
        if (list.length === 0 && selectedOrder.equipmentName) {
          const found = catalog.find(c => c.serialNumber === selectedOrder.equipmentSerial || c.model === selectedOrder.equipmentModel);
          list = [{
            id: selectedOrder.id + '_eq',
            orderId: selectedOrder.id,
            equipmentName: selectedOrder.equipmentName,
            equipmentModel: selectedOrder.equipmentModel,
            equipmentSerial: selectedOrder.equipmentSerial,
            equipmentFamily: found?.familyName || '',
            status: selectedOrder.status === 'CONCLUÍDO' ? 'COMPLETED' : 'PENDING',
            formData: selectedOrder.formData || {},
            formId: selectedOrder.formId,
            sortOrder: 0,
            createdAt: selectedOrder.createdAt,
          }];
        }
        setEquipments(list);
        setOsEquipments(list);
      }).finally(() => setEquipmentsLoading(false));
    }
  }, [activeTab, selectedOrder]);

  // Lazy load: aba formulários — busca regras, templates e equipamentos (caso não carregados)
  useEffect(() => {
    if (activeTab === 'forms' && selectedOrder) {
      setFormsTabLoading(true);
      Promise.all([
        FormService.getActivationRules(),
        FormService.getFormTemplates(),
        osEquipments.length === 0 ? VisitService.getOrderEquipments(selectedOrder.id) : Promise.resolve(osEquipments),
        osEquipments.length === 0 ? EquipmentService.getEquipments() : Promise.resolve([] as any[]),
      ]).then(([rules, templates, soeList, catalog]) => {
        setActivationRules(rules);
        setFormTemplatesAll(templates);
        // Enriquece equipamentos se ainda não estavam carregados
        if (osEquipments.length === 0) {
          let list: any[] = (soeList as any[]).map((s: any) => {
            const found = (catalog as any[]).find((c: any) => c.serialNumber === s.equipmentSerial || c.model === s.equipmentModel);
            return { ...s, equipmentFamily: s.equipmentFamily || found?.familyName || '' };
          });
          if (list.length === 0 && selectedOrder.equipmentName) {
            const found = (catalog as any[]).find((c: any) => c.serialNumber === selectedOrder.equipmentSerial || c.model === selectedOrder.equipmentModel);
            list = [{
              id: selectedOrder.id + '_eq',
              orderId: selectedOrder.id,
              equipmentName: selectedOrder.equipmentName,
              equipmentModel: selectedOrder.equipmentModel,
              equipmentSerial: selectedOrder.equipmentSerial,
              equipmentFamily: found?.familyName || '',
              status: 'PENDING',
              formData: selectedOrder.formData || {},
              formId: selectedOrder.formId,
              sortOrder: 0,
              createdAt: selectedOrder.createdAt,
            }];
          }
          setOsEquipments(list);
        }
      }).finally(() => setFormsTabLoading(false));
    }
  }, [activeTab, selectedOrder]);

  const handleUpdateItem = (id: string, field: string, value: any) => {
    setEditDraft(prev => {
      const items = [...(prev.items || selectedOrder?.items || [])];
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) {
        const updated = { ...items[idx], [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updated.total = Number(updated.quantity || 0) * Number(updated.unitPrice || 0);
        }
        items[idx] = updated;
      }
      return { ...prev, items };
    });
  };

  const handleAddItem = () => {
    setEditDraft(prev => ({
      ...prev,
      items: [...(prev.items || selectedOrder?.items || []), {
        id: 'new-' + Math.random().toString(36).substr(2, 9),
        description: '',
        quantity: 1,
        unitPrice: 0,
        total: 0,
        fromStock: false
      }]
    }));
  };

  const handleRemoveItem = (id: string) => {
    setEditDraft(prev => ({
      ...prev,
      items: (prev.items || selectedOrder?.items || []).filter(i => i.id !== id)
    }));
  };

  const fetchStockForPicker = async () => {
    setStockLoading(true);
    try {
      const items = await DataService.getStockItems();
      setAllStockItems(items);
    } catch (e) {
      console.error(e);
    } finally {
      setStockLoading(false);
    }
  };

  const handleAddStockItem = (item: any) => {
    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      description: item.description,
      quantity: 1,
      unitPrice: item.sellPrice || 0,
      total: item.sellPrice || 0,
      fromStock: true,
      stockItemId: item.id
    };

    setEditDraft(prev => ({
      ...prev,
      items: [...(prev.items || selectedOrder?.items || []), newItem]
    }));
    setIsStockPickerOpen(false);
  };

  const handleManualAdd = () => {
    setEditDraft(prev => ({
      ...prev,
      items: [...(prev.items || selectedOrder?.items || []), {
        id: Math.random().toString(36).substr(2, 9),
        description: '',
        quantity: 1,
        unitPrice: 0,
        total: 0,
        fromStock: false
      }]
    }));
    setIsStockPickerOpen(false);
  };

  // Refresh de visitas quando a aba é aberta
  useEffect(() => {
    if (activeTab === 'visits' && selectedOrder) {
      setVisitsLoading(true);
      VisitService.getVisitsByOrderId(selectedOrder.id)
        .then(v => {
          if (v.length === 0 && (selectedOrder.visitCount || 0) > 0 && selectedOrder.assignedTo) {
            // Fallback Dinâmico para OS Legadas usando o visitCount parseado
            const legacyVisits = Array.from({ length: selectedOrder.visitCount || 1 }).map((_, index) => {
              const isLast = index + 1 === (selectedOrder.visitCount || 1);
              const isPendingOS = ['PENDENTE', 'ATRIBUÍDO', 'EM ANDAMENTO'].includes(selectedOrder.status);
              
              let finalStatus = 'completed';
              if (isLast) {
                  if (selectedOrder.status === 'CONCLUÍDO' || selectedOrder.status === 'CANCELADO') finalStatus = 'completed';
                  else if (selectedOrder.status === 'IMPEDIDO') finalStatus = 'blocked';
                  else if (isPendingOS) finalStatus = 'pending';
              }

              return {
                id: `legacy-visit-${selectedOrder.id}-${index + 1}`,
                orderId: selectedOrder.id,
                visitNumber: index + 1,
                status: finalStatus,
                scheduledDate: selectedOrder.scheduledDate,
                scheduledTime: selectedOrder.scheduledTime,
                technicianId: selectedOrder.assignedTo,
                technicianName: techs.find(t => t.id === selectedOrder.assignedTo)?.name || selectedOrder.assignedTo || '—',
                createdAt: selectedOrder.createdAt,
                isLocked: !isPendingOS // Histórico legado concluído é travado, pendente fica livre
              } as any;
            });
            setVisits(legacyVisits);
          } else {
            setVisits(v);
          }
        })
        .finally(() => setVisitsLoading(false));
    }
  }, [activeTab, selectedOrder, techs]);

  const handleStartEdit = () => {
    if (!selectedOrder) return;
    // Pre-fetch stock if needed
    if (allStockItems.length === 0) fetchStockForPicker();

    // Buscar Service Types dinamicamente do banco para popular o select de Modalidade
    if (serviceTypes.length === 0) {
      DataService.getServiceTypes().then(st => setServiceTypes(st || []));
    }

    setEditDraft({
      title: selectedOrder.title,
      description: selectedOrder.description,
      customerName: selectedOrder.customerName,
      customerAddress: selectedOrder.customerAddress,
      scheduledDate: selectedOrder.scheduledDate,
      scheduledTime: selectedOrder.scheduledTime,
      notes: selectedOrder.notes,
      priority: selectedOrder.priority,
      operationType: selectedOrder.operationType,
      items: selectedOrder.items || [],
      showValueToClient: selectedOrder.showValueToClient ?? false,
      linkedQuotes: selectedOrder.linkedQuotes || [],
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    showConfirm('Você tem edições em andamento. Deseja DESCARTAR as alterações e sair do modo de edição?', () => {
      setIsEditing(false);
      setEditDraft({});
    }, 'Atenção', 'Descartar Alterações', true);
  };

  const handleCloseModal = () => {
    if (isEditing) {
      showConfirm('Você tem edições em andamento. Deseja DESCARTAR as alterações e fechar a OS?', () => {
        setSelectedOrder(null);
        setIsEditing(false);
        setEditDraft({});
      }, 'Atenção', 'Descartar e Fechar', true);
      return;
    }
    setSelectedOrder(null);
    setIsEditing(false);
    setEditDraft({});
  };

  const handleAddEquipment = async (eqId: string) => {
    const eq = allEquipmentsCatalog.find(e => e.id === eqId);
    if (!eq || !selectedOrder) return;

    setEquipmentsLoading(true);
    try {
      const newEq = await VisitService.addEquipmentToOrder({
        orderId: selectedOrder.id,
        equipmentId: eq.id,
        equipmentName: eq.model,
        equipmentModel: eq.model,
        equipmentSerial: eq.serialNumber,
        equipmentFamily: eq.familyName || '',
        formId: undefined
      });

      let newFormId = null;
      const rules = activationRules.length > 0 ? activationRules : await FormService.getActivationRules();
      const templates = formTemplatesAll.length > 0 ? formTemplatesAll : await FormService.getFormTemplates();
      const types = serviceTypes.length > 0 ? serviceTypes : await DataService.getServiceTypes();

      const matchedService = types.find((s: any) => s.name === selectedOrder.operationType);
      const serviceTypeId = matchedService?.id || selectedOrder.operationType;

      const rule = rules.find(r =>
        (r.serviceTypeId === serviceTypeId || r.service_type_id === serviceTypeId) &&
        (!r.equipmentFamily || r.equipmentFamily === 'Todos' || r.equipmentFamily === eq.familyName)
      );

      newFormId = rule?.formId || rule?.form_id || null;
      if (!newFormId) {
        const fallbackForm = templates.find((f: any) =>
          (f.title || '').toLowerCase().includes((selectedOrder.operationType || '').toLowerCase()) ||
          (f.serviceTypes || []).includes(selectedOrder.operationType || '')
        );
        newFormId = fallbackForm?.id || null;
      }

      if (newFormId) {
        await VisitService.updateEquipmentFormId(newEq.id, newFormId);
        newEq.formId = newFormId;
      }

      const newList = [...equipments, newEq];
      setEquipments(newList);
      setOsEquipments(newList);
      ordersRefetch();
    } catch (e: any) {
      showAlert("Erro ao vincular equipamento: " + e.message);
    } finally {
      setEquipmentsLoading(false);
    }
  };

  const handleRemoveEquipment = async (eqEntryId: string, isLast: boolean) => {
    if (isLast) {
      showAlert("Não é possível remover todos os ativos. Deixe ao menos um ativo ou cancele a OS.");
      return;
    }
    showConfirm("Tem certeza que deseja remover este equipamento desta OS? Formulários e checklists atrelados podem ser afetados.", async () => {
      setEquipmentsLoading(true);
      try {
        await VisitService.removeEquipmentFromOrder(eqEntryId);
        const newList = equipments.filter(e => e.id !== eqEntryId);
        setEquipments(newList);
        setOsEquipments(newList);
        ordersRefetch();
      } catch (e: any) {
        showAlert("Erro ao remover equipamento: " + e.message, 'error');
      } finally {
        setEquipmentsLoading(false);
      }
    }, "Remover Equipamento", "Remover", true);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrder) return;
    setEditLoading(true);
    try {
      const updated = { ...selectedOrder, ...editDraft } as ServiceOrder;

      // Se a modalidade (operationType) foi alterada, recalcular os templates dos equipamentos
      if (editDraft.operationType && editDraft.operationType !== selectedOrder.operationType) {
        try {
          const rules = activationRules.length > 0 ? activationRules : await FormService.getActivationRules();
          const templates = formTemplatesAll.length > 0 ? formTemplatesAll : await FormService.getFormTemplates();
          const types = serviceTypes.length > 0 ? serviceTypes : await DataService.getServiceTypes();

          const matchedService = types.find(s => s.name === updated.operationType);
          const serviceTypeId = matchedService?.id || updated.operationType;

          if (osEquipments.length > 0) {
            for (const eq of osEquipments) {
              const rule = rules.find(r =>
                (r.serviceTypeId === serviceTypeId || r.service_type_id === serviceTypeId) &&
                (!r.equipmentFamily || r.equipmentFamily === 'Todos' || r.equipmentFamily === eq.equipmentFamily)
              );

              let newFormId = rule?.formId || rule?.form_id || null;

              if (!newFormId) {
                const fallbackForm = templates.find(f =>
                  (f.title || '').toLowerCase().includes((updated.operationType || '').toLowerCase()) ||
                  (f.serviceTypes || []).includes(updated.operationType || '')
                );
                newFormId = fallbackForm?.id || null;
              }

              // Atualiza o formId da ordem (espelho do eq primário)
              if (osEquipments.indexOf(eq) === 0) {
                updated.formId = newFormId || undefined;
              }

              if (newFormId !== eq.formId) {
                // Atualiza o ID do form no equipamento no bando de dados (se for eq real)
                if (eq.id && typeof eq.id === 'string' && !eq.id.includes('_eq')) {
                  await VisitService.updateEquipmentFormId(eq.id, newFormId);
                }
              }
            }
          } else {
            // Caso não tenha equipment configurado na aba (OS muito antigas ou erro)
            const fallbackForm = templates.find(f =>
              (f.title || '').toLowerCase().includes((updated.operationType || '').toLowerCase()) ||
              (f.serviceTypes || []).includes(updated.operationType || '')
            );
            updated.formId = fallbackForm?.id || undefined;
          }
        } catch (error) {
          console.error('Erro ao re-vincular formulários na edição:', error);
        }
      }

      await onEditOrder(updated);

      // Re-fetch os equipamentos localmente para a UI atualizar as abas
      if (editDraft.operationType && editDraft.operationType !== selectedOrder.operationType) {
        const [soeList, catalog] = await Promise.all([
          VisitService.getOrderEquipments(updated.id),
          EquipmentService.getEquipments(),
        ]);
        const list = soeList.map((s: any) => {
          const found = catalog.find(c => c.serialNumber === s.equipmentSerial || c.model === s.equipmentModel);
          return { ...s, equipmentFamily: s.equipmentFamily || found?.familyName || '', formId: s.formId };
        });
        setOsEquipments(list);
        setEquipments(list);
      }

      setSelectedOrder(updated);
      setIsEditing(false);
      setEditDraft({});
      ordersRefetch();
    } catch (e: any) {
      showAlert(`Erro ao salvar: ${e.message}`);
    } finally {
      setEditLoading(false);
    }
  };

  const handleCreateVisit = async () => {
    if (!selectedOrder || !newVisitDraft.technicianId || !newVisitDraft.scheduledDate) {
      showAlert('Selecione o técnico e a data.');
      return;
    }
    if (isGeofencingEnabled && allowedTechIds !== null && newVisitDraft.technicianId) {
      if (!allowedTechIds.includes(newVisitDraft.technicianId)) {
        const techName = techs.find(t => t.id === newVisitDraft.technicianId)?.name || 'selecionado';
        showAlert(`O técnico ${techName} não atende a região demarcada do cliente. Selecione um técnico autorizado para esta área.`, 'error');
        return;
      }
    }
    if (!newVisitDraft.notes || !newVisitDraft.notes.trim()) {
      showAlert('O campo "Observações para o técnico" é obrigatório. Descreva o motivo ou instruções da visita.');
      return;
    }
    setSavingVisit(true);
    try {
      await VisitService.createNewVisit({
        orderId: selectedOrder.id,
        orderStatus: selectedOrder.status,
        technicianId: newVisitDraft.technicianId,
        scheduledDate: newVisitDraft.scheduledDate,
        scheduledTime: newVisitDraft.scheduledTime,
        notes: newVisitDraft.notes,
      });
      setShowNewVisitForm(false);
      setNewVisitDraft({ technicianId: '', scheduledDate: '', scheduledTime: '', notes: '' });

      // Refresh visitas e OS — createNewVisit já atualizou o DB corretamente.
      // NÃO chamamos onEditOrder aqui pois isso sobrescreveria form_data no banco
      // com um objeto vazio, destruindo o impediment_history que foi preservado.
      const updatedVisits = await VisitService.getVisitsByOrderId(selectedOrder.id);
      setVisits(updatedVisits);
      setOrderVisits(updatedVisits);

      // Atualiza o estado local da OS para refletir o estado real do banco
      // (status=ATRIBUÍDO, mantendo o form_data preservado intacto O Histórico de Impedimentos)
      const preservedHistory = Array.isArray(selectedOrder.formData?.impediment_history)
        ? selectedOrder.formData.impediment_history
        : [];

      const freshOrder: ServiceOrder = {
        ...selectedOrder,
        status: OrderStatus.ASSIGNED,
        scheduledDate: newVisitDraft.scheduledDate,
        scheduledTime: newVisitDraft.scheduledTime || selectedOrder.scheduledTime,
        assignedTo: newVisitDraft.technicianId || selectedOrder.assignedTo,
        signature: undefined,
        signatureName: undefined,
        signatureDoc: undefined,
        videoUrl: undefined,
      };
      setSelectedOrder(freshOrder);

      // Força recarregamento da query `orders` via usePagedOrders
      await ordersRefetch();
    } catch (e: any) {
      const msg = (e.message || '').startsWith('INVALID_') ? e.message.split(': ')[1] : e.message;
      showAlert(msg || 'Erro ao criar visita.');
    } finally {
      setSavingVisit(false);
    }
  };

  const handleSaveVisitSchedule = async (visit: ServiceVisit) => {
    if (!visitScheduleDraft.scheduledDate) {
      showAlert('Informe a data do agendamento.');
      return;
    }
    if (!selectedOrder) return;
    if (isGeofencingEnabled && allowedTechIds !== null && visitScheduleDraft.technicianId) {
      if (!allowedTechIds.includes(visitScheduleDraft.technicianId)) {
        const techName = techs.find(t => t.id === visitScheduleDraft.technicianId)?.name || 'selecionado';
        showAlert(`O técnico ${techName} não atende a região demarcada do cliente. Selecione um técnico autorizado para esta área.`, 'error');
        return;
      }
    }
    setSavingSchedule(true);
    try {
      // ─── 1. Atualiza a visita via RPC ──────────────────────────────
      const updatedVisit = await VisitService.updateVisitSchedule({
        visitId: visit.id,
        orderId: visit.orderId,
        scheduledDate: visitScheduleDraft.scheduledDate,
        scheduledTime: visitScheduleDraft.scheduledTime || undefined,
        technicianId: visitScheduleDraft.technicianId || undefined,
      });
      setVisits(prev => prev.map(v => v.id === updatedVisit.id ? updatedVisit : v));

      // ─── 2. Atualiza a OS via onEditOrder (CAMINHO COMPROVADO) ─────
      // Mesmo fluxo que handleSaveEdit usa para salvar datas na aba Dados Gerais
      const updatedOrder: ServiceOrder = {
        ...selectedOrder,
        scheduledDate: visitScheduleDraft.scheduledDate,
        scheduledTime: visitScheduleDraft.scheduledTime || selectedOrder.scheduledTime,
        assignedTo: visitScheduleDraft.technicianId || selectedOrder.assignedTo,
      };
      await onEditOrder(updatedOrder);

      // ─── 3. Atualiza UI local imediatamente ───────────────────────
      setSelectedOrder(updatedOrder);
      setEditingVisitId(null);
      ordersRefetch();
    } catch (e: any) {
      const msg = (e.message || '').replace(/^[A-Z_]+: /, '');
      showAlert(msg || 'Erro ao salvar reagendamento.');
    } finally {
      setSavingSchedule(false);
    }
  };


  /** Retorna true apenas para URLs remotas acessíveis pelo navegador (http/https).
   * URLs do tipo file:///data/user/... (Android local) são inválidas no contexto web. */
  const isRemoteUrl = (url?: string): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
  };

  const mapIdToLabel = (id: string): string => {
    const lowerId = id.toLowerCase();
    if (lowerId === 'blockphotourls' || lowerId === 'block_photo_urls' || lowerId === 'blockphotourl' || lowerId === 'block_photo_url' || lowerId === 'impediment_photos' || lowerId === 'impedimento_fotos') {
      return 'Anexos das OS impedidas';
    }
    if (!selectedTemplate) return id;
    const field = selectedTemplate.fields?.find((f: any) => f.id === id || f.label === id);
    return field ? field.label : id;
  };


  const handleOpenPublicView = (order: ServiceOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const publicUrl = `${window.location.origin}/#/order/view/${order.publicToken || order.id}`;
    console.log('[AdminDashboard] Abrindo viewer público:', publicUrl);
    window.open(publicUrl, '_blank');
  };

  const handleCopyPublicLink = (order: ServiceOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const publicUrl = `${window.location.origin}/#/order/view/${order.publicToken || order.id}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopiedOrderId(order.id);
      setTimeout(() => setCopiedOrderId(null), 2500);
    }).catch(err => {
      console.error('Falha ao copiar:', err);
      showAlert('Erro ao copiar o link.');
    });
  };

  const handleCancelOrder = async (order: ServiceOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (order.status === OrderStatus.CANCELED) return;
    showConfirm('Tem certeza que deseja cancelar esta Ordem de Serviço? Esta ação bloqueará edições futuras.', async () => {
      await onEditOrder({ ...order, status: OrderStatus.CANCELED });
    }, "Cancelar OS", "Confirmar Cancelamento", true);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '---';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  // Client-side sort da página atual (20 items — rápido e sem custo)
  const sortedPageOrders = useMemo(() => {
    if (!sortConfig.key) return pagedOrders;
    return [...pagedOrders].sort((a, b) => {
      let aValue: any = (a as any)[sortConfig.key!];
      let bValue: any = (b as any)[sortConfig.key!];

      if (sortConfig.key === 'assignedTo') {
        aValue = techs.find(t => t.id === a.assignedTo)?.name || '';
        bValue = techs.find(t => t.id === b.assignedTo)?.name || '';
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [pagedOrders, sortConfig, techs]);

  // Select-all: seleciona apenas os itens da página atual (padrão Big Tech)
  const toggleSelectAll = useCallback(() => {
    const pageIds = sortedPageOrders.map(o => o.id);
    const allSelected = pageIds.every(id => selectedOrderIds.includes(id));
    if (allSelected) {
      setSelectedOrderIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedOrderIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  }, [sortedPageOrders, selectedOrderIds]);

  const handleFastFilter = (type: 'today' | 'week' | 'month') => {
    const now = new Date();
    const getLocalISO = (date: Date) => {
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().split('T')[0];
    };
    const today = getLocalISO(now);
    if (type === 'today') onDateChange(today, today);
    else if (type === 'week') {
      const date = new Date(now); date.setDate(now.getDate() - 7);
      onDateChange(getLocalISO(date), today);
    } else if (type === 'month') {
      const date = new Date(now); date.setMonth(now.getMonth() - 1);
      onDateChange(getLocalISO(date), today);
    }
  };

  return (
    <div className="p-2 sm:p-4 animate-fade-in flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Search & Filter Toolbar */}
      <div className="relative z-30 mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        {/* Top Row: Search, Fast Filters, Toggle, Actions */}
        <div className="flex flex-col xl:flex-row flex-wrap items-stretch xl:items-center justify-between gap-3">
          
          {/* Left Side: Search */}
          <div className="relative flex-1 min-w-[240px] xl:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar OS..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
            />
          </div>

          {/* Right Side: Filters, Actions & New OS */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full xl:w-auto justify-end flex-1">
            
            {/* Fast Filters Group */}
            <div className="flex items-center gap-1 bg-white border border-[#1c2d4f]/10 p-1 rounded-xl shadow-sm overflow-x-auto custom-scrollbar shrink-0">
              {['today', 'week', 'month'].map((type) => (
                <button
                  key={type}
                  onClick={() => handleFastFilter(type as any)}
                  className="h-8 px-3 text-[10px] uppercase text-slate-500 hover:text-[#1c2d4f] rounded-lg hover:bg-slate-50 transition-all whitespace-nowrap"
                >
                  {type === 'today' ? 'Hoje' : type === 'week' ? '7 Dias' : '30 Dias'}
                </button>
              ))}
            </div>

            {/* Filter Actions */}
            <div className="flex items-center gap-1.5 shrink-0 mr-auto sm:mr-0">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border transition-all text-[10px] font-medium ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 shadow-sm'}`}
              >
                <Filter size={14} /> <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Avançado'}</span>
              </button>
              <button
                onClick={() => {
                  setSearchTerm(''); setStatusFilter('ALL'); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
                  onDateChange('', '');
                  setSelectedOrderIds([]);
                  setCurrentPage(1);
                }}
                className="flex items-center gap-1.5 px-3 h-10 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 shadow-sm transition-all text-[10px] bg-white"
                title="Limpar Todos os Filtros"
              >
                <X size={14} /> <span className="hidden sm:inline">Limpar</span>
              </button>
            </div>
            {/* Ações em Lote (Seleção) */}
            {selectedOrderIds.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 h-10 bg-slate-900 rounded-xl shadow-lg animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-center w-6 h-6 rounded bg-slate-800 text-white text-[10px] font-semibold">{selectedOrderIds.length}</div>
                <button onClick={handleExportExcel} className="p-1.5 text-white hover:text-emerald-400 transition-colors" title="Excel"><FileSpreadsheet size={16} /></button>
                <button onClick={handleBatchPrint} className="p-1.5 text-white hover:text-blue-400 transition-colors" title="PDF"><FileText size={16} /></button>
                <div className="w-px h-4 bg-slate-700 mx-0.5" />
                <button onClick={() => setSelectedOrderIds([])} className="p-1.5 text-white hover:text-rose-400 transition-colors" title="Limpar"><X size={16} /></button>
              </div>
            )}

            <button
              onClick={handleManualRefresh}
              disabled={ordersLoading || isManualSyncing}
              className={`group h-10 px-4 flex items-center gap-2 rounded-xl border transition-all duration-300 shadow-sm active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed ${
                ordersLoading || isManualSyncing 
                  ? 'bg-primary-50 border-primary-200 text-primary-600' 
                  : 'bg-white hover:bg-slate-50 border-[#1c2d4f]/20 text-[#1c2d4f] hover:text-primary-600 hover:border-primary-300 hover:shadow-md'
              }`}
              title="Atualizar todos os dados"
            >
              <div className="relative flex items-center justify-center">
                <RefreshCw 
                  size={16} 
                  className={`${ordersLoading || isManualSyncing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} 
                />
                {(ordersLoading || isManualSyncing) && (
                  <span className="absolute inset-0 rounded-full bg-primary-400/20 animate-ping"></span>
                )}
              </div>
            </button>
            <Button
              variant="primary"
              className={`h-10 px-4 gap-1.5 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl whitespace-nowrap ${!canCreate('orders') ? 'opacity-50 !cursor-not-allowed' : ''}`}
              onClick={(e) => {
                if (!canCreate('orders')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para criar ordens.'); return; }
                setOrderToEdit(null); setIsCreateModalOpen(true);
              }}
            >
              <Plus size={16} /> Nova OS
            </Button>
          </div>
        </div>

        {/* Collapsible Filters Row */}
        {showFilters && (
          <div className="relative z-20 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 p-3 bg-white/60 rounded-xl border border-[#1c2d4f]/10 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1 md:col-span-2 xl:col-span-6">
              <label className="text-xs font-medium text-slate-500 px-1">Período</label>
              <div className="flex items-center gap-1 bg-white border border-[#1c2d4f]/20 p-1 rounded-xl shadow-sm h-10 hover:border-[#1c2d4f]/40 transition-colors focus-within:ring-2 focus-within:ring-primary-500/20">
                <select
                  value={dateTypeFilter}
                  onChange={(e) => { setDateTypeFilter(e.target.value as 'scheduled' | 'created' | 'completed'); setCurrentPage(1); }}
                  className="bg-transparent text-xs text-slate-700 outline-none cursor-pointer border-r border-slate-100 pr-2 pl-2 hover:text-primary-600 transition-colors"
                >
                  <option value="scheduled">Agendamento</option>
                  <option value="created">Abertura</option>
                  <option value="completed">Conclusão</option>
                </select>
                <div className="flex items-center gap-1 px-1 flex-1 min-w-0 justify-between h-full">
                  <input type="date" value={startDate} onChange={e => { onDateChange(e.target.value, endDate); setCurrentPage(1); }} className="bg-transparent border-none text-[11px] text-slate-700 outline-none hover:text-primary-600 focus:text-primary-600 cursor-pointer flex-1 min-w-[90px] h-full [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 transition-opacity" />
                  <span className="text-[10px] text-slate-400 shrink-0">até</span>
                  <input type="date" value={endDate} onChange={e => { onDateChange(startDate, e.target.value); setCurrentPage(1); }} className="bg-transparent border-none text-[11px] text-slate-700 outline-none hover:text-primary-600 focus:text-primary-600 cursor-pointer flex-1 min-w-[90px] h-full [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 xl:col-span-2">
              <label className="text-xs font-medium text-slate-500 px-1">{t.common.status}</label>
              <div className="relative">
                <button 
                  onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsTechDropdownOpen(false); }}
                  onBlur={() => setTimeout(() => setIsStatusDropdownOpen(false), 200)}
                  className="flex items-center justify-between w-full bg-white border border-[#1c2d4f]/20 rounded-xl px-3 h-10 text-xs text-slate-700 hover:border-[#1c2d4f]/40 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-400" />
                    <span>{statusFilter === 'ALL' ? 'Todos Status' : statusFilter}</span>
                  </div>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {isStatusDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                    <button 
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${statusFilter === 'ALL' ? 'font-medium text-primary-600 bg-primary-50/50' : 'text-slate-600'}`}
                      onClick={() => { setStatusFilter('ALL'); setIsStatusDropdownOpen(false); setCurrentPage(1); }}
                    >
                      Todos Status
                    </button>
                    {Object.values(OrderStatus).map(s => (
                      <button 
                        key={s} 
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${statusFilter === s ? 'font-medium text-primary-600 bg-primary-50/50' : 'text-slate-600'}`}
                        onClick={() => { setStatusFilter(s); setIsStatusDropdownOpen(false); setCurrentPage(1); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1 xl:col-span-2">
              <label className="text-xs font-medium text-slate-500 px-1">Responsável</label>
              <div className="relative">
                <button 
                  onClick={() => { setIsTechDropdownOpen(!isTechDropdownOpen); setIsStatusDropdownOpen(false); }}
                  onBlur={() => setTimeout(() => setIsTechDropdownOpen(false), 200)}
                  className="flex items-center justify-between w-full bg-white border border-[#1c2d4f]/20 rounded-xl px-3 h-10 text-xs text-slate-700 hover:border-[#1c2d4f]/40 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <UserCheck size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{techFilter === 'ALL' ? 'Técnicos' : (techs.find(t => t.id === techFilter)?.name || 'Técnicos')}</span>
                  </div>
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                </button>
                {isTechDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                    <button 
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${techFilter === 'ALL' ? 'font-medium text-primary-600 bg-primary-50/50' : 'text-slate-600'}`}
                      onClick={() => { setTechFilter('ALL'); setIsTechDropdownOpen(false); setCurrentPage(1); }}
                    >
                      Técnicos
                    </button>
                    {techs.map(t => (
                      <button 
                        key={t.id} 
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${techFilter === t.id ? 'font-medium text-primary-600 bg-primary-50/50' : 'text-slate-600'}`}
                        onClick={() => { setTechFilter(t.id); setIsTechDropdownOpen(false); setCurrentPage(1); }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-end pb-0.5 xl:col-span-2">
              <button
                onClick={() => {
                  setSearchTerm(''); setStatusFilter('ALL'); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
                  onDateChange('', '');
                  setSelectedOrderIds([]);
                  setCurrentPage(1);
                }}
                className="h-10 w-full px-4 text-xs bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 rounded-xl transition-colors border border-rose-100 shadow-sm"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table Container - Premium Look */}
      <div className="relative bg-white border border-slate-300/80 rounded-xl shadow-lg shadow-slate-200/50 flex flex-col overflow-hidden flex-1 ring-1 ring-slate-200/80">
        {/* 🔄 Page Transition Overlay — Big Tech Standard */}
        {(ordersFetching || isManualSyncing) && !ordersLoading && pagedOrders.length > 0 && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex items-center justify-center transition-opacity duration-200 animate-fade-in">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 uppercase tracking-widest">atualizando...</p>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto custom-scrollbar os-table-container">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm font-poppins">
              <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center">
                <th className="px-3 py-2 w-12 text-center text-slate-400">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    checked={sortedPageOrders.length > 0 && sortedPageOrders.every(o => selectedOrderIds.includes(o.id))}
                    onChange={toggleSelectAll}
                    title="Selecionar página atual"
                  />
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('id')}>
                  <div className="flex items-center justify-center gap-1">Protocolo {getSortIcon('displayId')}</div>
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('operationType')}>
                  <div className="flex items-center justify-center gap-1">Modalidade {getSortIcon('operationType')}</div>
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('customerName')}>
                  <div className="flex items-center justify-center gap-1">Cliente {getSortIcon('customerName')}</div>
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('assignedTo')}>
                  <div className="flex items-center justify-center gap-1">Técnico {getSortIcon('assignedTo')}</div>
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('createdAt')}>
                  <div className="flex items-center justify-center gap-1">Abertura {getSortIcon('createdAt')}</div>
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('scheduledDate')}>
                  <div className="flex items-center justify-center gap-1">Agendamento {getSortIcon('scheduledDate')}</div>
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('endDate')}>
                  <div className="flex items-center justify-center gap-1">Conclusão {getSortIcon('endDate')}</div>
                </th>
                <th className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">Visitas</div>
                </th>
                <th className="px-3 py-2 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('status')}>
                  <div className="flex items-center justify-center gap-1">Status {getSortIcon('status')}</div>
                </th>
                <th className="px-3 py-2 text-center pr-4">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {ordersLoading ? (
                <tr>
                  <td colSpan={10} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <Loader2 size={28} className="animate-spin text-primary-400" />
                      <p className="text-sm text-slate-500 uppercase tracking-widest">Carregando ordens...</p>
                    </div>
                  </td>
                </tr>
              ) : sortedPageOrders.length > 0 ? sortedPageOrders.map(order => {
                const isSelected = selectedOrderIds.includes(order.id);
                const assignedTech = techs.find(t => t.id === order.assignedTo);
                return (
                  <tr
                    key={order.id}
                    className={`transition-all border-b border-slate-100 hover:border-slate-200 group cursor-pointer ${isSelected ? 'bg-indigo-50/40' : 'bg-white hover:bg-slate-50'}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-3 py-2 text-center shrink-0 w-12" onClick={(e) => { e.stopPropagation(); setSelectedOrderIds(prev => prev.includes(order.id) ? prev.filter(id => id !== order.id) : [...prev, order.id]); }}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                        checked={isSelected}
                        readOnly
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-700 text-[12px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 group-hover:bg-white group-hover:border-slate-300 transition-colors">
                        {order.displayId || order.id}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500 tracking-wide whitespace-nowrap">
                      {order.operationType || '---'}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-slate-800 tracking-tight truncate max-w-[160px]">
                      {order.customerName}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-center">
                        {assignedTech ? (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 border border-slate-200 group-hover:bg-white inset-shadow-lg shadow-slate-200/50 transition-all shrink-0">
                            <img src={assignedTech.avatar} className="w-4 h-4 rounded-full object-cover shadow-sm" />
                            <span className="text-[11px] text-slate-600 truncate max-w-[60px]">{assignedTech?.name?.split(' ')[0]}</span>
                          </div>
                        ) : <span className="text-[11px] text-slate-300 tracking-widest">-</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-slate-500 tracking-wide whitespace-nowrap">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '---'}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-slate-700 whitespace-nowrap">
                      {formatDateDisplay(order.scheduledDate)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-slate-700 whitespace-nowrap">
                      {order.endDate ? new Date(order.endDate).toLocaleDateString('pt-BR') : '---'}
                    </td>
                    <td className="px-3 py-2 align-middle"><VisitCountCell order={order} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={order.status} /></td>
                    <td className="px-3 py-2 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5 transition-opacity opacity-90 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(order);
                          }}
                          className="p-2 text-primary-600 bg-primary-50 hover:bg-primary-600 hover:text-white rounded-lg border border-primary-200 hover:border-primary-600 transition-all shadow-sm"
                          title="Visualizar OS"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={10} className="py-32 text-center bg-slate-50/30">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-lg shadow-slate-200/50">
                      <Search size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-500 uppercase tracking-widest">Nenhuma atividade localizada</p>
                    <p className="text-xs text-slate-400 mt-1">Ajuste os filtros para encontrar o que procura</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalOrders}
          itemsPerPage={PAGE_SIZE}
          onPageChange={(page) => {
            setCurrentPage(page);
            setTimeout(() => {
              const container = document.querySelector('.os-table-container');
              if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
              const scrollableRoot = document.querySelector('.overflow-y-auto.custom-scrollbar'); // Try generic main scrollable
              if (scrollableRoot) scrollableRoot.scrollTo({ top: 0, behavior: 'smooth' });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 50);
          }}
        />
      </div>

      {isCreateModalOpen && (
        <CreateOrderModal
          onClose={() => setIsCreateModalOpen(false)}
          initialData={orderToEdit || undefined}
          onSubmit={async (data) => {
            if (orderToEdit) {
              await onEditOrder({ ...orderToEdit, ...data } as ServiceOrder);
              return orderToEdit;
            } else {
              const created = await onCreateOrder(data);
              return created;
            }
          }}
        />
      )}

      {selectedOrder && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
          <div className="bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200">

            {/* HEADER */}
            <div className={`px-3 sm:px-6 py-3 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 transition-colors ${isEditing ? 'bg-blue-50' : 'bg-white'}`}>
              <div className="flex items-start sm:items-center gap-2 sm:gap-4 min-w-0 flex-1">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border transition-colors shrink-0 ${isEditing ? 'bg-blue-100 border-blue-200 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  {isEditing ? <Edit3 size={16} /> : <FileText size={18} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins truncate">OS #{selectedOrder.displayId || selectedOrder.id}</h2>
                    <StatusBadge status={selectedOrder.status} />
                    {isEditing && (
                      <span className="text-[9px] sm:text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full uppercase tracking-widest animate-pulse">
                        Editando
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                    {isEditing ? (editDraft.customerName || selectedOrder.customerName) : selectedOrder.customerName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Botões de salvamento — aparecem automaticamente se em modo de edição */}

                {isEditing && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={editLoading}
                      className="h-9 px-4 gap-2 text-slate-500"
                    >
                      <X size={14} /> Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={editLoading}
                      className="h-9 px-5 gap-2 bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-500/20"
                    >
                      {editLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Salvar
                    </Button>
                  </>
                )}

                {!isEditing && (
                  <>
                    {/* Botão de Edição Explícito */}
                    {selectedOrder.status !== OrderStatus.COMPLETED && selectedOrder.status !== OrderStatus.CANCELED && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          if (!canEdit('orders')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                          handleStartEdit();
                        }}
                        className={`h-9 px-2 sm:px-4 gap-1.5 !bg-slate-50 border-blue-200 text-blue-700 hover:!bg-blue-50 ${!canEdit('orders') ? 'opacity-50 !cursor-not-allowed' : ''}`}
                      >
                        <Edit3 size={14} /> <span className="hidden sm:inline">Editar OS</span>
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => handleOpenPublicView(selectedOrder, e)}
                      className="h-9 px-2 sm:px-4 gap-1.5 !bg-slate-50 border-primary-200 text-primary-700 hover:!bg-primary-50"
                    >
                      <Share2 size={14} /> <span className="hidden sm:inline">Visualizar</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => handleCopyPublicLink(selectedOrder, e)}
                      className={`h-9 px-2 sm:px-4 gap-1.5 transition-colors ${copiedOrderId === selectedOrder.id ? '!bg-emerald-50 border-emerald-300 text-emerald-700' : '!bg-slate-50 border-slate-300 text-slate-700 hover:!bg-slate-100'}`}
                    >
                      {copiedOrderId === selectedOrder.id ? <CheckCircle2 size={14} /> : <Copy size={14} />} 
                      <span className="hidden sm:inline">{copiedOrderId === selectedOrder.id ? 'Copiado!' : 'Copiar Link'}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        const customer = customers.find(c => c.name === selectedOrder.customerName);
                        if (customer?.whatsapp) {
                          const phone = customer.whatsapp.replace(/\D/g, '');
                          const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
                          window.open(`https://wa.me/${fullPhone}`, '_blank');
                        } else {
                          showAlert('WhatsApp do cliente não cadastrado no sistema.');
                        }
                      }}
                      className="h-9 px-2 sm:px-4 gap-1.5 !bg-slate-50 border-emerald-200 text-emerald-700 hover:!bg-emerald-50"
                    >
                      <MessageCircle size={14} /> <span className="hidden sm:inline">WhatsApp</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handlePrintOrder(selectedOrder.id)}
                      className="h-9 px-2 sm:px-4 gap-1.5 hidden sm:flex !bg-slate-50 border-slate-200 text-slate-700 hover:!bg-slate-100"
                    >
                      <Printer size={14} /> <span className="hidden md:inline">Gerar PDF</span>
                    </Button>
                    {selectedOrder.status !== OrderStatus.COMPLETED && selectedOrder.status !== OrderStatus.CANCELED && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          if (!canDelete('orders')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para excluir/cancelar.'); return; }
                          handleCancelOrder(selectedOrder, e);
                        }}
                        className={`h-9 px-2 sm:px-4 gap-1.5 !bg-slate-50 border-rose-200 text-rose-700 hover:!bg-rose-50 ${!canDelete('orders') ? 'opacity-50 !cursor-not-allowed' : ''}`}
                      >
                        <Ban size={14} /> <span className="hidden sm:inline">Cancelar OS</span>
                      </Button>
                    )}
                  </>
                )}
                <div className="h-6 w-px bg-slate-200 mx-0.5 sm:mx-2"></div>
                <button onClick={handleCloseModal} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* BODY CONTAINER */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              
              {/* DESKTOP SIDEBAR TABS */}
              <div className="hidden md:flex flex-col w-48 border-r border-slate-200 bg-slate-50/80 p-3 gap-1 overflow-y-auto custom-scrollbar shrink-0">
                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-2">Navegação</div>
                {[
                  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
                  { id: 'internal_notes', label: 'Obs Internas', icon: FileText },
                  { id: 'equipments', label: `Ativos${equipments.length > 0 ? ` (${equipments.length})` : ''}`, icon: Box },
                  { id: 'forms', label: 'Formulários', icon: ClipboardList },
                  { id: 'visits', label: `Visitas${visits.length > 0 ? ` (${visits.length})` : ''}`, icon: CalendarPlus },
                  { id: 'history', label: 'Histórico', icon: History },
                  { id: 'displacement', label: 'Deslocamento', icon: MapPin },
                  { id: 'media', label: 'Galeria', icon: Camera },
                  { id: 'costs', label: 'Custos', icon: DollarSign },
                  { id: 'vinculos', label: `Vínculos${(selectedOrder.linkedQuotes?.length || 0) > 0 ? ` (${selectedOrder.linkedQuotes?.length})` : ''}`, icon: Link2 },
                  { id: 'audit', label: 'Assinaturas', icon: ShieldCheck }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === 'forms' && (formTemplatesAll.length === 0 || osEquipments.length === 0)) {
                        setFormsTabLoading(true);
                      }
                      setActiveTab(tab.id as any);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all w-full text-left font-poppins
                      ${activeTab === tab.id 
                        ? 'bg-[#1c2d4f] text-white shadow-md ring-1 ring-[#1c2d4f]' 
                        : 'text-slate-500 hover:bg-white hover:text-[#1c2d4f] hover:shadow-sm'}`}
                  >
                    <tab.icon size={15} className={activeTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} /> 
                    <span className="flex-1 truncate">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* MOBILE TABS */}
              <div className="md:hidden border-b border-slate-200 bg-white p-3 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                {[
                  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
                  { id: 'internal_notes', label: 'Obs Internas', icon: FileText },
                  { id: 'equipments', label: `Ativos${equipments.length > 0 ? ` (${equipments.length})` : ''}`, icon: Box },
                  { id: 'forms', label: 'Formulários', icon: ClipboardList },
                  { id: 'visits', label: `Visitas${visits.length > 0 ? ` (${visits.length})` : ''}`, icon: CalendarPlus },
                  { id: 'history', label: 'Histórico', icon: History },
                  { id: 'displacement', label: 'Deslocamento', icon: MapPin },
                  { id: 'media', label: 'Galeria', icon: Camera },
                  { id: 'costs', label: 'Custos', icon: DollarSign },
                  { id: 'vinculos', label: `Vínculos${(selectedOrder.linkedQuotes?.length || 0) > 0 ? ` (${selectedOrder.linkedQuotes?.length})` : ''}`, icon: Link2 },
                  { id: 'audit', label: 'Assinaturas', icon: ShieldCheck }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === 'forms' && (formTemplatesAll.length === 0 || osEquipments.length === 0)) {
                        setFormsTabLoading(true);
                      }
                      setActiveTab(tab.id as any);
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap font-poppins
                      ${activeTab === tab.id 
                        ? 'bg-[#1c2d4f] text-white shadow-md' 
                        : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                  >
                    <tab.icon size={14} className={activeTab === tab.id ? 'text-white' : 'text-slate-400'} /> 
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* CONTENT AREA */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/50 custom-scrollbar">

              {/* TAB: VISÃO GERAL */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-12 gap-8">
                  {/* Left Column: Details */}
                  <div className="col-span-12 lg:col-span-8 space-y-6">
                    {/* Info Card Grid */}
                    <div className={`bg-white p-6 rounded-lg border shadow-sm transition-all ${isEditing ? 'border-blue-200 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                      <h3 className="text-sm font-medium text-slate-900 mb-6 flex items-center gap-2">
                        <UserIcon size={18} className="text-slate-400" /> Informações do Cliente
                        {isEditing && <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest ml-auto">🔒 Não editável</span>}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                        {(() => {
                          const c = customers.find(cust => cust.id === selectedOrder.customerId || cust.name === selectedOrder.customerName);
                          const doc = c?.document || selectedOrder.customerDoc;
                          const phone = c?.phone || c?.whatsapp || '';
                          const email = c?.email || '';
                          
                          let formattedDoc = doc || 'Não informado';
                          if (doc) {
                            const d = doc.replace(/\D/g, '');
                            if (d.length === 11) formattedDoc = d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                            else if (d.length === 14) formattedDoc = d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
                          }

                          let formattedPhone = phone || 'Não informado';
                          if (phone) {
                            const p = phone.replace(/\D/g, '');
                            if (p.length === 11) formattedPhone = p.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
                            else if (p.length === 10) formattedPhone = p.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
                          }
                          
                          let rawAddress = selectedOrder.customerAddress;
                          if (c && (c.street || c.city || c.neighborhood)) {
                            const p = [];
                            if (c.street) p.push(c.street);
                            if (c.number) p.push(c.number);
                            if (c.complement) p.push(`- ${c.complement}`);
                            if (c.neighborhood) p.push(`- ${c.neighborhood}`);
                            if (c.city) p.push(c.city);
                            if (c.state) p.push(c.state);
                            rawAddress = p.join(', ').replace(', -,', ' -').replace(', - ,', ' - ');
                          }
                          const cepDisplay = c?.zip ? `CEP: ${c.zip}` : '';

                          return (
                            <>
                              <div className="space-y-1.5 md:col-span-2">
                                <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Cliente / Razão Social</label>
                                {/* Cliente é estruturalmente fixo — não pode ser alterado daqui */}
                                <div className="text-sm font-semibold text-slate-900">{selectedOrder.customerName}</div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">CPF / CNPJ</label>
                                <div className="text-sm font-semibold text-slate-900">{formattedDoc}</div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Telefone / WhatsApp</label>
                                <div className="text-sm font-semibold text-slate-900">{formattedPhone}</div>
                              </div>
                              <div className="space-y-1.5 md:col-span-2">
                                <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">{t.common.email}</label>
                                <div className="text-sm font-semibold text-slate-900">{email || 'Não informado'}</div>
                              </div>
                              <div className="space-y-1.5 md:col-span-2">
                                <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Endereço de Atendimento / Principal</label>
                                {isEditing
                                  ? <input className="w-full border border-blue-200 bg-blue-50/50 rounded-md px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 transition-all" value={editDraft.customerAddress ?? ''} onChange={e => setEditDraft(d => ({ ...d, customerAddress: e.target.value }))} />
                                  : (
                                    <div className="text-sm text-slate-600 font-medium leading-relaxed">
                                      {rawAddress || 'Não informado'}
                                      {cepDisplay && <span className="block mt-0.5">{cepDisplay}</span>}
                                    </div>
                                  )
                                }
                              </div>
                            </>
                          );
                        })()}
                        
                        <div className="md:col-span-2 border-t border-slate-200/60 my-2"></div>
                        
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Título do Atendimento</label>
                          {isEditing ? (
                            <input className="w-full border border-blue-200 bg-blue-50/50 rounded-md px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 transition-all" value={editDraft.title ?? ''} onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))} />
                          ) : (
                            <div className="text-sm text-slate-900 font-medium leading-relaxed">{selectedOrder.title || 'Não informado'}</div>
                          )}
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Descrição Técnico-Operacional</label>
                          {isEditing ? (
                            <textarea rows={3} className="w-full border border-blue-200 bg-blue-50/50 rounded-md px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 transition-all resize-none" value={editDraft.description ?? ''} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} />
                          ) : (
                            <div className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">{selectedOrder.description || 'Não informado'}</div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Modalidade do Atendimento</label>
                          {isEditing
                            ? (
                              <select
                                className="w-full border border-blue-200 bg-blue-50/50 rounded-md px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 transition-all cursor-pointer"
                                value={editDraft.operationType || ''}
                                onChange={e => setEditDraft(d => ({ ...d, operationType: e.target.value }))}
                              >
                                {serviceTypes.length > 0 ? (
                                  serviceTypes.map(type => (
                                    <option key={type.id || type.name} value={type.name}>{type.name}</option>
                                  ))
                                ) : (
                                  <option value={selectedOrder.operationType}>{selectedOrder.operationType || 'Carregando opções...'}</option>
                                )}
                              </select>
                            )
                            : <div className="text-sm text-slate-600 font-medium leading-relaxed">{selectedOrder.operationType || 'Não informada'}</div>
                          }
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Prioridade</label>
                          {isEditing
                            ? (
                              <select
                                className="w-full border border-blue-200 bg-blue-50/50 rounded-md px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 transition-all cursor-pointer"
                                value={editDraft.priority || 'MÉDIA'}
                                onChange={e => setEditDraft(d => ({ ...d, priority: e.target.value as any }))}
                              >
                                <option value="BAIXA">Baixa</option>
                                <option value="MÉDIA">Média</option>
                                <option value="ALTA">Alta</option>
                                <option value="CRÍTICA">Crítica</option>
                              </select>
                            )
                            : (
                              <div className="text-[11px] font-medium uppercase tracking-wider leading-relaxed">
                                {selectedOrder.priority === 'CRÍTICA' ? <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded">🔴 Crítica</span> :
                                 selectedOrder.priority === 'ALTA' ? <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded">🟡 Alta</span> :
                                 selectedOrder.priority === 'BAIXA' ? <span className="text-slate-500 bg-slate-50 px-2 py-0.5 rounded">Baixa</span> :
                                 <span className="text-slate-600 bg-slate-50 px-2 py-0.5 rounded">Média</span>}
                              </div>
                            )
                          }
                        </div>
                      </div>
                    </div>

                    <div className={`bg-white p-6 rounded-lg border shadow-sm transition-all ${isEditing ? 'border-blue-200 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                      <h3 className="text-sm font-medium text-slate-900 mb-6 flex items-center gap-2">
                        <FileText size={18} className="text-slate-400" /> Relatório de Atendimento
                      </h3>
                      <div className="space-y-4">

                        <div className="space-y-2">
                          <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Notas Internas</label>
                          {isEditing
                            ? <textarea rows={3} className="w-full border border-blue-200 bg-blue-50/50 rounded-md px-3 py-2.5 text-sm text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-300 transition-all resize-none" placeholder="Notas opcionais..." value={editDraft.notes ?? ''} onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))} />
                            : selectedOrder.notes && (
                              <div className="p-4 bg-primary-50 border border-primary-100 rounded-md">
                                <label className="text-[11px] font-medium text-[#1c2d4f] uppercase tracking-wider flex items-center gap-2 mb-2">
                                  <ShieldCheck size={14} /> Notas de Encerramento
                                </label>
                                <p className="text-sm font-medium text-slate-700 leading-relaxed">{selectedOrder.notes}</p>
                              </div>
                            )
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Metadata */}
                  <div className="col-span-12 lg:col-span-4 space-y-6">
                    {/* Dates Card */}
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-lg shadow-slate-200/50">
                      <h3 className="text-xs font-medium text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2"><Clock size={16} className="text-slate-400" /> Cronograma</h3>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                          <span className="text-xs font-semibold text-slate-400">Abertura</span>
                          <span className="text-xs font-medium text-slate-700">{new Date(selectedOrder.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                          <span className="text-xs font-semibold text-slate-400">Agendamento</span>
                          <span className="text-xs font-medium text-[#1c2d4f]">{formatDateDisplay(selectedOrder.scheduledDate)} - {selectedOrder.scheduledTime || '--:--'}</span>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-md border border-emerald-100">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-medium text-emerald-600 uppercase">Execução</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] font-medium text-emerald-800">
                              <span>Check-in</span>
                              <span>{(() => {
                                const checkin = visits.find(v => v.arrivalTime)?.arrivalTime || selectedOrder.startDate;
                                return checkin ? new Date(checkin).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--/--';
                              })()}</span>
                            </div>
                            <div className="flex justify-between text-[11px] font-medium text-emerald-800">
                              <span>Conclusão</span>
                              <span>{(() => {
                                const checkout = selectedOrder.endDate || [...visits].reverse().find(v => v.departureTime)?.departureTime;
                                return checkout ? new Date(checkout).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--/--';
                              })()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tech Card */}
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-lg shadow-slate-200/50">
                      <h3 className="text-xs font-medium text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2"><UserCheck size={16} className="text-slate-400" /> Responsável</h3>
                      {(() => {
                        const tech = techs.find(t => t.id === selectedOrder.assignedTo);
                        return tech ? (
                          <div className="flex items-center gap-4">
                            <img src={tech.avatar} className="w-12 h-12 rounded-full border border-slate-100 object-cover" />
                            <div>
                              <div className="text-sm font-medium text-slate-900">{tech.name}</div>
                              <div className="text-xs font-medium text-slate-500">Técnico de Campo</div>
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-400 font-medium">Nenhum técnico atribuído</span>;
                      })()}
                    </div>

                    {/* Equipamentos agora exibidos na aba dedicada — removido daqui */}
                  </div>
                </div>
              )}

              {/* TAB: OBSERVAÇÕES INTERNAS */}
              {activeTab === 'internal_notes' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-medium text-slate-900 uppercase tracking-tight flex items-center gap-2 mb-4">
                      <FileText size={18} className="text-primary-500" /> Observações Internas
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium mb-6">
                      Estes registros são visíveis apenas para usuários administrativos do sistema e não aparecerão na impressão ou no link do cliente.
                    </p>

                    {isEditing ? (
                        <div className="space-y-4">
                          <textarea
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm font-medium text-slate-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-50 transition-all resize-y min-h-[120px]"
                            placeholder="Digite uma nova observação interna..."
                            value={newInternalNote}
                            onChange={(e) => setNewInternalNote(e.target.value)}
                            disabled={isUploadingNote}
                          />
                          
                          {internalNoteAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {internalNoteAttachments.map((file, i) => (
                                <div key={i} className="flex items-center gap-1.5 bg-[#1c2d4f]/10 text-[#1c2d4f] px-3 py-1.5 rounded-full text-xs font-semibold border border-[#1c2d4f]/20">
                                  {file.isUploading ? <Loader2 size={14} className="animate-spin text-primary-500" /> : (file.type === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />)}
                                  <span className="truncate max-w-[150px]">{file.name}</span>
                                  <button type="button" onClick={async () => {
                                      setInternalNoteAttachments(prev => prev.filter((_, idx) => idx !== i));
                                      if (file.url) {
                                          await StorageService.deleteFile(file.url);
                                      }
                                  }} className="hover:bg-[#1c2d4f]/20 rounded-full p-0.5 transition-colors text-rose-500 hover:text-rose-600">
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            <label className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#1c2d4f] transition-colors">
                              <input 
                                type="file" 
                                multiple
                                className="hidden"
                                accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={async (e) => {
                                  if (e.target.files) {
                                    const files = Array.from(e.target.files);
                                    const validFiles = files.filter(f => {
                                      if (f.size > 15 * 1024 * 1024) {
                                        alert(`O arquivo ${f.name} é muito grande (máx 15MB).`);
                                        return false;
                                      }
                                      if (!f.type.startsWith('image/') && !['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(f.type)) {
                                        alert(`Tipo de arquivo não permitido: ${f.name}`);
                                        return false;
                                      }
                                      return true;
                                    });
                                    
                                    const newPlaceholders = validFiles.map(f => ({ name: f.name, type: f.type.startsWith('image/') ? 'image' : 'document', size: f.size, isUploading: true, url: '' }));
                                    setInternalNoteAttachments(prev => [...prev, ...newPlaceholders]);
                                    
                                    for (let i = 0; i < validFiles.length; i++) {
                                        const file = validFiles[i];
                                        const placeholder = newPlaceholders[i];
                                        try {
                                            const att = await StorageService.uploadInternalNoteAttachment(file, selectedOrder.id);
                                            setInternalNoteAttachments(prev => prev.map(p => p.name === placeholder.name && p.isUploading ? { ...att, isUploading: false } : p));
                                        } catch (err) {
                                            console.error("Falha ao enviar:", err);
                                            setInternalNoteAttachments(prev => prev.filter(p => p !== placeholder));
                                        }
                                    }
                                  }
                                  e.target.value = '';
                                }}
                              />
                              <Paperclip size={18} />
                              Anexar Arquivos
                            </label>

                            <button
                              type="button"
                              disabled={(!newInternalNote.trim() && internalNoteAttachments.length === 0) || internalNoteAttachments.some(a => a.isUploading)}
                              onClick={() => {
                                if (!newInternalNote.trim() && internalNoteAttachments.length === 0) return;
                                const newNoteObj = {
                                  text: newInternalNote.trim(),
                                  user: auth?.user?.name || auth?.user?.email || 'Usuário',
                                  date: new Date().toISOString(),
                                  attachments: internalNoteAttachments.map(({ url, name, type, size }) => ({ url, name, type, size }))
                                };
                                setEditDraft(prev => ({
                                  ...prev,
                                  internalNotes: [...(prev.internalNotes || selectedOrder.internalNotes || []), newNoteObj]
                                }));
                                setNewInternalNote('');
                                setInternalNoteAttachments([]);
                              }}
                              className="bg-[#1c2d4f] text-white px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-widest hover:bg-[#2a457a] disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                              Adicionar Observação
                            </button>
                          </div>
                        </div>
                    ) : (
                      <div className="bg-slate-50 rounded-lg p-4 text-center border border-slate-200">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Ative a edição para adicionar uma nova observação</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {(() => {
                      const notesList = isEditing 
                        ? (editDraft.internalNotes || selectedOrder.internalNotes || [])
                        : (selectedOrder.internalNotes || []);
                      
                      if (notesList.length === 0) {
                        return (
                          <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-200">
                            <FileText size={32} className="mx-auto text-slate-200 mb-3" />
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Nenhuma observação registrada</p>
                          </div>
                        );
                      }

                      return [...notesList].reverse().map((note, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm relative group">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium text-xs uppercase">
                                {note.user.slice(0, 2)}
                              </div>
                              <div>
                                <p className="text-xs font-medium text-slate-900">{note.user}</p>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                  {new Date(note.date).toLocaleString('pt-BR')}
                                </p>
                              </div>
                            </div>
                            {isEditing && (
                              <button
                                onClick={() => {
                                  // Reverse logic to delete
                                  const originalIdx = notesList.length - 1 - idx;
                                  const noteToDelete = notesList[originalIdx];
                                  
                                  const doDelete = () => {
                                      const updatedNotes = [...notesList];
                                      updatedNotes.splice(originalIdx, 1);
                                      setEditDraft(prev => ({
                                        ...prev,
                                        internalNotes: updatedNotes
                                      }));
                                  };
                                  
                                  if (noteToDelete.attachments && noteToDelete.attachments.length > 0) {
                                      showConfirm('Tem certeza que deseja excluir esta observação e seus anexos?', async () => {
                                          for (const att of noteToDelete.attachments) {
                                              await StorageService.deleteFile(att.url);
                                          }
                                          doDelete();
                                      });
                                  } else {
                                      doDelete();
                                  }
                                }}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all opacity-0 group-hover:opacity-100"
                                title="Excluir observação"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <div className="pl-10">
                            <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{note.text}</p>
                            {note.attachments && note.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {note.attachments.map((att: any, idx: number) => (
                                  <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-[11px] font-semibold hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 shadow-sm transition-all group">
                                    {att.type === 'image' ? <ImageIcon size={14} className="text-primary-500 group-hover:scale-110 transition-transform" /> : <FileText size={14} className="text-rose-500 group-hover:scale-110 transition-transform" />}
                                    <span className="truncate max-w-[200px]">{att.name}</span>
                                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* TAB: EQUIPAMENTOS VINCULADOS */}
              {activeTab === 'equipments' && (() => {
                // Fonte: campos da OS + catálogo de equipamentos
                const eqList = equipments;
                const hasAny = eqList.length > 0;

                return (
                  <div className="max-w-4xl mx-auto space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-medium text-slate-900">
                          {equipmentsLoading
                            ? 'Carregando...'
                            : hasAny
                              ? `${eqList.length} equipamento${eqList.length !== 1 ? 's' : ''} vinculado${eqList.length !== 1 ? 's' : ''}`
                              : 'Nenhum equipamento vinculado'}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Ativos associados a esta OS</p>
                      </div>

                      {isEditing && (
                        <div className="flex gap-2">
                          <select
                            className="text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-2 outline-none max-w-[280px] shadow-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-300 transition-all cursor-pointer"
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddEquipment(e.target.value);
                                e.target.value = '';
                              }
                            }}
                          >
                            <option value="">+ Adicionar Equipamento</option>
                            {allEquipmentsCatalog
                              .filter((e: any) => e.customerId === customers.find(c => c.name === selectedOrder.customerName)?.id && !eqList.some((osEq: any) => osEq.equipmentId === e.id))
                              .map((e: any) => (
                                <option key={e.id} value={e.id}>{e.model} ({e.serialNumber || 'Sem Série'})</option>
                              ))
                            }
                          </select>
                        </div>
                      )}
                    </div>

                    {equipmentsLoading ? (
                      <div className="flex items-center justify-center py-16 gap-3">
                        <Loader2 size={22} className="animate-spin text-primary-400" />
                        <span className="text-xs font-medium uppercase tracking-widest text-slate-400">Buscando equipamentos...</span>
                      </div>
                    ) : !hasAny ? (
                      <div className="bg-white border border-dashed border-slate-200 rounded-xl py-16 text-center">
                        <Box size={40} className="mx-auto text-slate-200 mb-4" />
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Nenhum equipamento cadastrado nesta OS</p>
                        <p className="text-[11px] text-slate-300 font-medium mt-1">O equipamento é vinculado durante a criação da OS</p>
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg shadow-slate-200/50">
                        <div className="overflow-x-auto custom-scrollbar">
                          <table className="w-full text-left border-collapse whitespace-nowrap">
                            <thead className="bg-[#f8fafc] text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-200">
                              <tr>
                                <th className="px-5 py-3 font-semibold text-center">Ativo / Equipamento</th>
                                <th className="px-5 py-3 font-semibold">Família</th>
                                <th className="px-5 py-3 font-semibold">Série / Patrimônio</th>
                                <th className="px-5 py-3 font-semibold text-center">Garantia</th>
                                <th className="px-5 py-3 font-semibold text-center">Formulário</th>
                                <th className="px-5 py-3 font-semibold text-center">{t.common.status}</th>
                                {isEditing && <th className="px-5 py-3 font-semibold text-center">{t.common.actions}</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                              {eqList.map((eq: any, idx: number) => {
                                const eqPrefix = `[${eq.equipmentModel || eq.equipmentName || 'Equipamento'}`;
                                const hasFormData = Object.keys(selectedOrder.formData || {}).some(k => k.startsWith(eqPrefix)) || !!(eq.formData && Object.keys(eq.formData).length > 0);
                                const isActive = selectedOrder.status !== 'CONCLUÍDO' && selectedOrder.status !== 'CANCELADO';
                                
                                return (
                                  <tr key={eq.id || idx} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-5 py-3.5">
                                      <div className="flex items-center justify-center gap-3">
                                        <div className="w-8 h-8 bg-primary-50 border border-primary-100 rounded-md flex items-center justify-center shrink-0">
                                          <Box size={14} className="text-primary-500" />
                                        </div>
                                        <div className="text-left min-w-[120px]">
                                          <p className="text-xs font-medium text-slate-900 truncate max-w-[200px]">{eq.equipmentName}</p>
                                          {eq.equipmentModel && eq.equipmentModel !== eq.equipmentName && (
                                            <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">{eq.equipmentModel}</p>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                      <span className="text-xs font-semibold text-slate-600">{eq.equipmentFamily || '—'}</span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                      <span className="text-xs font-medium text-slate-700 font-mono">{eq.equipmentSerial && eq.equipmentSerial !== '-' ? eq.equipmentSerial : '—'}</span>
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                      {(() => {
                                        const fullEq = allEquipmentsCatalog.find((e: any) => e.id === eq.equipmentId) || eq;
                                        if (fullEq.manufactureDate && fullEq.warrantyMonths) {
                                          const isWarranty = checkWarrantyStatus(fullEq.manufactureDate, fullEq.warrantyMonths);
                                          return (
                                            <span className={`inline-flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-md border ${isWarranty ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                                              {isWarranty ? 'Em Garantia' : 'Fora de Garantia'}
                                            </span>
                                          );
                                        }
                                        return (
                                          <span className="inline-flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-md border bg-slate-50 text-slate-400 border-slate-200">
                                            Sem Info.
                                          </span>
                                        );
                                      })()}
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                      <span className={`inline-flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-md border ${hasFormData ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-500 border-amber-100'}`}>
                                        {hasFormData ? '✓ Sim' : '○ Pendente'}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                      <span className={`inline-flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-md border ${isActive ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                        {isActive ? 'Ativo' : 'Concluído'}
                                      </span>
                                    </td>
                                    {isEditing && (
                                      <td className="px-5 py-3.5 text-center">
                                        <button
                                          onClick={() => handleRemoveEquipment(eq.id, eqList.length <= 1)}
                                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                                          title="Remover ativo da OS"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* TAB: FORMULÁRIOS — 1 container por visita (cronológico) */}
              {activeTab === 'forms' && (
                <VisitFormsTab
                  orderVisits={orderVisits}
                  selectedOrder={selectedOrder}
                  techs={techs}
                  formsTabLoading={formsTabLoading}
                  formTemplatesAll={formTemplatesAll}
                  onImageClick={setFullscreenImage}
                />
              )}

              {/* TAB: EXECUÇÃO (CHECKLIST) — mantido para backward compat */}
              {activeTab === 'execution' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  {/* Alertas de impedimento — Fonte: impediment_history (append-only) + legado */}
                  {(() => {
                    const seenKeys = new Set<string>();
                    const impediments: { title: string; reason: string; photo?: string; date?: string; signature?: string; responsible?: string }[] = [];

                    const addEntry = (title: string, entry: { reason?: string; photoUrl?: string; blockedAt?: string; signature?: string; responsible?: string }) => {
                      const key = entry.blockedAt || (title + (entry.reason || ''));
                      if (seenKeys.has(key)) return;
                      seenKeys.add(key);
                      impediments.push({ title, reason: entry.reason || 'Sem motivo.', photo: entry.photoUrl, date: entry.blockedAt, signature: entry.signature, responsible: entry.responsible });
                    };

                    [...orderVisits].sort((a, b) => a.visitNumber - b.visitNumber).forEach(v => {
                      const vFd: any = v.formData || {};
                      if (Array.isArray(vFd.impediment_history) && vFd.impediment_history.length > 0) {
                        vFd.impediment_history.forEach((entry: any) =>
                          addEntry(`Impedimento — Visita nº ${v.visitNumber}`, entry)
                        );
                      } else {
                        const reason = v.impedimentReason || v.pauseReason || vFd.blockReason || vFd.impediment_reason;
                        if (reason) addEntry(`Impedimento — Visita nº ${v.visitNumber}`, { reason, photoUrl: vFd.blockPhotoUrl, blockedAt: vFd.blockedAt, signature: vFd.impediment_signature, responsible: vFd.impediment_responsible });
                      }
                    });

                    // OS atual — SEMPRE lida
                    const osFd: any = selectedOrder.formData || {};
                    if (Array.isArray(osFd.impediment_history) && osFd.impediment_history.length > 0) {
                      osFd.impediment_history.forEach((entry: any) =>
                        addEntry('Impedimento (Atual)', entry)
                      );
                    } else if (osFd.blockReason || selectedOrder.status === 'IMPEDIDO') {
                      addEntry('Impedimento (Atual)', {
                        reason: osFd.blockReason || osFd.impediment_reason || selectedOrder.notes?.replace('IMPEDIMENTO: ', '') || 'Motivo não detalhado.',
                        photoUrl: osFd.blockPhotoUrl,
                        blockedAt: osFd.blockedAt,
                        signature: osFd.impediment_signature,
                        responsible: osFd.impediment_responsible
                      });
                    }

                    if (impediments.length === 0) return null;

                    return (
                      <div className="space-y-4 mb-6">
                        {impediments.map((imp, idx) => (
                          <div key={idx} className="bg-rose-50 border border-rose-100 rounded-lg p-5 flex items-start gap-4 shadow-sm">
                            <div className="w-10 h-10 bg-white rounded-md flex items-center justify-center border border-rose-200 text-rose-600 shrink-0"><AlertTriangle size={20} /></div>
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-rose-900">{imp.title}</h4>
                              {imp.date && <p className="text-[10px] text-rose-400 font-semibold mb-1">{new Date(imp.date).toLocaleString('pt-BR')}</p>}
                              <p className="text-xs text-rose-700 font-medium leading-relaxed">{imp.reason}</p>
                              {imp.photo && (
                                isRemoteUrl(imp.photo) ? (
                                  <a href={imp.photo} target="_blank" rel="noreferrer" className="mt-3 block">
                                    <img src={imp.photo} alt="Foto impedimento" className="w-full max-w-xs rounded-lg border border-rose-200 object-cover cursor-zoom-in hover:opacity-90 transition-all" style={{ maxHeight: 200 }} />
                                    <span className="text-[10px] text-rose-500 font-medium uppercase tracking-widest mt-1 block">Foto do Impedimento (clique para ampliar)</span>
                                  </a>
                                ) : (
                                  <div className="mt-3 flex items-center gap-2 p-2.5 bg-rose-100/60 border border-rose-200 rounded-lg">
                                    <span className="text-rose-400" style={{fontSize:16}}>&#128247;</span>
                                    <span className="text-[10px] text-rose-500 font-medium">Foto registrada pelo técnico (disponível apenas no app mobile)</span>
                                  </div>
                                )
                              )}
                              {(imp.signature || imp.responsible) && (
                                <div className="mt-4 pt-4 border-t border-rose-200/50">
                                  <p className="text-[10px] text-rose-500 font-medium uppercase tracking-widest mb-2">Assinatura do Autorizador:</p>
                                  {imp.signature && (
                                    <div className="bg-white p-2 rounded-lg border border-rose-200 inline-block">
                                      <img src={imp.signature} alt="Assinatura" className="h-20 object-contain mix-blend-multiply" />
                                    </div>
                                  )}
                                  {imp.responsible && (
                                    <p className="text-xs font-medium text-rose-900 mt-2">Responsável: {imp.responsible}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Agrupar e Renderizar os Checklists de Todas as Visitas */}
                  {(() => {
                    const validVisits = orderVisits
                      .filter(v => ['completed', 'paused', 'blocked'].includes(v.status) && v.formData && Object.keys(v.formData).length > 0)
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                    const osFormData = selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0 ? selectedOrder.formData : null;

                    if (validVisits.length === 0 && !osFormData) {
                      return (
                        <div className="p-20 text-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-6">
                          <ClipboardList className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Aguardando preenchimento do checklist</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-6">
                        {/* 1. VISITAS REGISTRADAS */}
                        {validVisits.map((visit, index) => {
                          const vFormData = visit.formData || {};
                          return (
                            <div key={visit.id || index} className="bg-white border border-slate-200 rounded-lg shadow-lg shadow-slate-200/50 overflow-hidden">
                              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                                <div>
                                  <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider">
                                    Visita concluída em {new Date(visit.updatedAt || visit.createdAt).toLocaleString()}
                                  </h3>
                                  <p className="text-[10px] text-slate-500 font-medium">Status da Visita: {visit.status}</p>
                                </div>
                                <span className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-medium text-slate-500 rounded uppercase">
                                  {Object.keys(vFormData).length} Itens
                                </span>
                              </div>
                              <div className="divide-y divide-slate-50">
                                {Object.entries(vFormData).filter(([key, val]) => {
                                  if (Array.isArray(val)) return false;
                                  if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) return false;
                                  if (key.includes('Assinatura') || key.includes('impediment')) return false;
                                  if (['signature', 'signatureName', 'signatureDoc', 'finishedAt'].includes(key)) return false;
                                  return true;
                                }).map(([key, val]) => (
                                  <div key={key} className="px-6 py-4 flex justify-between gap-6 hover:bg-slate-50/50 transition-colors items-center">
                                    <div className="text-[13px] font-medium text-slate-600">{mapIdToLabel(key)}</div>
                                    <div className={`text-[11px] font-medium uppercase px-2.5 py-1 rounded-md border min-w-[60px] text-center ${String(val).toLowerCase() === 'ok' || String(val).toLowerCase() === 'sim' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                      {String(val)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. DADOS DO FORMULÁRIO MASTER (SE NÃO ESTIVEREM NAS VISITAS) */}
                        {osFormData && (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-lg shadow-slate-200/50 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                              <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider">Dados Globais do Formulário (OS)</h3>
                              <span className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-medium text-slate-500 rounded uppercase">
                                {Object.keys(osFormData).length} Itens
                              </span>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {Object.entries(osFormData).filter(([key, val]) => {
                                if (Array.isArray(val)) return false;
                                if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) return false;
                                if (key.includes('Assinatura') || key.includes('impediment')) return false;
                                if (['signature', 'signatureName', 'signatureDoc', 'finishedAt', 'technical_report', 'parts_used'].includes(key)) return false;
                                return true;
                              }).map(([key, val]) => (
                                <div key={key} className="px-6 py-4 flex justify-between gap-6 hover:bg-slate-50/50 transition-colors items-center">
                                  <div className="text-[13px] font-medium text-slate-600">{mapIdToLabel(key)}</div>
                                  <div className={`text-[11px] font-medium uppercase px-2.5 py-1 rounded-md border min-w-[60px] text-center ${String(val).toLowerCase() === 'ok' || String(val).toLowerCase() === 'sim' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                    {String(val)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB: MÍDIAS */}
              {activeTab === 'media' && (
                <div className="space-y-8">

                  {/* Combina fotos e vídeos da OS e das visitas concluídas/pausadas */}
                  {(() => {
                    const allForms: any[] = [];
                    if (selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0) {
                      allForms.push(selectedOrder.formData);
                    }
                    orderVisits.filter(v => ['completed', 'paused', 'blocked'].includes(v.status) && v.formData).forEach(v => allForms.push(v.formData));

                    const rawMedia: { key: string, url: string, type: 'image' | 'video' }[] = [];

                    // Incluir o vídeo principal da OS se não estiver no form_data
                    if (selectedOrder.videoUrl) {
                      rawMedia.push({ key: 'Vídeo da OS', url: selectedOrder.videoUrl, type: 'video' });
                    }

                    allForms.forEach(form => {
                      Object.entries(form).forEach(([key, val]) => {
                        if (Array.isArray(val)) {
                          val.forEach(url => {
                            if (typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:image') || url.startsWith('data:video'))) {
                              rawMedia.push({ key, url, type: isVideoUrl(url) ? 'video' : 'image' });
                            }
                          });
                        } else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image') || val.startsWith('data:video')) && !key.toLowerCase().includes('assinat') && !key.toLowerCase().includes('sign')) {
                          rawMedia.push({ key, url: val, type: isVideoUrl(val) ? 'video' : 'image' });
                        }
                      });
                    });

                    // Filtrar duplicados globais por URL
                    const seenUrls = new Set<string>();
                    const extractedMedia = rawMedia.filter(m => {
                      const cleanUrl = m.url.split('?')[0];
                      if (seenUrls.has(cleanUrl)) return false;
                      seenUrls.add(cleanUrl);
                      return true;
                    });

                    const groupedMedia = extractedMedia.reduce((acc, curr) => {
                      const displayKey = mapIdToLabel(curr.key);
                      if (!acc[displayKey]) acc[displayKey] = [];
                      acc[displayKey].push(curr);
                      return acc;
                    }, {} as Record<string, { url: string, type: 'image' | 'video' }[]>);

                    const groupKeys = Object.keys(groupedMedia);

                    if (groupKeys.length === 0) {
                      return (
                        <div className="py-20 text-center bg-white border border-slate-200 rounded-lg">
                          <Camera className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Nenhuma evidência registrada</p>
                        </div>
                      );
                    }

                    return groupKeys.map(key => (
                      <div key={key} className="bg-white p-6 rounded-lg border border-slate-200 shadow-lg shadow-slate-200/50">
                        <h4 className="text-xs font-medium text-slate-900 uppercase tracking-wider mb-6 pb-2 border-b border-slate-200 flex items-center gap-2">
                          <Camera size={16} className="text-slate-400" /> {key}
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {groupedMedia[key].map((p, i) => (
                            <div key={i} className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg shadow-slate-200/50 group hover:border-[#1c2d4f] transition-all">
                              <div
                                className="aspect-[4/3] bg-slate-50 cursor-zoom-in relative"
                                onClick={() => setFullscreenImage(p.url)}
                              >
                                {p.type === 'video' ? (
                                  <div className="w-full h-full relative flex items-center justify-center bg-black">
                                    <video src={p.url} className="w-full h-full object-cover opacity-60" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform">
                                        <Play size={16} className="text-white fill-white ml-0.5" />
                                      </div>
                                    </div>
                                    <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] text-white font-medium uppercase tracking-wider flex items-center gap-1">
                                      <Video size={10} /> VÍDEO
                                    </div>
                                  </div>
                                ) : (
                                  <img src={p.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                )}
                                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
                              </div>
                              <div className="p-3 bg-slate-50/50 border-t border-slate-200 flex-1 flex flex-col justify-between">
                                <p className="text-[10px] leading-snug font-medium text-slate-700 uppercase tracking-tight line-clamp-2" title={key}>{key}</p>
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-2 bg-slate-100 self-start px-2 py-0.5 rounded">{p.type === 'video' ? `Vídeo #${i + 1}` : `Foto #${i + 1}`}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* TAB: CUSTOS */}
              {activeTab === 'costs' && (
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-slate-800">Gestão de Peças e Custos</h3>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">Peças sempre aparecem no link público. O botão abaixo controla somente a exibição dos valores (R$).</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => setEditDraft({ ...editDraft, showValueToClient: !(editDraft.showValueToClient ?? selectedOrder.showValueToClient ?? false) })}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all shadow-sm border ${(editDraft.showValueToClient ?? selectedOrder.showValueToClient ?? false)
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                            }`}
                        >
                          {(editDraft.showValueToClient ?? selectedOrder.showValueToClient ?? false) ? <><Eye size={14} /> Valores Visíveis</> : <><EyeOff size={14} /> Valores Ocultos</>}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            showConfirm(`Deseja ${selectedOrder.showValueToClient ? 'ocultar' : 'mostrar'} os valores (R$) das peças no link público e na impressão? As peças continuarão visíveis.`, async () => {
                              await onEditOrder({ ...selectedOrder, showValueToClient: !selectedOrder.showValueToClient });
                              setSelectedOrder({ ...selectedOrder, showValueToClient: !selectedOrder.showValueToClient });
                            }, "Visibilidade de Valores", "Confirmar", false);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all shadow-sm border ${selectedOrder.showValueToClient ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'}`}
                        >
                          {selectedOrder.showValueToClient ? <><Eye size={14} /> Valores Visíveis</> : <><EyeOff size={14} /> Valores Ocultos</>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[#1c2d4f] px-5 py-3.5 rounded-xl shadow border border-[#1c2d4f]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/5">
                        <DollarSign size={16} className="text-blue-300" />
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Total Consolidado</span>
                    </div>
                    <div className="text-2xl font-medium font-mono text-white">
                      R$ {(selectedOrder.items?.reduce((acc, i) => acc + i.total, 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg shadow-lg shadow-slate-200/50 overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100/80 text-[11px] font-semibold text-slate-600 border-b border-slate-300 font-poppins">
                        <tr>
                          <th className="px-6 py-3">Item / Serviço</th>
                          <th className="px-4 py-3 text-center">Quant.</th>
                          <th className="px-4 py-3 text-right">Unitário</th>
                          <th className="px-6 py-3 text-right">Subtotal</th>
                          {isEditing && <th className="px-4 py-3 text-center w-10"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {(editDraft.items || selectedOrder.items || [])?.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-2">
                              {isEditing ? (
                                <input
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs font-medium text-slate-800"
                                  value={item.description}
                                  onChange={e => handleUpdateItem(item.id, 'description', e.target.value)}
                                  placeholder="Descrição do item..."
                                />
                              ) : (
                                <div>
                                  <span className="font-semibold text-slate-800">{item.description}</span>
                                  {item.equipmentName && (
                                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium uppercase mt-1">
                                      <Box size={10} /> {item.equipmentName}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  className="w-16 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs font-medium text-center"
                                  value={item.quantity}
                                  onChange={e => handleUpdateItem(item.id, 'quantity', Number(e.target.value))}
                                />
                              ) : <span className="text-slate-600 font-medium">{item.quantity}</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-[10px] text-slate-400 font-medium">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="w-24 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs font-medium text-right"
                                    value={item.unitPrice}
                                    onChange={e => handleUpdateItem(item.id, 'unitPrice', Number(e.target.value))}
                                  />
                                </div>
                              ) : <span className="font-mono text-slate-500 text-xs">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                            </td>
                            <td className="px-6 py-2 text-right font-mono font-medium text-slate-900">
                              R$ {(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            {isEditing && (
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                                  title="Remover Item"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {isEditing && (
                          <tr>
                            <td colSpan={5} className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => setIsStockPickerOpen(true)}
                                className="flex items-center gap-2 text-[10px] font-semibold text-primary-600 hover:text-primary-700 uppercase tracking-widest transition-all"
                              >
                                <PlusCircle size={14} /> Adicionar Item / Peça (Estoque)
                              </button>
                            </td>
                          </tr>
                        )}
                        {(!editDraft.items && (!selectedOrder.items || selectedOrder.items.length === 0)) && (
                          <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-medium uppercase tracking-widest text-xs">Nenhum custo registrado para esta O.S.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB: VÍNCULOS (ORÇAMENTOS) */}
              {activeTab === 'vinculos' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="flex items-center gap-3 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center border border-emerald-100">
                      <FileText size={18} className="text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-900 tracking-tight">Orçamentos Vinculados</h3>
                      <p className="text-[11px] text-slate-500 font-medium">Orçamentos aprovados ou relacionados a esta ordem de serviço</p>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        placeholder="Vincular novo orçamento (Pesquisar por título ou código)..."
                        value={quoteSearch}
                        onChange={e => setQuoteSearch(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-3 text-xs font-semibold text-slate-700 outline-none focus:border-primary-500 transition-all shadow-sm"
                      />
                    </div>
                  )}

                  <div className="space-y-6">
                    {/* Lista de Vinculados */}
                    {((isEditing ? editDraft.linkedQuotes : selectedOrder.linkedQuotes) || []).length > 0 && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-medium text-slate-400 uppercase px-1">Atualmente Vinculados</label>
                        <div className="space-y-2">
                          {((isEditing ? editDraft.linkedQuotes : selectedOrder.linkedQuotes) || []).map(qid => {
                            const q = quotes.find(qt => qt.id === qid);
                            return (
                              <div key={qid} className="flex items-center justify-between bg-white border border-slate-200 shadow-sm rounded-lg p-4 group">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-slate-50 rounded-md flex items-center justify-center border border-slate-100">
                                    <Link2 size={14} className="text-slate-400" />
                                  </div>
                                  <div>
                                    <p
                                      className="text-[12px] font-medium text-slate-800 hover:text-primary-600 cursor-pointer flex items-center gap-1 transition-colors"
                                      onClick={() => window.open(`/#/view-quote/${q?.publicToken || qid}`, '_blank')}
                                      title="Abrir orçamento no portal do cliente"
                                    >
                                      {q?.displayId || q?.title || qid}
                                      <ExternalLink size={12} className="opacity-50" />
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">{q?.customerName || '—'} • R$ {(q?.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-[10px] font-medium px-2 py-1 rounded-md border ${q?.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : q?.status === 'REJEITADO' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                    {q?.status || '—'}
                                  </span>
                                  {isEditing && (
                                    <button
                                      onClick={() => setEditDraft(d => ({ ...d, linkedQuotes: (d.linkedQuotes || []).filter(id => id !== qid) }))}
                                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-all"
                                      title="Remover vínculo"
                                    >
                                      <Unlink size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Lista para Vincular (apenas na edição e se houver busca) */}
                    {isEditing && quoteSearch && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-medium text-slate-400 uppercase px-1">Resultados da Busca</label>
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                          {quotes.filter(q => !(editDraft.linkedQuotes || []).includes(q.id) && (
                            q.title?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                            q.customerName?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                            q.displayId?.toLowerCase().includes(quoteSearch.toLowerCase())
                          )).map(q => (
                            <button
                              key={q.id}
                              onClick={() => setEditDraft(d => ({ ...d, linkedQuotes: [...(d.linkedQuotes || []), q.id] }))}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 last:border-0 transition-colors group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-slate-50 rounded-md flex items-center justify-center border border-slate-100 group-hover:bg-primary-50 group-hover:border-primary-100 transition-colors">
                                  <FileText size={14} className="text-slate-400 group-hover:text-primary-500" />
                                </div>
                                <div>
                                  <p className="text-[12px] font-medium text-slate-700 group-hover:text-primary-700">{q.displayId || q.title}</p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">{q.customerName} • R$ {(q.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-[10px] font-medium px-2 py-1 rounded-md border ${q.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : q.status === 'REJEITADO' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                  {q.status}
                                </span>
                                <Plus size={16} className="text-slate-300 group-hover:text-primary-600" />
                              </div>
                            </button>
                          ))}
                          {quotes.filter(q => !(editDraft.linkedQuotes || []).includes(q.id) && (
                            q.title?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                            q.customerName?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                            q.displayId?.toLowerCase().includes(quoteSearch.toLowerCase())
                          )).length === 0 && (
                            <div className="p-6 text-center text-[11px] font-semibold text-slate-400">Nenhum orçamento encontrado</div>
                          )}
                        </div>
                      </div>
                    )}

                    {!isEditing && (selectedOrder.linkedQuotes || []).length === 0 && (
                      <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
                        <Link2 size={32} className="mx-auto text-slate-200 mb-3" />
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Nenhum orçamento vinculado</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: AUDITORIA */}
              {activeTab === 'audit' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-10 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 mb-6 group hover:border-[#1c2d4f] transition-all">
                      <ShieldCheck size={32} className="text-slate-300 group-hover:text-[#1c2d4f]" />
                    </div>
                    <h3 className="text-sm font-medium text-slate-900 uppercase tracking-tight">Validação Técnica</h3>
                    <p className="text-xs text-slate-500 mt-2 mb-8 font-medium">Revisado e assinado eletronicamente pelo responsável de campo</p>
                    <div className="w-full pt-8 border-t border-slate-200">
                      <div className="text-base font-medium text-slate-800">{techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'Técnico Não Identificado'}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-2 break-all bg-slate-50 p-2 rounded border border-slate-100 select-all">
                        {selectedOrder.displayId || selectedOrder.id}-VALID-{new Date(selectedOrder.createdAt).getTime()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-10 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 mb-6">
                      <UserCheck size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-sm font-medium text-slate-900 uppercase tracking-tight">Aceite do Cliente</h3>
                    <p className="text-xs text-slate-500 mt-2 mb-8 font-medium">Protocolo de recebimento e satisfação de serviço</p>

                    {(() => {
                      // Consolidação de todos os forms (OS e Visitas)
                      const allForms: any[] = [];
                      if (selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0) {
                        allForms.push(selectedOrder.formData);
                      }
                      orderVisits.filter(v => ['completed', 'paused', 'blocked'].includes(v.status) && v.formData).forEach(v => allForms.push(v.formData));

                      let signatureUrl: string | null = selectedOrder.signature || null;
                      let signatureRefName: string | null = selectedOrder.signatureName || null;
                      let signatureDoc: string | null = selectedOrder.signatureDoc || null;

                      // Se não achar na base oficial, procura dentro do formData como fallback
                      if (!signatureUrl || !signatureDoc || !signatureRefName) {
                        [...allForms].reverse().forEach(data => {
                          if (!signatureUrl) {
                            signatureUrl = data.signature || data['Assinatura do Cliente'] || Object.entries(data).find(([k, v]) => k.toLowerCase().includes('assinat') && typeof v === 'string' && (v.startsWith('data:') || v.startsWith('http')))?.[1];
                          }
                          if (!signatureRefName) {
                            signatureRefName = data.signatureName || data.clientName || data.client_signature_name || data['Assinatura do Cliente - Nome'] || null;
                          }
                          if (!signatureDoc) {
                            signatureDoc = data.signatureDoc || data.clientDoc || data['assinaturaDoc'] || data['CPF'] || Object.entries(data).find(([k]) => k.toLowerCase() === 'cpf')?.[1] || null;
                          }
                        });
                      }

                      const name = signatureRefName || selectedOrder.customerName || selectedOrder.customer?.name;

                      return signatureUrl ? (
                        <div className="w-full">
                          <img src={signatureUrl} className="h-28 mx-auto object-contain mix-blend-multiply mb-6" alt="Assinatura" />
                          <div className="pt-6 border-t border-slate-200">
                            <div className="text-base font-medium text-slate-900 uppercase text-center">{name}</div>
                            {signatureDoc && <div className="text-xs font-semibold text-slate-500 font-mono text-center mt-1">CPF/Doc: {signatureDoc}</div>}
                            <div className="text-center">
                              <div className="text-[10px] text-emerald-600 font-medium uppercase mt-2 inline-block px-2 py-1 bg-emerald-50 rounded-md">✓ Assinado Digitalmente no App</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 w-full border-t border-slate-200 text-center">
                          <p className="text-xs text-slate-400 font-medium uppercase bg-slate-50 py-4 rounded-md border border-dashed border-slate-200 tracking-widest">Assinatura Pendente</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* TAB: VISITAS — Gestão ativa */}
              {activeTab === 'visits' && (
                <div className="max-w-4xl mx-auto space-y-6">

                  {/* Cabeçalho da aba */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                        {visits.length} {visits.length === 1 ? 'visita registrada' : 'visitas registradas'}
                        {visits.length > 0 && visits[0].scheduledDate && (
                          <span className="text-primary-500 ml-1">
                            (Último agendamento: {new Date(visits[visits.length - 1].scheduledDate).toLocaleDateString()})
                          </span>
                        )}
                      </span>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">Agendamento e gestão de visitas técnicas desta OS</p>
                    </div>

                    {/* Botão Nova Visita — Design System Primário */}
                    {selectedOrder.status !== OrderStatus.COMPLETED && selectedOrder.status !== OrderStatus.CANCELED && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                          if (!canEdit('orders')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                          setShowNewVisitForm(v => !v);
                        }}
                        disabled={!(
                          visits.length === 0 ||
                          visits[visits.length - 1]?.status === VisitStatusEnum.PAUSED ||
                          visits[visits.length - 1]?.status === VisitStatusEnum.BLOCKED ||
                          selectedOrder.status === OrderStatus.BLOCKED
                        )}
                        title={visits.length > 0 && visits[visits.length - 1]?.status !== VisitStatusEnum.PAUSED && visits[visits.length - 1]?.status !== VisitStatusEnum.BLOCKED && selectedOrder.status !== OrderStatus.BLOCKED
                          ? 'A OS ou última visita devem estar pausadas ou impedidas.'
                          : 'Agendar nova visita'
                        }
                        className={`h-9 px-5 gap-2 bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${!canEdit('orders') ? 'opacity-50 !cursor-not-allowed' : ''}`}
                      >
                        <Plus size={15} /> Nova Visita
                      </Button>
                    )}
                  </div>

                  {/* Formulário de nova visita (inline) */}
                  {showNewVisitForm && (
                    <div className="bg-white border border-primary-200 rounded-xl shadow-lg shadow-slate-200/50 p-6 space-y-4 animate-in fade-in slide-in-from-top-2">
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-primary-700">Agendar Nova Visita</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-semibold text-slate-500 uppercase">Técnico Responsável *</label>
                          
                          {/* Barra de busca */}
                          <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                              type="text"
                              placeholder="Buscar por nome ou e-mail..."
                              value={newVisitTechSearch}
                              onChange={e => setNewVisitTechSearch(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] transition-all"
                            />
                          </div>

                          {/* Lista de técnicos */}
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                            {techs
                              .filter(t =>
                                t.name.toLowerCase().includes(newVisitTechSearch.toLowerCase()) ||
                                t.email?.toLowerCase().includes(newVisitTechSearch.toLowerCase())
                              )
                              .map(t => {
                                const isAllowed = allowedTechIds === null || allowedTechIds.includes(t.id);
                                const isSelected = newVisitDraft.technicianId === t.id;
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      if (!isAllowed) {
                                        showAlert(`O técnico ${t.name} não atende a região demarcada do cliente. Selecione um técnico autorizado para esta área.`, 'error');
                                        return;
                                      }
                                      setNewVisitDraft(d => ({ ...d, technicianId: t.id }));
                                    }}
                                    className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-all ${
                                      !isAllowed
                                        ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-100'
                                        : isSelected
                                        ? 'border-[#1c2d4f] bg-[#1c2d4f]/5 shadow-sm font-semibold'
                                        : 'border-slate-100 bg-slate-50 hover:border-slate-300 hover:bg-white'
                                    }`}
                                  >
                                    <div className="relative shrink-0">
                                      <img src={t.avatar} className="w-7 h-7 rounded-lg object-cover border border-slate-200" alt={t.name} />
                                      {!isAllowed && (
                                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full flex items-center justify-center">
                                          <span className="text-white text-[7px] font-bold">✕</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-bold text-slate-800 truncate">{t.name}</p>
                                      <p className="text-[9px] font-medium truncate">
                                        {!isAllowed
                                          ? <span className="text-rose-400">Fora da área demarcada</span>
                                          : <span className="text-slate-400">{t.email}</span>
                                        }
                                      </p>
                                    </div>
                                    {isSelected && <CheckCircle2 size={12} className="text-[#1c2d4f] shrink-0" />}
                                  </button>
                                );
                              })
                            }
                            {techs.filter(t =>
                              t.name.toLowerCase().includes(newVisitTechSearch.toLowerCase()) ||
                              t.email?.toLowerCase().includes(newVisitTechSearch.toLowerCase())
                            ).length === 0 && (
                              <p className="text-center text-xs text-slate-400 py-4">Nenhum técnico encontrado</p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500 uppercase">Data de Agendamento *</label>
                          <input
                            type="date"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                            value={newVisitDraft.scheduledDate}
                            onChange={e => setNewVisitDraft(d => ({ ...d, scheduledDate: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500 uppercase">Horário (opcional)</label>
                          <input
                            type="time"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                            value={newVisitDraft.scheduledTime}
                            onChange={e => setNewVisitDraft(d => ({ ...d, scheduledTime: e.target.value }))}
                          />
                        </div>
        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                            Observações para o técnico
                            <span className="text-rose-500 font-semibold">*</span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Descreva o motivo da visita, equipamentos a verificar, histórico do problema ou qualquer instrução importante para o técnico..."
                            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
                            value={newVisitDraft.notes}
                            onChange={e => setNewVisitDraft(d => ({ ...d, notes: e.target.value }))}
                          />
                          <p className="text-[10px] text-slate-400 font-medium">Esta informação será exibida ao técnico no campo "Descrição Detalhada" da OS.</p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowNewVisitForm(false)} className="text-slate-500">
                          Cancelar
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleCreateVisit}
                          disabled={savingVisit}
                          className="gap-2 bg-primary-600 hover:bg-primary-700 px-6"
                        >
                          {savingVisit ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Confirmar Agendamento
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Lista de visitas */}
                  {visitsLoading ? (
                    <div className="flex items-center justify-center py-16 gap-3">
                      <Loader2 size={22} className="animate-spin text-primary-400" />
                      <span className="text-xs font-medium uppercase tracking-widest text-slate-400">Carregando visitas...</span>
                    </div>
                  ) : visits.length === 0 ? (
                    <div className="bg-white border border-dashed border-slate-200 rounded-xl py-16 text-center">
                      <CalendarPlus size={40} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Nenhuma visita agendada</p>
                      <p className="text-[11px] text-slate-300 font-medium mt-1">Clique em "Nova Visita" para agendar a primeira.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visits.map((visit, idx) => {
                        const isLast = idx === visits.length - 1;
                        const rawStatus = visit.status;
                        // A visita mais recente (Atual) deve espelhar o status da OS se ainda não foi sincronizada
                        const effectiveStatus = (() => {
                          if (rawStatus === 'completed' || visit.isLocked) return 'completed';
                          if (rawStatus === 'blocked') return 'blocked';
                          if (rawStatus === 'paused') return 'paused';
                          if (rawStatus === 'ongoing') {
                            if (selectedOrder.status === 'CONCLUÍDO') return 'completed';
                            if (selectedOrder.status === 'IMPEDIDO') return 'blocked';
                            return 'ongoing';
                          }
                          if (rawStatus === 'pending') {
                            if (selectedOrder.status === 'CONCLUÍDO') return 'completed';
                            if (isLast && selectedOrder.status === 'IMPEDIDO') return 'blocked';
                          }
                          return rawStatus;
                        })();

                        const canEditVisit = canEdit('orders') && effectiveStatus === 'pending' && !visit.isLocked;
                        const isEditingThis = editingVisitId === visit.id;
                        const statusColors: Record<string, string> = {
                          pending: 'bg-slate-100 text-slate-600 border-slate-200',
                          ongoing: 'bg-blue-50 text-blue-700 border-blue-200',
                          paused: 'bg-blue-50 text-blue-700 border-blue-200',
                          blocked: 'bg-rose-50 text-rose-700 border-rose-200',
                          completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        };
                        const statusLabel: Record<string, string> = {
                          pending: 'Agendado', ongoing: 'Em andamento',
                          paused: 'Pausado', blocked: 'Impedido', completed: 'Concluído',
                        };
                        const techName = techs.find(t => t.id === visit.technicianId)?.name || visit.technicianName || '—';
                        return (
                          <div
                            key={visit.id}
                            className={`bg-white border rounded-xl transition-all ${isEditingThis ? 'border-amber-300 ring-2 ring-blue-100 shadow-md' :
                              isLast ? 'border-primary-200 ring-2 ring-primary-50 shadow-sm' : 'border-slate-200'
                              }`}
                          >
                            {/* Card header */}
                            <div className="p-3.5 flex items-center gap-4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 border-2 ${isLast ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-500'
                                }`}>
                                {visit.visitNumber ?? idx + 1}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border ${statusColors[effectiveStatus] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                    {statusLabel[effectiveStatus] || effectiveStatus}
                                  </span>
                                  {isLast && <span className="text-[9px] font-semibold text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full uppercase">Atual</span>}
                                  {visit.isLocked && <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">🔒 Concluída</span>}
                                </div>
                                <p className="text-sm font-medium text-slate-800 mt-1 truncate">{techName}</p>
                                <p className="text-[11px] text-slate-400 font-medium">
                                  {visit.scheduledDate ? formatDateDisplay(visit.scheduledDate) : '—'}
                                  {visit.scheduledTime ? ` às ${visit.scheduledTime}` : ''}
                                </p>
                              </div>

                              {!isEditingThis && (
                                <button
                                  onClick={(e) => {
                                    if (!canEditVisit) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                    setEditingVisitId(visit.id);
                                    setVisitScheduleDraft({
                                      scheduledDate: visit.scheduledDate || '',
                                      scheduledTime: visit.scheduledTime || '',
                                      technicianId: visit.technicianId || '',
                                    });
                                  }}
                                  className={`p-2 text-amber-500 hover:bg-blue-50 rounded-lg border border-blue-200 transition-all shrink-0 ${!canEditVisit ? 'opacity-50 !cursor-not-allowed' : ''}`}
                                  title="Editar agendamento"
                                >
                                  <Edit3 size={14} />
                                </button>
                              )}

                              {visit.arrivalTime && !isEditingThis && (
                                <div className="text-right shrink-0">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Chegada</p>
                                  <p className="text-xs font-medium text-slate-700">
                                    {new Date(visit.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Formulário de edição de agendamento — expandido inline */}
                            {isEditingThis && (
                              <div className="border-t border-amber-100 bg-blue-50/40 px-5 py-4 space-y-3">
                                <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest">Editar Agendamento</p>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Data</label>
                                      <input type="date" className="w-full border border-blue-200 bg-white rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                                        value={visitScheduleDraft.scheduledDate}
                                        onChange={e => setVisitScheduleDraft(d => ({ ...d, scheduledDate: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Início</label>
                                      <input type="time" className="w-full border border-blue-200 bg-white rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                                        value={visitScheduleDraft.scheduledTime}
                                        onChange={e => setVisitScheduleDraft(d => ({ ...d, scheduledTime: e.target.value }))} />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase">Técnico</label>
                                    
                                    {/* Barra de busca */}
                                    <div className="relative mb-2">
                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                      <input
                                        type="text"
                                        placeholder="Buscar por nome ou e-mail..."
                                        value={editVisitTechSearch}
                                        onChange={e => setEditVisitTechSearch(e.target.value)}
                                        className="w-full bg-white border border-blue-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                                      />
                                    </div>

                                    {/* Lista de técnicos */}
                                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                      <button
                                        type="button"
                                        onClick={() => setVisitScheduleDraft(d => ({ ...d, technicianId: '' }))}
                                        className={`w-full flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all text-xs ${
                                          visitScheduleDraft.technicianId === ''
                                            ? 'border-blue-500 bg-blue-50/50 shadow-sm font-semibold'
                                            : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[11px] font-bold text-slate-800">Manter atual / Nenhum</p>
                                        </div>
                                        {visitScheduleDraft.technicianId === '' && <CheckCircle2 size={12} className="text-blue-500 shrink-0" />}
                                      </button>
                                      
                                      {techs
                                        .filter(t =>
                                          t.name.toLowerCase().includes(editVisitTechSearch.toLowerCase()) ||
                                          t.email?.toLowerCase().includes(editVisitTechSearch.toLowerCase())
                                        )
                                        .map(t => {
                                          const isAllowed = allowedTechIds === null || allowedTechIds.includes(t.id);
                                          const isSelected = visitScheduleDraft.technicianId === t.id;
                                          return (
                                            <button
                                              key={t.id}
                                              type="button"
                                              onClick={() => {
                                                if (!isAllowed) {
                                                  showAlert(`O técnico ${t.name} não atende a região demarcada do cliente. Selecione um técnico autorizado para esta área.`, 'error');
                                                  return;
                                                }
                                                setVisitScheduleDraft(d => ({ ...d, technicianId: t.id }));
                                              }}
                                              className={`w-full flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all text-xs ${
                                                !isAllowed
                                                  ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-100'
                                                  : isSelected
                                                  ? 'border-blue-500 bg-blue-50/50 shadow-sm font-semibold'
                                                  : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                                              }`}
                                            >
                                              <div className="relative shrink-0">
                                                <img src={t.avatar} className="w-6 h-6 rounded-md object-cover border border-slate-200" alt={t.name} />
                                                {!isAllowed && (
                                                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-rose-500 rounded-full flex items-center justify-center">
                                                    <span className="text-white text-[6px] font-bold">✕</span>
                                                  </div>
                                                )}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-slate-800 truncate">{t.name}</p>
                                                <p className="text-[9px] font-medium truncate">
                                                  {!isAllowed
                                                    ? <span className="text-rose-400">Fora da área demarcada</span>
                                                    : <span className="text-slate-400">{t.email}</span>
                                                  }
                                                </p>
                                              </div>
                                              {isSelected && <CheckCircle2 size={12} className="text-blue-500 shrink-0" />}
                                            </button>
                                          );
                                        })
                                      }
                                      {techs.filter(t =>
                                        t.name.toLowerCase().includes(editVisitTechSearch.toLowerCase()) ||
                                        t.email?.toLowerCase().includes(editVisitTechSearch.toLowerCase())
                                      ).length === 0 && (
                                        <p className="text-center text-xs text-slate-400 py-2">Nenhum técnico encontrado</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                  <button onClick={() => setEditingVisitId(null)} className="px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors">
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => handleSaveVisitSchedule(visit)}
                                    disabled={savingSchedule}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-lg transition-all shadow-md disabled:opacity-50"
                                  >
                                    {savingSchedule ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: HISTÓRICO — Audit trail imutável */}
              {activeTab === 'history' && (
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="bg-white p-8 rounded-lg border border-slate-200">
                    <OrderTimeline orderId={selectedOrder.id} />
                  </div>
                  {/* Histórico detalhado de visitas */}
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Histórico de Visitas</h3>
                    </div>
                    <VisitHistoryTab orderId={selectedOrder.id} isActive={activeTab === 'history'} />
                  </div>
                </div>
              )}

              {/* TAB: DESLOCAMENTO */}
              {activeTab === 'displacement' && (
                <div className="max-w-4xl mx-auto space-y-8">
                  <DisplacementTab visits={orderVisits} />
                </div>
              )}

              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Batch Print Container — renderiza tabela de ordens selecionadas */}
      {
        isBatchPrinting && ordersToPrint && createPortal(
          <div id="batch-print-root" className="bg-white">
            {/* Cabeçalho do Relatório */}
            {(() => {
              let companyInfo: any = {};
              try {
                companyInfo = JSON.parse(localStorage.getItem('nexus_settings') || '{}')?.company || {};
              } catch {}

              return (
                <div className="mb-6 border-b-4 border-[#1C2D4F] pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {companyInfo.logo && (
                      <img src={companyInfo.logo} alt="Logo" className="h-16 object-contain max-w-[150px]" />
                    )}
                    <div className="text-left text-xs text-slate-600 font-medium space-y-0.5">
                      {companyInfo.name && <p className="font-bold text-slate-900 uppercase text-sm mb-1">{companyInfo.name}</p>}
                      {companyInfo.cnpj && <p>CNPJ: {companyInfo.cnpj}</p>}
                      {companyInfo.phone && <p>Tel: {companyInfo.phone}</p>}
                      {companyInfo.email && <p>E-mail: {companyInfo.email}</p>}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <h1 className="text-2xl font-black text-[#1C2D4F] tracking-tight uppercase">Relatório de O.S.</h1>
                    <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-widest">{ordersToPrint.length} Registros Selecionados</p>
                    <div className="text-[10px] text-slate-400 font-medium mt-3">
                      <p>Gerado em: {new Date().toLocaleString('pt-BR')}</p>
                      <p>Usuário: {auth?.user?.name || 'Administrador'}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-[#1C2D4F] text-white uppercase tracking-wider">
                  <th className="px-3 py-2 border border-slate-300 font-bold">Protocolo (ID)</th>
                  <th className="px-3 py-2 border border-slate-300 font-bold">Data de Abertura</th>
                  <th className="px-3 py-2 border border-slate-300 font-bold">Data de Conclusão</th>
                  <th className="px-3 py-2 border border-slate-300 font-bold">Cliente</th>
                  <th className="px-3 py-2 border border-slate-300 font-bold">Técnico</th>
                  <th className="px-3 py-2 border border-slate-300 font-bold">Modalidade</th>
                  <th className="px-3 py-2 border border-slate-300 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {ordersToPrint.map((order, idx) => {
                  const techName = techs.find(t => t.id === order.assignedTo)?.name || 'N/A';
                  const dataAbertura = new Date(order.createdAt).toLocaleDateString('pt-BR');
                  const dataConclusao = order.endDate ? new Date(order.endDate).toLocaleDateString('pt-BR') : '—';
                  
                  return (
                    <tr key={order.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-3 py-2 border border-slate-200 font-mono text-[9px] font-semibold">{order.displayId || order.id}</td>
                      <td className="px-3 py-2 border border-slate-200 font-medium">{dataAbertura}</td>
                      <td className="px-3 py-2 border border-slate-200 font-medium">{dataConclusao}</td>
                      <td className="px-3 py-2 border border-slate-200 font-bold text-slate-700">{order.customerName || 'N/A'}</td>
                      <td className="px-3 py-2 border border-slate-200">{techName}</td>
                      <td className="px-3 py-2 border border-slate-200">{order.operationType || 'N/A'}</td>
                      <td className="px-3 py-2 border border-slate-200 uppercase font-bold text-[#1C2D4F]">{order.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>,
          document.body
        )
      }

      {/* Lightbox Viewer */}
      {
        fullscreenImage && createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-white flex items-center justify-center p-8 animate-in fade-in"
            onClick={() => setFullscreenImage(null)}
          >
            <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
              {isVideoUrl(fullscreenImage) ? (
                <video
                  src={fullscreenImage}
                  controls
                  autoPlay
                  className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in-95"
                />
              ) : (
                <img
                  src={fullscreenImage}
                  className="max-w-full max-h-full object-contain rounded-lg animate-in zoom-in-95"
                  alt="Visualização"
                />
              )}
              <button
                onClick={() => setFullscreenImage(null)}
                className="absolute top-0 right-0 p-3 text-slate-500 hover:text-slate-900 bg-white rounded-full shadow-md border border-slate-200 transition-all hover:scale-110"
              >
                <X size={22} />
              </button>
            </div>
          </div>,
          document.body
        )
      }

      {/* 📦 Stock Picker Modal */}
      {isStockPickerOpen && createPortal(
        <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
                  <PackageSearch size={18} />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-tight">Selecionar Item do Estoque</h3>
              </div>
              <button onClick={() => setIsStockPickerOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 flex-1 flex flex-col min-h-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Pesquisar por descrição ou código..."
                  className="w-full bg-slate-100 border-none rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                {stockLoading ? (
                  <div className="py-20 text-center flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-primary-400" />
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Carregando estoque...</p>
                  </div>
                ) : allStockItems.filter(i =>
                  i.description.toLowerCase().includes(stockSearch.toLowerCase()) ||
                  i.code.toLowerCase().includes(stockSearch.toLowerCase())
                ).length > 0 ? (
                  allStockItems
                    .filter(i =>
                      i.description.toLowerCase().includes(stockSearch.toLowerCase()) ||
                      i.code.toLowerCase().includes(stockSearch.toLowerCase())
                    )
                    .map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleAddStockItem(item)}
                        className="w-full p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 hover:border-primary-200 hover:shadow-sm transition-all text-left flex items-center justify-between group"
                      >
                        <div>
                          <p className="font-medium text-slate-800 text-sm group-hover:text-primary-700 transition-colors uppercase">{item.description}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase">Cód: {item.code}</p>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase">Salvo em: {item.location || 'Geral'}</p>
                            <p className={`text-[10px] font-semibold uppercase ${item.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              Estoque: {item.quantity} {item.unit}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-900 font-mono">R$ {Number(item.sellPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase">Unitário</p>
                        </div>
                      </button>
                    ))
                ) : (
                  <div className="py-20 text-center flex flex-col items-center gap-3">
                    <PackageSearch size={32} className="text-slate-200" />
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Nenhum item encontrado</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
              <p className="text-[10px] font-medium text-slate-400 uppercase flex items-center gap-2">
                <Box size={12} /> {allStockItems.length} Itens no catálogo
              </p>
              <button
                type="button"
                onClick={handleManualAdd}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-semibold text-slate-500 hover:text-slate-900 uppercase tracking-widest transition-all"
              >
                <Plus size={14} /> Item fora do catálogo (Manual)
              </button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
};

