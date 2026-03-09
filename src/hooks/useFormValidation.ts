/**
 * 🔧 Nexus Pro - Form Validation Hook
 * 
 * Hook para integrar validação Zod em formulários React
 */

import { useState, useCallback } from 'react';
import { z } from 'zod';
import { formatValidationErrors } from './validation';

export interface UseFormValidationOptions<T> {
    schema: z.ZodSchema<T>;
    onSuccess: (data: T) => void | Promise<void>;
    onError?: (errors: Record<string, string>) => void;
}

export function useFormValidation<T>({ schema, onSuccess, onError }: UseFormValidationOptions<T>) {
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const validate = useCallback((data: unknown): { valid: boolean; data?: T; errors?: Record<string, string> } => {
        try {
            const validatedData = schema.parse(data);
            setErrors({});
            return { valid: true, data: validatedData };
        } catch (error) {
            if (error instanceof z.ZodError) {
                const formattedErrors = formatValidationErrors(error);
                setErrors(formattedErrors);
                onError?.(formattedErrors);
                return { valid: false, errors: formattedErrors };
            }
            throw error;
        }
    }, [schema, onError]);

    const handleSubmit = useCallback(async (data: unknown) => {
        setIsSubmitting(true);
        try {
            const result = validate(data);
            if (result.valid && result.data) {
                await onSuccess(result.data);
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [validate, onSuccess]);

    const clearErrors = useCallback(() => {
        setErrors({});
    }, []);

    const setFieldError = useCallback((field: string, error: string) => {
        setErrors(prev => ({ ...prev, [field]: error }));
    }, []);

    const clearFieldError = useCallback((field: string) => {
        setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[field];
            return newErrors;
        });
    }, []);

    return {
        errors,
        isSubmitting,
        validate,
        handleSubmit,
        clearErrors,
        setFieldError,
        clearFieldError,
        hasErrors: Object.keys(errors).length > 0,
    };
}

/**
 * Hook para validação em tempo real de campo
 */
export function useFieldValidation<T>(schema: z.ZodSchema<T>, fieldName: string) {
    const [error, setError] = useState<string | null>(null);

    const validateField = useCallback((value: any) => {
        try {
            schema.parse(value);
            setError(null);
            return true;
        } catch (err) {
            if (err instanceof z.ZodError) {
                const fieldError = err.errors.find(e => e.path[0] === fieldName);
                setError(fieldError?.message || 'Erro de validação');
            }
            return false;
        }
    }, [schema, fieldName]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        error,
        validateField,
        clearError,
        hasError: error !== null,
    };
}
