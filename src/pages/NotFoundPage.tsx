
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ghost, Home, ArrowLeft } from 'lucide-react';
import { NexusBranding } from '../components/ui/NexusBranding';

export const NotFoundPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px]"></div>
            </div>

            <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
                <NexusBranding variant="light" className="mb-12 scale-125" />

                <div className="flex items-center justify-center w-32 h-32 bg-slate-800/50 rounded-full mb-8 border border-white/5 shadow-2xl">
                    <Ghost size={64} className="text-slate-500 animate-pulse" />
                </div>

                <h1 className="text-8xl font-black text-white tracking-tighter mb-2">404</h1>
                <h2 className="text-2xl font-bold text-slate-400 uppercase tracking-widest mb-8">Página Não Encontrada</h2>

                <p className="text-slate-500 mb-10 leading-relaxed">
                    O recurso que você está tentando acessar não existe ou foi movido.
                    Verifique o endereço digitado ou retorne ao sistema principal.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl border border-white/10 text-slate-300 font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
                    >
                        <ArrowLeft size={18} /> Voltar
                    </button>

                    <Link
                        to="/"
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary-600 text-white font-bold uppercase tracking-widest hover:bg-primary-500 shadow-lg shadow-primary-500/20 transition-all"
                    >
                        <Home size={18} /> Ir para Home
                    </Link>
                </div>
            </div>

            <footer className="absolute bottom-6 text-slate-700 text-xs font-bold uppercase tracking-widest">
                Nexus Enterprise System &copy; 2026
            </footer>
        </div>
    );
};
