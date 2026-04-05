
import React, { useState, useEffect } from 'react';
import { PublicOrderView } from '../../components/public/PublicOrderView';
import { PublicQuoteView } from '../../components/public/PublicQuoteView';
import { DataService } from '../../services/dataService';
import { ServiceOrder, User } from '../../types';

interface PublicAppProps {
    publicOrderId: string | null;
    publicQuoteId: string | null;
}

export const PublicApp: React.FC<PublicAppProps> = ({ publicOrderId, publicQuoteId }) => {
    const [fetchedPublicOrder, setFetchedPublicOrder] = useState<ServiceOrder | null>(null);
    const [isFetchingPublicOrder, setIsFetchingPublicOrder] = useState(false);
    const [techs, setTechs] = useState<User[]>([]);

    useEffect(() => {
        if (publicOrderId) {
            let isMounted = true;
            (async () => {
                try {
                    setIsFetchingPublicOrder(true);

                    // 1. Fetch da OS isolado e super rápido
                    const order = await DataService.getPublicOrderById(publicOrderId);

                    if (isMounted) {
                        setFetchedPublicOrder(order);
                        setIsFetchingPublicOrder(false); // Libera o "loading" giratório IMEDIATAMENTE após pegar a OS
                    }

                    // 2. Fetch secundário de Técnicos que não bloqueia a UI
                    if (order && order.tenantId && isMounted) {
                        try {
                            const t = await DataService.getPublicTechnicians(order.tenantId);
                            if (isMounted) setTechs(t);
                        } catch (e) { console.warn("Erro ao buscar técnicos secundários", e); }
                    }
                } catch (e) {
                    console.error(e);
                    if (isMounted) setIsFetchingPublicOrder(false);
                }
            })();
            return () => { isMounted = false; }
        }
    }, [publicOrderId]);

    if (publicQuoteId) {
        return <PublicQuoteView id={publicQuoteId} />;
    }

    if (publicOrderId) {
        if (isFetchingPublicOrder) {
            return (
                <div className="min-h-screen bg-white flex items-center justify-center">
                    <img
                        src="/duno-icon.png"
                        alt="Duno"
                        className="h-20 w-auto object-contain animate-pulse"
                    />
                </div>
            );
        }
        if (!fetchedPublicOrder) {
            return (
                <div className="min-h-screen bg-[#111422] flex flex-col items-center justify-center text-white font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    <h2 className="text-xl font-bold uppercase tracking-wider italic">Ordem de Serviço não encontrada</h2>
                </div>
            );
        }
        return <PublicOrderView order={fetchedPublicOrder} techs={techs} />;
    }

    return null;
};
