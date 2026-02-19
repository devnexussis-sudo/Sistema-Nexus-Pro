-- 1. Adicionar novas colunas para o fluxo de atendimento
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "timeline" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "checkin_location" jsonb;
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "checkout_location" jsonb;
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "pause_reason" text;

-- 2. Atualizar o tipo ENUM 'order_status' com os novos status
-- O 'IF NOT EXISTS' previne erros se você rodar a migração mais de uma vez.
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'EM DESLOCAMENTO';
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'NO LOCAL';
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'PAUSADO';

-- 3. Criar índice para consultas futuras de geolocalização (opcional mas recomendado)
CREATE INDEX IF NOT EXISTS idx_orders_checkin_location ON public.orders USING gin (checkin_location);
