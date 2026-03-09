-- Migration: Add geolocation tracking to technicians
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS last_latitude DOUBLE PRECISION;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS last_longitude DOUBLE PRECISION;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE;

-- Create an index for performance if we filter by last_seen
CREATE INDEX IF NOT EXISTS idx_technicians_last_seen ON technicians(last_seen);
