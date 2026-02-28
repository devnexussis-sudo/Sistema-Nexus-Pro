import { useState, useEffect } from 'react';
import { supabase, ensureValidSession } from '../lib/supabaseClient';
import { DataService } from '../services/dataService';
import { OrderService } from '../services/orderService';
import { ContractService } from '../services/contractService';
import { TechnicianService } from '../services/technicianService';
import { CustomerService } from '../services/customerService';

export const useDashboardSummary = (enabled = true) => {
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchSummary = async () => {
            if (!enabled) return;

            setIsLoading(true);
            setError(null);
            try {
                const sessionOk = await ensureValidSession();
                if (!sessionOk) {
                    if (isMounted) setIsLoading(false);
                    return;
                }

                const tenantId = DataService.getCurrentTenantId();
                if (!tenantId) throw new Error('No tenant ID');

                const { data: { session } } = await supabase.auth.getSession();

                const response = await supabase.functions.invoke('dashboard-summary', {
                    body: { tenantId },
                });

                if (response.error) {
                    throw response.error;
                }

                if (isMounted) {
                    const r = response.data;
                    setData({
                        orders: (r.orders || []).map((o: any) => OrderService._mapOrderFromDB(o)),
                        contracts: (r.contracts || []).map((c: any) => ContractService._mapContractFromDB(c)),
                        technicians: (r.technicians || []).map((t: any) => TechnicianService._mapTechFromDB(t)),
                        customers: (r.customers || []).map((c: any) => CustomerService._mapCustomerFromDB(c)),
                        users: r.users || [],
                        userGroups: r.userGroups || [],
                        forms: r.forms || [],
                        serviceTypes: r.serviceTypes || [],
                        activationRules: r.activationRules || []
                    });
                }
            } catch (err) {
                console.error('[DashboardSummary] Error fetching edge function:', err);
                if (isMounted) setError(err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchSummary();

        return () => { isMounted = false; };
    }, [enabled]);

    return { data, isLoading, error };
};
