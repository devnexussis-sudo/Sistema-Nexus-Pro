
import { supabase } from '../lib/supabase';
import { CashFlowEntry } from '../types';
import { AuthService } from './authService';
import { SessionStorage, GlobalStorage } from '../lib/sessionStorage';
import { logger } from '../lib/logger';
import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);



export const FinancialService = {

    // --- Fluxo de Caixa ---

    registerCashFlow: async (entry: Partial<CashFlowEntry>): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            // Buscar user ID de forma resiliente
            let createdById: string | undefined;
            try {
                const currentUser = await AuthService.getCurrentUser();
                createdById = currentUser?.id;
            } catch (err) {
                console.warn("⚠️ Não foi possível obter getCurrentUser, tentando session fallback:", err);
                // Fallback: pegar do SessionStorage
                try {
                    const sessionUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
                    if (sessionUser) {
                        createdById = typeof sessionUser === 'string' ? JSON.parse(sessionUser).id : sessionUser.id;
                    }
                } catch (e) {
                    console.warn("⚠️ Fallback de usuário também falhou, usando 'sistema'");
                }
            }

            const dbEntry = {
                tenant_id: tenantId,
                type: entry.type,
                category: entry.category,
                amount: entry.amount,
                description: entry.description,
                reference_id: entry.referenceId,
                reference_type: entry.referenceType,
                payment_method: entry.paymentMethod,
                entry_date: entry.entryDate || new Date().toISOString(),
                customer_id: entry.customerId,
                technician_id: entry.technicianId,
                created_by: createdById || 'sistema' // Fallback para 'sistema' se não conseguir obter user
            };

            const { error } = await supabase.from('cash_flow').insert([dbEntry]);
            if (error) {
                console.error("❌ Erro ao registrar no fluxo de caixa:", error);
                throw error;
            }
            console.log("✅ Entrada registrada no fluxo de caixa");
        }
    },

    getCashFlow: async (filters?: { start?: string, end?: string }): Promise<CashFlowEntry[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            let query = supabase.from('cash_flow').select('*').eq('tenant_id', tenantId);
            if (filters?.start) query = query.gte('entry_date', filters.start);
            if (filters?.end) query = query.lte('entry_date', filters.end);

            const { data, error } = await query.order('entry_date', { ascending: false }).limit(100);
            if (error) throw error;
            return data.map(d => ({
                id: d.id,
                tenantId: d.tenant_id,
                type: d.type,
                category: d.category,
                amount: Number(d.amount),
                description: d.description,
                referenceId: d.reference_id,
                referenceType: d.reference_type,
                paymentMethod: d.payment_method,
                entryDate: d.entry_date,
                customerId: d.customer_id,
                technicianId: d.technician_id,
                createdAt: d.created_at,
                createdBy: d.created_by
            })) as CashFlowEntry[];
        }
        return [];
    },

    // --- Contas a Pagar (Accounts Payable) ---

    getAccountsPayable: async (filters?: { start?: string, end?: string, status?: string }): Promise<any[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            let query = supabase.from('accounts_payable').select('*').eq('tenant_id', tenantId);
            if (filters?.start) query = query.gte('due_date', filters.start);
            if (filters?.end) query = query.lte('due_date', filters.end);
            if (filters?.status && filters.status !== 'ALL') query = query.eq('status', filters.status);

            const { data, error } = await query.order('due_date', { ascending: false }).limit(200);
            if (error) throw error;

            // Fetch user names
            const userIds = [...new Set(data.flatMap(d => [d.created_by, d.paid_by, d.cancelled_by]).filter(Boolean))];
            let userMap: Record<string, string> = {};
            if (userIds.length > 0) {
                const { data: usersData } = await supabase.from('users').select('id, name').in('id', userIds);
                if (usersData) {
                    usersData.forEach(u => { userMap[u.id] = u.name; });
                }
            }

            return data.map(d => ({
                id: d.id,
                tenantId: d.tenant_id,
                description: d.description,
                supplierName: d.supplier_name,
                category: d.category,
                amount: Number(d.amount),
                dueDate: d.due_date,
                paidAt: d.paid_at,
                status: d.status,
                paymentMethod: d.payment_method,
                notes: d.notes,
                isRecurring: d.is_recurring,
                recurrencePeriod: d.recurrence_period,
                parentId: d.parent_id,
                createdAt: d.created_at,
                updatedAt: d.updated_at,
                createdBy: d.created_by,
                createdByName: userMap[d.created_by] || 'Sistema',
                paidBy: d.paid_by,
                paidByName: d.paid_by ? userMap[d.paid_by] || 'Usuário Desconhecido' : null,
                cancelledAt: d.cancelled_at,
                cancelledBy: d.cancelled_by,
                cancelledByName: d.cancelled_by ? userMap[d.cancelled_by] || 'Usuário Desconhecido' : null
            }));
        }
        return [];
    },

    createAccountPayable: async (entry: any): Promise<any> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            let userId: string | undefined;
            try {
                const currentUser = await AuthService.getCurrentUser();
                userId = currentUser?.id;
                if (!userId) {
                    const sessionUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
                    if (sessionUser) {
                        userId = typeof sessionUser === 'string' ? JSON.parse(sessionUser).id : sessionUser.id;
                    }
                }
            } catch (e) {}

            const isRecurring = entry.isRecurring || false;
            const installments = isRecurring && entry.installments > 1 ? entry.installments : 1;
            const recurrencePeriod = entry.recurrencePeriod || null;
            const entriesToInsert = [];

            let currentDate = new Date(entry.dueDate + 'T12:00:00');

            const toLocalYMD = (d: Date) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            for (let i = 0; i < installments; i++) {
                const dbEntry: any = {
                    tenant_id: tenantId,
                    description: installments > 1 ? `${entry.description} (${i + 1}/${installments})` : entry.description,
                    supplier_name: entry.supplierName,
                    category: entry.category,
                    amount: entry.amount,
                    due_date: toLocalYMD(currentDate),
                    status: entry.status || 'PENDING',
                    payment_method: entry.paymentMethod,
                    notes: entry.notes,
                    // Não marcamos como "is_recurring" no banco para não acionar geração infinita ao pagar
                    is_recurring: false, 
                    recurrence_period: null,
                    parent_id: entry.parentId || null
                };
                if (userId) {
                    dbEntry.created_by = userId;
                }
                entriesToInsert.push(dbEntry);

                // Calcular próxima data
                if (recurrencePeriod === 'MONTHLY') currentDate.setMonth(currentDate.getMonth() + 1);
                else if (recurrencePeriod === 'WEEKLY') currentDate.setDate(currentDate.getDate() + 7);
                else if (recurrencePeriod === 'YEARLY') currentDate.setFullYear(currentDate.getFullYear() + 1);
            }

            const { data, error } = await supabase.from('accounts_payable').insert(entriesToInsert).select();
            if (error) throw error;
            return data[0]; // Retorna o primeiro para compatibilidade
        }
    },

    updateAccountPayable: async (id: string, updates: any): Promise<void> => {
        if (isCloudEnabled) {
            const dbUpdates: any = {};
            if (updates.description !== undefined) dbUpdates.description = updates.description;
            if (updates.supplierName !== undefined) dbUpdates.supplier_name = updates.supplierName;
            if (updates.category !== undefined) dbUpdates.category = updates.category;
            if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
            if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt;
            if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
            
            if (updates.isRecurring !== undefined) dbUpdates.is_recurring = updates.isRecurring;
            if (updates.recurrencePeriod !== undefined) dbUpdates.recurrence_period = updates.recurrencePeriod;
            if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId;
            
            dbUpdates.updated_at = new Date().toISOString();

            // Capturar o usuário que está liquidando a conta
            if (updates.status === 'PAID') {
                try {
                    let userId: string | undefined;
                    const currentUser = await AuthService.getCurrentUser();
                    userId = currentUser?.id;
                    if (!userId) {
                        const sessionUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
                        if (sessionUser) {
                            userId = typeof sessionUser === 'string' ? JSON.parse(sessionUser).id : sessionUser.id;
                        }
                    }
                    if (userId) {
                        dbUpdates.paid_by = userId;
                    }
                } catch (e) {
                    console.warn("⚠️ Fallback paid_by falhou:", e);
                }
            }

            // Capturar o usuário que está inativando a conta
            if (updates.status === 'CANCELLED') {
                dbUpdates.cancelled_at = new Date().toISOString();
                try {
                    let userId: string | undefined;
                    const currentUser = await AuthService.getCurrentUser();
                    userId = currentUser?.id;
                    if (!userId) {
                        const sessionUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
                        if (sessionUser) {
                            userId = typeof sessionUser === 'string' ? JSON.parse(sessionUser).id : sessionUser.id;
                        }
                    }
                    if (userId) {
                        dbUpdates.cancelled_by = userId;
                    }
                } catch (e) {
                    console.warn("⚠️ Fallback cancelled_by falhou:", e);
                }
            }

            // Lógica de Recorrência: Se estivermos marcando como PAID, verificamos se precisa gerar a próxima
            if (updates.status === 'PAID') {
                const { data: currentAccount } = await supabase.from('accounts_payable').select('*').eq('id', id).single();
                if (currentAccount && currentAccount.is_recurring && currentAccount.recurrence_period) {
                    // Calcular próxima data
                    const currDate = new Date(currentAccount.due_date + 'T12:00:00');
                    const nextDate = new Date(currDate);
                    if (currentAccount.recurrence_period === 'MONTHLY') nextDate.setMonth(nextDate.getMonth() + 1);
                    else if (currentAccount.recurrence_period === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);
                    else if (currentAccount.recurrence_period === 'YEARLY') nextDate.setFullYear(nextDate.getFullYear() + 1);

                    const year = nextDate.getFullYear();
                    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
                    const day = String(nextDate.getDate()).padStart(2, '0');
                    const nextDueDateStr = `${year}-${month}-${day}`;

                    const nextAccount = {
                        tenant_id: currentAccount.tenant_id,
                        description: currentAccount.description,
                        supplier_name: currentAccount.supplier_name,
                        category: currentAccount.category,
                        amount: currentAccount.amount,
                        due_date: nextDueDateStr,
                        status: 'PENDING',
                        is_recurring: true,
                        recurrence_period: currentAccount.recurrence_period,
                        parent_id: currentAccount.id
                    };
                    
                    // Criar a próxima conta
                    await supabase.from('accounts_payable').insert([nextAccount]);
                }
            }

            const { error } = await supabase.from('accounts_payable').update(dbUpdates).eq('id', id);
            if (error) throw error;
        }
    },

    deleteAccountPayable: async (id: string): Promise<void> => {
        if (isCloudEnabled) {
            const { error } = await supabase.from('accounts_payable').delete().eq('id', id);
            if (error) throw error;
        }
    },

    // --- Categorias de Contas a Pagar (Payable Categories) ---
    getPayableCategories: async (): Promise<any[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const { data, error } = await supabase.from('payable_categories').select('*').eq('tenant_id', tenantId).order('name');
            if (error) throw error;
            return data.map(d => ({
                id: d.id,
                tenantId: d.tenant_id,
                name: d.name,
                color: d.color
            }));
        }
        return [];
    },

    createPayableCategory: async (name: string, color?: string): Promise<any> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const { data, error } = await supabase.from('payable_categories').insert([{
                tenant_id: tenantId,
                name,
                color
            }]).select().single();
            if (error) throw error;
            return data;
        }
    },

    deletePayableCategory: async (id: string): Promise<void> => {
        if (isCloudEnabled) {
            const { error } = await supabase.from('payable_categories').delete().eq('id', id);
            if (error) throw error;
        }
    }
};
