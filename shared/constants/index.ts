/**
 * 🤝 CONSTANTES COMPARTILHADAS
 * Este arquivo contém constantes compartilhadas entre Frontend e Backend
 */

// ============================================
// API CONFIGURATION
// ============================================

export const API_CONFIG = {
    VERSION: 'v1',
    TIMEOUT: 30000, // 30 segundos
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 segundo
} as const;

// ============================================
// PAGINATION
// ============================================

export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

// ============================================
// ORDER STATUS CONFIG
// ============================================

export const ORDER_STATUS_CONFIG = {
    PENDENTE: {
        color: '#F59E0B', // Amber
        label: 'Pendente',
        icon: 'Clock',
    },
    ATRIBUÍDO: {
        color: '#3B82F6', // Blue
        label: 'Atribuído',
        icon: 'UserCheck',
    },
    'EM ANDAMENTO': {
        color: '#8B5CF6', // Purple
        label: 'Em Andamento',
        icon: 'Wrench',
    },
    CONCLUÍDO: {
        color: '#10B981', // Green
        label: 'Concluído',
        icon: 'CheckCircle',
    },
    CANCELADO: {
        color: '#EF4444', // Red
        label: 'Cancelado',
        icon: 'XCircle',
    },
} as const;

// ============================================
// PRIORITY CONFIG
// ============================================

export const PRIORITY_CONFIG = {
    BAIXA: {
        color: '#6B7280', // Gray
        label: 'Baixa',
        level: 1,
    },
    MÉDIA: {
        color: '#3B82F6', // Blue
        label: 'Média',
        level: 2,
    },
    ALTA: {
        color: '#F59E0B', // Amber
        label: 'Alta',
        level: 3,
    },
    CRÍTICA: {
        color: '#EF4444', // Red
        label: 'Crítica',
        level: 4,
    },
} as const;

// ============================================
// FIELD TYPES CONFIG
// ============================================

export const FIELD_TYPE_CONFIG = {
    TEXT: {
        label: 'Texto',
        icon: 'Type',
    },
    LONG_TEXT: {
        label: 'Texto Longo',
        icon: 'AlignLeft',
    },
    SELECT: {
        label: 'Seleção',
        icon: 'List',
    },
    PHOTO: {
        label: 'Foto',
        icon: 'Camera',
    },
    SIGNATURE: {
        label: 'Assinatura',
        icon: 'PenTool',
    },
} as const;

// ============================================
// VALIDATION RULES
// ============================================

export const VALIDATION_RULES = {
    EMAIL: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Email inválido',
    },
    PHONE: {
        pattern: /^\(\d{2}\)\s\d{4,5}-\d{4}$/,
        message: 'Telefone inválido. Formato: (XX) XXXXX-XXXX',
    },
    CPF: {
        pattern: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
        message: 'CPF inválido. Formato: XXX.XXX.XXX-XX',
    },
    CNPJ: {
        pattern: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
        message: 'CNPJ inválido. Formato: XX.XXX.XXX/XXXX-XX',
    },
    ZIP: {
        pattern: /^\d{5}-\d{3}$/,
        message: 'CEP inválido. Formato: XXXXX-XXX',
    },
    PASSWORD: {
        minLength: 6,
        message: 'Senha deve ter no mínimo 6 caracteres',
    },
    NAME: {
        minLength: 3,
        message: 'Nome deve ter no mínimo 3 caracteres',
    },
} as const;

// ============================================
// FILE UPLOAD LIMITS
// ============================================

export const FILE_UPLOAD = {
    MAX_SIZE_MB: 5,
    MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const;

// ============================================
// DATE/TIME FORMATS
// ============================================

export const DATE_FORMATS = {
    DATE: 'DD/MM/YYYY',
    TIME: 'HH:mm',
    DATETIME: 'DD/MM/YYYY HH:mm',
    DATETIME_FULL: 'DD/MM/YYYY HH:mm:ss',
    ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
} as const;

// ============================================
// ORDER ID CONFIGURATION
// ============================================

export const ORDER_ID_CONFIG = {
    DEFAULT_PREFIX: 'OS',
    DEFAULT_START_NUMBER: 1000,
    YEAR_INCLUDED: true,
    PADDING: 4, // Número de dígitos (ex: 0001)
} as const;

// ============================================
// OPERATION TYPES (Tipos de Operação)
// ============================================

export const OPERATION_TYPES = [
    'Manutenção Preventiva',
    'Manutenção Corretiva',
    'Instalação',
    'Desinstalação',
    'Vistoria',
    'Orçamento',
    'Consultoria',
    'Treinamento',
    'Outros',
] as const;

// ============================================
// ERROR CODES
// ============================================

export const ERROR_CODES = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',
} as const;

