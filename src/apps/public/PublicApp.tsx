
import React, { useState, useEffect } from 'react';
import { PublicOrderView } from '../../components/public/PublicOrderView';
import { PublicQuoteView } from '../../components/public/PublicQuoteView';
import { DataService } from '../../services/dataService';
import { ServiceOrder, User } from '../../types';
import { Hexagon } from 'lucide-react';

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
            (async () => {
                try {
                    setIsFetchingPublicOrder(true);
                    const order = await DataService.getPublicOrderById(publicOrderId);

                    if (order && order.tenantId) {
                        const t = await DataService.getPublicTechnicians(order.tenantId);
                        setTechs(t);
                    }
                    setFetchedPublicOrder(order);
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsFetchingPublicOrder(false);
                }
            })();
        }
    }, [publicOrderId]);

    if (publicQuoteId) {
        return <PublicQuoteView id={publicQuoteId} />;
    }

    if (publicOrderId) {
        if (isFetchingPublicOrder) {
            return (
                <div className="min-h-screen bg-[#111422] flex items-center justify-center">
                    <Hexagon size={48} className="animate-spin text-primary-500" />
                </div>
            );
        }
        if (!fetchedPublicOrder) {
            return (
                <div className="min-h-screen bg-[#111422] flex flex-col items-center justify-center text-white">
                    <h2 className="text-xl font-black uppercase italic">Ordem de Serviço não encontrada</h2>
                </div>
            );
        }
        return <PublicOrderView order={fetchedPublicOrder} techs={techs} />;
    }

    return null;
};
