/**
 * 🤝 TIPOS COMPARTILHADOS
 * Este arquivo contém tipos TypeScript compartilhados entre Frontend e Backend
 * 
 * IMPORTANTE: 
 * - Qualquer alteração aqui afeta tanto o frontend quanto o backend
 * - Mantenha sincronizado com o Supabase schema
 * - Use este arquivo como fonte única de verdade para tipos
 */

// ============================================
// ENUMS
// ============================================

export enum UserRole {
    ADMIN = 'ADMIN',
    TECHNICIAN = 'TECHNICIAN'
}

export enum OrderStatus {
    PENDING = 'PENDENTE',
    ASSIGNED = 'ATRIBUÍDO',
    IN_PROGRESS = 'EM ANDAMENTO',
    COMPLETED = 'CONCLUÍDO',
    CANCELED = 'CANCELADO'
}

export enum OrderPriority {
    LOW = 'BAIXA',
    MEDIUM = 'MÉDIA',
    HIGH = 'ALTA',
    CRITICAL = 'CRÍTICA'
}

export enum FormFieldType {
    TEXT = 'TEXT',
    LONG_TEXT = 'LONG_TEXT',
    SELECT = 'SELECT',
    PHOTO = 'PHOTO',
    SIGNATURE = 'SIGNATURE'
}

// ============================================
// INTERFACES - AUTENTICAÇÃO E PERMISSÕES
// ============================================

export interface UserPermissions {
    // Atividades (O.S.)
    orders: { create: boolean; read: boolean; update: boolean; delete: boolean };
    // Clientes
    customers: { create: boolean; read: boolean; update: boolean; delete: boolean };
    // Ativos (Equipamentos)
    equipments: { create: boolean; read: boolean; update: boolean; delete: boolean };
    // Técnicos
    technicians: { create: boolean; read: boolean; update: boolean; delete: boolean };
    // Configurações e Sistema
    settings: boolean;
    manageUsers: boolean;
    accessSuperAdmin: boolean;
}

export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
}

// ============================================
// INTERFACES - MULTI-TENANCY
// ============================================

export interface Tenant {
    id: string;
    slug: string;
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    address?: string;
    status: 'active' | 'suspended';
    created_at?: string;
    updated_at?: string;
    userCount?: number;
    osCount?: number;
    activeTechs?: number;
    osPrefix?: string; // ex: 'OS-2025-'
    osStartNumber?: number; // ex: 1000
}

// ============================================
// INTERFACES - USUÁRIOS
// ============================================

export interface User {
    id: string;
    tenantId?: string; // Multi-tenancy
    name: string;
    email: string;
    password?: string; // Nunca retornar do backend!
    role: UserRole;
    avatar?: string;
    active?: boolean;
    permissions?: UserPermissions;
    created_at?: string;
    updated_at?: string;
}

// ============================================
// INTERFACES - ORDENS DE SERVIÇO
// ============================================

export interface ServiceOrder {
    id: string;
    tenantId?: string; // Multi-tenancy
    title: string;
    description: string;
    customerName: string;
    customerAddress: string;
    status: OrderStatus;
    priority: OrderPriority;
    operationType?: string;
    assignedTo?: string;
    formId?: string; // Vínculo direto com o modelo de checklist
    equipmentName?: string;
    equipmentModel?: string;
    equipmentSerial?: string;
    createdAt: string;
    updatedAt: string;
    scheduledDate: string;
    scheduledTime?: string;
    startDate?: string;
    endDate?: string;
    notes?: string;
    formData?: Record<string, any>;
}

// ============================================
// INTERFACES - CLIENTES
// ============================================

export interface Customer {
    id: string;
    tenantId?: string; // Multi-tenancy
    type: 'PF' | 'PJ';
    name: string;
    document: string;
    email: string;
    phone: string;
    whatsapp: string;
    zip: string;
    state: string;
    city: string;
    address: string;
    number: string;
    complement: string;
    active: boolean;
    created_at?: string;
    updated_at?: string;
}

// ============================================
// INTERFACES - EQUIPAMENTOS
// ============================================

export interface EquipmentFamily {
    id: string;
    tenantId?: string; // Multi-tenancy
    name: string;
    description: string;
    active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface Equipment {
    id: string;
    tenantId?: string; // Multi-tenancy
    serialNumber: string;
    model: string;
    familyId: string;
    familyName: string;
    description: string;
    customerId: string;
    customerName: string;
    active: boolean;
    createdAt: string;
    updated_at?: string;
}

// ============================================
// INTERFACES - FORMULÁRIOS E CHECKLISTS
// ============================================

export interface FormField {
    id: string;
    label: string;
    type: FormFieldType;
    required: boolean;
    options?: string[];
}

export interface FormTemplate {
    id: string;
    title: string;
    targetType?: string;
    targetFamily?: string;
    fields: FormField[];
    active: boolean;
    created_at?: string;
    updated_at?: string;
}

// ============================================
// TYPES - API RESPONSES
// ============================================

export type ApiResponse<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: {
        message: string;
        code?: string;
        details?: unknown;
    };
};

export type PaginatedResponse<T> = {
    data: T[];
    pagination: {
        page: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
    };
};

// ============================================
// TYPES - VALIDAÇÃO
// ============================================

export type ValidationError = {
    field: string;
    message: string;
};

export type ValidationResult = {
    valid: boolean;
    errors?: ValidationError[];
};

// ============================================
// EXPORT ALL
// ============================================

export type {
    // Já exportados acima via interface/type
};
