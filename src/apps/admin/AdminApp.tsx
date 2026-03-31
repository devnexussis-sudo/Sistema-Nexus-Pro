
import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AdminLogin } from '../../components/admin/AdminLogin';
import { AdminDashboard } from '../../components/admin/AdminDashboard';
import { AdminOverview } from '../../components/admin/AdminOverview';
import { CustomerManagement } from '../../components/admin/CustomerManagement';
import { EquipmentManagement } from '../../components/admin/EquipmentManagement';
import { TechnicianManagement } from '../../components/admin/TechnicianManagement';
import { FormManagement } from '../../components/admin/FormManagement';
import { SettingsPage } from '../../components/admin/SettingsPage';
import { UserManagement } from '../../components/admin/UserManagement';
import { StockManagement } from '../../components/admin/StockManagement';
import { FinancialDashboard } from '../../components/admin/FinancialDashboard';
import { TechnicianMap } from '../../components/admin/TechnicianMap';
import { OrderCalendar } from '../../components/admin/OrderCalendar';
import { PlannedMaintenance } from '../../components/admin/PlannedMaintenance';
import { QuoteManagement } from '../../components/admin/QuoteManagement';
import { DataService } from '../../services/dataService';
import SessionStorage from '../../lib/sessionStorage';
import {
    useOrdersStats,
    useOrders,
    useContracts,
    useQuotes,
    useTechnicians,
    useCustomers,
    useEquipments,
    useStock,
    useUsers,
    useUserGroups,
    useForms,
    useServiceTypes,
    useActivationRules,
    useTenant,
    NexusQueryClient
} from '../../hooks/nexusHooks';
import { useDashboardSummary } from '../../hooks/useDashboardSummary';
import { AuthState, User } from '../../types';
import { AdminLayout } from '../../components/layout/AdminLayout';

interface AdminAppProps {
    auth: AuthState;
    onLogin: (user: User) => void;
    onLogout: () => void;
    isImpersonating: boolean;
    onToggleMaster: () => void;
    systemNotifications: any[];
    onMarkNotificationRead: (id: string) => void;
}

const getInitialDateRange = () => ({ start: '', end: '' });

