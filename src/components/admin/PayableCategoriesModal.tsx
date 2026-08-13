import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FinancialService } from '../../services/financialService';
import { useDialog } from '../../contexts/DialogContext';
import { usePayableCategories, NexusQueryClient } from '../../hooks/nexusHooks';
import { X, Tag, Plus, Trash2, Loader2 } from 'lucide-react';

export const PayableCategoriesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { showAlert, showConfirm } = useDialog();
    const { data: categories = [], isLoading, refetch } = usePayableCategories();
    
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;

        setIsSaving(true);
        try {
            await FinancialService.createPayableCategory(newCategoryName.trim());
            showAlert('Categoria adicionada com sucesso!', 'success');
            setNewCategoryName('');
            refetch();
        } catch (error: any) {
            showAlert(`Erro ao adicionar categoria: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        showConfirm(
            'Deseja excluir esta categoria? Contas a pagar existentes não serão afetadas, mas a categoria não aparecerá mais na lista.',
            async () => {
                try {
                    await FinancialService.deletePayableCategory(id);
                    showAlert('Categoria excluída!', 'success');
                    refetch();
                } catch (error: any) {
                    showAlert(`Erro ao excluir: ${error.message}`, 'error');
                }
            },
            'Excluir Categoria',
            'Excluir',
            true
        );
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-[15px] font-bold text-slate-800 flex items-center gap-2">
                            Categorias de Despesas
                        </h2>
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Personalize suas categorias</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                    <form onSubmit={handleAdd} className="flex gap-2 mb-2">
                        <input
                            type="text"
                            placeholder="Nova categoria..."
                            value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                            className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                        />
                        <button
                            type="submit"
                            disabled={isSaving || !newCategoryName.trim()}
                            className="h-10 px-4 bg-[#1c2d4f] hover:bg-[#152340] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Adicionar
                        </button>
                    </form>

                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                        {isLoading ? (
                            <div className="p-8 text-center text-slate-400">
                                <Loader2 className="animate-spin mx-auto mb-2" size={20} />
                                <span className="text-[10px] uppercase tracking-widest">Carregando...</span>
                            </div>
                        ) : categories.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Tag className="mx-auto mb-2 opacity-20" size={24} />
                                <span className="text-[10px] uppercase tracking-widest">Nenhuma categoria cadastrada.</span>
                            </div>
                        ) : (
                            categories.map(cat => (
                                <div key={cat.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                                    <span className="text-xs font-medium text-slate-700">{cat.name}</span>
                                    <button 
                                        onClick={() => handleDelete(cat.id)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                        title="Excluir Categoria"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
