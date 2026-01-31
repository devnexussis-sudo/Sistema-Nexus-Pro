-- POLICY: Allow technicians to update orders assigned to them
-- This bypasses the generic tenant check if the user is the assigned technician
-- Solves "PGRST116" or silent failures if tenant_id context is lost

CREATE POLICY "Technicians can update assigned orders" ON orders
  FOR UPDATE
  USING (
    auth.uid() = technician_id
  );
