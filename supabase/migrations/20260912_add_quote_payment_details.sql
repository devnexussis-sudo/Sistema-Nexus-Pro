-- Add payment configuration fields to quotes
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS installments integer,
ADD COLUMN IF NOT EXISTS payment_notes text;
