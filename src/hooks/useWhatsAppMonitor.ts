import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useWhatsAppMonitor(tenant: any | null, isAdmin: boolean) {
    const [isDisconnected, setIsDisconnected] = useState(false);
    const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);

    useEffect(() => {
        const isModuleEnabled = tenant?.enabled_modules?.ai !== false && tenant?.enabledModules?.ai !== false;
        
        // Só monitora se o usuário for Admin, o módulo estiver habilitado, as credenciais existirem 
        // E o sistema registrar que já houve uma conexão bem-sucedida (connected === true).
        if (!isAdmin || 
            !isModuleEnabled ||
            !tenant?.whatsapp_settings?.uazapi_url || 
            !tenant?.whatsapp_settings?.uazapi_token ||
            tenant?.whatsapp_settings?.connected !== true) {
            setIsDisconnected(false);
            return;
        }

        const checkConnection = async () => {
            try {
                // Delega a checagem para a Edge Function segura
                const { data, error: funcErr } = await supabase.functions.invoke('whatsapp-admin', {
                    body: { action: 'status', tenantId: tenant.id }
                });

                if (funcErr || !data?.success) {
                    setIsDisconnected(true);
                    setLastCheckTime(new Date());
                    return;
                }

                const json = data.data;
                const connected = json?.connected === true || 
                                json?.instance?.status === 'connected' || 
                                json?.instance?.state === 'open' || 
                                json?.state === 'open' || 
                                json?.status === 'connected';

                setIsDisconnected(!connected);
                setLastCheckTime(new Date());
            } catch (error) {
                console.error('[WhatsAppMonitor] Failed to check connection:', error);
                setIsDisconnected(true);
                setLastCheckTime(new Date());
            }
        };

        // Check immediately on mount/change
        checkConnection();

        // Then check every 3 minutes (180,000 ms)
        const intervalId = setInterval(checkConnection, 180000);

        return () => clearInterval(intervalId);
    }, [
        isAdmin, 
        tenant?.whatsapp_settings?.uazapi_url, 
        tenant?.whatsapp_settings?.uazapi_token
    ]);

    return {
        isDisconnected,
        lastCheckTime
    };
}
