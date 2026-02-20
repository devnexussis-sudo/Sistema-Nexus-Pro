/**
 * 🗄️ Nexus Pro — Database Row Types (snake_case)
 *
 * Estes tipos espelham exatamente as colunas do banco Supabase.
 * Use-os nos mappers _mapFromDB / _mapToDB dos services para
 * eliminar `any` e obter autocomplete correto.
 *
 * Convenção:
 *   - DB types: snake_case  → usado nos services (raw DB rows)
 *   - Domain types: camelCase → usado nos componentes React (types/index.ts)
 */

import type { UserPermissions } from './index';

// ─── Enums do Banco ───────────────────────────────────────────

export type DbUserRole = 'ADMIN' | 'TECHNICIAN' | 'MANAGER' | 'OPERATOR';
export type DbTenantStatus = 'active' | 'suspended';
export type DbOrderStatus =
    | 'PENDENTE'
    | 'ATRIBUÍDO'
    | 'EM DESLOCAMENTO'
    | 'NO LOCAL'
    | 'EM ANDAMENTO'
    | 'PAUSADO'
    | 'CONCLUÍDO'
    | 'CANCELADO'
    | 'IMPEDIDO';
export type DbOrderPriority = 'BAIXA' | 'MÉDIA' | 'ALTA' | 'CRÍTICA';
export type DbBillingStatus = 'PENDING' | 'PAID';
export type DbCashFlowType = 'INCOME' | 'EXPENSE';
export type DbStockMovementType = 'TRANSFER' | 'CONSUMPTION' | 'RESTOCK' | 'ADJUSTMENT';
export type DbVisitStatus = 'pending' | 'ongoing' | 'paused' | 'completed';

// ─── Tabela: tenants ──────────────────────────────────────────

export interface DbTenant {
    id: string;
    slug: string;
    name: string;
    company_name?: string;
    document?: string;
    email?: string;
    phone?: string;
    address?: string;
    logo_url?: string;
    admin_email?: string;
    admin_name?: string;
    status: DbTenantStatus;
    os_prefix?: string;
    os_start_number?: number;
    enabled_modules?: Record<string, boolean>;
    created_at: string;
    updated_at?: string;
}

/** Input para INSERT/UPDATE de tenant (campos opcionais) */
export type DbTenantInsert = Omit<DbTenant, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
};

// ─── Tabela: users ────────────────────────────────────────────

export interface DbUser {
    id: string;
    tenant_id: string;
    name: string;
    email: string;
    role: DbUserRole;
    avatar?: string;
    active: boolean;
    group_id?: string;
    permissions?: Partial<UserPermissions>;
    created_at?: string;
    updated_at?: string;
}

export type DbUserInsert = Omit<DbUser, 'created_at' | 'updated_at'>;

// ─── Tabela: user_groups ──────────────────────────────────────

export interface DbUserGroup {
    id: string;
    tenant_id: string;
    name: string;
    description: string;
    permissions: UserPermissions;
    is_system: boolean;
    created_at?: string;
}

export type DbUserGroupInsert = Omit<DbUserGroup, 'id' | 'created_at'> & { id?: string };

// ─── Tabela: orders ───────────────────────────────────────────

export interface DbOrderTimeline {
    assignedAt?: string;
    travelStartAt?: string;
    arrivedAt?: string;
    serviceStartAt?: string;
    pausedAt?: string;
    resumedAt?: string;
    completedAt?: string;
    totalPausedMs?: number;
}

export interface DbGeoLocation {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
}

export interface DbOrderItem {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    fromStock?: boolean;
    stockItemId?: string;
}

