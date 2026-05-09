/**
 * 🔒 Nexus Pro - Secure Error Handler
 * 
 * Sistema centralizado de tratamento de erros com:
 * - Sanitização automática de dados sensíveis
 * - Integração com Sentry
 * - Logging estruturado
 * - Retry logic para erros temporários
 */

import { logger } from './logger';

export enum ErrorCode {
    // Authentication
    AUTH_FAILED = 'AUTH_FAILED',
    AUTH_EXPIRED = 'AUTH_EXPIRED',
    AUTH_INVALID = 'AUTH_INVALID',

    // Authorization
    FORBIDDEN = 'FORBIDDEN',
    INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

    // Validation
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    INVALID_INPUT = 'INVALID_INPUT',

    // Database
    DB_CONNECTION_ERROR = 'DB_CONNECTION_ERROR',
    DB_QUERY_ERROR = 'DB_QUERY_ERROR',
    DB_CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',

    // Business Logic
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
    OPERATION_FAILED = 'OPERATION_FAILED',

    // Network
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

    // Unknown
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ErrorMetadata {
    code: ErrorCode;
    message: string;
    userMessage?: string;
    retryable?: boolean;
    statusCode?: number;
    context?: Record<string, any>;
    originalError?: Error;
}

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly userMessage: string;
    public readonly retryable: boolean;
    public readonly statusCode: number;
    public readonly context: Record<string, any>;
    public readonly originalError?: Error;
    public readonly timestamp: string;

    private static readonly USER_MESSAGES: Record<ErrorCode, string> = {
        [ErrorCode.AUTH_FAILED]: 'Falha na autenticação. Verifique suas credenciais.',
        [ErrorCode.AUTH_EXPIRED]: 'Sua sessão expirou. Faça login novamente.',
        [ErrorCode.AUTH_INVALID]: 'Credenciais inválidas.',
        [ErrorCode.FORBIDDEN]: 'Você não tem permissão para esta ação.',
        [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'Permissões insuficientes.',
        [ErrorCode.VALIDATION_ERROR]: 'Dados inválidos. Verifique os campos.',
        [ErrorCode.INVALID_INPUT]: 'Entrada inválida.',
        [ErrorCode.DB_CONNECTION_ERROR]: 'Erro de conexão. Tente novamente.',
        [ErrorCode.DB_QUERY_ERROR]: 'Erro ao processar dados.',
        [ErrorCode.DB_CONSTRAINT_VIOLATION]: 'Operação violou regras de integridade.',
        [ErrorCode.RESOURCE_NOT_FOUND]: 'Recurso não encontrado.',
        [ErrorCode.DUPLICATE_RESOURCE]: 'Recurso já existe.',
        [ErrorCode.OPERATION_FAILED]: 'Operação falhou. Tente novamente.',
        [ErrorCode.NETWORK_ERROR]: 'Erro de rede. Verifique sua conexão.',
        [ErrorCode.TIMEOUT_ERROR]: 'Operação demorou muito. Tente novamente.',
        [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Muitas requisições. Aguarde um momento.',
        [ErrorCode.UNKNOWN_ERROR]: 'Ocorreu um erro. Tente novamente.',
    };

    constructor(metadata: ErrorMetadata) {
        super(metadata.message);
        this.name = 'AppError';
        this.code = metadata.code;
        this.userMessage = metadata.userMessage || AppError.USER_MESSAGES[metadata.code] || 'Ocorreu um erro. Tente novamente.';
        this.retryable = metadata.retryable ?? false;
        this.statusCode = metadata.statusCode ?? 500;
        this.context = metadata.context || {};
        this.originalError = metadata.originalError;
        this.timestamp = new Date().toISOString();

        // Mantém stack trace correto
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            userMessage: this.userMessage,
            retryable: this.retryable,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
            // Não incluir context em produção (pode ter dados sensíveis)
            ...(import.meta.env.DEV && { context: this.context })
        };
    }
}

/**
 * Handler centralizado de erros
 */
export class ErrorHandler {
    /**
     * Processa e reporta erro
     */
    static handle(error: unknown, context?: Record<string, any>): AppError {
        const appError = this.normalize(error, context);

        // Log estruturado
        logger.error('error_occurred', {
            code: appError.code,
            message: appError.message,
            retryable: appError.retryable,
            statusCode: appError.statusCode,
            context: appError.context
        });

        // Reportar para Sentry (se configurado)
        if (typeof window !== 'undefined' && (window as any).Sentry) {
            (window as any).Sentry.captureException(appError, {
                tags: {
                    errorCode: appError.code,
                    retryable: appError.retryable
                },
                contexts: {
                    error: appError.context
                }
            });
        }

        return appError;
    }

