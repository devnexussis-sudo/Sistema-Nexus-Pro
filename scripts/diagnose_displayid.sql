-- 🔍 DIAGNÓSTICO COMPLETO - Verificar DisplayIDs

-- 1. Verificar se displayId existe nas OSs
SELECT 
    id,
    "displayId",
    title,
    "customerName",
    status,
    "createdAt"
FROM service_orders
ORDER BY "createdAt" DESC
LIMIT 10;

-- 2. Contar OSs com e sem displayId
SELECT 
    COUNT(*) as total_orders,
    COUNT("displayId") as with_display_id,
    COUNT(*) - COUNT("displayId") as without_display_id
FROM service_orders;

-- 3. Ver exemplos de displayId vs id
SELECT 
    substring(id::text, 1, 36) as uuid_id,
    "displayId" as display_id,
    title
FROM service_orders
WHERE "displayId" IS NOT NULL
LIMIT 5;

-- 4. Ver OSs SEM displayId
SELECT 
    substring(id::text, 1, 36) as uuid_id,
    "displayId",
    title,
    "createdAt"
FROM service_orders
WHERE "displayId" IS NULL
ORDER BY "createdAt" DESC
LIMIT 5;

-- 5. Ver formato do tenant_config (onde está o prefixo OS-xxxx)
SELECT 
    id,
    name,
    "orderPrefix",
    "orderCounter"
FROM tenants
LIMIT 5;
