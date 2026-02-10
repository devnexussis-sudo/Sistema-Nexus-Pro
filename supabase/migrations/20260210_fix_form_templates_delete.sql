-- Fix form_templates RLS policies for proper DELETE permissions
-- Date: 2026-02-10

-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can view form_templates in same tenant" ON public.form_templates;
DROP POLICY IF EXISTS "Users can insert form_templates in same tenant" ON public.form_templates;
DROP POLICY IF EXISTS "Users can update form_templates in same tenant" ON public.form_templates;
DROP POLICY IF EXISTS "Users can delete form_templates in same tenant" ON public.form_templates;
DROP POLICY IF EXISTS "tenant_form_templates" ON public.form_templates;
DROP POLICY IF EXISTS "form_templates_tenant_policy" ON public.form_templates;
DROP POLICY IF EXISTS "form_templates_isolation_policy" ON public.form_templates;

-- Enable RLS
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

-- Create single comprehensive policy for all operations (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "form_templates_all_operations_policy" 
ON public.form_templates 
FOR ALL 
TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Ensure proper grants
GRANT ALL ON TABLE public.form_templates TO authenticated;

-- Validate: Check if policy was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'form_templates' 
    AND policyname = 'form_templates_all_operations_policy'
  ) THEN
    RAISE NOTICE '✅ Policy form_templates_all_operations_policy created successfully';
  ELSE
    RAISE WARNING '❌ Failed to create policy form_templates_all_operations_policy';
  END IF;
END $$;
