-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL, -- e.g., 'empresa-x'
  name TEXT NOT NULL,
  document TEXT, -- CNPJ/CPF
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add tenant_id to Users table
-- Assuming 'users' table already exists. If not, create it.
-- This usually references auth.users in a real Supabase app, but we will use a public.users table as per the current codebase logic which seems to mirror it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- 3. Add tenant_id to other core tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

ALTER TABLE equipments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_equipments_tenant ON equipments(tenant_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipments ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies
-- Helper function to get current user's tenant_id
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
  -- This assumes the user is logged in via Supabase Auth and their public.users record has the tenant_id
  -- We match auth.uid() with the id in public.users
  RETURN (SELECT tenant_id FROM public.users WHERE id::text = auth.uid()::text); 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Users can only see their own tenant
-- Note: 'users' table policy need to allow users to see their own profile at least.
CREATE POLICY "Users can view users in same tenant" ON users
  FOR SELECT
  USING (tenant_id = get_current_tenant_id() OR id::text = auth.uid()::text);

-- Policy for Tenants table
-- Users can view their own tenant details
CREATE POLICY "Users can view own tenant" ON tenants
  FOR SELECT
  USING (id = get_current_tenant_id());

-- Policy for Orders
CREATE POLICY "Users can view orders in same tenant" ON orders
  FOR SELECT USING (tenant_id = get_current_tenant_id());
  
CREATE POLICY "Users can insert orders in same tenant" ON orders
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());
  
CREATE POLICY "Users can update orders in same tenant" ON orders
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

-- Policy for Customers
CREATE POLICY "Users can view customers in same tenant" ON customers
  FOR SELECT USING (tenant_id = get_current_tenant_id());
  
CREATE POLICY "Users can insert customers in same tenant" ON customers
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can update customers in same tenant" ON customers
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

-- Policy for Equipments
CREATE POLICY "Users can view equipments in same tenant" ON equipments
  FOR SELECT USING (tenant_id = get_current_tenant_id());
  
CREATE POLICY "Users can insert equipments in same tenant" ON equipments
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can update equipments in same tenant" ON equipments
  FOR UPDATE USING (tenant_id = get_current_tenant_id());


-- 6. Super Admin / Master Logic (Optional)
-- If there is a "Master Tenant", you might want a bypass.
-- For now, we assume standard isolation.

-- 7. Trigger to automatically set updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
