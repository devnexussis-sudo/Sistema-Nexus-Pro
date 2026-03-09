import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorHandler, AppError, ErrorCode } from '@/lib/errorHandler';

describe('ErrorHandler', () => {
    describe('AppError', () => {
        it('deve criar erro com todas as propriedades', () => {
            const error = new AppError({
                code: ErrorCode.VALIDATION_ERROR,
                message: 'Test error',
                userMessage: 'User friendly message',
                retryable: true,
                statusCode: 400,
                context: { field: 'email' }
            });

            expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
            expect(error.message).toBe('Test error');
            expect(error.userMessage).toBe('User friendly message');
            expect(error.retryable).toBe(true);
            expect(error.statusCode).toBe(400);
            expect(error.context).toEqual({ field: 'email' });
            expect(error.timestamp).toBeDefined();
        });

        it('deve usar valores padrão quando não fornecidos', () => {
            const error = new AppError({
                code: ErrorCode.UNKNOWN_ERROR,
                message: 'Test error'
            });

            expect(error.userMessage).toBe('Ocorreu um erro. Tente novamente.');
            expect(error.retryable).toBe(false);
            expect(error.statusCode).toBe(500);
            expect(error.context).toEqual({});
        });

        it('deve serializar para JSON corretamente', () => {
            const error = new AppError({
                code: ErrorCode.AUTH_FAILED,
                message: 'Authentication failed',
                context: { attempt: 1 }
            });

            const json = error.toJSON();

            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('code');
            expect(json).toHaveProperty('message');
            expect(json).toHaveProperty('userMessage');
            expect(json).toHaveProperty('timestamp');
        });
    });

    describe('normalize', () => {
        it('deve normalizar AppError', () => {
            const original = new AppError({
                code: ErrorCode.AUTH_FAILED,
                message: 'Auth failed'
            });

            const normalized = ErrorHandler.normalize(original);

            expect(normalized).toBe(original);
        });

        it('deve normalizar Error nativo', () => {
            const original = new Error('Network error');
            const normalized = ErrorHandler.normalize(original);

            expect(normalized).toBeInstanceOf(AppError);
            expect(normalized.message).toBe('Network error');
            expect(normalized.code).toBe(ErrorCode.NETWORK_ERROR);
        });

        it('deve normalizar string', () => {
            const normalized = ErrorHandler.normalize('Something went wrong');

            expect(normalized).toBeInstanceOf(AppError);
            expect(normalized.message).toBe('Something went wrong');
            expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
        });

        it('deve normalizar objeto genérico', () => {
            const normalized = ErrorHandler.normalize({
                message: 'Custom error',
                code: 'CUSTOM_CODE'
            });

            expect(normalized).toBeInstanceOf(AppError);
            expect(normalized.message).toBe('Custom error');
        });

        it('deve inferir código de erro corretamente', () => {
            const authError = new Error('Authentication failed');
            const normalized = ErrorHandler.normalize(authError);
            expect(normalized.code).toBe(ErrorCode.AUTH_FAILED);

            const networkError = new Error('Network request failed');
            const normalizedNetwork = ErrorHandler.normalize(networkError);
            expect(normalizedNetwork.code).toBe(ErrorCode.NETWORK_ERROR);

            const notFoundError = new Error('Resource not found');
            const normalizedNotFound = ErrorHandler.normalize(notFoundError);
            expect(normalizedNotFound.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        });
    });

    describe('isRetryable', () => {
        it('deve marcar erros de rede como retryable', () => {
            const error = new Error('Network error');
            const normalized = ErrorHandler.normalize(error);
            expect(normalized.retryable).toBe(true);
        });

        it('deve marcar erros de timeout como retryable', () => {
            const error = new Error('Request timeout');
            const normalized = ErrorHandler.normalize(error);
            expect(normalized.retryable).toBe(true);
        });

        it('deve marcar erros de validação como não retryable', () => {
            const error = new Error('Validation failed');
            const normalized = ErrorHandler.normalize(error);
            expect(normalized.retryable).toBe(false);
        });
    });

    describe('getUserMessage', () => {
        it('deve retornar mensagem amigável para AUTH_FAILED', () => {
            const error = new AppError({
                code: ErrorCode.AUTH_FAILED,
                message: 'Auth failed'
            });

            expect(error.userMessage).toContain('autenticação');
        });

        it('deve retornar mensagem amigável para NETWORK_ERROR', () => {
            const error = new Error('Network error');
            const normalized = ErrorHandler.normalize(error);

            expect(normalized.userMessage).toContain('rede');
        });

        it('deve retornar mensagem amigável para VALIDATION_ERROR', () => {
            const error = new Error('Invalid input');
            const normalized = ErrorHandler.normalize(error);

            expect(normalized.userMessage).toContain('inválid');
        });
    });

    describe('withRetry', () => {
        it('deve executar operação com sucesso na primeira tentativa', async () => {
            const operation = vi.fn().mockResolvedValue('success');

            const result = await ErrorHandler.withRetry(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('deve retry em caso de erro retryable', async () => {
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce('success');

            const result = await ErrorHandler.withRetry(operation, {
                maxAttempts: 3,
                delayMs: 10,
                backoff: false
            });

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('deve lançar erro após max attempts', async () => {
            const operation = vi.fn().mockRejectedValue(new Error('Network error'));

            await expect(
                ErrorHandler.withRetry(operation, {
                    maxAttempts: 3,
                    delayMs: 10,
                    backoff: false
                })
            ).rejects.toThrow();

            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('não deve retry erro não retryable', async () => {
            const operation = vi.fn().mockRejectedValue(new Error('Validation failed'));

            await expect(
                ErrorHandler.withRetry(operation, {
                    maxAttempts: 3,
                    delayMs: 10
                })
            ).rejects.toThrow();

            expect(operation).toHaveBeenCalledTimes(1);
        });
    });
});
