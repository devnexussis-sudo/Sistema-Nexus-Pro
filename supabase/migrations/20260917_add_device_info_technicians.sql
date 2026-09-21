-- Migration: Add device_model and motion_state to technicians

ALTER TABLE public.technicians
ADD COLUMN IF NOT EXISTS device_model text,
ADD COLUMN IF NOT EXISTS motion_state text;
