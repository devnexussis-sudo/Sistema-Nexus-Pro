-- Migration: Create invoice_nfse table for NFS-e tracking
-- Date: 2026-09-10

CREATE TABLE IF NOT EXISTS invoice_nfse (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    invoice_id UUID NOT NULL,
    asaas_nfse_id TEXT,
    status TEXT DEFAULT 'SCHEDULED',
    nfse_number TEXT,
    pdf_url TEXT,
    xml_url TEXT,
    invoice_url TEXT,
    value NUMERIC(12,2),
    service_description TEXT,
    effective_date DATE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(invoice_id)
);

-- Enable RLS
ALTER TABLE invoice_nfse ENABLE ROW LEVEL SECURITY;

-- Policy: allow all authenticated users access (tenant filtering done in application layer)
CREATE POLICY "invoice_nfse_authenticated_access" ON invoice_nfse
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
