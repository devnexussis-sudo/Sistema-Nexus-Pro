-- Drop the restrictive check constraint.
BEGIN;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS check_status;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
NOTIFY pgrst, 'reload schema';
COMMIT;