// ============================================
// SUCCESS MESSAGES
// ============================================

export const SUCCESS_MESSAGES = {
    ORDER_CREATED: 'Ordem de serviço criada com sucesso!',
    ORDER_UPDATED: 'Ordem de serviço atualizada com sucesso!',
    ORDER_DELETED: 'Ordem de serviço deletada com sucesso!',
    CUSTOMER_CREATED: 'Cliente cadastrado com sucesso!',
    CUSTOMER_UPDATED: 'Cliente atualizado com sucesso!',
    CUSTOMER_DELETED: 'Cliente deletado com sucesso!',
    TECHNICIAN_CREATED: 'Técnico cadastrado com sucesso!',
    TECHNICIAN_UPDATED: 'Técnico atualizado com sucesso!',
    TECHNICIAN_DELETED: 'Técnico deletado com sucesso!',
    EQUIPMENT_CREATED: 'Equipamento cadastrado com sucesso!',
    EQUIPMENT_UPDATED: 'Equipamento atualizado com sucesso!',
    EQUIPMENT_DELETED: 'Equipamento deletado com sucesso!',
    LOGIN_SUCCESS: 'Login realizado com sucesso!',
    LOGOUT_SUCCESS: 'Logout realizado com sucesso!',
} as const;

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES = {
    GENERIC: 'Ocorreu um erro. Por favor, tente novamente.',
    NETWORK: 'Erro de conexão. Verifique sua internet.',
    UNAUTHORIZED: 'Você não tem permissão para acessar este recurso.',
    INVALID_CREDENTIALS: 'Email ou senha incorretos.',
    SESSION_EXPIRED: 'Sua sessão expirou. Por favor, faça login novamente.',
    NOT_FOUND: 'Recurso não encontrado.',
    VALIDATION_FAILED: 'Por favor, verifique os campos do formulário.',
} as const;

// ============================================
// LOCAL STORAGE KEYS
// ============================================

export const STORAGE_KEYS = {
    AUTH_TOKEN: 'nexus_auth_token',
    USER_DATA: 'nexus_user_data',
    TENANT_ID: 'nexus_tenant_id',
    THEME: 'nexus_theme',
    LANGUAGE: 'nexus_language',
} as const;

// ============================================
// PERMISSIONS PRESETS
// ============================================

export const PERMISSIONS_PRESETS = {
    SUPER_ADMIN: {
        orders: { create: true, read: true, update: true, delete: true },
        customers: { create: true, read: true, update: true, delete: true },
        equipments: { create: true, read: true, update: true, delete: true },
        technicians: { create: true, read: true, update: true, delete: true },
        settings: true,
        manageUsers: true,
        accessSuperAdmin: true,
    },
    ADMIN: {
        orders: { create: true, read: true, update: true, delete: true },
        customers: { create: true, read: true, update: true, delete: true },
        equipments: { create: true, read: true, update: true, delete: true },
        technicians: { create: true, read: true, update: true, delete: false },
        settings: true,
        manageUsers: true,
        accessSuperAdmin: false,
    },
    TECHNICIAN: {
        orders: { create: false, read: true, update: true, delete: false },
        customers: { create: false, read: true, update: false, delete: false },
        equipments: { create: false, read: true, update: false, delete: false },
        technicians: { create: false, read: false, update: false, delete: false },
        settings: false,
        manageUsers: false,
        accessSuperAdmin: false,
    },
} as const;

// ============================================
// EXPORT ALL
// ============================================

export type OperationType = typeof OPERATION_TYPES[number];
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
