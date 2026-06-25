-- Migration to add rejection_reason column to whatsapp_service_requests
ALTER TABLE whatsapp_service_requests 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
