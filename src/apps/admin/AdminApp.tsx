
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

const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
};

/**
 * 🛡️ RouteGuard — Big Tech Standard Loading Guard
 * 
 * CRITICAL: This MUST be defined OUTSIDE of AdminApp.
 * Defining a component inside a render function creates a new component type
 * on every render, causing React to unmount/remount the entire subtree.
 * That's the #1 cause of UI flickering in React SPAs.
 * 
 * RULE: Children ALWAYS render. Loading is a gentle overlay, never a replacement.
 */
const RouteGuard: React.FC<{ isLoading: boolean; children: React.ReactNode }> = ({ isLoading, children }) => {
    const [showOverlay, setShowOverlay] = React.useState(false);

    React.useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (isLoading) {
            timer = setTimeout(() => setShowOverlay(true), 800);
        } else {
            setShowOverlay(false);
        }
        return () => clearTimeout(timer);
    }, [isLoading]);

    return (
        <div className="relative flex-1 flex flex-col h-full min-h-0">
            <div className="flex-1 flex flex-col h-full min-h-0">
                {children}
            </div>
            {isLoading && showOverlay && (
                <div className="absolute inset-0 bg-slate-50/60 backdrop-blur-[1px] flex items-center justify-center z-10 animate-fade-in">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">carregando...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export const AdminApp: React.FC<AdminAppProps> = ({
    auth, onLogin, onLogout, isImpersonating, onToggleMaster,
    systemNotifications, onMarkNotificationRead
}) => {
    const location = useLocation();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [overviewDateRange, setOverviewDateRange] = useState(getInitialDateRange());
    const [activitiesDateRange, setActivitiesDateRange] = useState({ start: '', end: '' });

    const handleDateValidation = (start: string, end: string, setter: (val: {start: string, end: string}) => void) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if ((d2.getTime() - d1.getTime()) > 31622400000) { // 366 dias
                alert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada automaticamente.');
                const limit = new Date(d1.getTime() + 31536000000); // 365 dias
                setter({ start, end: limit.toISOString().split('T')[0] });
                return;
            }
        }
        setter({ start, end });
    };

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

    // Other entities fetching logic (Fallback se a Edge Function falhar no LAN)
    const needsContracts = isContracts || (isDashboard && !dashSummary);
    const needsQuotes = isQuotes || isFinancial;
    const needsTechs = isTechs || isOrdersView || isMap || isCalendar || isFinancial || isContracts || (isDashboard && !dashSummary);
    const needsCustomers = isCustomers || isOrdersView || isQuotes || isContracts || isEquipments || isCalendar || (isDashboard && !dashSummary);
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
            onMarkNotificationRead={onMarkNotificationRead}
            onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            isSidebarCollapsed={isSidebarCollapsed}
        >
            <Routes>
                <Route path="/" element={
                    <RouteGuard isLoading={isDashboard && summaryLoading && statsLoading && !dashSummary && statsOrders.length === 0}>
                        <AdminOverview
                            orders={dashSummary?.orders || statsOrders}
                            contracts={dashSummary?.contracts || contracts}
                            techs={dashSummary?.technicians || techs}
                            customers={dashSummary?.customers || customers}
                            startDate={overviewDateRange.start}
                            endDate={overviewDateRange.end}
                            onDateChange={(start, end) => handleDateValidation(start, end, setOverviewDateRange)}
                            onSwitchView={(v) => { /* Legacy Switch: Use navigate if needed */ }}
                        />
                    </RouteGuard>
                } />
                <Route path="/orders" element={
                    <RouteGuard isLoading={oLoading && fullOrders.length === 0}>
                        <AdminDashboard techs={techs} customers={customers} startDate={activitiesDateRange.start} endDate={activitiesDateRange.end} onDateChange={(start, end) => handleDateValidation(start, end, setActivitiesDateRange)} onUpdateOrders={fetchGlobalData} onEditOrder={async (o) => { await DataService.updateOrder(o); await NexusQueryClient.invalidateOrders(); await oRefetch(); }} onCreateOrder={async (o) => { const created = await DataService.createOrder(o as any); await NexusQueryClient.invalidateOrders(); await oRefetch(); return created; }} />
                    </RouteGuard>
                } />
                <Route path="/contracts" element={
                    <RouteGuard isLoading={cLoading && contracts.length === 0}>
                        <PlannedMaintenance orders={contracts} techs={techs} customers={customers} equipments={equipments} user={auth.user} onUpdateOrders={fetchGlobalData} onEditOrder={async (c) => { await DataService.updateContract(c); await NexusQueryClient.invalidateContracts(); await cRefetch(); }} onCreateOrder={async (c) => { await DataService.createContract(c); await NexusQueryClient.invalidateContracts(); await cRefetch(); }} />
                    </RouteGuard>
                } />
                <Route path="/quotes" element={
                    <RouteGuard isLoading={(qLoading && quotes.length === 0) || (oLoading && fullOrders.length === 0)}>
                        <QuoteManagement quotes={quotes} customers={customers} orders={fullOrders} stockItems={stockItems} onUpdateQuotes={fetchGlobalData} onEditQuote={async (q) => { await DataService.updateQuote(q); await NexusQueryClient.invalidateQuotes(); await qRefetch(); }} onCreateQuote={async (q) => { await DataService.createQuote(q); await NexusQueryClient.invalidateQuotes(); await qRefetch(); }} onDeleteQuote={async (id) => { await DataService.deleteQuote(id); await NexusQueryClient.invalidateQuotes(); await qRefetch(); }} onCreateOrder={async (o) => { await DataService.createOrder(o as any); await NexusQueryClient.invalidateOrders(); await oRefetch(); }} />
                    </RouteGuard>
                } />
                <Route path="/customers" element={
                    <RouteGuard isLoading={custLoading && customers.length === 0}>
                        <CustomerManagement customers={customers} equipments={equipments} onUpdateCustomers={fetchGlobalData} onSwitchView={(v, p) => { /* Legacy Switch */ }} />
                    </RouteGuard>
                } />
                <Route path="/equipments" element={
                    <RouteGuard isLoading={eLoading && equipments.length === 0}>
                        <EquipmentManagement equipments={equipments} customers={customers} onUpdateEquipments={fetchGlobalData} />
                    </RouteGuard>
                } />
                <Route path="/stock" element={<StockManagement />} />
                <Route path="/technicians" element={<TechnicianManagement />} />
                <Route path="/map" element={<TechnicianMap />} />
                <Route path="/forms" element={<FormManagement />} />
                <Route path="/users" element={<UserManagement />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/financial" element={
                    <RouteGuard isLoading={oLoading && fullOrders.length === 0}>
                        <FinancialDashboard orders={fullOrders} quotes={quotes} techs={techs} customers={customers} tenant={tenantData} onRefresh={fetchGlobalData} />
                    </RouteGuard>
                } />
                <Route path="/calendar" element={
                    <RouteGuard isLoading={oLoading && fullOrders.length === 0}>
                        <OrderCalendar orders={fullOrders} techs={techs} customers={customers} />
                    </RouteGuard>
                } />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
        </AdminLayout>
    );
};
