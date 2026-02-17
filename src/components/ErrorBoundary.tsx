
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#0d0d12] flex items-center justify-center p-6">
                    <div className="max-w-xl w-full bg-[#16161e] border border-red-500/20 rounded-[3rem] p-12 text-center space-y-6">
                        <div className="mx-auto w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center">
                            <span className="text-4xl">⚠️</span>
                        </div>
                        <h1 className="text-2xl font-black text-white italic truncate uppercase">Erro de Inicialização</h1>
                        <div className="bg-black/30 p-6 rounded-2xl text-left overflow-auto max-h-40">
                            <code className="text-red-400 text-xs font-mono break-all font-bold">
                                {this.state.error?.message || 'Erro desconhecido'}
                            </code>
                        </div>
                        <p className="text-gray-500 text-sm">
                            Um erro crítico impediu o carregamento do painel. Isso geralmente ocorre por falta de conexão ou erro de permissão.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-primary-600 hover:bg-primary-500 text-white rounded-2xl py-4 font-black uppercase tracking-widest transition-all"
                        >
                            Recarregar Sistema
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