export interface DbOrder {
    id: string;
    display_id?: string;
    public_token?: string;
    tenant_id: string;
    title: string;
    description: string;
    customer_name: string;
    customer_address: string;
    status: DbOrderStatus;
    priority: DbOrderPriority;
    operation_type?: string;
    assigned_to?: string;
    form_id?: string;
    form_data?: Record<string, unknown>;
    equipment_name?: string;
    equipment_model?: string;
    equipment_serial?: string;
    scheduled_date: string;
    scheduled_time?: string;
    start_date?: string;
    end_date?: string;
    notes?: string;
    items?: DbOrderItem[];
    show_value_to_client?: boolean;
    signature?: string;
    signature_name?: string;
    signature_doc?: string;
    billing_status?: DbBillingStatus;
    payment_method?: string;
    paid_at?: string;
    billing_notes?: string;
    linked_quotes?: string[];
    timeline?: DbOrderTimeline;
    checkin_location?: DbGeoLocation;
    checkout_location?: DbGeoLocation;
    pause_reason?: string;
    created_at: string;
    updated_at: string;
}

/** Payload para INSERT de ordem (sem campos gerados pelo DB) */
export type DbOrderInsert = Omit<DbOrder, 'id' | 'display_id' | 'public_token' | 'created_at' | 'updated_at'>;

/** Payload para UPDATE de ordem (todos opcionais exceto updated_at) */
export type DbOrderUpdate = Partial<Omit<DbOrder, 'id' | 'tenant_id' | 'created_at'>> & {
    updated_at: string;
};

// ─── Tabela: service_visits ───────────────────────────────────

