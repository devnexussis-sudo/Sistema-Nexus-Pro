
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
    const [isFetchingPublicOrder, setIsFetchingPublicOrder] = useState(true);
    const [techs, setTechs] = useState<User[]>([]);
    const [tenant, setTenant] = useState<any>(null);

    // 🛡️ Garante fundo 100% branco e tema claro no HTML, BODY e theme-color mesmo em navegadores escuros
    useEffect(() => {
        const origHtmlBg = document.documentElement.style.backgroundColor;
        const origBodyBg = document.body.style.backgroundColor;
        const origHtmlCs = document.documentElement.style.colorScheme;
        const origBodyCs = document.body.style.colorScheme;

        document.documentElement.style.backgroundColor = '#ffffff';
        document.documentElement.style.colorScheme = 'light';
        document.body.style.backgroundColor = '#ffffff';
        document.body.style.colorScheme = 'light';

        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        const origThemeColor = themeColorMeta?.getAttribute('content');
        if (themeColorMeta) {
            themeColorMeta.setAttribute('content', '#ffffff');
        }

        return () => {
            document.documentElement.style.backgroundColor = origHtmlBg;
            document.documentElement.style.colorScheme = origHtmlCs;
            document.body.style.backgroundColor = origBodyBg;
            document.body.style.colorScheme = origBodyCs;
            if (themeColorMeta && origThemeColor) {
                themeColorMeta.setAttribute('content', origThemeColor);
            }
        };
    }, []);

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

                    // 2. Fetch secundário de Técnicos e Empresa que não bloqueia a UI primária
                    if (order && order.tenantId && isMounted) {
                        try {
                            const [t, tenantData] = await Promise.all([
                                DataService.getPublicTechnicians(order.tenantId),
                                DataService.getTenantById(order.tenantId)
                            ]);
                            if (isMounted) {
                                setTechs(t);
                                setTenant(tenantData);
                                console.log('🏢 [PublicApp] Tenant Loaded:', tenantData?.name);
                            }
                        } catch (e) { 
                            console.warn("Erro ao buscar dados secundários", e); 
                        }
                    }
                } catch (e) {
                    console.error(e);
                    if (isMounted) setIsFetchingPublicOrder(false);
                }
            })();
            return () => { isMounted = false; }
        }
    }, [publicOrderId]);

    useEffect(() => {
        if (publicQuoteId) {
            let isMounted = true;
            (async () => {
                try {
                    const data = await DataService.getPublicQuoteById(publicQuoteId);
                    if (data && data.tenantId && isMounted) {
                        const tenantData = await DataService.getTenantById(data.tenantId);
                        if (isMounted) setTenant(tenantData);
                    }
                } catch (e) { console.warn("Error fetching quote tenant", e); }
            })();
            return () => { isMounted = false; };
        }
    }, [publicQuoteId]);

    if (publicQuoteId) {
        return (
            <div className="public-view-wrapper min-h-screen bg-white" style={{ backgroundColor: '#ffffff', colorScheme: 'light' }}>
                <PublicQuoteView id={publicQuoteId} tenantProp={tenant} />
            </div>
        );
    }

    if (publicOrderId) {
        if (isFetchingPublicOrder) {
            return (
                <div className="public-view-wrapper min-h-screen bg-white flex items-center justify-center" style={{ backgroundColor: '#ffffff', colorScheme: 'light' }}>
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
                <div className="public-view-wrapper min-h-screen bg-white flex flex-col items-center justify-center text-slate-800 font-poppins" style={{ backgroundColor: '#ffffff', colorScheme: 'light', fontFamily: "'Poppins', sans-serif" }}>
                    <h2 className="text-xl font-bold uppercase tracking-wider italic text-slate-800">Ordem de Serviço não encontrada</h2>
                </div>
            );
        }
        return (
            <div className="public-view-wrapper min-h-screen bg-white" style={{ backgroundColor: '#ffffff', colorScheme: 'light' }}>
                <PublicOrderView order={fetchedPublicOrder} techs={techs} tenantProp={tenant} />
            </div>
        );
    }

    return null;
};
