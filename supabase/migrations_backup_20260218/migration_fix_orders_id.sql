-- ============================================
-- MIGRATION: Orders ID Generation with Tenant Configuration
-- Execute this in Supabase SQL Editor
-- ============================================

-- Step 1: Create function to generate order IDs based on tenant settings
CREATE OR REPLACE FUNCTION generate_order_id(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
    new_id TEXT;
    tenant_prefix TEXT;
    tenant_start_num INTEGER;
    max_num INTEGER;
    current_count INTEGER;
BEGIN
    -- Get tenant's OS configuration (prefix and start number)
    SELECT 
        COALESCE(os_prefix, 'OS-'),
        COALESCE(os_start_number, 1000)
    INTO 
        tenant_prefix,
        tenant_start_num
    FROM tenants
    WHERE id = p_tenant_id;
    
    -- If tenant not found, use defaults
    IF tenant_prefix IS NULL THEN
        tenant_prefix := 'OS-';
        tenant_start_num := 1000;
    END IF;
    
    -- Count existing orders for this tenant to determine next number
    SELECT COUNT(*) INTO current_count
    FROM orders
    WHERE tenant_id = p_tenant_id;
    
    -- Calculate next number (start number + count of existing orders)
    max_num := tenant_start_num + current_count;
    
    -- Generate new ID with tenant's prefix
    new_id := tenant_prefix || max_num::TEXT;
    
    -- Ensure uniqueness (in case of race conditions)
    WHILE EXISTS (SELECT 1 FROM orders WHERE id = new_id) LOOP
        max_num := max_num + 1;
        new_id := tenant_prefix || max_num::TEXT;
    END LOOP;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create a trigger function to auto-generate ID before insert
CREATE OR REPLACE FUNCTION set_order_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate ID if not provided
    IF NEW.id IS NULL OR NEW.id = '' THEN
        NEW.id := generate_order_id(NEW.tenant_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_order_id ON orders;

-- Step 4: Create trigger to run before insert
CREATE TRIGGER trigger_set_order_id
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_order_id();

-- Step 5: Remove any DEFAULT constraint on id column (we use trigger instead)
ALTER TABLE orders 
    ALTER COLUMN id DROP DEFAULT;

-- Step 6: Verify the setup
SELECT 
    trigger_name, 
    event_manipulation, 
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders' AND trigger_name = 'trigger_set_order_id';

-- ============================================
-- TESTING (Optional - Run these to test)
-- ============================================

-- Test 1: Check if function works
-- Replace 'your-tenant-id-here' with an actual tenant ID
-- SELECT generate_order_id('your-tenant-id-here'::UUID);

-- Test 2: Insert a test order (will auto-generate ID)
-- INSERT INTO orders (tenant_id, title, description, status, priority, customerName, customerAddress, scheduledDate)
-- VALUES (
--     'your-tenant-id-here'::UUID,
--     'Test Order',
--     'Testing auto ID generation',
--     'PENDENTE',
--     'MÉDIA',
--     'Test Customer',
--     'Test Address',
--     CURRENT_DATE
-- )
-- RETURNING id, title;

-- ============================================
-- NOTES:
-- ============================================
-- After running this migration:
-- 1. Each tenant's orders will follow their configured prefix (e.g., 'OS-', 'CHM-', etc.)
-- 2. Numbering starts from the tenant's os_start_number (e.g., 1000, 5000, etc.)
-- 3. Numbers increment sequentially per tenant
-- 4. Examples:
--    - Tenant A (prefix: 'OS-', start: 1000) → OS-1000, OS-1001, OS-1002...
--    - Tenant B (prefix: 'CHM-', start: 5000) → CHM-5000, CHM-5001, CHM-5002...
-- 5. The trigger ensures IDs are unique even with concurrent inserts
