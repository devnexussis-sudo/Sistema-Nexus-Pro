BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS signature_doc TEXT;
NOTIFY pgrst, 'reload schema';
COMMIT;
