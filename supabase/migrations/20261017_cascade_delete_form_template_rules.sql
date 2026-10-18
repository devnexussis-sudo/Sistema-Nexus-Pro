-- ════════════════════════════════════════════════════════════════════
-- Nexus Pro — On Delete Cascade para activation_rules -> form_templates
-- Previne violação da FK activation_rules_form_template_id_fkey
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.activation_rules 
DROP CONSTRAINT IF EXISTS activation_rules_form_template_id_fkey;

ALTER TABLE IF EXISTS public.activation_rules 
ADD CONSTRAINT activation_rules_form_template_id_fkey 
FOREIGN KEY (form_template_id) 
REFERENCES public.form_templates(id) 
ON DELETE CASCADE;
