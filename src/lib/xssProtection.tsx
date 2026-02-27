/**
 * 🛡️ Nexus Pro - XSS Protection Utilities
 * 
 * Utilitários para prevenir ataques XSS (Cross-Site Scripting)
 */

import DOMPurify from 'dompurify';

/**
 * Configurações padrão do DOMPurify
 */
const DEFAULT_CONFIG: DOMPurify.Config = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * Configuração restrita (apenas texto formatado básico)
 */
const STRICT_CONFIG: DOMPurify.Config = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br'],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
};

/**
 * Configuração para texto puro (remove todas as tags)
 */
const TEXT_ONLY_CONFIG: DOMPurify.Config = {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
};

/**
 * Sanitiza HTML com configuração padrão
 */
export function sanitizeHtml(dirty: string, config?: DOMPurify.Config): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Sanitiza HTML com configuração restrita
 */
export function sanitizeHtmlStrict(dirty: string): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, STRICT_CONFIG);
}

/**
 * Remove todas as tags HTML, mantendo apenas texto
 */
export function sanitizeTextOnly(dirty: string): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, TEXT_ONLY_CONFIG);
}

/**
 * Sanitiza URL para prevenir javascript: e data: URIs
 */
export function sanitizeUrl(url: string): string {
    if (!url) return '';

    // Remove espaços em branco
    const trimmed = url.trim();

    // Bloqueia protocolos perigosos
    const dangerous = /^(javascript|data|vbscript):/i;
    if (dangerous.test(trimmed)) {
        return '';
    }

    return trimmed;
}

/**
 * Escapa caracteres especiais HTML
 */
export function escapeHtml(text: string): string {
    if (!text) return '';

    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Componente React para renderizar HTML sanitizado
 */
export interface SafeHtmlProps {
    html: string;
    config?: DOMPurify.Config;
    className?: string;
    strict?: boolean;
}

export function SafeHtml({ html, config, className, strict = false }: SafeHtmlProps) {
    const sanitized = strict
        ? sanitizeHtmlStrict(html)
        : sanitizeHtml(html, config);

    return (
        <div
            className= { className }
    dangerouslySetInnerHTML = {{ __html: sanitized }
}
        />
    );
}

/**
 * Hook React para sanitizar HTML
 */
export function useSanitizedHtml(html: string, config?: DOMPurify.Config): string {
    return React.useMemo(() => sanitizeHtml(html, config), [html, config]);
}

/**
 * Valida e sanitiza input de formulário
 */
export function sanitizeInput(input: string, maxLength?: number): string {
    if (!input) return '';

    // Remove caracteres de controle
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');

    // Limita comprimento
    if (maxLength && sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    // Remove espaços extras
    sanitized = sanitized.trim();

    return sanitized;
}

/**
 * Sanitiza objeto recursivamente
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeInput(value);
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            sanitized[key] = sanitizeObject(value);
        } else if (Array.isArray(value)) {
            sanitized[key] = value.map(item =>
                typeof item === 'string' ? sanitizeInput(item) :
                    typeof item === 'object' && item !== null ? sanitizeObject(item) :
                        item
            );
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized as T;
}

// Para uso em componentes React
import * as React from 'react';
