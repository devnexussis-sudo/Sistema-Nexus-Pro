/**
 * 🤝 UTILITÁRIOS COMPARTILHADOS
 * Funções utilitárias que podem ser usadas tanto no Frontend quanto no Backend
 */

import { VALIDATION_RULES } from '../constants';

// ============================================
// VALIDAÇÃO
// ============================================

/**
 * Valida email
 */
export const isValidEmail = (email: string): boolean => {
    return VALIDATION_RULES.EMAIL.pattern.test(email);
};

/**
 * Valida CPF
 */
export const isValidCPF = (cpf: string): boolean => {
    // Remove formatação
    const cleanCPF = cpf.replace(/\D/g, '');

    if (cleanCPF.length !== 11) return false;

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

    // Validação dos dígitos verificadores
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
    }
    let digit = 11 - (sum % 11);
    if (digit >= 10) digit = 0;
    if (digit !== parseInt(cleanCPF.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
    }
    digit = 11 - (sum % 11);
    if (digit >= 10) digit = 0;
    if (digit !== parseInt(cleanCPF.charAt(10))) return false;

    return true;
};

/**
 * Valida CNPJ
 */
export const isValidCNPJ = (cnpj: string): boolean => {
    // Remove formatação
    const cleanCNPJ = cnpj.replace(/\D/g, '');

    if (cleanCNPJ.length !== 14) return false;

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false;

    // Validação dos dígitos verificadores
    const calcDigit = (cnpj: string, positions: number) => {
        let sum = 0;
        let pos = positions - 7;
        for (let i = positions; i >= 1; i--) {
            sum += parseInt(cnpj.charAt(positions - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        const result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        return result;
    };

    const digit1 = calcDigit(cleanCNPJ, 12);
    const digit2 = calcDigit(cleanCNPJ, 13);

    return digit1 === parseInt(cleanCNPJ.charAt(12)) &&
        digit2 === parseInt(cleanCNPJ.charAt(13));
};

/**
 * Valida telefone brasileiro
 */
export const isValidPhone = (phone: string): boolean => {
    const cleanPhone = phone.replace(/\D/g, '');
    return cleanPhone.length === 10 || cleanPhone.length === 11;
};

/**
 * Valida CEP brasileiro
 */
export const isValidZip = (zip: string): boolean => {
    const cleanZip = zip.replace(/\D/g, '');
    return cleanZip.length === 8;
};

// ============================================
// FORMATAÇÃO
// ============================================

/**
 * Formata CPF
 */
export const formatCPF = (cpf: string): string => {
    const clean = cpf.replace(/\D/g, '');
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

/**
 * Formata CNPJ
 */
export const formatCNPJ = (cnpj: string): string => {
    const clean = cnpj.replace(/\D/g, '');
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};

/**
 * Formata telefone brasileiro
 */
export const formatPhone = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
        return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (clean.length === 10) {
        return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
};

/**
 * Formata CEP brasileiro
 */
export const formatZip = (zip: string): string => {
    const clean = zip.replace(/\D/g, '');
    return clean.replace(/(\d{5})(\d{3})/, '$1-$2');
};

/**
 * Formata moeda brasileira
 */
export const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
};

/**
 * Formata data para padrão brasileiro
 */
export const formatDate = (date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('pt-BR').format(d);
};

/**
 * Formata data e hora para padrão brasileiro
 */
export const formatDateTime = (date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(d);
};

// ============================================
// MANIPULAÇÃO DE STRINGS
// ============================================

/**
 * Capitaliza primeira letra
 */
export const capitalize = (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Converte para slug (URL friendly)
 */
export const slugify = (str: string): string => {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, '-') // Substitui espaços por hífen
        .replace(/-+/g, '-') // Remove hífens duplicados
        .trim();
};

/**
 * Trunca texto com reticências
 */
export const truncate = (str: string, maxLength: number): string => {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
};

/**
 * Remove acentos e caracteres especiais
 */
export const removeAccents = (str: string): string => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

// ============================================
// MANIPULAÇÃO DE ARRAYS
// ============================================

/**
 * Remove duplicatas de array
 */
export const unique = <T>(arr: T[]): T[] => {
    return [...new Set(arr)];
};

/**
 * Ordena array de objetos por propriedade
 */
export const sortBy = <T>(arr: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] => {
    return [...arr].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];

        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
    });
};

/**
 * Agrupa array de objetos por propriedade
 */
export const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((acc, item) => {
        const groupKey = String(item[key]);
        if (!acc[groupKey]) {
            acc[groupKey] = [];
        }
        acc[groupKey].push(item);
        return acc;
    }, {} as Record<string, T[]>);
};

// ============================================
// MANIPULAÇÃO DE DATAS
// ============================================

/**
 * Verifica se data é hoje
 */
export const isToday = (date: Date | string): boolean => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    return d.toDateString() === today.toDateString();
};

/**
 * Verifica se data é no passado
 */
export const isPast = (date: Date | string): boolean => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d < new Date();
};

/**
 * Verifica se data é no futuro
 */
export const isFuture = (date: Date | string): boolean => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d > new Date();
};

/**
 * Adiciona dias a uma data
 */
export const addDays = (date: Date | string, days: number): Date => {
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

/**
 * Diferença entre duas datas em dias
 */
export const diffInDays = (date1: Date | string, date2: Date | string): number => {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// ============================================
// UTILITÁRIOS GERAIS
// ============================================

/**
 * Gera ID único simples
 */
export const generateId = (prefix: string = ''): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
};

/**
 * Delay assíncrono
 */
export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Debounce function
 */
export const debounce = <T extends (...args: any[]) => any>(
    func: T,
    wait: number
): ((...args: Parameters<T>) => void) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

/**
 * Clona objeto profundo
 */
export const deepClone = <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
};

/**
 * Verifica se objeto está vazio
 */
export const isEmpty = (obj: any): boolean => {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    return false;
};

/**
 * Gera cor hexadecimal a partir de string (útil para avatares)
 */
export const stringToColor = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = hash % 360;
    return `hsl(${hue}, 70%, 60%)`;
};

/**
 * Obtém iniciais do nome
 */
export const getInitials = (name: string): string => {
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
};
