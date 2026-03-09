import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validate, formatValidationErrors, OrderSchema, CustomerSchema, LoginSchema } from '@/lib/validation';

describe('Validation System', () => {
    describe('validate function', () => {
        it('deve validar dados corretos', () => {
            const validLogin = {
                email: 'test@example.com',
                password: 'password123'
            };

            const result = validate(LoginSchema, validLogin);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(validLogin);
            expect(result.errors).toBeUndefined();
        });

        it('deve rejeitar email inválido', () => {
            const invalidLogin = {
                email: 'invalid-email',
                password: 'password123'
            };

            const result = validate(LoginSchema, invalidLogin);

            expect(result.success).toBe(false);
            expect(result.errors).toBeDefined();
        });

        it('deve rejeitar senha vazia', () => {
            const invalidLogin = {
                email: 'test@example.com',
                password: ''
            };

            const result = validate(LoginSchema, invalidLogin);

            expect(result.success).toBe(false);
            expect(result.errors).toBeDefined();
        });
    });

    describe('CustomerSchema', () => {
        const validCustomer = {
            type: 'PF' as const,
            name: 'João Silva',
            document: '12345678901',
            email: 'joao@example.com',
            phone: '11987654321',
            whatsapp: '11987654321',
            zip: '01234567',
            state: 'SP',
            city: 'São Paulo',
            address: 'Rua Exemplo, 123',
            number: '123',
            active: true
        };

        it('deve validar cliente válido', () => {
            const result = validate(CustomerSchema, validCustomer);
            expect(result.success).toBe(true);
        });

        it('deve rejeitar nome muito curto', () => {
            const invalid = { ...validCustomer, name: 'AB' };
            const result = validate(CustomerSchema, invalid);
            expect(result.success).toBe(false);
        });

        it('deve rejeitar CEP inválido', () => {
            const invalid = { ...validCustomer, zip: '123' };
            const result = validate(CustomerSchema, invalid);
            expect(result.success).toBe(false);
        });

        it('deve rejeitar estado inválido', () => {
            const invalid = { ...validCustomer, state: 'ABC' };
            const result = validate(CustomerSchema, invalid);
            expect(result.success).toBe(false);
        });
    });

    describe('OrderSchema', () => {
        const validOrder = {
            title: 'Manutenção Preventiva',
            description: 'Manutenção de equipamento',
            customerName: 'Cliente Teste',
            customerAddress: 'Rua Teste, 123',
            status: 'PENDENTE' as const,
            priority: 'MÉDIA' as const,
            scheduledDate: new Date().toISOString(),
            showValueToClient: false
        };

        it('deve validar ordem válida', () => {
            const result = validate(OrderSchema, validOrder);
            expect(result.success).toBe(true);
        });

        it('deve rejeitar título muito curto', () => {
            const invalid = { ...validOrder, title: 'AB' };
            const result = validate(OrderSchema, invalid);
            expect(result.success).toBe(false);
        });

        it('deve rejeitar status inválido', () => {
            const invalid = { ...validOrder, status: 'INVALIDO' };
            const result = validate(OrderSchema, invalid);
            expect(result.success).toBe(false);
        });

        it('deve rejeitar prioridade inválida', () => {
            const invalid = { ...validOrder, priority: 'URGENTISSIMA' };
            const result = validate(OrderSchema, invalid);
            expect(result.success).toBe(false);
        });

        it('deve validar endDate >= startDate', () => {
            const now = new Date();
            const future = new Date(now.getTime() + 3600000); // +1 hora

            const validWithDates = {
                ...validOrder,
                startDate: now.toISOString(),
                endDate: future.toISOString()
            };

            const result = validate(OrderSchema, validWithDates);
            expect(result.success).toBe(true);
        });

        it('deve rejeitar endDate < startDate', () => {
            const now = new Date();
            const past = new Date(now.getTime() - 3600000); // -1 hora

            const invalidWithDates = {
                ...validOrder,
                startDate: now.toISOString(),
                endDate: past.toISOString()
            };

            const result = validate(OrderSchema, invalidWithDates);
            expect(result.success).toBe(false);
        });
    });

    describe('formatValidationErrors', () => {
        it('deve formatar erros de validação', () => {
            const invalidData = {
                email: 'invalid',
                password: ''
            };

            const result = validate(LoginSchema, invalidData);

            if (!result.success && result.errors) {
                const formatted = formatValidationErrors(result.errors);

                expect(formatted).toHaveProperty('email');
                expect(formatted).toHaveProperty('password');
                expect(typeof formatted.email).toBe('string');
                expect(typeof formatted.password).toBe('string');
            }
        });
    });
});
