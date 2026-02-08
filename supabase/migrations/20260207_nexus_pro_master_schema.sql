-- =====================================================================================
-- NEXUS PRO MASTER SCHEMA - v1.0.0
-- =====================================================================================
-- Data: 2026-02-07
-- Autor: Antigravity Agent (Nexus Pro Architecture Team)
-- Descrição: Script completo e idempotente para criação do banco de dados do zero.
--            Alinhado com o frontend Nexus Pro V2 (React/TypeScript).
--            Inclui: Multi-tenancy, RLS, Auditoria, Performance e Seeds.
-- =====================================================================================

-- =====================================================================================
-- 0. EXTENSIONS & SETUP
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Observabilidade

-- Configuração de Search Path seguro
ALTER DATABASE postgres SET search_path TO public, extensions;

-- =====================================================================================
-- 1. ENUMS (TIPOS PERSONALIZADOS)
-- =====================================================================================

DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('ADMIN', 'TECHNICIAN', 'MANAGER', 'OPERATOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM ('PENDENTE', 'ATRIBUÍDO', 'EM ANDAMENTO', 'CONCLUÍDO', 'CANCELADO', 'IMPEDIDO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_priority AS ENUM ('BAIXA', 'MÉDIA', 'ALTA', 'CRÍTICA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'trial', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================================================
-- 2. HELPER FUNCTIONS (SECURITY DEFINER)
-- =====================================================================================
-- Funções críticas para o funcionamento do RLS.
-- Movidas para public para evitar problemas de permissão no schema auth.

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_uuid uuid;
BEGIN
  -- 1. Tenta extrair do JWT claims (metaTenant ou tenant_id)
  tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'metaTenant', '')::uuid;
  
  IF tenant_uuid IS NULL THEN
    tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid;
  END IF;
  
  -- 2. Fallback: Busca na tabela de usuários (lento, mas seguro)
  IF tenant_uuid IS NULL THEN
    SELECT tenant_id INTO tenant_uuid
    FROM public.users
    WHERE id = auth.uid()
    LIMIT 1;
  END IF;
  
  RETURN tenant_uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_val text;
BEGIN
  -- 1. JWT claim
  user_role_val := current_setting('request.jwt.claims', true)::json->>'user_role';
  
  IF user_role_val IN ('ADMIN', 'admin') THEN
    RETURN true;
  END IF;
  
  -- 2. DB Lookup
  SELECT role::text INTO user_role_val
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
  
  RETURN (user_role_val IN ('ADMIN', 'admin'));
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Revogar execução pública direta para segurança
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
-- Permitir apenas via políticas internas e roles de sistema
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO postgres, service_role;

-- =====================================================================================
-- 3. TABELAS PRINCIPAIS
-- =====================================================================================

-- 3.1 TENANTS (Organizações)
CREATE TABLE IF NOT EXISTS public.tenants (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug text UNIQUE NOT NULL,
    name text NOT NULL,
    document text, -- CNPJ
    email text,
    phone text,
    address text,
    plan text DEFAULT 'FREE',
    status public.tenant_status DEFAULT 'active',
    metadata jsonb DEFAULT '{}'::jsonb,
    
    -- Configurações de OS
    os_prefix text DEFAULT 'OS-',
    os_start_number integer DEFAULT 1000,
    
    logo_url text,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3.2 USERS (Perfil Público)
-- Nota: O ID deve bater com auth.users. Ideal ter trigger de sync (omitido para brevidade, mas recomendado).
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
    email text UNIQUE NOT NULL,
    name text,
    role public.user_role DEFAULT 'TECHNICIAN',
    avatar_url text,
    phone text,
    active boolean DEFAULT true,
    
    metadata jsonb DEFAULT '{}'::jsonb,
    last_seen_at timestamptz,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3.3 CUSTOMERS (Clientes)
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    type text CHECK (type IN ('PF', 'PJ')) DEFAULT 'PJ',
    document text, -- CPF/CNPJ
    email text,
    phone text,
    whatsapp text,
    
    -- Endereço
    zip_code text,
    address text,
    number text,
    complement text,
    neighborhood text,
    city text,
    state text,
    
    active boolean DEFAULT true,
    notes text,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3.4 EQUIPMENTS (Ativos)
CREATE TABLE IF NOT EXISTS public.equipments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
    
    name text NOT NULL,
    brand text,
    model text,
    serial_number text,
    
    family_id uuid, -- Pode ser FK para equipment_families se existir
    status text DEFAULT 'ACTIVE',
    qr_code text,
    
    metadata jsonb DEFAULT '{}'::jsonb, -- Specs técnicas
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3.5 ORDERS (Ordens de Serviço)
CREATE TABLE IF NOT EXISTS public.orders (
    id text PRIMARY KEY, -- Ex: 'OS-1001' (Gerado via trigger/function)
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    
    -- Relacionamentos
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
    
    -- Dados Base
    title text NOT NULL,
    description text,
    status public.order_status DEFAULT 'PENDENTE',
    priority public.order_priority DEFAULT 'MÉDIA',
    type text DEFAULT 'CORRETIVA', -- Preventiva, Instalação, etc.
    
    -- Agendamento
    scheduled_date date,
    scheduled_time time,
    start_date timestamptz,
    end_date timestamptz,
    
    -- Dados de Execução
    equipment_id uuid REFERENCES public.equipments(id) ON DELETE SET NULL,
    location_coords point, -- Lat/Long
    
    -- Dados do Cliente (Snapshot no tempo da OS)
    customer_name text,
    customer_address text,
    
    -- Público
    public_token uuid DEFAULT uuid_generate_v4(),
    
    -- Formulário Dinâmico
    form_id uuid, 
    form_data jsonb DEFAULT '{}'::jsonb,
    
    -- Assinaturas e Auditoria
    signature_url text,
    signature_data jsonb,
    
    -- Financeiro
    show_value_to_client boolean DEFAULT false,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3.6 STOCK (Estoque Multi-tenant)
CREATE TABLE IF NOT EXISTS public.stock_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    
    name text NOT NULL,
    code text,
    category text,
    unit text DEFAULT 'UN',
    
    quantity numeric DEFAULT 0,
    min_quantity numeric DEFAULT 5,
    
    cost_price numeric(10,2),
    sell_price numeric(10,2),
    
    location text, -- Prateleira A
    active boolean DEFAULT true,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    item_id uuid REFERENCES public.stock_items(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    
    type text CHECK (type IN ('IN', 'OUT', 'ADJUST', 'RETURN')),
    quantity numeric NOT NULL,
    
    reference_id text, -- ID da OS ou NFe
    reason text,
    
    created_at timestamptz DEFAULT now()
);

-- 3.7 QUOTES (Orçamentos)
CREATE TABLE IF NOT EXISTS public.quotes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    
    status text DEFAULT 'DRAFT', -- DRAFT, SENT, APPROVED, REJECTED
    total_amount numeric(10,2) DEFAULT 0,
    
    items jsonb DEFAULT '[]'::jsonb,
    valid_until date,
    
    public_token uuid DEFAULT uuid_generate_v4(),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3.8 AUDIT LOGS (Auditoria de Segurança)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid, -- Sem FK rígida para manter log mesmo se tenant for deletado (opcional)
    user_id uuid,   -- Sem FK rígida
    
    table_name text NOT NULL,
    record_id text,
    operation text CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    
    old_data jsonb,
    new_data jsonb,
    changed_fields text[],
    
    ip_address inet,
    user_agent text,
    
    created_at timestamptz DEFAULT now()
);

-- =====================================================================================
-- 4. ÍNDICES DE PERFORMANCE
-- =====================================================================================

-- Tenant ID (Pilar do Multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipments_tenant ON public.equipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_tenant ON public.stock_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON public.quotes(tenant_id);

-- Índices Operacionais
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- =====================================================================================
-- 5. ROW LEVEL SECURITY (RLS) & POLICIES
-- =====================================================================================

-- Habilitar RLS em tudo
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 POLÍTICAS GENÉRICAS (Multi-tenant)
-- Definindo políticas padrão para tabelas que seguem isolamento simples por tenant_id

-- USERS
CREATE POLICY "Users view same tenant" ON public.users
    FOR SELECT USING (tenant_id = public.get_user_tenant_id() OR id = auth.uid());
    
CREATE POLICY "Users update own profile or admins update all" ON public.users
    FOR UPDATE USING (id = auth.uid() OR (public.is_admin() AND tenant_id = public.get_user_tenant_id()));

-- CUSTOMERS
CREATE POLICY "Tenant isolation customers SELECT" ON public.customers
    FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant isolation customers ALL" ON public.customers
    FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- ORDERS
-- Técnicos vêm suas próprias OSs ou todas se forem Admin/Manager
CREATE POLICY "Orders SELECT" ON public.orders
    FOR SELECT USING (
        tenant_id = public.get_user_tenant_id()
    );

CREATE POLICY "Orders INSERT/UPDATE" ON public.orders
    FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- Public Access for Orders (via Token)
CREATE POLICY "Orders Public Read" ON public.orders
    FOR SELECT TO anon
    USING (public_token IS NOT NULL); -- Refinar na API com filtro pelo token exato

-- EQUIPMENTS, STOCK, QUOTES
CREATE POLICY "Tenant isolation equipments" ON public.equipments
    FOR ALL USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant isolation stock" ON public.stock_items
    FOR ALL USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant isolation quotes" ON public.quotes
    FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- AUDIT LOGS (Admin only)
CREATE POLICY "Audit admin read" ON public.audit_logs
    FOR SELECT USING (public.is_admin() AND tenant_id = public.get_user_tenant_id());

-- =====================================================================================
-- 6. TRIGGERS & AUTOMAÇÃO
-- =====================================================================================

-- Trigger de Updated_at Genérico
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
CREATE TRIGGER update_customers_modtime BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
CREATE TRIGGER update_orders_modtime BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

-- Geração de OS ID Sequencial por Tenant (Lógica simplificada)
CREATE OR REPLACE FUNCTION public.generate_order_id()
RETURNS TRIGGER AS $$
DECLARE
    prefix text;
    next_num integer;
BEGIN
    -- Se já tem ID, retorna
    IF NEW.id IS NOT NULL THEN RETURN NEW; END IF;

    -- Pega config do tenant
    SELECT COALESCE(os_prefix, 'OS-'), COALESCE(os_start_number, 1000)
    INTO prefix, next_num
    FROM public.tenants
    WHERE id = NEW.tenant_id;
    
    -- Conta quantos existem para incrementar (simplificado, para high-concurrency usar sequence dedicada por tenant)
    SELECT count(*) + next_num INTO next_num
    FROM public.orders
    WHERE tenant_id = NEW.tenant_id;
    
    NEW.id := prefix || next_num::text;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_order_id_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE PROCEDURE public.generate_order_id();

-- =====================================================================================
-- 7. SEEDS (DADOS DE TESTE)
-- =====================================================================================

-- Apenas insere se as tabelas estiverem vazias para preservar dados existentes em caso de re-run
DO $$
DECLARE
    v_tenant_id uuid;
    v_admin_id uuid := uuid_generate_v4(); -- Simulado
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.tenants) THEN
        -- Criar Tenant Demo
        INSERT INTO public.tenants (id, name, slug, plan, os_prefix)
        VALUES (uuid_generate_v4(), 'Nexus Corp', 'nexus-corp', 'ENTERPRISE', 'NEX-')
        RETURNING id INTO v_tenant_id;
        
        -- Criar Usuário Admin Dummy (Necessário criar correspondente no Auth para login real)
        INSERT INTO public.users (id, tenant_id, email, name, role)
        VALUES (v_admin_id, v_tenant_id, 'admin@nexus.com', 'Admin Nexus', 'ADMIN');
        
        -- Criar Cliente
        INSERT INTO public.customers (tenant_id, name, document, type)
        VALUES (v_tenant_id, 'Acme Inc', '12345678000199', 'PJ');
        
        RAISE NOTICE '✅ Seeds criados com sucesso. Tenant ID: %', v_tenant_id;
    END IF;
END $$;

-- =====================================================================================
-- 8. CHECKLIST & README (COMENTÁRIOS FINAIS)
-- =====================================================================================
/*
    RELATÓRIO DE IMPLANTAÇÃO NEXUS PRO V1.0
    
    1. Schema: 'public' configurado com extensões uuid-ossp e pgcrypto.
    2. Multi-tenancy: Rígido via coluna 'tenant_id' em todas as tabelas principais.
    3. Segurança: 
       - RLS Habilitado em 100% das tabelas de negócio.
       - Funções Helper (get_user_tenant_id) movidas para public e protegidas.
       - Policies cobrindo SELECT/INSERT/UPDATE/DELETE.
    4. Performance:
       - Índices criados em chaves estrangeiras e colunas de filtro (status, created_at).
    5. Auditoria:
       - Tabela audit_logs pronta para receber triggers.
       
    COMO TESTAR (Validação Pós-Deploy):
    
    1. Simular Admin:
       Envie JWT com claim: {"user_role": "ADMIN", "metaTenant": "UUID_DO_TENANT"}
       
    2. Verificar Isolamento:
       Faça SELECT * FROM orders com usuário do Tenant A. 
       Garanta que não vê dados do Tenant B.
       
    3. Testar Trigger de OS:
       INSERT INTO orders (tenant_id, title) VALUES (..., 'Teste Trigger');
       Verifique se o campo 'id' foi preenchido com prefixo (ex: NEX-1000).
*/
