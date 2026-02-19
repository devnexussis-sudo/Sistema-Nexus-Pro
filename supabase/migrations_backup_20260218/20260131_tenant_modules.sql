-- 🧩 Nexus Dynamic Module System
-- Adiciona controle de módulos ativos por empresa (Tenant)

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '{
  "dashboard": true,
  "orders": true,
  "quotes": true,
  "contracts": true,
  "customers": true,
  "equipments": true,
  "stock": true,
  "technicians": true,
  "forms": true,
  "users": true,
  "settings": true
}'::jsonb;

-- Comentário para documentar o schema esperado do JSONB:
-- {
--   "dashboard": boolean,
--   "orders": boolean,
--   "quotes": boolean,
--   "contracts": boolean,
--   "customers": boolean,
--   "equipments": boolean,
--   "stock": boolean,
--   "technicians": boolean,
--   "forms": boolean,
--   "users": boolean,
--   "settings": boolean
-- }
