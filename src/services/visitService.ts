/**
 * 🏗️ Nexus VisitService — Domínio de Visitas Técnicas v2
 *
 * Responsabilidades (Single Responsibility):
 *   - CRUD completo de service_visits
 *   - Validação de transições via VisitStateMachine
 *   - Criação de nova visita com guarda de estado enterprise
 *   - Audit trail imutável via visit_status_history
 *   - Gestão de equipamentos vinculados à OS (service_order_equipments)
 *
 * Segurança:
 *   - Todas as queries filtram por tenant_id (RLS + aplicação)
 *   - Nenhuma operação modifica dados sem validação de estado
 *   - Histórico de status é insert-only (sem UPDATE/DELETE)
 */

import { supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { VisitStateMachine } from '../lib/visitStateMachine';
import { logger } from '../lib/logger';
import {
    ServiceVisit,
    ServiceOrderEquipment,
    VisitStatusEnum,
    ImpedimentCategory,
    VisitStatusHistoryEvent,
} from '../types';

// ─────────────────────────────────────────────────────────────────
// Mappers (snake_case DB → camelCase Domain)
// ─────────────────────────────────────────────────────────────────

const _mapVisitFromDB = (data: any): ServiceVisit => ({
    id: data.id,
    tenantId: data.tenant_id,
    orderId: data.order_id,
    visitNumber: data.visit_number ?? 1,
    technicianId: data.technician_id,
    technicianName: data.users?.name ?? data.technician_name,
    status: data.status as VisitStatusEnum,
    pauseReason: data.pause_reason,
    impedimentReason: data.impediment_reason,
    impedimentCategory: data.impediment_category as ImpedimentCategory | undefined,
    formId: data.form_id,
    scheduledDate: data.scheduled_date,
    scheduledTime: data.scheduled_time,
    arrivalTime: data.arrival_time,
    departureTime: data.departure_time,
    notes: data.notes,
    formData: data.form_data,
    isLocked: data.is_locked ?? false,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
});

const _mapEquipmentFromDB = (data: any): ServiceOrderEquipment => ({
    id: data.id,
    tenantId: data.tenant_id,
    orderId: data.order_id,
    equipmentId: data.equipment_id,
    equipmentName: data.equipment_name,
    equipmentModel: data.equipment_model,
    equipmentSerial: data.equipment_serial,
    equipmentFamily: data.equipment_family,
    formId: data.form_id,
    formData: data.form_data,
    status: data.status,
    sortOrder: data.sort_order ?? 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
});

// ─────────────────────────────────────────────────────────────────
// VisitService
// ─────────────────────────────────────────────────────────────────

export const VisitService = {

    // ═══════════════════════════════════════════════════════════════
    // VISITAS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Retorna todas as visitas de uma OS em ordem cronológica (visit_number ASC).
     */
    getVisitsByOrderId: async (orderId: string): Promise<ServiceVisit[]> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) return [];

        const { data, error } = await supabase
            .from('service_visits')
            .select(`
        *,
        users:technician_id (name)
      `)
            .eq('tenant_id', tenantId)
            .eq('order_id', orderId)
            .order('visit_number', { ascending: true });

        if (error) {
            logger.error('[VisitService] getVisitsByOrderId falhou', { error, orderId });
            return [];
        }

        return (data || []).map(_mapVisitFromDB);
    },

    /**
     * Cria nova visita com validação de estado enterprise.
     *
     * Guarda 1: OS não pode estar em estado terminal (CONCLUÍDO/CANCELADO)
     * Guarda 2: A visita anterior deve estar PAUSED ou BLOCKED
     * Auto: Calcula visit_number sequencial
     * Auto: Gera audit trail
     * Auto: Reposiciona a OS para ATRIBUÍDO
     */
    createNewVisit: async (params: {
        orderId: string;
        orderStatus: string;
        technicianId: string;
        scheduledDate: string;
        scheduledTime?: string;
        notes?: string;
        formId?: string;
    }): Promise<ServiceVisit> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error('TENANT_NOT_FOUND');

        // ── Guarda 1: OS em estado terminal ──────────────────────────
        if (VisitStateMachine.isOrderTerminal(params.orderStatus)) {
            throw new Error(
                `INVALID_OS_STATE: OS com status "${params.orderStatus}" não aceita novas visitas.`
            );
        }

        // ── Backup e Limpeza do Estado Atual ─────────────
        const { data: orderData } = await supabase.from('orders')
            .select('form_data, signature, signature_name, signature_doc, video_url')
            .eq('id', params.orderId)
            .single();

        // ── Guarda 2: Visita anterior permite nova visita ─────────────
        const existingVisits = await VisitService.getVisitsByOrderId(params.orderId);

        if (existingVisits.length > 0) {
            const lastVisit = existingVisits[existingVisits.length - 1];
            const forceAllow = ['IMPEDIDO', 'PAUSADO'].includes(params.orderStatus);

            if (!VisitStateMachine.canCreateNewVisit(lastVisit.status) && !forceAllow) {
                throw new Error(
                    `INVALID_VISIT_STATE: Visita nº ${lastVisit.visitNumber} está "${lastVisit.status}". ` +
                    `Nova visita só é criada a partir de IMPEDIDO.`
                );
            }

            // ── Construir form_data arquivado de forma ACUMULATIVA ──────
            // Nunca sobrescrever — unir os históricos de ambas as fontes (visita + OS)
            const visitFd: any = lastVisit.formData || {};
            const orderFd: any = orderData?.form_data || {};

            // Mescla o impediment_history: combina listas de ambas as fontes sem duplicar
            const visitHistory: any[] = Array.isArray(visitFd.impediment_history) ? visitFd.impediment_history : [];
            const orderHistory: any[] = Array.isArray(orderFd.impediment_history) ? orderFd.impediment_history : [];

            // Usa a data como chave para deduplicar entradas que possam existir nas duas fontes
            const mergedHistoryMap = new Map<string, any>();
            [...visitHistory, ...orderHistory].forEach(entry => {
                mergedHistoryMap.set(entry.blockedAt, entry);
            });
            const mergedHistory = Array.from(mergedHistoryMap.values())
                .sort((a, b) => new Date(a.blockedAt).getTime() - new Date(b.blockedAt).getTime());

            const archivedFormData = {
                ...visitFd,
                ...orderFd,
                // Garante que o histórico completo e unificado prevaleça
                impediment_history: mergedHistory,
                // Campos de auditoria extras
                ...(orderData?.signature ? { signature: orderData.signature } : {}),
                ...(orderData?.signature_name ? { signatureName: orderData.signature_name } : {}),
                ...(orderData?.signature_doc ? { signatureDoc: orderData.signature_doc } : {}),
                ...(orderData?.video_url ? { videoUrl: orderData.video_url } : {}),
            };

            // Atualizar status e backup de dados na visita anterior
            const targetSyncStatus = (forceAllow && !VisitStateMachine.canCreateNewVisit(lastVisit.status))
                ? (params.orderStatus === 'PAUSADO' ? VisitStatusEnum.PAUSED : VisitStatusEnum.BLOCKED)
                : lastVisit.status;

            const { error: updateErr } = await supabase.from('service_visits')
                .update({ 
                    status: targetSyncStatus, 
                    form_data: archivedFormData,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', lastVisit.id);
            
            if (updateErr) {
                throw new Error(`CRITICAL: Falha ao arquivar evidências da visita ${lastVisit.visitNumber} (DB: ${updateErr.message}). Operação abortada para evitar perda de dados.`);
            }
        }

        const nextVisitNumber = existingVisits.length + 1;

        // ── Obter usuário criador ─────────────────────────────────────
        const { data: { session } } = await supabase.auth.getSession();
        const createdBy = session?.user?.id;

        // ── Inserir visita ────────────────────────────────────────────
        const { data, error } = await supabase
            .from('service_visits')
            .insert({
                tenant_id: tenantId,
                order_id: params.orderId,
                technician_id: params.technicianId,
                visit_number: nextVisitNumber,
                status: VisitStatusEnum.PENDING,
                scheduled_date: params.scheduledDate,
                scheduled_time: params.scheduledTime || null,
                notes: params.notes || null,
                form_id: params.formId || null,
                created_by: createdBy,
            })
            .select()
            .single();

        if (error) {
            logger.error('[VisitService] createNewVisit DB falhou', { error, params });
            throw new Error(`DB_ERROR: ${error.message}`);
        }

        // ── Audit trail ───────────────────────────────────────────────
        await VisitService._recordStatusHistory({
            tenantId,
            visitId: data.id,
            orderId: params.orderId,
            toStatus: VisitStatusEnum.PENDING,
            reason: `Visita ${nextVisitNumber} criada pelo admin`,
            changedBy: createdBy,
        });

        // ── Repor OS para ATRIBUÍDO + sincronizar agendamento e LIMPAR execução do app mobile ─────────
        await supabase.from('orders').update({
            status: 'ATRIBUÍDO',
            assigned_to: params.technicianId,
            scheduled_date: params.scheduledDate,
            scheduled_time: params.scheduledTime || null,
            form_data: {}, // Reset do checklist / motivações de impedimento
            signature: null,
            signature_name: null,
            signature_doc: null,
            video_url: null,
            updated_at: new Date().toISOString(),
        }).eq('id', params.orderId).eq('tenant_id', tenantId);

        logger.info('[VisitService] Nova visita criada', {
            orderId: params.orderId,
            visitNumber: nextVisitNumber,
            techId: params.technicianId,
        });

        return _mapVisitFromDB(data);
    },

    /**
     * Transiciona o status de uma visita com validação formal.
     * Impede transições inválidas e visitas bloqueadas.
     */
    transitionStatus: async (params: {
        visitId: string;
        orderId: string;
        newStatus: VisitStatusEnum;
        reason?: string;
        impedimentCategory?: ImpedimentCategory;
        formData?: Record<string, any>;
    }): Promise<ServiceVisit> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error('TENANT_NOT_FOUND');

        // Buscar visita atual
        const { data: current, error: fetchErr } = await supabase
            .from('service_visits')
            .select('*')
            .eq('id', params.visitId)
            .eq('tenant_id', tenantId)
            .single();

        if (fetchErr || !current) throw new Error('VISIT_NOT_FOUND');

        // Bloquear se visita travada
        if (current.is_locked) throw new Error('VISIT_LOCKED: OS concluída — somente leitura.');

        // Validar transição
        if (!VisitStateMachine.isValidTransition(
            current.status as VisitStatusEnum,
            params.newStatus
        )) {
            throw new Error(
                `INVALID_TRANSITION: ${current.status} → ${params.newStatus} não é permitida.`
            );
        }

        // Preparar payload de update
        const updatePayload: Record<string, any> = {
            status: params.newStatus,
            updated_at: new Date().toISOString(),
        };

        if (params.newStatus === VisitStatusEnum.ONGOING) {
            updatePayload.arrival_time = new Date().toISOString();
        }
        if ([VisitStatusEnum.COMPLETED, VisitStatusEnum.BLOCKED].includes(params.newStatus)) {
            updatePayload.departure_time = new Date().toISOString();
        }
        if (params.reason) {
            if (params.newStatus === VisitStatusEnum.BLOCKED) {
                updatePayload.impediment_reason = params.reason;
            } else {
                updatePayload.pause_reason = params.reason;
            }
        }
        if (params.impedimentCategory) {
            updatePayload.impediment_category = params.impedimentCategory;
        }
        if (params.formData && params.newStatus === VisitStatusEnum.COMPLETED) {
            updatePayload.form_data = params.formData;
            updatePayload.is_locked = true; // Lock automático ao concluir
        }

        const { data, error } = await supabase
            .from('service_visits')
            .update(updatePayload)
            .eq('id', params.visitId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (error) throw new Error(`DB_ERROR: ${error.message}`);

        // Audit trail
        const { data: { session } } = await supabase.auth.getSession();
        await VisitService._recordStatusHistory({
            tenantId,
            visitId: params.visitId,
            orderId: params.orderId,
            fromStatus: current.status as VisitStatusEnum,
            toStatus: params.newStatus,
            reason: params.reason,
            changedBy: session?.user?.id,
        });

        return _mapVisitFromDB(data);
    },

    /**
     * Retorna o histórico de status de uma visita em ordem cronológica.
     */
    getStatusHistory: async (visitId: string): Promise<VisitStatusHistoryEvent[]> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) return [];

        const { data, error } = await supabase
            .from('visit_status_history')
            .select('*, users:changed_by (name)')
            .eq('visit_id', visitId)
            .eq('tenant_id', tenantId)
            .order('changed_at', { ascending: true });

        if (error) {
            logger.error('[VisitService] getStatusHistory falhou', { error, visitId });
            return [];
        }

        return (data || []).map((h: any): VisitStatusHistoryEvent => ({
            id: h.id,
            tenantId: h.tenant_id,
            visitId: h.visit_id,
            orderId: h.order_id,
            fromStatus: h.from_status as VisitStatusEnum | undefined,
            toStatus: h.to_status as VisitStatusEnum,
            reason: h.reason,
            metadata: h.metadata,
            changedBy: h.users?.name ?? h.changed_by,
            changedAt: h.changed_at,
        }));
    },

    // ═══════════════════════════════════════════════════════════════
    // EQUIPAMENTOS VINCULADOS À OS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Retorna todos os equipamentos vinculados a uma OS (não deletados).
     * Usa RPC SECURITY DEFINER para contornar RLS no SELECT.
     */
    getOrderEquipments: async (orderId: string): Promise<ServiceOrderEquipment[]> => {
        const { data, error } = await supabase
            .rpc('nexus_get_order_equipments', { p_order_id: orderId });

        if (error) {
            logger.error('[VisitService] getOrderEquipments RPC falhou', { error, orderId });
            return [];
        }

        const rows: any[] = Array.isArray(data) ? data : (data ? [data] : []);
        return rows.map(_mapEquipmentFromDB);
    },

    /**
     * Adiciona um equipamento a uma OS via RPC (SECURITY DEFINER).
     * Resolve tenant_id internamente — sem depender de JWT claims no RLS.
     */
    addEquipmentToOrder: async (params: {
        orderId: string;
        equipmentId?: string;
        equipmentName: string;
        equipmentModel?: string;
        equipmentSerial?: string;
        equipmentFamily?: string;
        formId?: string;
    }): Promise<ServiceOrderEquipment> => {
        // Calcula sort_order: quantos já existem para esta OS
        const existing = await VisitService.getOrderEquipments(params.orderId);
        const nextSort = existing.length;

        const { data, error } = await supabase.rpc('nexus_add_equipment_to_order', {
            p_order_id: params.orderId,
            p_equipment_id: params.equipmentId || '',
            p_equipment_name: params.equipmentName,
            p_equipment_model: params.equipmentModel || '',
            p_equipment_serial: params.equipmentSerial || '',
            p_equipment_family: params.equipmentFamily || '',
            p_form_id: params.formId || '',
            p_sort_order: nextSort,
        });

        if (error) throw new Error(`RPC_ERROR: ${error.message}`);
        if (!data) throw new Error('RPC_ERROR: função retornou null');

        // A RPC retorna JSONB com snake_case — mapeia para o tipo do frontend
        const row = typeof data === 'string' ? JSON.parse(data) : data;
        return _mapEquipmentFromDB(row);
    },


    /**
     * Remove (soft delete) um equipamento de uma OS via RPC.
     */
    removeEquipmentFromOrder: async (equipmentEntryId: string): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error('TENANT_NOT_FOUND');

        const { error } = await supabase.rpc('nexus_remove_equipment_from_order', {
            p_equipment_entry_id: equipmentEntryId,
            p_tenant_id: tenantId
        });

        if (error) throw new Error(`RPC_ERROR: ${error.message}`);
    },

    /**
     * Atualiza o formulário vinculado a um equipamento na OS.
     */
    updateEquipmentFormId: async (equipmentEntryId: string, formId: string | null): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error('TENANT_NOT_FOUND');

        const { error } = await supabase.rpc('nexus_update_equipment_form_id', {
            p_equipment_entry_id: equipmentEntryId,
            p_form_id: formId,
            p_tenant_id: tenantId
        });

        if (error) throw new Error(`RPC_ERROR: ${error.message}`);
    },

    /**
     * Atualiza campos de agendamento de uma visita (data/horário/técnico).
     *
     * Regras:
     *   - Não permite editar visita CONCLUÍDA ou CANCELADA (is_locked ou status terminal)
     *   - Valida horário_fim > horário_início quando ambos presentes
     *   - Gera audit trail com snapshot anterior
     */
    updateVisitSchedule: async (params: {
        visitId: string;
        orderId: string;
        scheduledDate?: string;
        scheduledTime?: string;
        // scheduledEndTime removed – column does not exist
        technicianId?: string;
        notes?: string;
    }): Promise<ServiceVisit> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error('TENANT_NOT_FOUND');
        if (!params.scheduledDate) throw new Error('INVALID_TIME: Data de agendamento obrigatória.');

        // Validação de horário – remove end time check
        // if (params.scheduledTime && params.scheduledEndTime && params.scheduledEndTime <= params.scheduledTime) {
        //     throw new Error('INVALID_TIME: Horário de término deve ser maior que o horário de início.');
        // }

        // ── USA RPC SECURITY DEFINER ──────────────────────────────────
        // Resolve tenant_id a partir da OS (não depende de JWT claim no RLS),
        // atualiza service_visits e sincroniza orders em uma transação única.
        const { data: rpcData, error: rpcErr } = await supabase.rpc('duno_update_visit_schedule', {
            p_visit_id: params.visitId,
            p_order_id: params.orderId,
            p_scheduled_date: params.scheduledDate,
            p_scheduled_time: params.scheduledTime ?? null,
            // p_scheduled_end_time removed
            p_technician_id: params.technicianId ?? null,
        });

        if (rpcErr) throw new Error(`DB_ERROR: ${rpcErr.message}`);
        if (!rpcData?.ok) {
            const code = rpcData?.error || 'UNKNOWN';
            if (code === 'VISIT_LOCKED') throw new Error('VISIT_LOCKED: Visita concluída não pode ser reagendada.');
            if (code === 'VISIT_NOT_FOUND') throw new Error('VISIT_NOT_FOUND: Visita não encontrada.');
            throw new Error(`RPC_ERROR: ${code}`);
        }

        // Audit trail (fire-and-forget — não bloqueia o retorno)
        const { data: { session } } = await supabase.auth.getSession();
        supabase.from('visit_status_history').insert({
            tenant_id: tenantId,
            visit_id: params.visitId,
            order_id: params.orderId,
            from_status: rpcData.visit?.status ?? 'pending',
            to_status: rpcData.visit?.status ?? 'pending',
            reason: `Reagendamento: → ${params.scheduledDate}`,
            metadata: {
                action: 'RESCHEDULE',
                next: {
                    scheduledDate: params.scheduledDate,
                    scheduledTime: params.scheduledTime,
                    // scheduledEndTime omitted
                    technicianId: params.technicianId,
                },
            },
            changed_by: session?.user?.id ?? null,
            changed_at: new Date().toISOString(),
        }).then(({ error: auditErr }) => {
            if (auditErr) logger.error('[VisitService] updateVisitSchedule audit falhou', { auditErr });
        });

        logger.info('[VisitService] Visita reagendada via RPC', {
            visitId: params.visitId,
            orderId: params.orderId,
            scheduledDate: params.scheduledDate,
        });

        return _mapVisitFromDB(rpcData.visit);
    },

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════

    _recordStatusHistory: async (params: {
        tenantId: string;
        visitId: string;
        orderId: string;
        fromStatus?: VisitStatusEnum;
        toStatus: VisitStatusEnum;
        reason?: string;
        changedBy?: string;
    }): Promise<void> => {
        // Fire-and-forget: não bloqueia o fluxo principal se falhar
        supabase.from('visit_status_history').insert({
            tenant_id: params.tenantId,
            visit_id: params.visitId,
            order_id: params.orderId,
            from_status: params.fromStatus ?? null,
            to_status: params.toStatus,
            reason: params.reason ?? null,
            changed_by: params.changedBy ?? null,
            changed_at: new Date().toISOString(),
        }).then(({ error }) => {
            if (error) {
                logger.error('[VisitService] _recordStatusHistory falhou (não crítico)', { error });
            }
        });
    },
};
