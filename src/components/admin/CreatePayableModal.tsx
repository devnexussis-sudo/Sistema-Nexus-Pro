import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FinancialService } from '../../services/financialService';
import { useDialog } from '../../contexts/DialogContext';
import { usePayableCategories } from '../../hooks/nexusHooks';
import { X, Calendar, DollarSign, AlignLeft, Tag, Building2, Save, Loader2, Repeat, History } from 'lucide-react';

export const CreatePayableModal: React.FC<{ onClose: () => void, onSuccess: () => void, accountToEdit?: any }> = ({ onClose, onSuccess, accountToEdit }) => {
    const { showAlert } = useDialog();
    const [isSaving, setIsSaving] = useState(false);
    const { data: categories = [], isLoading: isLoadingCategories } = usePayableCategories();

    const isReadOnly = accountToEdit?.status === 'PAID' || accountToEdit?.status === 'CANCELLED';

    const [formData, setFormData] = useState({
        description: '',
        supplierName: '',
        category: '',
        amount: '',
        dueDate: new Date().toISOString().split('T')[0],
        notes: '',
        isRecurring: false,
        recurrencePeriod: 'MONTHLY' as 'MONTHLY' | 'WEEKLY' | 'YEARLY',
        installments: 1
    });

    React.useEffect(() => {
        if (accountToEdit) {
            setFormData({
                description: accountToEdit.description || '',
                supplierName: accountToEdit.supplierName || '',
                category: accountToEdit.category || '',
                amount: accountToEdit.amount?.toString() || '',
                dueDate: accountToEdit.dueDate || new Date().toISOString().split('T')[0],
                notes: accountToEdit.notes || '',
                isRecurring: accountToEdit.isRecurring || false,
                recurrencePeriod: accountToEdit.recurrencePeriod || 'MONTHLY',
                installments: 1
            });
        } else if (categories.length > 0 && !formData.category) {
            setFormData(prev => ({ ...prev, category: categories[0].name }));
        }
    }, [accountToEdit, categories]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isReadOnly) return;

        if (!formData.description || !formData.amount || !formData.dueDate || !formData.category) {
            showAlert('Preencha os campos obrigatórios.', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            if (accountToEdit) {
                await FinancialService.updateAccountPayable(accountToEdit.id, {
                    ...formData,
                    amount: Number(formData.amount)
                });
                showAlert('Conta a pagar atualizada com sucesso!', 'success');
            } else {
                await FinancialService.createAccountPayable({
                    ...formData,
                    amount: Number(formData.amount)
                });
                showAlert('Conta a pagar registrada com sucesso!', 'success');
            }
            onSuccess();
        } catch (error: any) {
            showAlert(`Erro ao salvar: ${error.message}`, 'error');
            setIsSaving(false);
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${accountToEdit ? 'max-w-3xl' : 'max-w-xl'} flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200`}>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-[15px] font-bold text-slate-800 flex items-center gap-2">
                            {accountToEdit ? (isReadOnly ? 'Detalhes da Conta a Pagar' : 'Editar Conta a Pagar') : 'Nova Conta a Pagar'}
                        </h2>
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">
                            {accountToEdit ? (isReadOnly ? `Visualizando informações (${accountToEdit.status === 'PAID' ? 'Paga' : 'Inativa'})` : 'Altere os dados da despesa') : 'Registre uma nova despesa'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row overflow-y-auto custom-scrollbar divide-y md:divide-y-0 md:divide-x divide-slate-100">
                    <form id="create-payable-form" onSubmit={handleSubmit} className="p-6 flex-1 flex flex-col gap-4">
                        
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
                                <AlignLeft size={12} /> Descrição *
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Conta de Luz (Maio)"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                disabled={isReadOnly}
                                className={`w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
                                    <DollarSign size={12} /> Valor (R$) *
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="0.01"
                                    step="0.01"
                                    placeholder="0,00"
                                    value={formData.amount}
                                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                    disabled={isReadOnly}
                                    className={`w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
                                    <Calendar size={12} /> Vencimento *
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={formData.dueDate}
                                    onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                    disabled={isReadOnly}
                                    className={`w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
                                <Tag size={12} /> Categoria *
                            </label>
                            <select
                                required
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                disabled={isLoadingCategories || isReadOnly}
                                className={`w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                <option value="" disabled>Selecione uma categoria...</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                                ))}
                            </select>
                        </div>

                        {!accountToEdit && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isRecurring}
                                        onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })}
                                        className="w-4 h-4 text-[#1c2d4f] rounded border-slate-300 focus:ring-[#1c2d4f]"
                                    />
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                                    <Repeat size={14} className={formData.isRecurring ? 'text-amber-500' : 'text-slate-400'} />
                                    Despesa Recorrente?
                                </span>
                            </label>

                            {formData.isRecurring && (
                                <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                                            Frequência
                                        </label>
                                        <select
                                            value={formData.recurrencePeriod}
                                            onChange={e => setFormData({ ...formData, recurrencePeriod: e.target.value as any })}
                                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all"
                                        >
                                            <option value="MONTHLY">Mensal</option>
                                            <option value="WEEKLY">Semanal</option>
                                            <option value="YEARLY">Anual</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                                            Quantas Vezes?
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            min="2"
                                            max="120"
                                            value={formData.installments}
                                            onChange={e => setFormData({ ...formData, installments: parseInt(e.target.value) || 1 })}
                                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-[9px] text-slate-500 font-medium">As {formData.installments || 1} contas serão geradas e distribuídas no calendário imediatamente após salvar.</p>
                                    </div>
                                </div>
                            )}
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
                                <Building2 size={12} /> Fornecedor (Opcional)
                            </label>
                            <input
                                type="text"
                                placeholder="Ex: CEMIG, VIVO, etc"
                                value={formData.supplierName}
                                onChange={e => setFormData({ ...formData, supplierName: e.target.value })}
                                disabled={isReadOnly}
                                className={`w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
                                <AlignLeft size={12} /> Observações (Opcional)
                            </label>
                            <textarea
                                rows={3}
                                placeholder="Detalhes adicionais..."
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                disabled={isReadOnly}
                                className={`w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] outline-none transition-all resize-none ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                            />
                        </div>
                    </form>

                    {accountToEdit && (
                        <div className="p-6 w-full md:w-[280px] shrink-0 bg-slate-50/50 flex flex-col gap-5 border-l border-slate-100">
                            <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200 pb-2">
                                <History size={14} className="text-slate-400" /> Histórico da Conta
                            </h3>
                            
                            <div className="space-y-6">
                                <div className="relative pl-4 border-l-2 border-indigo-200">
                                    <div className="absolute w-2 h-2 bg-indigo-500 rounded-full -left-[5px] top-1"></div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Criação</p>
                                    <p className="text-xs font-semibold text-slate-700">{accountToEdit.createdByName || 'Sistema'}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{new Date(accountToEdit.createdAt).toLocaleDateString('pt-BR')} às {new Date(accountToEdit.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                                </div>

                                {accountToEdit.status === 'PAID' && accountToEdit.paidAt && (
                                    <div className="relative pl-4 border-l-2 border-emerald-200">
                                        <div className="absolute w-2 h-2 bg-emerald-500 rounded-full -left-[5px] top-1"></div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Liquidação</p>
                                        <p className="text-xs font-semibold text-emerald-700">{accountToEdit.paidByName || 'Sistema'}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{new Date(accountToEdit.paidAt).toLocaleDateString('pt-BR')} às {new Date(accountToEdit.paidAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                                    </div>
                                )}

                                {accountToEdit.status === 'CANCELLED' && accountToEdit.cancelledAt && (
                                    <div className="relative pl-4 border-l-2 border-rose-200">
                                        <div className="absolute w-2 h-2 bg-rose-500 rounded-full -left-[5px] top-1"></div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Inativação</p>
                                        <p className="text-xs font-semibold text-rose-700">{accountToEdit.cancelledByName || 'Sistema'}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{new Date(accountToEdit.cancelledAt).toLocaleDateString('pt-BR')} às {new Date(accountToEdit.cancelledAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50 rounded-b-2xl shrink-0">
                    <button 
                        type="button" 
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        {isReadOnly ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!isReadOnly && (
                        <button 
                            type="submit"
                            form="create-payable-form"
                            disabled={isSaving}
                            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-sm shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Salvar
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