export const AdminApp: React.FC<AdminAppProps> = ({
    auth, onLogin, onLogout, isImpersonating, onToggleMaster,
    systemNotifications, onMarkNotificationRead
}) => {
    const location = useLocation();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [overviewDateRange, setOverviewDateRange] = useState(getInitialDateRange());
    const [activitiesDateRange, setActivitiesDateRange] = useState(getInitialDateRange());

    // 🧠 Route-Based Lazy Loading Logic
    const isDashboard = location.pathname === '/admin' || location.pathname === '/admin/';
    const isOrdersView = location.pathname.includes('/orders');
    const isFinancial = location.pathname.includes('/financial');
    const isCalendar = location.pathname.includes('/calendar');
    const isMap = location.pathname.includes('/map');
    const isQuotes = location.pathname.includes('/quotes');
    const isContracts = location.pathname.includes('/contracts');
    const isTechs = location.pathname.includes('/technicians');
    const isCustomers = location.pathname.includes('/customers');
    const isEquipments = location.pathname.includes('/equipments');
    const isStock = location.pathname.includes('/stock');
    const isForms = location.pathname.includes('/forms');
    const isUsers = location.pathname.includes('/users');

    // 📡 Realtime Sincronização (Big Tech Standard)
    React.useEffect(() => {
        const tid = DataService.getCurrentTenantId();
        if (!tid || !auth.user) return;

        console.log(`[AdminApp] 📡 Iniciando Realtime para Tenant: ${tid}`);

        const channel = supabase
            .channel(`nexus-realtime-${tid}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'customers',
                    filter: `tenant_id=eq.${tid}`
                },
                (payload) => {
                    console.log('🔄 Realtime: Customer change detected:', payload.eventType);
                    NexusQueryClient.invalidateCustomers();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    filter: `tenant_id=eq.${tid}`
                },
                (payload) => {
                    console.log('🔄 Realtime: Order change detected:', payload.eventType);
                    NexusQueryClient.invalidateOrders();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'quotes',
                    filter: `tenant_id=eq.${tid}`
                },
                (payload) => {
                    console.log('🔄 Realtime: Quote change detected:', payload.eventType);
                    NexusQueryClient.invalidateQuotes();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'equipments',
                    filter: `tenant_id=eq.${tid}`
                },
                (payload) => {
                    console.log('🔄 Realtime: Equipment change detected:', payload.eventType);
                    NexusQueryClient.invalidateEquipments();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'technicians',
                    filter: `tenant_id=eq.${tid}`
                },
                (payload) => {
                    console.log('🔄 Realtime: Technician change detected:', payload.eventType);
                    NexusQueryClient.invalidateTechnicians();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'stock_categories',
                    filter: `tenant_id=eq.${tid}`
                },
                (payload) => {
                    console.log('🔄 Realtime: Stock Category change detected:', payload.eventType);
                    NexusQueryClient.invalidateCategories();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tenants',
                    filter: `id=eq.${tid}`
                },
                (payload) => {
                    console.log('🔄 Realtime: Tenant configuration change detected:', payload.eventType);
                    NexusQueryClient.invalidateTenant();
                }
            )
            .subscribe((status) => {
                console.log(`[AdminApp] 📡 Realtime Status: ${status}`);
            });

        return () => {
            console.log('[AdminApp] 📡 Finalizando Realtime');
            supabase.removeChannel(channel);
        };
    }, [auth.user]);

    // 0. Dashboard Optimization (Edge Function)
    const { data: dashSummary, isLoading: summaryLoading } = useDashboardSummary(!!auth.isAuthenticated && isDashboard);

    // 1. Dashboard Light Fetch (Desativado se Edge Function habilitada, ou mantido fallback)
    const { data: statsOrders = [], isLoading: statsLoading } = useOrdersStats(!!auth.isAuthenticated && isDashboard && !dashSummary, overviewDateRange.start, overviewDateRange.end);

    // 2. Full Orders Fetch (Only when needed)
    const needsFullOrders = isOrdersView || isCalendar || isFinancial || isQuotes;
    const { data: fullOrders = [], isLoading: oLoading, refetch: oRefetch } = useOrders(!!auth.isAuthenticated && needsFullOrders);

    // Other entities fetching logic (Removemos o loading forçado do isDashboard para não dar DDoS)
    const needsContracts = isContracts;
    const needsQuotes = isQuotes || isFinancial;
    const needsTechs = isTechs || isOrdersView || isMap || isCalendar || isFinancial || isContracts;
    const needsCustomers = isCustomers || isOrdersView || isQuotes || isContracts || isEquipments || isCalendar;
    const needsEquipments = isEquipments || isContracts || isCustomers;
    const needsStock = isStock || isQuotes;
    const needsUsers = isUsers;
    const needsForms = isForms;

    // 🛡️ Nexus Hooks (Enhanced with Global Cache)
    const { data: contracts = [], isLoading: cLoading, refetch: cRefetch } = useContracts(!!auth.isAuthenticated && needsContracts);
    const { data: quotes = [], isLoading: qLoading, refetch: qRefetch } = useQuotes(!!auth.isAuthenticated && needsQuotes);
    const { data: techs = [], isLoading: tLoading, refetch: tRefetch } = useTechnicians(!!auth.isAuthenticated && needsTechs);
    const { data: customers = [], isLoading: custLoading, refetch: custRefetch } = useCustomers(!!auth.isAuthenticated && needsCustomers);
    const { data: equipments = [], isLoading: eLoading, refetch: eRefetch } = useEquipments(!!auth.isAuthenticated && needsEquipments);
    const { data: stockItems = [], isLoading: sLoading, refetch: sRefetch } = useStock(!!auth.isAuthenticated && needsStock);

    // 👥 Users & Forms Hooks
    const { data: users = [], isLoading: usersLoading, refetch: usersRefetch } = useUsers(!!auth.isAuthenticated && needsUsers);
    const { data: userGroups = [], isLoading: groupsLoading, refetch: groupsRefetch } = useUserGroups(!!auth.isAuthenticated && needsUsers);
    const { data: forms = [], isLoading: formsLoading, refetch: formsRefetch } = useForms(!!auth.isAuthenticated && needsForms);
    const { data: serviceTypes = [], isLoading: typesLoading, refetch: typesRefetch } = useServiceTypes(!!auth.isAuthenticated && needsForms);
    const { data: activationRules = [], isLoading: rulesLoading, refetch: rulesRefetch } = useActivationRules(!!auth.isAuthenticated && needsForms);
    const { data: tenantData } = useTenant(!!auth.isAuthenticated);

    const isFetchingAny = summaryLoading || oLoading || cLoading || qLoading || tLoading || custLoading || eLoading || sLoading || statsLoading || usersLoading || groupsLoading || formsLoading || typesLoading || rulesLoading;

    // 🔄 Force Refresh
    const fetchGlobalData = async () => {
        if (isDashboard) {
            await NexusQueryClient.invalidateAll();
            await NexusQueryClient.invalidateTenant();
        }
        if (needsFullOrders) await oRefetch();
        if (needsContracts) await cRefetch();
        if (needsQuotes) await qRefetch();
        if (needsTechs) await tRefetch();
        if (needsCustomers) await custRefetch();
        if (needsEquipments) await eRefetch();
        if (needsStock) await sRefetch();
        if (needsUsers) {
            await usersRefetch();
            await groupsRefetch();
        }
        if (needsForms) {
            await formsRefetch();
            await typesRefetch();
            await rulesRefetch();
        }
    };


    if (!auth.isAuthenticated) {
        return <AdminLogin onLogin={onLogin} onToggleMaster={onToggleMaster} />;
    }

    return (
        <AdminLayout
            user={auth.user}
            tenant={tenantData}
            isImpersonating={isImpersonating}
            onLogout={onLogout}
            systemNotifications={systemNotifications}
            onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            isSidebarCollapsed={isSidebarCollapsed}
        >
            <Routes>
                <Route path="/" element={<AdminOverview
                    orders={dashSummary?.orders || statsOrders}
                    contracts={dashSummary?.contracts || contracts}
                    techs={dashSummary?.technicians || techs}
                    customers={dashSummary?.customers || customers}
                    startDate={overviewDateRange.start}
                    endDate={overviewDateRange.end}
                    onDateChange={(start, end) => setOverviewDateRange({ start, end })}
                    onSwitchView={(v) => { /* Legacy Switch: Use navigate if needed */ }}
                />} />
                <Route path="/orders" element={<AdminDashboard techs={techs} customers={customers} startDate={activitiesDateRange.start} endDate={activitiesDateRange.end} onDateChange={(start, end) => setActivitiesDateRange({ start, end })} onUpdateOrders={fetchGlobalData} onEditOrder={async (o) => { await DataService.updateOrder(o); await NexusQueryClient.invalidateOrders(); await oRefetch(); }} onCreateOrder={async (o) => { const created = await DataService.createOrder(o as any); await NexusQueryClient.invalidateOrders(); await oRefetch(); return created; }} />} />
                <Route path="/contracts" element={<PlannedMaintenance orders={contracts} techs={techs} customers={customers} equipments={equipments} user={auth.user} onUpdateOrders={fetchGlobalData} onEditOrder={async (c) => { await DataService.updateContract(c); await NexusQueryClient.invalidateContracts(); await cRefetch(); }} onCreateOrder={async (c) => { await DataService.createContract(c); await NexusQueryClient.invalidateContracts(); await cRefetch(); }} />} />
                <Route path="/quotes" element={<QuoteManagement quotes={quotes} customers={customers} orders={fullOrders} stockItems={stockItems} onUpdateQuotes={fetchGlobalData} onEditQuote={async (q) => { await DataService.updateQuote(q); await NexusQueryClient.invalidateQuotes(); await qRefetch(); }} onCreateQuote={async (q) => { await DataService.createQuote(q); await NexusQueryClient.invalidateQuotes(); await qRefetch(); }} onDeleteQuote={async (id) => { await DataService.deleteQuote(id); await NexusQueryClient.invalidateQuotes(); await qRefetch(); }} onCreateOrder={async (o) => { await DataService.createOrder(o as any); await NexusQueryClient.invalidateOrders(); await oRefetch(); }} />} />
                <Route path="/customers" element={<CustomerManagement customers={customers} equipments={equipments} onUpdateCustomers={fetchGlobalData} onSwitchView={(v, p) => { /* Legacy Switch */ }} />} />
                <Route path="/equipments" element={<EquipmentManagement equipments={equipments} customers={customers} onUpdateEquipments={fetchGlobalData} />} />
                <Route path="/stock" element={<StockManagement />} />
                <Route path="/technicians" element={<TechnicianManagement />} />
                <Route path="/map" element={<TechnicianMap />} />
                <Route path="/forms" element={<FormManagement />} />
                <Route path="/users" element={<UserManagement />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/financial" element={<FinancialDashboard orders={fullOrders} quotes={quotes} techs={techs} tenant={tenantData} onRefresh={fetchGlobalData} />} />
                <Route path="/calendar" element={<OrderCalendar orders={fullOrders} techs={techs} customers={customers} />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
        </AdminLayout>
    );
};
