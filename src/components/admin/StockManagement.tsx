
import React, { useState, useEffect, useMemo } from 'react';
import { Package, Search, Plus, Edit3, Trash2, X, Save, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Scale, Box, Barcode, Filter, Wand2, Layers, Tag, LayoutGrid, List, RefreshCw, ChevronLeft } from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { StockItem, Category } from '../../types';
import { DataService } from '../../services/dataService';
import { TenantService } from '../../services/tenantService';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

export const StockManagement: React.FC = () => {
    // Application State
    const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'techs' | 'movements'>('items');

    // --- Items State ---
    const [items, setItems] = useState<StockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

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
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferData, setTransferData] = useState({ itemId: '', techId: '', quantity: '' });

    // --- Loaders ---
    const loadItems = async () => {
        setLoading(true);
        const timeoutId = setTimeout(() => {
            setLoading(false);
            console.warn('[Stock] ⚠️ Load timeout - forcing spinner stop');
        }, 30000);

        try {
            await import('../../lib/supabase').then(m => m.ensureValidSession());
            const data = await DataService.getStockItems();
            setItems(data);
        } catch (error) {
            console.error('Erro ao carregar estoque:', error);
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            const data = await DataService.getCategories();
            setCategories(data);
            setAvailableCategories(data);
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    };

    const loadTechs = async () => {
        try {
            const tenantId = DataService.getCurrentTenantId();
            if (!tenantId) return;
            const data = await TenantService.getTenantUsers(tenantId);
            setTechs(data.filter((u: any) => u.role === 'TECHNICIAN' || u.role === 'ADMIN'));
        } catch (error) {
            console.error('Erro ao carregar técnicos:', error);
        }
    };

    const loadMovements = async () => {
        try {
            const data = await DataService.getMovements();
            setMovements(data);
        } catch (error) {
            console.error('Erro ao carregar movimentações:', error);
        }
    };

    useEffect(() => {
        const init = async () => {
            const user = await DataService.getCurrentUser();
            const tid = user?.tenantId;

            if (tid) {
                loadItems();
                loadCategories();
                loadTechs();
                loadMovements();
            } else {
                console.warn("🛡️ [StockManagement] Tenant ID não detectado. Aguardando sincronização...");
                // Retry logic safely
                setTimeout(async () => {
                    const retryUser = await DataService.getCurrentUser();
                    if (retryUser?.tenantId) {
                        loadItems();
                        loadCategories();
                        loadTechs();
                        loadMovements();
                    }
                }, 1000);
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
        } catch (error) {
            alert('Erro ao salvar item.');
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
            loadItems();
            loadMovements();
        } catch (error) {
            alert('Erro ao atualizar estoque.');
        }
    };
    const filteredItems = useMemo(() => {
        return items.filter(i => {
            const matchesSearch = i.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                i.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (i.externalCode && i.externalCode.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesCategory = categoryFilter === 'ALL' || i.category === categoryFilter;

            let matchesStatus = true;
            if (statusFilter === 'LOW') matchesStatus = i.quantity <= i.minQuantity && i.quantity > 0;
            else if (statusFilter === 'OUT') matchesStatus = i.quantity === 0;
            else if (statusFilter === 'GOOD') matchesStatus = i.quantity > i.minQuantity;

            return matchesSearch && matchesCategory && matchesStatus;
        });
    }, [items, searchTerm, categoryFilter, statusFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, categoryFilter, statusFilter, activeTab]);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

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
        <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">
            {/* Toolbar Externa */}
            <div className="mb-2 flex flex-col xl:flex-row gap-3 items-center">
                {/* Tabs */}
                <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-sm flex-shrink-0">
                    <button onClick={() => setActiveTab('items')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'items' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                        <List size={14} /> Itens
                    </button>
                    <button onClick={() => setActiveTab('categories')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'categories' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Tag size={14} /> Categorias
                    </button>
                    <button onClick={() => setActiveTab('techs')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'techs' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Box size={14} /> Estoque Técnico
                    </button>
                    <button onClick={() => setActiveTab('movements')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'movements' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Scale size={14} /> Movimentações
                    </button>
                </div>

                {/* Search */}
                {activeTab === 'items' ? (
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Pesquisar estoque..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-6 py-2.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary-100 transition-all shadow-sm"
                        />
                    </div>
                ) : <div className="flex-1"></div>}

                {/* Filters & Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 w-full xl:w-auto justify-end">
                    {activeTab === 'items' && (
                        <>
                            <div className="hidden lg:flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-[42px]">
                                <Filter size={14} className="text-slate-400 mr-2" />
                                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none max-w-[100px] cursor-pointer">
                                    <option value="ALL">Categorias</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="hidden lg:flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-[42px]">
                                <AlertTriangle size={14} className="text-slate-400 mr-2" />
                                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer">
                                    <option value="ALL">Status</option>
                                    <option value="GOOD">Regular</option>
                                    <option value="LOW">Baixo</option>
                                    <option value="OUT">Zerado</option>
                                </select>
                            </div>
                            <button
                                onClick={() => { setSearchTerm(''); setCategoryFilter('ALL'); setStatusFilter('ALL'); }}
                                className="hidden lg:block px-4 py-2 text-[9px] font-bold uppercase text-slate-400 hover:text-[#1c2d4f] transition-colors"
                            >
                                Limpar
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => activeTab === 'items' ? handleOpenModal() : handleOpenCategoryModal()}
                        className={`flex items-center gap-2 px-6 h-[42px] rounded-xl text-[10px] font-bold uppercase shadow-sm hover:-translate-y-0.5 transition-all text-white active:scale-95 whitespace-nowrap ${activeTab === 'items' ? 'bg-[#1c2d4f] hover:bg-[#253a66]' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                        <Plus size={16} /> {activeTab === 'items' ? 'Novo Item' : 'Nova Categoria'}
                    </button>
                </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">

                {activeTab === 'items' ? (
                    <>
                        {/* Items Table */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full border-separate border-spacing-y-0">
                                <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b border-slate-100 shadow-sm">
                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                                        <th className="px-4 py-2">Item</th>
                                        <th className="px-4 py-2">Descrição</th>
                                        <th className="px-4 py-2">Localização</th>
                                        <th className="px-4 py-2 text-center">Qtd.</th>
                                        <th className="px-4 py-2 text-right whitespace-nowrap">Custo Total</th>
                                        <th className="px-4 py-2 text-right">Venda</th>
                                        <th className="px-4 py-2 text-center">Margem</th>
                                        <th className="px-4 py-2 text-right pr-6">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={8} className="py-20 text-center">
                                                <RefreshCw size={40} className="mx-auto text-primary-600 animate-spin mb-4" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Estoque...</p>
                                            </td>
                                        </tr>
                                    ) : paginatedItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-20 text-center">
                                                <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                                    <Package size={24} className="text-slate-300" />
                                                </div>
                                                <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Nenhum item localizado</p>
                                            </td>
                                        </tr>
                                    ) :
                                        paginatedItems.map(item => {
                                            const totalCost = calculateTotalCost(item);
                                            const margin = calculateMargin(item);
                                            return (
                                                <tr key={item.id} className="bg-white hover:bg-primary-50/40 transition-all border-b border-slate-50 last:border-0 group">
                                                    <td className="px-4 py-1.5">
                                                        <div className="flex flex-col truncate max-w-[100px]">
                                                            <span className="text-[10px] font-black text-primary-600 uppercase truncate">{item?.code || '---'}</span>
                                                            {item?.externalCode && (
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1 truncate">
                                                                    <Barcode size={10} className="shrink-0" /> {item.externalCode}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-1.5">
                                                        <p className="text-[11px] font-bold text-slate-700 uppercase truncate max-w-[180px]">{item?.description || 'Item sem descrição'}</p>
                                                        <div className="flex gap-1.5 overflow-hidden">
                                                            <span className="text-[9px] text-slate-400 font-bold uppercase truncate">{item?.category || '-'}</span>
                                                            <span className="text-[9px] text-slate-300 font-bold uppercase shrink-0">•</span>
                                                            <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">{item?.unit || 'UN'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase truncate max-w-[100px]">{item?.location || '-'}</td>
                                                    <td className="px-4 py-1.5 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <span className={`text-[11px] font-black ${(item?.quantity || 0) <= (item?.minQuantity || 0) ? 'text-rose-500' : 'text-slate-700'}`}>{item?.quantity || 0}</span>
                                                            {(item?.quantity || 0) <= (item?.minQuantity || 0) && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-1.5 text-[10px] font-bold text-slate-500 text-right whitespace-nowrap">R$ {totalCost.toFixed(2)}</td>
                                                    <td className="px-4 py-1.5 text-[10px] font-bold text-slate-700 text-right whitespace-nowrap">R$ {(item?.sellPrice || 0).toFixed(2)}</td>
                                                    <td className="px-4 py-1.5">
                                                        <div className={`flex items-center justify-center gap-1 text-[10px] font-black ${margin >= 30 ? 'text-emerald-500' : (margin > 0 ? 'text-amber-500' : 'text-rose-500')}`}>
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
                            totalItems={filteredItems.length}
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
                                            <div key={cat.id} className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
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

                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                    <div className="lg:col-span-1 space-y-2">
                                        {techs.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={async () => {
                                                    setSelectedTech(t);
                                                    const stock = await DataService.getTechStock(t.id);
                                                    setTechStock(stock);
                                                }}
                                                className={`w-full p-4 rounded-2xl border text-left transition-all ${selectedTech?.id === t.id ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-white border-slate-100 hover:border-amber-200'}`}
                                            >
                                                <p className="text-xs font-black text-slate-800 uppercase ">{t.name}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">{t.role === 'ADMIN' ? 'Administrador' : 'Técnico de Campo'}</p>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="lg:col-span-3">
                                        {selectedTech ? (
                                            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden min-h-[400px]">
                                                <table className="w-full text-left">
                                                    <thead className="bg-slate-50 border-b border-slate-200">
                                                        <tr className="text-[10px] font-black text-slate-500 uppercase">
                                                            <th className="px-6 py-1.5">Item</th>
                                                            <th className="px-6 py-1.5">Quantidade</th>
                                                            <th className="px-6 py-1.5 text-right">Valor Unit.</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {techStock.length === 0 ? (
                                                            <tr><td colSpan={3} className="p-10 text-center text-[10px] font-bold text-slate-400 uppercase ">Nenhum item em mãos</td></tr>
                                                        ) : techStock.map(ts => (
                                                            <tr key={ts.id}>
                                                                <td className="px-6 py-1.5">
                                                                    <p className="text-[11px] font-black text-slate-800 uppercase ">{ts.item?.description}</p>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Cód: {ts.item?.code}</p>
                                                                </td>
                                                                <td className="px-6 py-1.5">
                                                                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[11px] font-black">{ts.quantity}</span>
                                                                </td>
                                                                <td className="px-6 py-1.5 text-right">
                                                                    <span className="text-[11px] font-black text-slate-700">R$ {ts.item?.sellPrice?.toFixed(2)}</span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="h-full flex items-center justify-center p-20 text-center">
                                                <p className="text-xs font-black text-slate-300 uppercase  tracking-widest">Selecione um técnico para ver o estoque</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'movements' && (
                            <div className="space-y-6">
                                <h3 className="text-xl font-black text-slate-800 uppercase  flex items-center gap-3">
                                    <Scale className="text-slate-800" /> Auditoria de Movimentações
                                </h3>
                                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr className="text-[10px] font-black text-slate-500 uppercase">
                                                <th className="px-6 py-1.5 text-center">Data</th>
                                                <th className="px-6 py-1.5 text-center">Tipo</th>
                                                <th className="px-6 py-1.5">Item</th>
                                                <th className="px-6 py-1.5 text-center">Qtd.</th>
                                                <th className="px-6 py-1.5 text-center">Fluxo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {movements.map(m => (
                                                <tr key={m.id} className="text-[11px]">
                                                    <td className="px-6 py-1.5 text-center text-slate-500 font-bold">{new Date(m.created_at).toLocaleString()}</td>
                                                    <td className="px-6 py-1.5 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${m.type === 'TRANSFER' ? 'bg-primary-50 text-primary-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            {m.type === 'TRANSFER' ? 'Transferência' : 'Consumo'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-1.5">
                                                        <p className="font-black text-slate-800 uppercase ">{m.stock_items?.description}</p>
                                                    </td>
                                                    <td className="px-6 py-1.5 text-center font-bold text-slate-900">{m.quantity}</td>
                                                    <td className="px-6 py-1.5 text-center text-[10px] font-bold text-slate-400 ">
                                                        {m.source} → {m.destination}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* RESTOCK MODAL */}
            {isRestockModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up border border-white/50">
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
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
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 sm:p-8 animate-fade-in">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-[95vw] lg:max-w-6xl shadow-2xl overflow-hidden animate-scale-up border border-white/50 flex flex-col max-h-[90vh]">
                        <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary-600/20">
                                    <Package size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter  leading-none">{editingItem ? 'Editar Item' : 'Novo Item'}</h2>
                                    <p className="text-[10px] font-black text-primary-500 uppercase tracking-widest mt-1 ">Cadastro de Estoque</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all shadow-sm"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-10 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-12 gap-8">
                                <div className="col-span-12 lg:col-span-7 space-y-8">
                                    <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-6">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest  flex items-center gap-2"><Box size={14} /> Identificação</h3>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-1.5">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Código Interno</span>
                                                <div className="relative">
                                                    <Input
                                                        value={formData.code}
                                                        onChange={e => setFormData({ ...formData, code: e.target.value })}
                                                        className="rounded-xl border-slate-200 font-bold bg-white pr-10"
                                                        required
                                                        placeholder="Ex: NEX-001"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={generateCode}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                                                        title="Gerar Código Automático"
                                                    >
                                                        <Wand2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Cód. Terceiro / Fabricante</span>
                                                <Input
                                                    value={formData.externalCode}
                                                    onChange={e => setFormData({ ...formData, externalCode: e.target.value })}
                                                    className="rounded-xl border-slate-200 font-bold bg-white text-slate-600"
                                                    placeholder="Ref. Fabricante..."
                                                    icon={<Barcode size={14} className="text-slate-300" />}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Descrição do Produto</span>
                                            <Input
                                                value={formData.description}
                                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                className="rounded-xl border-slate-200 font-bold bg-white text-lg"
                                                required
                                                placeholder="Nome completo do item..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-1.5">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Categoria</span>
                                                <select
                                                    value={formData.category}
                                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all uppercase"
                                                >
                                                    <option value="">Sem Categoria</option>
                                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                </select>
                                                {/* Fallback to text input if user wants to type? Maybe not for strict data. Keeping select for now. */}
                                            </div>
                                            <div className="space-y-1.5">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Unidade de Medida</span>
                                                <select
                                                    value={formData.unit}
                                                    onChange={e => setFormData({ ...formData, unit: e.target.value as any })}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all uppercase"
                                                >
                                                    <option value="UN">Unidade (UN)</option>
                                                    <option value="CX">Caixa (CX)</option>
                                                    <option value="PCT">Pacote (PCT)</option>
                                                    <option value="M">Metros (M)</option>
                                                    <option value="CM">Centímetros (CM)</option>
                                                    <option value="KG">Quilos (KG)</option>
                                                    <option value="G">Gramas (G)</option>
                                                    <option value="L">Litros (L)</option>
                                                    <option value="ML">Mililitros (ML)</option>
                                                    <option value="M2">Metros² (M²)</option>
                                                    <option value="M3">Metros³ (M³)</option>
                                                    <option value="PAR">Par (PAR)</option>
                                                    <option value="CJ">Conjunto (CJ)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-6">
                                        <div className="space-y-1.5">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Localização</span>
                                            <Input
                                                value={formData.location}
                                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                                                className="rounded-xl border-slate-200 font-bold"
                                                placeholder="Corredor / Prateleira"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Qtd Atual</span>
                                            <Input
                                                type="number"
                                                value={formData.quantity}
                                                onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                                onFocus={(e) => e.target.select()}
                                                className="rounded-xl border-slate-200 font-bold text-center"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Alerta Mínimo</span>
                                            <Input
                                                type="number"
                                                value={formData.minQuantity}
                                                onChange={e => setFormData({ ...formData, minQuantity: e.target.value })}
                                                onFocus={(e) => e.target.select()}
                                                className="rounded-xl border-slate-200 font-bold text-rose-500 text-center"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-12 lg:col-span-5 space-y-8 flex flex-col h-full">
                                    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 flex-1 flex flex-col gap-8">
                                        <div className="flex-1 space-y-6">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest  flex items-center gap-2"><DollarSign size={14} /> Composição de Custo</h3>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[9px] font-black text-slate-500 uppercase w-24">Valor Compra</span>
                                                    <div className="flex-1 relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">R$</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={formData.costPrice}
                                                            onChange={e => setFormData({ ...formData, costPrice: e.target.value })}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-primary-300"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[9px] font-black text-slate-500 uppercase w-24">Frete / Logística</span>
                                                    <div className="flex-1 relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">R$</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={formData.freightCost}
                                                            onChange={e => setFormData({ ...formData, freightCost: e.target.value })}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-primary-300"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[9px] font-black text-slate-500 uppercase w-24">Taxas / Impostos</span>
                                                    <div className="flex-1 relative">
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">%</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={formData.taxPercent}
                                                            onChange={e => setFormData({ ...formData, taxPercent: e.target.value })}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-primary-300"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-slate-200 mx-2">
                                                    <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase">Custo Total</span>
                                                        <span className="text-base font-black text-slate-700">R$ {calculateTotalCost(formData).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest  flex items-center gap-2"><Scale size={14} /> Estratégia de Venda</h3>

                                            <div className="relative group">
                                                <label className="absolute -top-2.5 left-4 bg-slate-50 px-2 text-[9px] font-black text-emerald-600 uppercase">Preço Final</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 text-sm font-bold">R$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={formData.sellPrice}
                                                        onChange={e => setFormData({ ...formData, sellPrice: e.target.value })}
                                                        onFocus={(e) => e.target.select()}
                                                        className="w-full pl-10 pr-6 py-4 rounded-2xl border-2 border-emerald-100 text-xl font-black text-emerald-700 outline-none focus:border-emerald-300 focus:shadow-xl focus:shadow-emerald-100 transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center px-2">
                                                <div className="flex-1 mr-4">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Margem Desejada (%)</span>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            placeholder="0.0"
                                                            onChange={(e) => {
                                                                const margin = Number(e.target.value);
                                                                const totalCost = calculateTotalCost(formData);
                                                                // Sell = Cost * (1 + Margin/100)
                                                                if (margin >= 0) {
                                                                    const newSellPrice = totalCost * (1 + (margin / 100));
                                                                    setFormData({ ...formData, sellPrice: parseFloat(newSellPrice.toFixed(2)) });
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-primary-300 bg-white"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">Margem Real</span>
                                                    <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${calculateMargin(formData) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {calculateMargin(formData) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                        <span className="text-sm font-black">{calculateMargin(formData).toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-8 py-3 rounded-xl font-black text-[10px] uppercase text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all tracking-wider"
                                >
                                    Cancelar Operação
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    className="px-10 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-primary-600/20 bg-primary-600 text-white hover:bg-primary-700 hover:-translate-y-0.5 transition-all tracking-wider flex items-center gap-2"
                                >
                                    <Save size={16} /> Salvar Cadastro
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CATEGORY MODAL */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 sm:pt-20 animate-fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-scale-up border border-white/50">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-black text-slate-800 uppercase ">
                                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                            </h2>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-rose-500">
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
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
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
                                await DataService.transferToTech(transferData.techId, transferData.itemId, Number(transferData.quantity));
                                setIsTransferModalOpen(false);
                                alert('Transferência concluída com sucesso!');
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
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Item do Estoque Geral</label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100"
                                        value={transferData.itemId}
                                        onChange={e => setTransferData({ ...transferData, itemId: e.target.value })}
                                    >
                                        <option value="">Selecione o Item</option>
                                        {items.map(i => (
                                            <option key={i.id} value={i.id}>{i.description} ({i.quantity} {i.unit} disp.)</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Técnico Destino</label>
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
