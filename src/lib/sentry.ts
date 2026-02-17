/**
 * 📊 Nexus Pro - Sentry Integration
 * Monitoramento de erros e performance em produção
 */

import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENVIRONMENT = import.meta.env.MODE;
const IS_PRODUCTION = ENVIRONMENT === 'production';

/**
 * Inicializa Sentry
 */
export function initSentry() {
    if (!SENTRY_DSN) {
        console.warn('Sentry DSN not configured - error tracking disabled');
        return;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: ENVIRONMENT,

        // Integrations
        integrations: [
            new BrowserTracing(),
            new Sentry.Replay({
                maskAllText: true,
                blockAllMedia: true,
            }),
        ],

        // Performance Monitoring
        tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0, // 10% em produção, 100% em dev

        // Session Replay
        replaysSessionSampleRate: IS_PRODUCTION ? 0.1 : 0, // 10% em prod, 0% em dev
        replaysOnErrorSampleRate: 1.0, // 100% quando há erro

        // Filtragem de dados sensíveis
        beforeSend(event, hint) {
            // Remover dados sensíveis
            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
            }

            // Remover tokens de URLs
            if (event.request?.url) {
                event.request.url = event.request.url.replace(/token=[^&]+/, 'token=REDACTED');
            }

            // Filtrar breadcrumbs sensíveis
            if (event.breadcrumbs) {
                event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
                    if (breadcrumb.data) {
                        const sanitized = { ...breadcrumb.data };
                        const sensitiveKeys = ['password', 'token', 'api_key', 'apiKey', 'secret'];
                        sensitiveKeys.forEach(key => {
                            if (key in sanitized) {
                                sanitized[key] = 'REDACTED';
                            }
                        });
                        return { ...breadcrumb, data: sanitized };
                    }
                    return breadcrumb;
                });
            }

            return event;
        },

        // Ignorar erros conhecidos/esperados
        ignoreErrors: [
            // Erros de rede (comum em mobile)
            'Network request failed',
            'NetworkError',
            'Failed to fetch',

            // Erros de browser extensions
            'top.GLOBALS',
            'chrome-extension://',

            // Cancelamento de requisições
            'AbortError',
            'Request aborted',
        ],

        // Release tracking
        release: `nexus-pro@${import.meta.env.VITE_APP_VERSION || 'dev'}`,

        // Debug em desenvolvimento
        debug: !IS_PRODUCTION,

        // Controlar envio de PII
        sendDefaultPii: false,
    });
}

/**
 * Configura contexto do usuário
 */
export function setSentryUser(user: { id: string; tenantId?: string; role?: string }) {
    Sentry.setUser({
        id: user.id,
        // NÃO incluir email ou dados sensíveis
        tenant_id: user.tenantId,
        role: user.role,
    });
}

/**
 * Limpa contexto do usuário
 */
export function clearSentryUser() {
    Sentry.setUser(null);
}

/**
 * Adiciona contexto customizado
 */
export function setSentryContext(context: string, data: Record<string, any>) {
    Sentry.setContext(context, data);
}

/**
 * Adiciona breadcrumb manual
 */
export function addSentryBreadcrumb(
    message: string,
    data?: Record<string, any>,
    level: Sentry.SeverityLevel = 'info'
) {
    Sentry.addBreadcrumb({
        message,
        level,
        data,
        timestamp: Date.now() / 1000,
    });
}

/**
 * Captura erro manualmente
 */
export function captureSentryError(error: Error, context?: Record<string, any>) {
    Sentry.captureException(error, {
        contexts: context ? { custom: context } : undefined,
    });
}

/**
 * Captura mensagem
 */
export function captureSentryMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    context?: Record<string, any>
) {
    Sentry.captureMessage(message, {
        level,
        contexts: context ? { custom: context } : undefined,
    });
}

/**
 * Inicia transaction para performance monitoring
 */
export function startSentryTransaction(name: string, op: string) {
    return Sentry.startTransaction({ name, op });
}

/**
 * Hook React para Error Boundary com Sentry
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

/**
 * HOC para capturar erros de componente
 */
export function withSentryErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    options?: {
        fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
        showDialog?: boolean;
    }
) {
    const FallbackComponent = options?.fallback || DefaultErrorFallback;

    return (props: P) => (
        <SentryErrorBoundary
      fallback= {({ error, resetError }) => (
        <FallbackComponent error= { error } resetError = { resetError } />
      )
}
showDialog = { options?.showDialog }
    >
    <Component { ...props } />
    </SentryErrorBoundary>
  );
}

/**
 * Componente de fallback padrão
 */
function DefaultErrorFallback({
    error,
    resetError
}: {
    error: Error;
    resetError: () => void;
}) {
    return (
        <div className= "min-h-screen flex items-center justify-center bg-gray-50" >
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6" >
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full" >
                <svg
            className="w-6 h-6 text-red-600"
    fill = "none"
    stroke = "currentColor"
    viewBox = "0 0 24 24"
        >
        <path
              strokeLinecap="round"
    strokeLinejoin = "round"
    strokeWidth = { 2}
    d = "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
        </svg>
        </div>

        < h3 className = "mt-4 text-lg font-medium text-gray-900 text-center" >
            Algo deu errado
                </h3>

                < p className = "mt-2 text-sm text-gray-500 text-center" >
                    Desculpe, ocorreu um erro inesperado.Nossa equipe foi notificada.
        </p>

    {
        !IS_PRODUCTION && (
            <pre className="mt-4 p-4 bg-gray-100 rounded text-xs overflow-auto" >
                { error.message }
                </pre>
        )
    }

    <div className="mt-6 flex gap-3" >
        <button
            onClick={ resetError }
    className = "flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
        Tentar Novamente
            </button>

            < button
    onClick = {() => window.location.href = '/'
}
className = "flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
    >
    Voltar ao Início
        </button>
        </div>
        </div>
        </div>
  );
}

// Para uso em componentes React
import * as React from 'react';
