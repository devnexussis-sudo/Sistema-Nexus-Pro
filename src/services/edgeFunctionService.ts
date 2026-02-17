/**
 * Edge Function Service
 * 
 * Serviço para integração com Supabase Edge Functions
 * Este arquivo facilita chamadas às funções do backend
 */

import { supabase } from '../lib/supabase'
import type { ApiResponse, PaginatedResponse, ServiceOrder } from '../../shared/types'

// ============================================
// TYPES
// ============================================

interface GetOrdersParams {
    page?: number
    pageSize?: number
    status?: string
    priority?: string
    assignedTo?: string
    tenantId?: string
}

interface CreateOrderParams {
    title: string
    description: string
    customerName: string
    customerAddress: string
    priority: 'BAIXA' | 'MÉDIA' | 'ALTA' | 'CRÍTICA'
    scheduledDate: string
    scheduledTime?: string
    operationType?: string
    equipmentName?: string
    equipmentModel?: string
    equipmentSerial?: string
    tenantId?: string
    assignedTo?: string
}

// ============================================
// EDGE FUNCTION SERVICE
// ============================================

/**
 * Chama uma Edge Function genérica
 */
export const callEdgeFunction = async <T = any>(
    functionName: string,
    data?: any
): Promise<T> => {
    try {
        const { data: response, error } = await supabase.functions.invoke(
            functionName,
            { body: data }
        )

        if (error) {
            throw new Error(error.message || 'Erro ao chamar função')
        }

        return response as T
    } catch (error) {
        console.error(`Error calling edge function ${functionName}:`, error)
        throw error
    }
}

// ============================================
// ORDER FUNCTIONS
// ============================================

/**
 * Busca ordens de serviço com filtros e paginação
 */
export const getOrders = async (
    params: GetOrdersParams = {}
): Promise<PaginatedResponse<ServiceOrder>> => {
    try {
        const response = await callEdgeFunction<PaginatedResponse<ServiceOrder>>(
            'get-orders',
            params
        )

        if (!response.data) {
            throw new Error('Resposta inválida do servidor')
        }

        return response
    } catch (error) {
        console.error('Error fetching orders:', error)
        throw error
    }
}

/**
 * Cria uma nova ordem de serviço
 */
export const createOrder = async (
    params: CreateOrderParams
): Promise<ApiResponse<ServiceOrder>> => {
    try {
        const response = await callEdgeFunction<ApiResponse<ServiceOrder>>(
            'create-order',
            params
        )

        return response
    } catch (error) {
        console.error('Error creating order:', error)
        throw error
    }
}

/**
 * Atualiza uma ordem de serviço
 */
export const updateOrder = async (
    orderId: string,
    updates: Partial<ServiceOrder>
): Promise<ApiResponse<ServiceOrder>> => {
    try {
        const response = await callEdgeFunction<ApiResponse<ServiceOrder>>(
            'update-order',
            {
                orderId,
                updates,
            }
        )

        return response
    } catch (error) {
        console.error('Error updating order:', error)
        throw error
    }
}

/**
 * Deleta uma ordem de serviço
 */
export const deleteOrder = async (
    orderId: string
): Promise<ApiResponse<{ deleted: boolean }>> => {
    try {
        const response = await callEdgeFunction<ApiResponse<{ deleted: boolean }>>(
            'delete-order',
            { orderId }
        )

        return response
    } catch (error) {
        console.error('Error deleting order:', error)
        throw error
    }
}

/**
 * Atribui uma ordem de serviço a um técnico
 */
export const assignOrder = async (
    orderId: string,
    technicianId: string
): Promise<ApiResponse<ServiceOrder>> => {
    try {
        const response = await callEdgeFunction<ApiResponse<ServiceOrder>>(
            'assign-order',
            {
                orderId,
                technicianId,
            }
        )

        return response
    } catch (error) {
        console.error('Error assigning order:', error)
        throw error
    }
}

/**
 * Inicia uma ordem de serviço
 */
export const startOrder = async (
    orderId: string
): Promise<ApiResponse<ServiceOrder>> => {
    try {
        const response = await callEdgeFunction<ApiResponse<ServiceOrder>>(
            'start-order',
            { orderId }
        )

        return response
    } catch (error) {
        console.error('Error starting order:', error)
        throw error
    }
}

/**
 * Completa uma ordem de serviço
 */
export const completeOrder = async (
    orderId: string,
    formData?: Record<string, any>
): Promise<ApiResponse<ServiceOrder>> => {
    try {
        const response = await callEdgeFunction<ApiResponse<ServiceOrder>>(
            'complete-order',
            {
                orderId,
                formData,
            }
        )

        return response
    } catch (error) {
        console.error('Error completing order:', error)
        throw error
    }
}

// ============================================
// EXPORT
// ============================================

export const edgeFunctionService = {
    callEdgeFunction,
    orders: {
        get: getOrders,
        create: createOrder,
        update: updateOrder,
        delete: deleteOrder,
        assign: assignOrder,
        start: startOrder,
        complete: completeOrder,
    },
}

export default edgeFunctionService
