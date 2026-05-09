/**
 * 🛡️ Nexus Pro - Schema Validation with Zod
 * 
 * Validação centralizada para garantir integridade de dados
 * em frontend e backend
 */

import { z } from 'zod';

// ============================================
// SCHEMAS DE VALIDAÇÃO
// ============================================

/**
 * User Schemas
 */
export const UserSchema = z.object({
    id: z.string().uuid().optional(),
    tenantId: z.string().uuid().optional(),
    name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').optional(),
    role: z.enum(['ADMIN', 'TECHNICIAN']),
    avatar: z.string().url().optional(),
    active: z.boolean().default(true),
    groupId: z.string().uuid().optional(),
});

export const LoginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Senha é obrigatória'),
});

/**
 * Order Schemas
 */
export const OrderItemSchema = z.object({
    id: z.string().uuid().optional(),
    description: z.string().min(1, 'Descrição é obrigatória').max(500),
    quantity: z.number().positive('Quantidade deve ser positiva'),
    unitPrice: z.number().nonnegative('Preço não pode ser negativo'),
    total: z.number().nonnegative(),
    fromStock: z.boolean().optional(),
    stockItemId: z.string().uuid().optional(),
});

export const OrderSchema = z.object({
    id: z.string().uuid().optional(),
    displayId: z.string().optional(),
    publicToken: z.string().optional(),
    tenantId: z.string().uuid().optional(),
    title: z.string().min(3, 'Título deve ter no mínimo 3 caracteres').max(200),
    description: z.string().max(5000, 'Descrição muito longa'),
    customerName: z.string().min(3, 'Nome do cliente é obrigatório'),
    customerAddress: z.string().min(5, 'Endereço é obrigatório'),
    status: z.enum(['PENDENTE', 'ATRIBUÍDO', 'EM ANDAMENTO', 'CONCLUÍDO', 'CANCELADO', 'IMPEDIDO']),
    priority: z.enum(['BAIXA', 'MÉDIA', 'ALTA', 'CRÍTICA']),
    operationType: z.string().optional(),
    assignedTo: z.string().uuid().optional(),
    formId: z.string().uuid().optional(),
    equipmentName: z.string().optional(),
    equipmentModel: z.string().optional(),
    equipmentSerial: z.string().optional(),
    scheduledDate: z.string().datetime('Data de agendamento inválida'),
    scheduledTime: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
    items: z.array(OrderItemSchema).optional(),
    showValueToClient: z.boolean().default(false),
    signature: z.string().optional(),
    signatureName: z.string().optional(),
    signatureDoc: z.string().optional(),
    billingStatus: z.enum(['PENDING', 'PAID']).optional(),
    paymentMethod: z.string().optional(),
    paidAt: z.string().datetime().optional(),
    billingNotes: z.string().optional(),
}).refine((data) => {
    // Validação: endDate deve ser >= startDate
    if (data.startDate && data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
}, {
    message: 'Data de término deve ser posterior à data de início',
    path: ['endDate'],
});

/**
 * Customer Schemas
 */
export const CustomerSchema = z.object({
    id: z.string().uuid().optional(),
    tenantId: z.string().uuid().optional(),
    type: z.enum(['PF', 'PJ']),
    name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(200),
    document: z.string().min(11, 'Documento inválido').max(18),
    email: z.string().email('Email inválido'),
    phone: z.string().min(10, 'Telefone inválido').max(15),
    whatsapp: z.string().min(10, 'WhatsApp inválido').max(15),
    zip: z.string().length(8, 'CEP deve ter 8 dígitos'),
    state: z.string().length(2, 'Estado deve ter 2 caracteres'),
    city: z.string().min(2, 'Cidade é obrigatória'),
    address: z.string().min(5, 'Endereço é obrigatório'),
    number: z.string().min(1, 'Número é obrigatório'),
    complement: z.string().optional(),
    active: z.boolean().default(true),
});

/**
 * Equipment Schemas
 */
export const EquipmentSchema = z.object({
    id: z.string().uuid().optional(),
    tenantId: z.string().uuid().optional(),
    serialNumber: z.string().min(1, 'Número de série é obrigatório').max(100),
    model: z.string().min(1, 'Modelo é obrigatório').max(100),
    familyId: z.string().uuid('Família inválida'),
    familyName: z.string(),
    description: z.string().max(500).optional(),
    customerId: z.string().uuid('Cliente inválido'),
    customerName: z.string(),
    active: z.boolean().default(true),
});

/**
 * Stock Schemas
 */
export const StockItemSchema = z.object({
    id: z.string().uuid().optional(),
    tenantId: z.string().uuid().optional(),
    code: z.string().min(1, 'Código é obrigatório').max(50),
    externalCode: z.string().max(50).optional(),
    description: z.string().min(1, 'Descrição é obrigatória').max(200),
    category: z.string().optional(),
    location: z.string().min(1, 'Localização é obrigatória').max(100),
    quantity: z.number().nonnegative('Quantidade não pode ser negativa'),
    minQuantity: z.number().nonnegative('Quantidade mínima não pode ser negativa'),
    costPrice: z.number().nonnegative('Preço de custo não pode ser negativo'),
    sellPrice: z.number().nonnegative('Preço de venda não pode ser negativo'),
    freightCost: z.number().nonnegative().optional(),
    taxCost: z.number().nonnegative().optional(),
    unit: z.enum(['UN', 'CX', 'PCT', 'M', 'CM', 'KG', 'G', 'L', 'ML', 'M2', 'M3', 'PAR', 'CJ']).optional(),
    lastRestockDate: z.string().datetime().optional(),
    active: z.boolean().default(true),
});

/**
 * Quote Schemas
 */
export const QuoteItemSchema = z.object({
    id: z.string().uuid().optional(),
    description: z.string().min(1, 'Descrição é obrigatória').max(500),
    quantity: z.number().positive('Quantidade deve ser positiva'),
    unitPrice: z.number().nonnegative('Preço não pode ser negativo'),
    total: z.number().nonnegative(),
    stockCode: z.string().max(50).optional(),
});

export const QuoteSchema = z.object({
    id: z.string().uuid().optional(),
    customerName: z.string().min(3, 'Nome do cliente é obrigatório'),
    customerAddress: z.string().min(5, 'Endereço é obrigatório'),
    title: z.string().min(3, 'Título é obrigatório').max(200),
    description: z.string().max(5000).optional(),
    items: z.array(QuoteItemSchema).min(1, 'Adicione pelo menos um item'),
    totalValue: z.number().nonnegative(),
    status: z.enum(['ABERTO', 'APROVADO', 'REJEITADO', 'CONVERTIDO', 'PENDENTE']),
    notes: z.string().max(2000).optional(),
    validUntil: z.string().datetime().optional(),
    linkedOrderId: z.string().uuid().optional(),
    publicToken: z.string().optional(),
});

/**
 * Tenant Schemas
 */
export const TenantSchema = z.object({
    id: z.string().uuid().optional(),
    slug: z.string().min(3, 'Slug deve ter no mínimo 3 caracteres').max(50).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
    name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(200),
    document: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    status: z.enum(['active', 'suspended']),
    osPrefix: z.string().max(10).optional(),
    osStartNumber: z.number().positive().optional(),
});

// ============================================
// TIPOS INFERIDOS
// ============================================

export type UserInput = z.infer<typeof UserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type OrderInput = z.infer<typeof OrderSchema>;
export type OrderItemInput = z.infer<typeof OrderItemSchema>;
export type CustomerInput = z.infer<typeof CustomerSchema>;
export type EquipmentInput = z.infer<typeof EquipmentSchema>;
export type StockItemInput = z.infer<typeof StockItemSchema>;
export type QuoteInput = z.infer<typeof QuoteSchema>;
export type QuoteItemInput = z.infer<typeof QuoteItemSchema>;
export type TenantInput = z.infer<typeof TenantSchema>;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Valida dados e retorna resultado tipado
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: boolean;
    data?: T;
    errors?: z.ZodError;
} {
    try {
        const validatedData = schema.parse(data);
        return { success: true, data: validatedData };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, errors: error };
        }
        throw error;
    }
}

/**
 * Formata erros de validação para exibição
 */
export function formatValidationErrors(errors: z.ZodError): Record<string, string> {
    const formatted: Record<string, string> = {};

    errors.issues.forEach((error) => {
        const path = error.path.join('.');
        formatted[path] = error.message;
    });

    return formatted;
}

/**
 * Valida e lança erro se inválido
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}
