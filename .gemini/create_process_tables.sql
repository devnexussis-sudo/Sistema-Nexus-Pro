-- ============================================
-- SCRIPT SQL: Estrutura de Processos/Formulários
-- Execute no SQL Editor do Supabase
-- ============================================

-- 1. TABELA: Tipos de Serviço/Atendimento
CREATE TABLE IF NOT EXISTS public.service_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA: Modelos de Formulário/Checklist
CREATE TABLE IF NOT EXISTS public.form_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  "targetType" TEXT,
  "targetFamily" TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de campos do formulário
  active BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA: Regras de Vinculação (Ativação Automática)
CREATE TABLE IF NOT EXISTS public.activation_rules (
  id TEXT PRIMARY KEY,
  "serviceTypeId" TEXT NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  "equipmentFamily" TEXT NOT NULL,
  "formId" TEXT NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint para evitar duplicatas
  UNIQUE("serviceTypeId", "equipmentFamily", "formId")
);

-- ============================================
-- DADOS INICIAIS (Seed Data)
-- ============================================

-- Tipos de Serviço Padrão
INSERT INTO public.service_types (id, name, active) VALUES
  ('st-prev', 'Manutenção Preventiva', true),
  ('st-corr', 'Manutenção Corretiva', true),
  ('st-inst', 'Instalação / Startup', true),
  ('st-orca', 'Orçamento Técnico', true)
ON CONFLICT (id) DO NOTHING;

-- Formulário/Checklist Padrão
INSERT INTO public.form_templates (id, title, fields, active) VALUES
  ('f-chiller', 'Checklist Técnico: Chiller Carrier 30XA', 
   '[
     {"id":"1","label":"Nível de Óleo do Compressor","type":"TEXT","required":true},
     {"id":"2","label":"Pressão de Sucção (psi)","type":"TEXT","required":true},
     {"id":"3","label":"Foto da Placa de Controle","type":"PHOTO","required":true},
     {"id":"4","label":"Assinatura do Responsável","type":"SIGNATURE","required":true}
   ]'::jsonb, 
   true),
  ('f-padrao', 'Checklist de Manutenção Geral',
   '[
     {"id":"q1","label":"Equipamento em condições de uso?","type":"SELECT","options":["Sim","Não","Necessita Reparo"],"required":true},
     {"id":"q2","label":"Observações do Técnico","type":"LONG_TEXT","required":false},
     {"id":"q3","label":"Foto do Equipamento","type":"PHOTO","required":true},
     {"id":"q4","label":"Assinatura do Responsável","type":"SIGNATURE","required":true}
   ]'::jsonb,
   true)
ON CONFLICT (id) DO NOTHING;

-- Regra de Vinculação Padrão
INSERT INTO public.activation_rules (id, "serviceTypeId", "equipmentFamily", "formId", active) VALUES
  ('r-1', 'st-prev', 'Refrigeração Industrial', 'f-chiller', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PERMISSÕES (Row Level Security)
-- ============================================

-- Service Types
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for service_types" ON public.service_types FOR ALL USING (true) WITH CHECK (true);

-- Form Templates
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for form_templates" ON public.form_templates FOR ALL USING (true) WITH CHECK (true);

-- Activation Rules
ALTER TABLE public.activation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for activation_rules" ON public.activation_rules FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- REALTIME (Sincronização Automática)
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.service_types;
ALTER PUBLICATION supabase_realtime ADD TABLE public.form_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activation_rules;

-- ============================================
-- CONFIRMAÇÃO
-- ============================================

SELECT 'Estrutura de Processos criada com sucesso!' as status;