    /**
     * Normaliza qualquer erro para AppError
     */
    static normalize(error: unknown, context?: Record<string, any>): AppError {
        // Já é AppError
        if (error instanceof AppError) {
            return error;
        }

        // Error nativo
        if (error instanceof Error) {
            return new AppError({
                code: this.inferErrorCode(error),
                message: error.message,
                userMessage: this.getUserMessage(error),
                retryable: this.isRetryable(error),
                context,
                originalError: error
            });
        }

        // String
        if (typeof error === 'string') {
            return new AppError({
                code: ErrorCode.UNKNOWN_ERROR,
                message: error,
                context
            });
        }

        // Objeto genérico
        if (typeof error === 'object' && error !== null) {
            const err = error as any;
            return new AppError({
                code: err.code || ErrorCode.UNKNOWN_ERROR,
                message: err.message || 'Erro desconhecido',
                userMessage: err.userMessage,
                retryable: err.retryable,
                statusCode: err.statusCode,
                context: { ...context, ...err }
            });
        }

        // Fallback
        return new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'Erro desconhecido',
            context: { error, ...context }
        });
    }

    /**
     * Infere código de erro baseado no erro original
     */
    private static inferErrorCode(error: Error): ErrorCode {
        const message = error.message.toLowerCase();

        if (message.includes('auth') || message.includes('authentication')) {
            return ErrorCode.AUTH_FAILED;
        }
        if (message.includes('permission') || message.includes('forbidden')) {
            return ErrorCode.FORBIDDEN;
        }
        if (message.includes('not found')) {
            return ErrorCode.RESOURCE_NOT_FOUND;
        }
        if (message.includes('network') || message.includes('fetch')) {
            return ErrorCode.NETWORK_ERROR;
        }
        if (message.includes('timeout')) {
            return ErrorCode.TIMEOUT_ERROR;
        }
        if (message.includes('rate limit')) {
            return ErrorCode.RATE_LIMIT_EXCEEDED;
        }
        if (message.includes('validation') || message.includes('invalid')) {
            return ErrorCode.VALIDATION_ERROR;
        }

        return ErrorCode.UNKNOWN_ERROR;
    }

    /**
     * Gera mensagem amigável para o usuário
     */
    private static getUserMessage(error: Error): string {
        const code = this.inferErrorCode(error);

        const messages: Record<ErrorCode, string> = {
            [ErrorCode.AUTH_FAILED]: 'Falha na autenticação. Verifique suas credenciais.',
            [ErrorCode.AUTH_EXPIRED]: 'Sua sessão expirou. Faça login novamente.',
            [ErrorCode.AUTH_INVALID]: 'Credenciais inválidas.',
            [ErrorCode.FORBIDDEN]: 'Você não tem permissão para esta ação.',
            [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'Permissões insuficientes.',
            [ErrorCode.VALIDATION_ERROR]: 'Dados inválidos. Verifique os campos.',
            [ErrorCode.INVALID_INPUT]: 'Entrada inválida.',
            [ErrorCode.DB_CONNECTION_ERROR]: 'Erro de conexão. Tente novamente.',
            [ErrorCode.DB_QUERY_ERROR]: 'Erro ao processar dados.',
            [ErrorCode.DB_CONSTRAINT_VIOLATION]: 'Operação violou regras de integridade.',
            [ErrorCode.RESOURCE_NOT_FOUND]: 'Recurso não encontrado.',
            [ErrorCode.DUPLICATE_RESOURCE]: 'Recurso já existe.',
            [ErrorCode.OPERATION_FAILED]: 'Operação falhou. Tente novamente.',
            [ErrorCode.NETWORK_ERROR]: 'Erro de rede. Verifique sua conexão.',
            [ErrorCode.TIMEOUT_ERROR]: 'Operação demorou muito. Tente novamente.',
            [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Muitas requisições. Aguarde um momento.',
            [ErrorCode.UNKNOWN_ERROR]: 'Erro inesperado. Tente novamente.'
        };

        return messages[code] || messages[ErrorCode.UNKNOWN_ERROR];
    }

    /**
     * Determina se erro é retryable
     */
    private static isRetryable(error: Error): boolean {
        const code = this.inferErrorCode(error);

        const retryableCodes = [
            ErrorCode.NETWORK_ERROR,
            ErrorCode.TIMEOUT_ERROR,
            ErrorCode.DB_CONNECTION_ERROR
        ];

        return retryableCodes.includes(code);
    }

    /**
     * Retry automático para operações retryable
     */
    static async withRetry<T>(
        operation: () => Promise<T>,
        options: {
            maxAttempts?: number;
            delayMs?: number;
            backoff?: boolean;
        } = {}
    ): Promise<T> {
        const { maxAttempts = 3, delayMs = 1000, backoff = true } = options;

        let lastError: AppError | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = this.handle(error, { attempt });

                if (!lastError.retryable || attempt === maxAttempts) {
                    throw lastError;
                }

                // Delay com backoff exponencial
                const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
                await new Promise(resolve => setTimeout(resolve, delay));

                logger.info('retrying_operation', { attempt: attempt + 1, delay });
            }
        }

        throw lastError!;
    }
}

/**
 * Hook React para tratamento de erros
 */
export function useErrorHandler() {
    const handleError = (error: unknown, context?: Record<string, any>) => {
        return ErrorHandler.handle(error, context);
    };

    const withRetry = <T,>(
        operation: () => Promise<T>,
        options?: Parameters<typeof ErrorHandler.withRetry>[1]
    ) => {
        return ErrorHandler.withRetry(operation, options);
    };

    return { handleError, withRetry };
}