export interface DbServiceVisit {
    id: string;
    tenant_id: string;
    order_id: string;
    technician_id?: string;
    status: DbVisitStatus;
    pause_reason?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    arrival_time?: string;
    departure_time?: string;
    notes?: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export type DbServiceVisitInsert = Omit<DbServiceVisit, 'id' | 'created_at' | 'updated_at'> & { id?: string };

// ─── Tabela: customers ────────────────────────────────────────

export interface DbCustomer {
    id: string;
    tenant_id: string;
    type: 'PF' | 'PJ';
    name: string;
    document: string;
    email: string;
    phone: string;
    whatsapp: string;
    zip: string;
    state: string;
    city: string;
    address: string;
    number: string;
    complement: string;
    active: boolean;
    created_at?: string;
    updated_at?: string;
}

export type DbCustomerInsert = Omit<DbCustomer, 'id' | 'created_at' | 'updated_at'> & { id?: string };

// ─── Tabela: equipments ───────────────────────────────────────

export interface DbEquipment {
    id: string;
    tenant_id: string;
    serial_number: string;
    model: string;
    family_id: string;
    family_name: string;
    description: string;
    customer_id: string;
    customer_name: string;
    active: boolean;
    created_at: string;
}

export type DbEquipmentInsert = Omit<DbEquipment, 'id' | 'created_at'> & { id?: string };

// ─── Tabela: stock_items ──────────────────────────────────────

export interface DbStockItem {
    id: string;
    tenant_id: string;
    code: string;
    external_code?: string;
    description: string;
    category?: string;
    location: string;
    quantity: number;
    min_quantity: number;
    cost_price: number;
    sell_price: number;
    freight_cost?: number;
    tax_cost?: number;
    unit?: string;
    last_restock_date?: string;
    active: boolean;
    created_at?: string;
    updated_at?: string;
}

export type DbStockItemInsert = Omit<DbStockItem, 'id' | 'created_at' | 'updated_at'> & { id?: string };

// ─── Tabela: quotes ───────────────────────────────────────────

export interface DbQuoteItem {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export interface DbQuote {
    id: string;
    tenant_id: string;
    customer_name: string;
    customer_address: string;
    title: string;
    description: string;
    items: DbQuoteItem[];
    total_value: number;
    status: 'ABERTO' | 'APROVADO' | 'REJEITADO' | 'CONVERTIDO' | 'PENDENTE';
    notes?: string;
    valid_until?: string;
    linked_order_id?: string;
    public_token?: string;
    approved_by_name?: string;
    approval_document?: string;
    approval_birth_date?: string;
    approval_signature?: string;
    approved_at?: string;
    approval_metadata?: Record<string, unknown>;
    approval_latitude?: number;
    approval_longitude?: number;
    billing_status?: DbBillingStatus;
    payment_method?: string;
    paid_at?: string;
    billing_notes?: string;
    created_at: string;
    updated_at?: string;
}

export type DbQuoteInsert = Omit<DbQuote, 'id' | 'public_token' | 'created_at' | 'updated_at'> & { id?: string };

// ─── Tabela: cash_flow ────────────────────────────────────────

export interface DbCashFlowEntry {
    id: string;
    tenant_id: string;
    type: DbCashFlowType;
    category: string;
    amount: number;
    description: string;
    reference_id?: string;
    reference_type?: 'ORDER' | 'QUOTE';
    payment_method?: string;
    entry_date: string;
    created_at: string;
    created_by: string;
}

export type DbCashFlowInsert = Omit<DbCashFlowEntry, 'id' | 'created_at'> & { id?: string };

// ─── Tabela: form_templates ───────────────────────────────────

export interface DbFormTemplateSchema {
    fields: unknown[];
    serviceTypes?: string[];
    targetFamily?: string;
}

export interface DbFormTemplate {
    id: string;
    tenant_id: string;
    title: string;
    schema: DbFormTemplateSchema;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export type DbFormTemplateInsert = Omit<DbFormTemplate, 'created_at' | 'updated_at'> & { id?: string };

// ─── Tabela: contracts ────────────────────────────────────────

export interface DbContract {
    id: string;
    tenant_id: string;
    title: string;
    description: string;
    customer_name: string;
    customer_address: string;
    status: DbOrderStatus;
    priority: DbOrderPriority;
    operation_type: string;
    scheduled_date: string;
    periodicity: string;
    maintenance_day: number;
    equipment_ids: string[];
    logs: unknown[];
    alert_settings: {
        enabled: boolean;
        days_before: number;
        frequency: number;
    };
    created_at: string;
    updated_at: string;
}

// ─── View: vw_tenant_stats ────────────────────────────────────

export interface DbTenantStats extends DbTenant {
    user_count?: number;
    os_count?: number;
    active_techs?: number;
}

// ─── Tabela: technicians (tech sessions) ─────────────────────

export interface DbTechnician {
    id: string;
    tenant_id: string;
    user_id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    active: boolean;
    current_location?: DbGeoLocation;
    last_seen_at?: string;
    created_at?: string;
}

// ─── Tabela: tech_stock ───────────────────────────────────────

export interface DbTechStock {
    id: string;
    tenant_id: string;
    user_id: string;
    stock_item_id: string;
    quantity: number;
    updated_at: string;
}

// ─── Tabela: stock_movements ──────────────────────────────────

export interface DbStockMovement {
    id: string;
    tenant_id: string;
    item_id: string;
    user_id?: string;
    type: DbStockMovementType;
    quantity: number;
    source: string;
    destination: string;
    reference_id?: string;
    created_at: string;
    created_by: string;
}

// ─── Tabela: service_types ────────────────────────────────────

export interface DbServiceType {
    id: string;
    tenant_id: string;
    name: string;
    created_at?: string;
}

// ─── Tabela: activation_rules ────────────────────────────────

export interface DbActivationRule {
    id: string;
    tenant_id: string;
    service_type_id: string;
    form_template_id: string;
    conditions: {
        equipment_family?: string;
    };
    created_at?: string;
}

// ─── Helpers de Tipagem ───────────────────────────────────────

/**
 * Extrai o tipo de retorno de uma query Supabase.
 * Uso: `type OrderRow = SupabaseRow<typeof supabase, 'orders'>`
 */
export type SupabaseRow<T extends { from: (table: string) => unknown }, Table extends string> =
    T extends { from: (table: Table) => { select: () => { data: infer R } } } ? R : never;

/**
 * Resultado padrão de operações Supabase.
 */
export interface SupabaseResult<T> {
    data: T | null;
    error: { message: string; code?: string } | null;
}
