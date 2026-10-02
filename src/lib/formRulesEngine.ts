/**
 * 🧠 Nexus FormRulesEngine
 *
 * Motor determinístico de resolução de formulários para pares
 * (operationType × equipmentFamily).
 *
 * Algoritmo de Especificidade (maior score vence):
 *   - Regra com AMBOS operationType E equipmentFamily: +100 cada = 200
 *   - Regra com apenas UM dos dois: +100
 *   - Regra genérica (nenhum critério): score 0
 *   - Empate: desempate pelo campo `priority` (maior vence)
 *
 * Princípios Aplicados:
 *   - Single Responsibility: apenas resolve formulários
 *   - Open/Closed: extensível via novas regras, sem alterar a engine
 *   - Cache TTL de 5 min (invalidado após criar/editar regra)
 */

import { supabase } from './supabase';
import { CacheManager } from './cache';
import { getCurrentTenantId } from './tenantContext';
import { FormRule } from '../types';
import type { DbFormRule } from '../types/database';

interface ResolveParams {
    tenantId: string;
    operationType?: string;
    equipmentFamily?: string;
}

export const FormRulesEngine = {

    /**
     * Resolver para um único par (operationType, equipmentFamily).
     * Retorna o formTemplateId mais específico, ou null se não encontrar.
     */
    resolve: async (params: ResolveParams): Promise<string | null> => {
        const { tenantId, operationType, equipmentFamily } = params;
        const rules = await FormRulesEngine._loadRules(tenantId);

        // Filtrar regras compatíveis (match parcial ou total)
        const compatible = rules.filter(r => {
            const opMatch = !r.operationType || r.operationType === operationType;
            const famMatch = !r.equipmentFamily || r.equipmentFamily === equipmentFamily;
            return opMatch && famMatch;
        });

        if (compatible.length === 0) return null;

        // Calcular especificidade e ordenar
        const scored = compatible
            .map(r => ({
                rule: r,
                score: FormRulesEngine._calcSpecificity(r, operationType, equipmentFamily),
            }))
            .sort((a, b) =>
                b.score !== a.score
                    ? b.score - a.score
                    : b.rule.priority - a.rule.priority
            );

        return scored[0]?.rule.formTemplateId ?? null;
    },

    /**
     * Resolver para múltiplos equipamentos de uma vez (batch).
     * Retorna Map<equipmentId, formTemplateId | null>
     */
    resolveForEquipments: async (
        operationType: string,
        equipments: Array<{ id: string; family?: string }>
    ): Promise<Map<string, string | null>> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) return new Map();

        const result = new Map<string, string | null>();

        await Promise.all(
            equipments.map(async (eq) => {
                const formId = await FormRulesEngine.resolve({
                    tenantId,
                    operationType,
                    equipmentFamily: eq.family,
                });
                result.set(eq.id, formId);
            })
        );

        return result;
    },

    /**
     * Invalida o cache de regras do tenant.
     * Chamar após criar, editar ou desativar uma regra.
     */
    invalidateCache: (tenantId?: string): void => {
        const tid = tenantId ?? getCurrentTenantId();
        if (tid) CacheManager.invalidate(`form_rules_${tid}`);
    },

    // ── Private ──────────────────────────────────────────────────

    _loadRules: async (tenantId: string): Promise<FormRule[]> => {
        const cacheKey = `form_rules_${tenantId}`;
        const cached = CacheManager.get<FormRule[]>(cacheKey);
        if (cached) return cached;

        const { data, error } = await supabase
            .from('form_rules')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('priority', { ascending: false });

        if (error) {
            console.error('[FormRulesEngine] Falha ao carregar regras:', error);
            return [];
        }

        const rules = (data || []).map(FormRulesEngine._mapFromDB);
        CacheManager.set(cacheKey, rules, CacheManager.TTL.MEDIUM); // 5 min
        return rules;
    },

    _calcSpecificity: (
        rule: FormRule,
        opType?: string,
        family?: string
    ): number => {
        let score = 0;
        if (rule.operationType && rule.operationType === opType) score += 100;
        if (rule.equipmentFamily && rule.equipmentFamily === family) score += 100;
        return score;
    },

    _mapFromDB: (r: DbFormRule): FormRule => ({
        id: r.id,
        tenantId: r.tenant_id,
        formTemplateId: r.form_template_id,
        operationType: r.operation_type,
        equipmentFamily: r.equipment_family,
        priority: r.priority,
        isActive: r.is_active,
        version: r.version,
        createdAt: r.created_at,
        createdBy: r.created_by,
    }),
};
