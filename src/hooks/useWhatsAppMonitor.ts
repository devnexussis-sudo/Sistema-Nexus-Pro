import { useState, useEffect } from 'react';

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
                let baseUrl = tenant.whatsapp_settings.uazapi_url.trim();
                if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                const token = tenant.whatsapp_settings.uazapi_token.trim();
                
                const headers = { 
                    'apikey': token,
                    'token': token,
                    'Content-Type': 'application/json'
                };
                
                // Uses the same logic from SettingsPage
                const res = await fetch(`${baseUrl}/instance/status`, { headers, method: 'GET' });
                
                if (!res.ok) {
                    setIsDisconnected(true);
                    setLastCheckTime(new Date());
                    return;
                }

                const json = await res.json();
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
