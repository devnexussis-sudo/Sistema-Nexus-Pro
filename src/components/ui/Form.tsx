/**
 * 🎨 Nexus Pro - Reusable Form Components
 * Componentes de formulário com validação integrada
 */

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, helperText, required, className = '', ...props }, ref) => {
        const id = props.id || props.name;

        return (
            <div className="mb-4">
                {label && (
                    <label htmlFor={id} className="block text-sm font-medium mb-1">
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                )}
                <input
                    ref={ref}
                    id={id}
                    className={`
            w-full px-3 py-2 border rounded-lg
            focus:outline-none focus:ring-2 focus:ring-green-500
            ${error ? 'border-red-500' : 'border-gray-300'}
            ${className}
          `}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
                    {...props}
                />
                {error && (
                    <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
                        {error}
                    </p>
                )}
                {!error && helperText && (
                    <p id={`${id}-helper`} className="mt-1 text-sm text-gray-500">
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    helperText?: string;
    required?: boolean;
    options: Array<{ value: string; label: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, error, helperText, required, options, className = '', ...props }, ref) => {
        const id = props.id || props.name;

        return (
            <div className="mb-4">
                {label && (
                    <label htmlFor={id} className="block text-sm font-medium mb-1">
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                )}
                <select
                    ref={ref}
                    id={id}
                    className={`
            w-full px-3 py-2 border rounded-lg
            focus:outline-none focus:ring-2 focus:ring-green-500
            ${error ? 'border-red-500' : 'border-gray-300'}
            ${className}
          `}
                    aria-invalid={!!error}
                    {...props}
                >
                    <option value="">Selecione...</option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {error && (
                    <p className="mt-1 text-sm text-red-600">{error}</p>
                )}
                {!error && helperText && (
                    <p className="mt-1 text-sm text-gray-500">{helperText}</p>
                )}
            </div>
        );
    }
);

Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    helperText?: string;
    required?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ label, error, helperText, required, className = '', ...props }, ref) => {
        const id = props.id || props.name;

        return (
            <div className="mb-4">
                {label && (
                    <label htmlFor={id} className="block text-sm font-medium mb-1">
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                )}
                <textarea
                    ref={ref}
                    id={id}
                    className={`
            w-full px-3 py-2 border rounded-lg
            focus:outline-none focus:ring-2 focus:ring-green-500
            ${error ? 'border-red-500' : 'border-gray-300'}
            ${className}
          `}
                    rows={4}
                    {...props}
                />
                {error && (
                    <p className="mt-1 text-sm text-red-600">{error}</p>
                )}
                {!error && helperText && (
                    <p className="mt-1 text-sm text-gray-500">{helperText}</p>
                )}
            </div>
        );
    }
);

Textarea.displayName = 'Textarea';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({
        variant = 'primary',
        size = 'md',
        isLoading = false,
        icon,
        children,
        className = '',
        disabled,
        ...props
    }, ref) => {
        const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

        const variantClasses = {
            primary: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
            secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
            danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
            ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
        };

        const sizeClasses = {
            sm: 'px-3 py-1.5 text-sm',
            md: 'px-4 py-2',
            lg: 'px-6 py-3 text-lg',
        };

        return (
            <button
                ref={ref}
                className={`
          ${baseClasses}
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                )}
                {icon && !isLoading && <span className="mr-2">{icon}</span>}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';

export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
    isLoading?: boolean;
}

export const Form = React.forwardRef<HTMLFormElement, FormProps>(
    ({ isLoading, children, className = '', ...props }, ref) => {
        return (
            <form
                ref={ref}
                className={`${isLoading ? 'opacity-60 pointer-events-none' : ''} ${className}`}
                {...props}
            >
                {children}
            </form>
        );
    }
);

Form.displayName = 'Form';
