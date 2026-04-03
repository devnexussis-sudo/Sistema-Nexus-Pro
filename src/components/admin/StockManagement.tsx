
import { AlertTriangle, Barcode, Box, DollarSign, Edit3, Filter, Layers, List, Loader2, Package, Plus, RefreshCw, Save, Scale, Search, Tag, Trash2, TrendingDown, TrendingUp, Users, Wand2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DataService } from '../../services/dataService';
import { TenantService } from '../../services/tenantService';
import { Category, StockItem } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Pagination } from '../ui/Pagination';

export const StockManagement: React.FC = () => {
    const { isAuthLoading, session } = useAuth();

    // Application State
    const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'techs' | 'movements'>('items');

    // --- Items State ---
    const [items, setItems] = useState<StockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItemsCount, setTotalItemsCount] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isFetching = useRef<boolean>(false);
    const ITEMS_PER_PAGE = 20;

    // --- Categories State ---
    const [categories, setCategories] = useState<Category[]>([]);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryFormData, setCategoryFormData] = useState({ name: '', active: true });

    // Item Form Data
    const [formData, setFormData] = useState<any>({
        code: '',
        externalCode: '',
        description: '',
        category: '',
        location: '',
        quantity: '',
        minQuantity: '',
        costPrice: '',
        sellPrice: '',
        freightCost: '',
        taxPercent: '', // Changed from taxCost to taxPercent
        unit: 'UN',
        active: true
    });

    // --- Restock State ---
    const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
    const [restockSearch, setRestockSearch] = useState('');
    const [selectedRestockItem, setSelectedRestockItem] = useState<StockItem | null>(null);
    const [restockQuantity, setRestockQuantity] = useState('');

    // --- Technical Stock State ---
    const [techs, setTechs] = useState<any[]>([]);
    const [selectedTech, setSelectedTech] = useState<any | null>(null);
    const [techStock, setTechStock] = useState<any[]>([]);
    const [movements, setMovements] = useState<any[]>([]);
    const [movSearch, setMovSearch] = useState('');
    const [movTypeFilter, setMovTypeFilter] = useState('ALL');
    const getDefaultDates = () => {
        const dEnd = new Date();
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 2);
        return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
    };
    const { start: initStart, end: initEnd } = getDefaultDates();
    const [movDateFrom, setMovDateFrom] = useState(initStart);
    const [movDateTo, setMovDateTo] = useState(initEnd);

    const handleDateValidation = (start: string, end: string) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if ((d2.getTime() - d1.getTime()) > 31622400000) { // 366 dias
                alert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada.');
                setMovDateFrom(start);
                setMovDateTo(new Date(d1.getTime() + 31536000000).toISOString().split('T')[0]);
                return;
            }
        }
        setMovDateFrom(start);
        setMovDateTo(end);
    };
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferData, setTransferData] = useState({ itemId: '', techId: '', quantity: '', direction: 'transfer' });
    const [techSearch, setTechSearch] = useState('');

    // --- Loaders ---
    const loadItems = async (page: number, search: string, category: string, status: string) => {
        if (isFetching.current) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort('New pagination fetch');
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        isFetching.current = true;
        setLoading(true);
        setError(null);

        const timeoutId = setTimeout(() => {
            if (abortControllerRef.current === controller && loading) {
                console.warn('[Stock] ⚠️ Load timeout - check Supabase logs');
                setError('A conexão está demorando mais que o esperado. Verifique sua internet.');
                setLoading(false);
            }
        }, 15000);

        try {
            if (isAuthLoading || !session) {
                console.warn('[Stock] 🔒 Fetch bloqueado: Auth ainda carregando ou sem sessão.');
                isFetching.current = false;
                setLoading(false);
                return;
            }

            const { ensureValidSession } = await import('../../lib/supabase');
            const sessionOk = await ensureValidSession();

            if (!sessionOk) {
                console.warn('[Stock] 🔒 Sessão ausente (Bolso global). Aguardando liberação...');
                setTimeout(() => loadItems(page, search, category, status), 500);
                setLoading(false);
                return;
            }

            const { data, count, error } = await DataService.getStockItemsPaginated(
                page,
                ITEMS_PER_PAGE,
                { searchTerm: search, categoryFilter: category, statusFilter: status },
                signal
            );

            if (signal.aborted) return;

            setItems(data || []);
            setTotalItemsCount(count || 0);
            setError(null);
        } catch (err: any) {
            if (signal.aborted) return;

            // "Killed by Nexus Recovery" = Recovery Engine abortou o fetch no Wake Up.
            // É normal e esperado. Silenciosamente ignoramos — o useEffect vai re-disparar
            // o fetch automaticamente quando a sessão/estado estiver estável.
            const isNexusKill = err?.message?.includes('Killed by Nexus') || err?.message?.includes('Nexus Recovery');
            const isAbort = err?.name === 'AbortError' || err?.message?.includes('AbortError') || err?.message?.includes('Aborted');

            if (isNexusKill || isAbort) {
                console.log('[Stock] 🛑 Fetch interrompido pelo Recovery (normal). Aguardando re-trigger automático.');
                return; // sem retry manual, sem erro no console
            }

            console.error('Erro ao carregar estoque:', err);
            setError(err.message || 'Erro inesperado ao sincronizar estoque.');
        } finally {
            clearTimeout(timeoutId);
            isFetching.current = false;
            if (!signal.aborted) {
                setLoading(false);
            }
        }
    };

    const loadCategories = async () => {
        try {
            const data = await DataService.getCategories();
            setCategories(data);
            setAvailableCategories(data);
        } catch (err: any) {
            const isNexusKill = err?.message?.includes('Killed by Nexus') || err?.name === 'AbortError';
            if (!isNexusKill) console.error('Erro ao carregar categorias:', err);
        }
    };

    const loadTechs = async () => {
        try {
            const tenantId = DataService.getCurrentTenantId();
            if (!tenantId) return;
            const data = await TenantService.getTenantUsers(tenantId);
            setTechs(data.filter((u: any) => u.role === 'TECHNICIAN' || u.role === 'ADMIN'));
        } catch (err: any) {
            const isNexusKill = err?.message?.includes('Killed by Nexus') || err?.name === 'AbortError';
            if (!isNexusKill) console.error('Erro ao carregar técnicos:', err);
        }
    };

    const loadMovements = async () => {
        try {
            const data = await DataService.getMovements();
            setMovements(data);
        } catch (err: any) {
            console.error('Erro ao carregar movimentações:', err);
            if (err.name === 'AbortError' || err.message?.includes('Abort') || err.message?.includes('Killed by Nexus')) {
                setTimeout(loadMovements, 3000);
            }
        }
    };

    const loadAll = async () => {
        loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        loadCategories();
        loadTechs();
        loadMovements();
    };

    useEffect(() => {
        const init = async () => {
            // Tenta obter usuário do service
            let user = await DataService.getCurrentUser();

            // Se falhar o service (cache), tenta direto no Supabase para forçar refresh
            if (!user?.tenantId) {
                const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
                if (session?.user?.user_metadata?.tenantId) {
                    console.log('🛡️ [StockManagement] Tenant ID recuperado via Supabase Session');
                    loadAll();
                    return;
                }
            }

            if (user?.tenantId) {
                loadAll();
            } else {
                console.warn("🛡️ [StockManagement] Tenant ID não detectado. Tentando carregamento forçado...");
                setLoading(false);
                setError('Não foi possível identificar seu Tenant ID. Recarregue a página ou faça login novamente.');
            }
        }
        init();
    }, []);

    // --- Item Handlers ---
    const handleOpenModal = (item?: StockItem) => {
        if (item) {
            setEditingItem(item);
            // Reverse calculate tax percent for editing
            const cost = item.costPrice || 0;
            const tax = item.taxCost || 0;
            const percent = cost > 0 ? (tax / cost) * 100 : 0;

            setFormData({
                ...item,
                taxPercent: percent > 0 ? percent.toFixed(2) : ''
            });
        } else {
            setEditingItem(null);
            setFormData({
                code: '',
                externalCode: '',
                description: '',
                category: '',
                location: '',
                quantity: '',
                minQuantity: '',
                costPrice: '',
                sellPrice: '',
                freightCost: '',
                taxPercent: '',
                unit: 'UN',
                active: true
            });
        }
        setIsModalOpen(true);
    };

    const generateCode = () => {
        const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        setFormData((prev: any) => ({ ...prev, code: `STK-${random}` }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload: StockItem = {
                ...formData,
                quantity: Number(formData.quantity) || 0,
                minQuantity: Number(formData.minQuantity) || 0,
                costPrice: Number(formData.costPrice) || 0,
                sellPrice: Number(formData.sellPrice) || 0,
                freightCost: Number(formData.freightCost) || 0,
                // Calculate actual tax cost for saving to DB (or keep percentage if DB supports it.
                // Based on StockItem type, it expects taxCost (number).
                // So we should calculate the absolute value here for persistence?
                // OR we should store the percentage?
                // StockItem has taxCost?: number.
                // If I change the UI to use %, I should probably calculate the cost before save,
                // OR ideally add taxPercent to the schema.
                // Given constraints, I will calculate the cost value on save,
                // BUT for UI state I need to persist the percentage to restore it properly on edit?
                // If I save only taxCost, when I edit, I have to reverse calculate %: (Tax / Cost) * 100.
                // That works.
                taxCost: (Number(formData.costPrice) || 0) * ((Number(formData.taxPercent) || 0) / 100)
            } as StockItem;

            if (editingItem) {
                await DataService.updateStockItem({ ...editingItem, ...payload });
            } else {
                await DataService.createStockItem(payload);
            }
            setIsModalOpen(false);
            loadItems();
        } catch (error: any) {
            console.error('Erro completo ao salvar item:', error);
            alert(`Erro ao salvar item no banco de dados:\n\n${error.message || 'Verifique sua conexão ou tente novamente.'}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja remover este item?')) {
            await DataService.deleteStockItem(id);
            loadItems();
        }
    };

    // --- Category Handlers ---
    const handleOpenCategoryModal = (cat?: Category) => {
        if (cat) {
            setEditingCategory(cat);
            setCategoryFormData({ name: cat.name, active: cat.active });
        } else {
            setEditingCategory(null);
            setCategoryFormData({ name: '', active: true });
        }
        setIsCategoryModalOpen(true);
    };

    const handleCategorySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingCategory) {
                await DataService.updateCategory({
                    ...editingCategory,
                    ...categoryFormData
                });
            } else {
                await DataService.createCategory({
                    ...categoryFormData,
                    type: 'stock'
                } as any);
            }
            setIsCategoryModalOpen(false);
            loadCategories();
        } catch (error: any) {
            console.error('❌ Erro completo ao salvar categoria:', error);
            alert(`Erro ao salvar categoria: ${error.message || 'Verifique o console para mais detalhes.'}`);
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (confirm('Tem certeza? Isso não removerá os itens associados.')) {
            await DataService.deleteCategory(id);
            loadCategories();
        }
    };



    // --- Restock Handlers ---
    const handleRestockSearch = (term: string) => {
        setRestockSearch(term);
        // Find exact match first, or partial
        if (!term) {
            setSelectedRestockItem(null);
            return;
        }

        const match = items.find(i =>
            i.code.toLowerCase() === term.toLowerCase() ||
            (i.externalCode && i.externalCode.toLowerCase() === term.toLowerCase())
        );

        if (match) setSelectedRestockItem(match);
        else setSelectedRestockItem(null);
    };

    const handleRestockSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRestockItem || !restockQuantity) return;

        const qtyToAdd = Number(restockQuantity);
        if (qtyToAdd <= 0) return;

        try {
            const updatedItem = {
                ...selectedRestockItem,
                quantity: selectedRestockItem.quantity + qtyToAdd,
                lastRestockDate: new Date().toISOString()
            };

            await DataService.updateStockItem(updatedItem);

            // Log de Movimentação (Audit Trail)
            const user = await DataService.getCurrentUser();
            const tenantId = DataService.getCurrentTenantId();
            if (tenantId) {
                await DataService.getServiceClient().from('stock_movements').insert([{
                    tenant_id: tenantId,
                    stock_item_id: selectedRestockItem.id,
                    type: 'RESTOCK',
                    quantity: qtyToAdd,
                    source: 'FORNECEDOR',
                    destination: 'GENERAL',
                    created_by: user?.id
                }]);
            }

            // Reset
            setRestockQuantity('');
            setRestockSearch('');
            setSelectedRestockItem(null);
            alert(`Estoque atualizado! Nova quantidade: ${updatedItem.quantity}`);
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
            loadMovements();
        } catch (error) {
            alert('Erro ao atualizar estoque.');
        }
    };
    // Use Effect for filtering debounce and pagination
    useEffect(() => {
        if (activeTab !== 'items') return;

        const timer = setTimeout(() => {
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        }, 200);

        return () => {
            clearTimeout(timer);
            isFetching.current = false;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort('Component Unmount / Effect Cleanup');
            }
        };
    }, [currentPage, searchTerm, categoryFilter, statusFilter, activeTab, isAuthLoading, session]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, categoryFilter, statusFilter, activeTab]);

    const totalPages = Math.ceil(totalItemsCount / ITEMS_PER_PAGE);

    // 🔒 Auth Guard Render
    if (isAuthLoading) {
        return (
            <div className="flex items-center justify-center p-8 h-full">
                <Loader2 className="animate-spin text-primary-500 w-8 h-8" />
                <span className="ml-3 text-slate-500 font-medium">Validando sessão segura...</span>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex flex-col items-center justify-center p-8 h-full">
                <AlertTriangle className="text-rose-500 w-12 h-12 mb-4" />
                <h3 className="text-lg font-bold text-slate-800">Sessão Expirada</h3>
                <p className="text-sm text-slate-500 mb-6">Sua sessão caiu ou você não tem acesso a esta página.</p>
                <Button variant="primary" onClick={() => window.location.reload()}>Fazer Login</Button>
            </div>
        );
    }

    const calculateTotalCost = (item: any) => {
        const cost = Number(item.costPrice) || 0;
        const freight = Number(item.freightCost) || 0;
        const taxCost = Number(item.taxCost) || 0;

        // No banco salvamos o valor absoluto do imposto (tax_cost)
        // Se houver taxPercent no formulário, ele é usado no handleSubmit para calcular o taxCost.
        return cost + freight + taxCost;
    };

    const calculateMargin = (item: any) => {
        const totalCost = calculateTotalCost(item);
        const sell = Number(item.sellPrice) || 0;
        if (totalCost === 0) return 0;
        return ((sell - totalCost) / totalCost) * 100;
    };

    return (
        <div className="p-4 pr-8 animate-fade-in">
            <div className="mb-6 flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between pr-2">
                {/* Tabs */}
                <div className="flex bg-[#f8fafc] p-1.5 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/40 shrink-0 overflow-x-auto max-w-full">
                    <button onClick={() => setActiveTab('items')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'items' ? 'bg-[#1c2d4f] text-white shadow-lg shadow-primary-900/20' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}>
                        <List size={14} /> Itens em Estoque
                    </button>
                    <button onClick={() => setActiveTab('categories')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'categories' ? 'bg-[#10b981] text-white shadow-lg shadow-emerald-900/20' : 'text-slate-500 hover:text-emerald-600 hover:bg-white'}`}>
                        <Tag size={14} /> Categorias
                    </button>
                    <button onClick={() => setActiveTab('techs')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'techs' ? 'bg-[#f59e0b] text-white shadow-lg shadow-amber-900/20' : 'text-slate-500 hover:text-amber-600 hover:bg-white'}`}>
                        <Box size={14} /> Estoque Técnico
                    </button>
                    <button onClick={() => setActiveTab('movements')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'movements' ? 'bg-slate-800 text-white shadow-lg shadow-slate-900/20' : 'text-slate-500 hover:text-slate-800 hover:bg-white'}`}>
                        <Scale size={14} /> Auditoria / Logs
                    </button>
                </div>

                <div className="flex items-center gap-4 w-full lg:w-auto">
                    <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-md flex-1 lg:flex-none">
                        {activeTab === 'items' && (
                            <div className="flex items-center gap-3 pl-3 pr-2 border-r border-slate-100 hidden sm:flex">
                                <Search size={14} className="text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Localizar no estoque..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="bg-transparent text-[10px] font-bold uppercase text-slate-700 outline-none w-32 placeholder:text-slate-300"
                                />
                            </div>
                        )}

                        {activeTab === 'items' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors hidden md:flex">
                                <Filter size={12} className="text-slate-400" />
                                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-transparent text-[9px] font-black uppercase text-slate-600 outline-none cursor-pointer">
                                    <option value="ALL">Categoria</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => setIsRestockModalOpen(true)}
                                className="flex items-center gap-2 px-5 h-[38px] rounded-xl text-[10px] font-black uppercase shadow-lg shadow-primary-900/10 bg-[#1c2d4f] text-white hover:bg-[#253a66] hover:-translate-y-0.5 transition-all active:scale-95 whitespace-nowrap"
                            >
                                <Scale size={14} /> Entrada
                            </button>

                            {(activeTab === 'items' || activeTab === 'categories') && (
                                <button
                                    onClick={() => activeTab === 'items' ? handleOpenModal() : handleOpenCategoryModal()}
                                    className={`flex items-center gap-2 px-5 h-[38px] rounded-xl text-[10px] font-black uppercase shadow-lg hover:-translate-y-0.5 transition-all text-white active:scale-95 whitespace-nowrap ${activeTab === 'items' ? 'bg-[#10b981] shadow-emerald-900/10' : 'bg-[#1c2d4f] shadow-primary-900/10'}`}
                                >
                                    <Plus size={14} /> {activeTab === 'items' ? 'Novo Cadastro' : 'Nova Categoria'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">

                {activeTab === 'items' ? (
                    <>
                        {/* Items Table */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full border-separate border-spacing-y-0">
                                <thead className="sticky top-0 z-20 shadow-md">
                                    <tr className="bg-[#1c2d4f] text-[10px] font-black text-white uppercase tracking-[0.15em] text-left">
                                        <th className="px-6 py-5 first:rounded-tl-[2rem]">Identificação / SKU</th>
                                        <th className="px-6 py-5">Descrição do Produto</th>
                                        <th className="px-6 py-5">Localização</th>
                                        <th className="px-6 py-5 text-center">Saldo</th>
                                        <th className="px-6 py-5 text-right whitespace-nowrap">Avaliação Custo</th>
                                        <th className="px-6 py-5 text-right whitespace-nowrap">Venda Público</th>
                                        <th className="px-6 py-5 text-center">Rentabilidade</th>
                                        <th className="px-6 py-5 text-right pr-10 last:rounded-tr-[2rem]">Gestão</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {error ? (
                                        <tr>
                                            <td colSpan={8} className="py-20 text-center px-6">
                                                <div className="max-w-md mx-auto">
                                                    <AlertTriangle size={40} className="mx-auto text-rose-500 mb-4 animate-pulse" />
                                                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em] mb-2">Falha na Sincronização</p>
                                                    <p className="text-xs font-bold text-slate-500 mb-6">{error}</p>
                                                    <button
                                                        onClick={() => loadAll()}
                                                        className="px-8 py-3 bg-[#1c2d4f] text-white text-[10px] font-black uppercase rounded-[2rem] hover:bg-[#253a66] transition-all shadow-xl shadow-primary-900/20 active:scale-95 flex items-center gap-2 mx-auto"
                                                    >
                                                        <RefreshCw size={14} /> Tentar Reconectar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : loading ? (
                                        <tr>
                                            <td colSpan={8} className="py-20 text-center">
                                                <RefreshCw size={40} className="mx-auto text-primary-600 animate-spin mb-4" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Estoque...</p>
                                            </td>
                                        </tr>
                                    ) :
                                        items.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="py-20 text-center">
                                                    <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                                        <Package size={24} className="text-slate-300" />
                                                    </div>
                                                    <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Nenhum item localizado</p>
                                                </td>
                                            </tr>
                                        ) :
                                            items.map(item => {
                                                const totalCost = calculateTotalCost(item);
                                                const margin = calculateMargin(item);
                                                return (
                                                    <tr key={item.id} className="bg-white hover:bg-primary-50/40 transition-all border-b border-slate-200 last:border-0 group">
                                                        <td className="px-4 py-1.5">
                                                            <div className="flex flex-col truncate max-w-[100px]">
                                                                <span className="text-[12px] font-medium text-primary-600 truncate">{item?.code || '---'}</span>
                                                                {item?.externalCode && (
                                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                                                                        <Barcode size={10} className="shrink-0" /> {item.externalCode}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-1.5">
                                                            <p className="text-[13px] font-medium text-slate-700 truncate max-w-[180px]">{item?.description || 'Item sem descrição'}</p>
                                                            <div className="flex gap-1.5 overflow-hidden">
                                                                <span className="text-[11px] text-slate-400 truncate">{item?.category || '-'}</span>
                                                                <span className="text-[11px] text-slate-300 shrink-0">•</span>
                                                                <span className="text-[11px] text-slate-400 shrink-0">{item?.unit || 'UN'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-1.5 text-[12px] text-slate-500 truncate max-w-[100px]">{item?.location || '-'}</td>
                                                        <td className="px-4 py-1.5 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <span className={`text-[13px] font-semibold ${(item?.quantity || 0) <= (item?.minQuantity || 0) ? 'text-rose-500' : 'text-slate-700'}`}>{item?.quantity || 0}</span>
                                                                {(item?.quantity || 0) <= (item?.minQuantity || 0) && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-1.5 text-[12px] text-slate-500 text-right whitespace-nowrap">R$ {totalCost.toFixed(2)}</td>
                                                        <td className="px-4 py-1.5 text-[12px] text-slate-700 text-right whitespace-nowrap">R$ {(item?.sellPrice || 0).toFixed(2)}</td>
                                                        <td className="px-4 py-1.5">
                                                            <div className={`flex items-center justify-center gap-1 text-[12px] font-medium ${margin >= 30 ? 'text-emerald-500' : (margin > 0 ? 'text-amber-500' : 'text-rose-500')}`}>
                                                                {margin >= 0 ? <TrendingUp size={12} className="shrink-0" /> : <TrendingDown size={12} className="shrink-0" />}
                                                                {margin.toFixed(1)}%
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-1.5 text-right pr-4">
                                                            <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-all">
                                                                <button onClick={() => handleOpenModal(item)} className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95" title="Editar">
                                                                    <Edit3 size={16} />
                                                                </button>
                                                                <button onClick={() => handleDelete(item.id)} className="p-2.5 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-rose-100 transition-all active:scale-95" title="Excluir">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItemsCount}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={setCurrentPage}
                        />
                    </>
                ) : (
                    <div className="p-10 flex-1 overflow-auto custom-scrollbar">
                        {activeTab === 'categories' && (
                            <>
                                <h3 className="text-xl font-black text-slate-800 uppercase  mb-6 flex items-center gap-3">
                                    <Tag className="text-emerald-500" /> Gerenciar Categorias
                                </h3>
                                {categories.length === 0 ? (
                                    <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                        <Tag size={40} className="mx-auto text-slate-300 mb-4" />
                                        <p className="text-slate-400 font-bold uppercase text-xs">Nenhuma categoria encontrada.</p>
                                        <button onClick={() => handleOpenCategoryModal()} className="mt-4 text-emerald-600 font-black text-[10px] uppercase hover:underline">
                                            Criar Primeira Categoria
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {categories.map(cat => (
                                            <div key={cat.id} className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                                        <Layers size={18} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-slate-700 uppercase text-xs">{cat.name}</h4>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{cat.active ? 'Ativo' : 'Inativo'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 transition-opacity">
                                                    <button onClick={() => handleOpenCategoryModal(cat)} className="p-3 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95" title="Editar">
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-3 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-rose-100 transition-all active:scale-95" title="Excluir">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {activeTab === 'techs' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-black text-slate-800 uppercase  flex items-center gap-3">
                                        <Box className="text-amber-500" /> Estoque por Técnico
                                    </h3>
                                    <button
                                        onClick={() => setIsTransferModalOpen(true)}
                                        className="px-6 py-2.5 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20"
                                    >
                                        Nova Transferência
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                                    <div className="lg:col-span-1 space-y-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                            <input
                                                type="text"
                                                placeholder="Buscar colaborador..."
                                                value={techSearch}
                                                onChange={e => setTechSearch(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-amber-50 transition-all shadow-sm"
                                            />
                                        </div>
                                        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                            {techs
                                                .filter(t => t.name.toLowerCase().includes(techSearch.toLowerCase()))
                                                .map(t => (
                                                    <button
                                                        key={t.id}
                                                        onClick={async () => {
                                                            setSelectedTech(t);
                                                            const stock = await DataService.getTechStock(t.id);
                                                            setTechStock(stock);
                                                        }}
                                                        className={`w-full p-4 rounded-2xl border text-left transition-all group relative overflow-hidden ${selectedTech?.id === t.id ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200/50' : 'bg-white border-slate-100 hover:border-amber-200'}`}
                                                    >
                                                        {selectedTech?.id === t.id && (
                                                            <div className="absolute right-0 top-0 bottom-0 w-1 bg-amber-500" />
                                                        )}
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${selectedTech?.id === t.id ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                                {t.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <p className="text-[11px] font-black text-slate-800 uppercase leading-none mb-1">{t.name}</p>
                                                                <p className={`text-[8px] font-black uppercase tracking-wider ${t.role === 'ADMIN' ? 'text-rose-500' : 'text-slate-400'}`}>
                                                                    {t.role === 'ADMIN' ? 'Gestor' : 'Técnico'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                        </div>
                                    </div>
                                    <div className="lg:col-span-3">
                                        {selectedTech ? (
                                            <div className="space-y-4">
                                                <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-3xl p-6 text-white shadow-lg shadow-amber-500/20">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase opacity-80 mb-1">Responsável</p>
                                                            <h4 className="text-xl font-black uppercase tracking-tight">{selectedTech.name}</h4>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-black uppercase opacity-80 mb-1">Total de Itens</p>
                                                            <p className="text-2xl font-black">{techStock.length}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-lg shadow-slate-200/50">
                                                    <table className="w-full text-left">
                                                        <thead className="bg-slate-50 border-b border-slate-200">
                                                            <tr className="text-[11px] font-semibold text-slate-600 tracking-tight font-poppins">
                                                                <th className="px-6 py-4">Item Patrimonial</th>
                                                                <th className="px-6 py-4 text-center">Quantidade</th>
                                                                <th className="px-6 py-3 text-right">Avaliação Unit.</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {techStock.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={3} className="py-20 text-center">
                                                                        <div className="flex flex-col items-center gap-2 opacity-20">
                                                                            <Package size={40} />
                                                                            <p className="text-[10px] font-black uppercase tracking-widest">Sem carga ativa</p>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ) : techStock.map(ts => (
                                                                <tr key={ts.id} className="hover:bg-slate-50/50 transition-colors">
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{ts.item?.description}</span>
                                                                            <span className="text-[9px] font-bold text-slate-400">SKU: {ts.item?.code || 'S/N'}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-center">
                                                                        <span className="inline-flex items-center justify-center min-w-[32px] h-8 px-2 bg-slate-900 text-white rounded-xl text-[11px] font-black shadow-inner">
                                                                            {ts.quantity}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-right">
                                                                        <span className="text-[11px] font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                                                                            R$ {ts.item?.sellPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[40px] h-full min-h-[500px] flex flex-col items-center justify-center p-12 text-center group">
                                                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl shadow-slate-200/50 flex items-center justify-center text-slate-300 mb-6 group-hover:scale-110 transition-transform">
                                                    <Users size={32} />
                                                </div>
                                                <h5 className="text-slate-800 font-black uppercase text-sm mb-2">Aguardando Seleção</h5>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest max-w-[200px]">Selecione um colaborador ao lado para auditar sua carga de estoque</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'movements' && (() => {
                            const term = movSearch.toLowerCase();
                            const filtered = movements.filter(m => {
                                if (movTypeFilter !== 'ALL' && m.type !== movTypeFilter) return false;
                                if (movDateFrom) { const d = new Date(m.created_at); if (d < new Date(movDateFrom)) return false; }
                                if (movDateTo) { const d = new Date(m.created_at); const end = new Date(movDateTo); end.setHours(23, 59, 59); if (d > end) return false; }
                                if (term) {
                                    const haystack = [
                                        m.stock_items?.description, m.stock_items?.code,
                                        m.technician?.name, m.executor?.name,
                                        m.reference_id, m.source, m.destination
                                    ].filter(Boolean).join(' ').toLowerCase();
                                    if (!haystack.includes(term)) return false;
                                }
                                return true;
                            }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                            return (
                                <div className="space-y-6">
                                    <h3 className="text-xl font-black text-slate-800 uppercase flex items-center gap-3">
                                        <Scale className="text-slate-800" /> Auditoria de Movimentações
                                    </h3>
                                    {/* Filtros */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="relative flex-1 min-w-[180px]">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                            <input
                                                type="text" placeholder="Buscar item, técnico, OS..."
                                                value={movSearch} onChange={e => setMovSearch(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary-100 transition-all shadow-sm"
                                            />
                                        </div>
                                        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 shadow-lg shadow-slate-200/50 h-[38px]">
                                            <Filter size={12} className="text-slate-400 mr-2" />
                                            <select value={movTypeFilter} onChange={e => setMovTypeFilter(e.target.value)} className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer">
                                                <option value="ALL">Todos Tipos</option>
                                                <option value="TRANSFER">Transferência</option>
                                                <option value="CONSUMPTION">Consumo</option>
                                                <option value="RESTOCK">Entrada</option>
                                                <option value="RETURN">Devolução</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input type="date" value={movDateFrom} onChange={e => handleDateValidation(e.target.value, movDateTo)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-600 outline-none focus:ring-4 focus:ring-primary-100 shadow-sm h-[38px]" />
                                            <span className="text-[9px] font-black text-slate-400">ATÉ</span>
                                            <input type="date" value={movDateTo} onChange={e => handleDateValidation(movDateFrom, e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-600 outline-none focus:ring-4 focus:ring-primary-100 shadow-sm h-[38px]" />
                                        </div>
                                        {(movSearch || movTypeFilter !== 'ALL' || movDateFrom || movDateTo) && (
                                            <button onClick={() => { setMovSearch(''); setMovTypeFilter('ALL'); setMovDateFrom(''); setMovDateTo(''); }} className="px-3 py-1.5 text-[9px] font-bold uppercase text-slate-400 hover:text-rose-500 transition-colors">
                                                Limpar
                                            </button>
                                        )}
                                        <span className="text-[9px] font-bold text-slate-400 ml-auto">{filtered.length} registro(s)</span>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr className="text-[10px] font-black text-slate-500 uppercase">
                                                    <th className="px-6 py-1.5 text-center">Data</th>
                                                    <th className="px-6 py-1.5 text-center">Tipo</th>
                                                    <th className="px-6 py-1.5">Item</th>
                                                    <th className="px-6 py-1.5 text-center">Qtd.</th>
                                                    <th className="px-6 py-1.5">Técnico / Admin</th>
                                                    <th className="px-6 py-1.5">Referência (OS/ORC)</th>
                                                    <th className="px-6 py-1.5 text-center">Fluxo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filtered.length === 0 ? (
                                                    <tr><td colSpan={7} className="py-16 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhuma movimentação encontrada</td></tr>
                                                ) : filtered.map(m => (
                                                    <tr key={m.id} className="text-[11px] hover:bg-slate-50/50">
                                                        <td className="px-6 py-1.5 text-center text-slate-500 font-bold">{new Date(m.created_at).toLocaleString('pt-BR')}</td>
                                                        <td className="px-6 py-1.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${m.type === 'TRANSFER' ? 'bg-primary-50 text-primary-600' :
                                                                m.type === 'CONSUMPTION' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-emerald-50 text-emerald-600'
                                                                }`}>
                                                                {m.type === 'TRANSFER' ? 'Transferência' : m.type === 'CONSUMPTION' ? 'Consumo' : m.type === 'RETURN' ? 'Devolução' : 'Entrada'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-1.5">
                                                            <p className="font-black text-slate-800 uppercase ">{m.stock_items?.description}</p>
                                                            <p className="text-[9px] text-slate-400">Cód: {m.stock_items?.code}</p>
                                                        </td>
                                                        <td className="px-6 py-1.5 text-center font-bold text-slate-900">{m.quantity}</td>
                                                        <td className="px-6 py-1.5">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-700 uppercase truncate max-w-[120px]">{m.technician?.name || m.executor?.name || '-'}</span>
                                                                {m.executor?.name && m.executor.name !== m.technician?.name && (
                                                                    <span className="text-[9px] text-slate-400 italic">Por: {m.executor.name}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-1.5">
                                                            <span className="font-black text-primary-600 text-[10px]">{m.reference_id || '-'}</span>
                                                        </td>
                                                        <td className="px-6 py-1.5 text-center text-[10px] font-bold text-slate-400 ">
                                                            {m.source} → {m.destination}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* RESTOCK MODAL */}
            {isRestockModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up border border-white/50">
                        <div className="px-8 py-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-black text-slate-800 uppercase  flex items-center gap-2">
                                <Package className="text-primary-600" size={20} /> Entrada Rápida
                            </h2>
                            <button onClick={() => setIsRestockModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Buscar Item (Cód. Interno ou Fabricante)</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        autoFocus
                                        value={restockSearch}
                                        onChange={e => handleRestockSearch(e.target.value)}
                                        placeholder="Digite o código exato..."
                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 text-slate-700 font-bold outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                                    />
                                </div>
                            </div>

                            {selectedRestockItem ? (
                                <div className="bg-primary-50/50 rounded-2xl p-6 border border-primary-100 space-y-4 animate-fade-in">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-black text-slate-700 uppercase text-sm">{selectedRestockItem.description}</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Cód: {selectedRestockItem.code} • Atual: {selectedRestockItem.quantity} {selectedRestockItem.unit}</p>
                                        </div>
                                        <div className="px-3 py-1 bg-white rounded-lg border border-primary-100 text-[10px] font-black text-primary-600 shadow-sm">
                                            ITEM ENCONTRADO
                                        </div>
                                    </div>

                                    <form onSubmit={handleRestockSubmit} className="pt-4 border-t border-primary-100/50 flex items-end gap-3">
                                        <div className="flex-1 space-y-1.5">
                                            <label className="text-[9px] font-black text-primary-400 uppercase tracking-widest">Qtd. Entrada (+)</label>
                                            <input
                                                type="number"
                                                value={restockQuantity}
                                                onChange={e => setRestockQuantity(e.target.value)}
                                                className="w-full px-4 py-2 rounded-xl border border-primary-200 text-primary-900 font-black outline-none focus:ring-2 focus:ring-primary-200"
                                                placeholder="0"
                                                min="1"
                                                required
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-primary-600/20 transition-all active:scale-95"
                                        >
                                            Confirmar Entrada
                                        </button>
                                    </form>
                                </div>
                            ) : restockSearch && (
                                <div className="text-center py-8 text-slate-400">
                                    <p className="text-xs font-bold uppercase">Nenhum item encontrado com este código.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ITEM MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 animate-fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-[95vw] lg:max-w-6xl h-[92vh] shadow-2xl overflow-hidden animate-scale-up border border-slate-200 flex flex-col">
                        {/* MODAL HEADER */}
                        <div className="px-10 py-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-[#1c2d4f] border border-slate-200 shadow-sm">
                                    <Package size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">
                                        {editingItem ? `Editar Item: ${editingItem.code}` : 'Novo Cadastro de Produto'}
                                    </h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                        Nexus Gestão de Materiais • Estoque Geral
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-3 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all border border-slate-200 hover:border-rose-200 shadow-sm"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* MODAL BODY */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30">
                            <form onSubmit={handleSubmit} id="stock-item-form" className="p-10">
                                <div className="grid grid-cols-12 gap-8 max-w-6xl mx-auto">
                                    {/* LEFT COLUMN: IDENTIFICATION & LOGISTICS */}
                                    <div className="col-span-12 lg:col-span-7 space-y-8">
                                        {/* SECTION: IDENTIFICAÇÃO */}
                                        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-lg shadow-slate-200/50 space-y-6">
                                            <h3 className="text-sm font-black text-slate-900 border-l-4 border-[#1c2d4f] pl-3 uppercase">Informações Básicas</h3>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código Interno (SKU)</label>
                                                    <div className="relative group">
                                                        <Input
                                                            value={formData.code}
                                                            onChange={e => setFormData({ ...formData, code: e.target.value })}
                                                            className="rounded-xl border-slate-200 font-bold bg-slate-50/50 focus:bg-white pr-12 h-12"
                                                            required
                                                            placeholder="Ex: STK-00001"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={generateCode}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 p-2 hover:bg-primary-50 rounded-lg transition-all"
                                                            title="Gerar Cód. Aleatório"
                                                        >
                                                            <Wand2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ref. Fabricante / Código Externo</label>
                                                    <Input
                                                        value={formData.externalCode}
                                                        onChange={e => setFormData({ ...formData, externalCode: e.target.value })}
                                                        className="rounded-xl border-slate-200 font-bold bg-slate-50/50 focus:bg-white h-12"
                                                        placeholder="EAN / Part Number..."
                                                        icon={<Barcode size={16} className="text-slate-400" />}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome / Descrição Detalhada</label>
                                                <Input
                                                    value={formData.description}
                                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                    className="rounded-xl border-slate-200 font-black bg-white h-14 text-sm shadow-inner"
                                                    required
                                                    placeholder="Digite o nome completo do produto ou peça..."
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria de Estoque</label>
                                                    <select
                                                        value={formData.category}
                                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-[11px] font-black text-slate-700 focus:ring-4 focus:ring-primary-100 focus:border-[#1c2d4f] transition-all outline-none uppercase cursor-pointer"
                                                    >
                                                        <option value="">Sem Categoria Definida</option>
                                                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade de Controle</label>
                                                    <select
                                                        value={formData.unit}
                                                        onChange={e => setFormData({ ...formData, unit: e.target.value as any })}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-[11px] font-black text-slate-700 focus:ring-4 focus:ring-primary-100 focus:border-[#1c2d4f] transition-all outline-none uppercase cursor-pointer"
                                                    >
                                                        <option value="UN">Unidade (UN)</option>
                                                        <option value="CX">Caixa (CX)</option>
                                                        <option value="PCT">Pacote (PCT)</option>
                                                        <option value="M">Metros (M)</option>
                                                        <option value="KG">Quilos (KG)</option>
                                                        <option value="G">Gramas (G)</option>
                                                        <option value="L">Litros (L)</option>
                                                        <option value="ML">Mililitros (ML)</option>
                                                        <option value="PAR">Par (PAR)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECTION: ARMAZENAMENTO */}
                                        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-lg shadow-slate-200/50 space-y-6">
                                            <h3 className="text-sm font-black text-slate-900 border-l-4 border-amber-500 pl-3 uppercase">Controle e Localização</h3>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço / Localização</label>
                                                    <Input
                                                        value={formData.location}
                                                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                                                        className="rounded-xl border-slate-200 font-bold h-12"
                                                        placeholder="Ex: A-10 / P-02"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo em Estoque</label>
                                                    <div className="relative">
                                                        <Input
                                                            type="number"
                                                            value={formData.quantity}
                                                            onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                                            onFocus={(e) => e.target.select()}
                                                            className="rounded-xl border-slate-200 font-black h-12 text-center text-lg bg-slate-50"
                                                            required
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">{formData.unit}</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alerta de Reposição</label>
                                                    <div className="relative">
                                                        <Input
                                                            type="number"
                                                            value={formData.minQuantity}
                                                            onChange={e => setFormData({ ...formData, minQuantity: e.target.value })}
                                                            onFocus={(e) => e.target.select()}
                                                            className="rounded-xl border-rose-200 font-black h-12 text-center text-lg text-rose-600 bg-rose-50/30"
                                                        />
                                                        <AlertTriangle size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-400" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: FINANCIAL / SIDEBAR STYLE */}
                                    <div className="col-span-12 lg:col-span-5 space-y-8 flex flex-col">
                                        <div className="bg-[#1c2d4f] p-10 rounded-[2.5rem] text-white shadow-2xl shadow-primary-900/40 relative overflow-hidden flex-1 flex flex-col gap-8">
                                            {/* Decorative Background */}
                                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                                <DollarSign size={120} />
                                            </div>
                                            
                                            <div className="relative z-10 space-y-8 flex-1">
                                                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary-300 border-b border-white/10 pb-4 flex items-center gap-3">
                                                    <DollarSign size={16} /> Composição Financeira
                                                </h3>

                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between group">
                                                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Preço de Compra</span>
                                                        <div className="relative flex-1 max-w-[160px]">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[10px] text-white/40">R$</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={formData.costPrice}
                                                                onChange={e => setFormData({ ...formData, costPrice: e.target.value })}
                                                                onFocus={(e) => e.target.select()}
                                                                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs font-black text-white outline-none focus:bg-white/20 focus:border-primary-400 transition-all text-right"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between group">
                                                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Frete / Logística</span>
                                                        <div className="relative flex-1 max-w-[160px]">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[10px] text-white/40">R$</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={formData.freightCost}
                                                                onChange={e => setFormData({ ...formData, freightCost: e.target.value })}
                                                                onFocus={(e) => e.target.select()}
                                                                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs font-black text-white outline-none focus:bg-white/20 focus:border-primary-400 transition-all text-right"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between group">
                                                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Impostos (%)</span>
                                                        <div className="relative flex-1 max-w-[160px]">
                                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-[10px] text-white/40">%</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={formData.taxPercent}
                                                                onChange={e => setFormData({ ...formData, taxPercent: e.target.value })}
                                                                onFocus={(e) => e.target.select()}
                                                                className="w-full bg-white/10 border border-white/10 rounded-xl pl-4 pr-8 py-3 text-xs font-black text-white outline-none focus:bg-white/20 focus:border-primary-400 transition-all text-right"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="pt-8 border-t border-white/10 mt-2">
                                                        <div className="flex justify-between items-center bg-white/10 p-5 rounded-2xl border border-white/5">
                                                            <span className="text-[10px] font-black text-primary-200 uppercase tracking-widest">Custo Operacional Total</span>
                                                            <span className="text-xl font-black text-white tracking-tight">
                                                                R$ {calculateTotalCost(formData).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-6 pt-10">
                                                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 border-b border-white/10 pb-4 flex items-center gap-3">
                                                        <TrendingUp size={16} /> Preço Final de Venda
                                                    </h3>

                                                    <div className="relative">
                                                        <label className="absolute -top-2.5 left-4 px-2 text-[9px] font-black text-emerald-400 uppercase tracking-widest z-10 bg-[#1c2d4f]">Marcação de Mercado</label>
                                                        <div className="relative">
                                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-emerald-400 opacity-50">R$</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={formData.sellPrice}
                                                                onChange={e => setFormData({ ...formData, sellPrice: e.target.value })}
                                                                onFocus={(e) => e.target.select()}
                                                                className="w-full pl-16 pr-8 py-6 rounded-[1.5rem] border-2 border-emerald-500/30 bg-white/5 text-3xl font-black text-emerald-400 outline-none focus:border-emerald-500 focus:bg-white/10 transition-all text-right"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl">
                                                        <div>
                                                            <p className="text-[10px] font-black text-emerald-400/70 uppercase mb-1">Margem Real Estimada</p>
                                                            <p className="text-2xl font-black text-emerald-400">{calculateMargin(formData).toFixed(2)}%</p>
                                                        </div>
                                                        <div className={`p-3 rounded-xl ${calculateMargin(formData) > 30 ? 'bg-emerald-500 text-white' : (calculateMargin(formData) > 0 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white')}`}>
                                                            {calculateMargin(formData) >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="shrink-0 pt-8 mt-auto flex flex-col gap-4">
                                                <button
                                                    type="submit"
                                                    className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl bg-emerald-500 text-white hover:bg-emerald-600 hover:-translate-y-1 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-emerald-900/40"
                                                >
                                                    <Save size={20} /> Efetivar Registro
                                                </button>
                                                <p className="text-[8px] text-center text-white/30 uppercase font-black tracking-widest">Certificado Duno Audit Trail • 2026</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* CATEGORY MODAL */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 sm:pt-20 animate-fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-scale-up border border-white/50">
                        <div className="px-8 py-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
                                    <Tag size={20} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                                        {editingCategory ? 'Modificar Categoria' : 'Nova Classificação'}
                                    </h2>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                        Nexus Organizational Structure
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCategorySubmit} className="p-8 space-y-6">
                            <div className="space-y-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nome da Categoria</span>
                                <Input
                                    value={categoryFormData.name}
                                    onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                    className="rounded-xl font-bold"
                                    placeholder="Ex: Elétrica, Hidráulica..."
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="pt-2 flex justify-end gap-3">
                                <Button type="button" onClick={() => setIsCategoryModalOpen(false)} variant="ghost" className="text-xs">
                                    Cancelar
                                </Button>
                                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-6 rounded-xl">
                                    Salvar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* TRANSFER MODAL */}
            {isTransferModalOpen && (
                <div className="fixed inset-0 z-[203] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up border border-white/50">
                        <div className="px-8 py-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-black text-slate-800 uppercase  flex items-center gap-2">
                                <Scale className="text-amber-600" size={20} /> Transferência Provisória
                            </h2>
                            <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form className="p-8 space-y-6" onSubmit={async (e) => {
                            e.preventDefault();
                            if (!transferData.itemId || !transferData.techId || !transferData.quantity) return;
                            try {
                                if (transferData.direction === 'return') {
                                    await DataService.returnFromTech(transferData.techId, transferData.itemId, Number(transferData.quantity));
                                    alert('Item devolvido ao estoque geral com sucesso!');
                                } else {
                                    await DataService.transferToTech(transferData.techId, transferData.itemId, Number(transferData.quantity));
                                    alert('Transferência ao técnico concluída!');
                                }
                                setIsTransferModalOpen(false);
                                loadItems();
                                loadMovements();
                                if (selectedTech?.id === transferData.techId) {
                                    const stock = await DataService.getTechStock(selectedTech.id);
                                    setTechStock(stock);
                                }
                            } catch (error: any) {
                                alert(error.message || 'Erro ao transferir.');
                            }
                        }}>
                            <div className="space-y-4">

                                {/* Seleção de Direção da Operação */}
                                <div className="flex bg-slate-100 p-1.5 rounded-xl">
                                    <button
                                        type="button"
                                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${transferData.direction === 'transfer' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        onClick={() => setTransferData({ ...transferData, direction: 'transfer' })}
                                    >
                                        Enviar para Técnico
                                    </button>
                                    <button
                                        type="button"
                                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${transferData.direction === 'return' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        onClick={() => setTransferData({ ...transferData, direction: 'return' })}
                                    >
                                        Devolver ao Estoque Geral
                                    </button>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Item Envolvido</label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100"
                                        value={transferData.itemId}
                                        onChange={e => setTransferData({ ...transferData, itemId: e.target.value })}
                                    >
                                        <option value="">Selecione o Item</option>
                                        {items.map(i => (
                                            <option key={i.id} value={i.id}>{i.description} {transferData.direction === 'transfer' ? `(${i.quantity} ${i.unit} disp. no Geral)` : ''}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Técnico Envolvido</label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100"
                                        value={transferData.techId}
                                        onChange={e => setTransferData({ ...transferData, techId: e.target.value })}
                                    >
                                        <option value="">Selecione o Técnico</option>
                                        {techs.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Quantidade a Transferir</label>
                                    <input
                                        type="number"
                                        required
                                        min="0.1"
                                        step="0.1"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100"
                                        value={transferData.quantity}
                                        onChange={e => setTransferData({ ...transferData, quantity: e.target.value })}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black uppercase text-xs  tracking-widest shadow-xl shadow-amber-500/20 transition-all active:scale-95"
                            >
                                Confirmar Envio ao Técnico
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
