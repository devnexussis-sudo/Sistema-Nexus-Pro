// src/services/regionService.ts
import { supabase } from '../lib/supabase';
import type { Region } from '../types/region';
import { getCurrentTenantId } from '../lib/tenantContext';

/**
 * Fetch all service regions for the current tenant.
 */
export async function getRegions(): Promise<Region[]> {
  const tid = getCurrentTenantId();
  if (!tid) return [];

  const { data, error } = await supabase
    .from<Region>('service_regions')
    .select('*')
    .eq('tenant_id', tid);
  
  if (error) throw error;
  return data || [];
}

/**
 * Create a new service region.
 */
export async function createRegion(region: Omit<Region, 'id'>): Promise<Region> {
  const tid = getCurrentTenantId();
  if (!tid) throw new Error("Tenant ID não encontrado.");

  // Explicitly map fields to avoid sending `id: ""` or other garbage that breaks Postgres inserts
  const payload = {
    id: crypto.randomUUID(),
    tenant_id: tid,
    name: region.name,
    description: region.description || null,
    color: region.color || '#3366ff',
    is_active: region.is_active ?? true,
    technician_ids: region.technician_ids || [],
    polygon_geojson: region.polygon_geojson
  };

  console.log("Tentando inserir região com payload:", payload);

  const { data, error } = await supabase
    .from('service_regions')
    .insert([payload])
    .select()
    .single();
    
  if (error) throw error;
  return data as Region;
}

/**
 * Update an existing region by its id.
 */
export async function updateRegion(id: string, updates: Partial<Omit<Region, 'id'>>): Promise<Region> {
  const tid = getCurrentTenantId();
  if (!tid) throw new Error("Tenant ID não encontrado.");

  const { data, error } = await supabase
    .from<Region>('service_regions')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tid)
    .select()
    .single();
    
  if (error) throw error;
  return data as Region;
}

/**
 * Delete a region.
 */
export async function deleteRegion(id: string): Promise<void> {
  const tid = getCurrentTenantId();
  if (!tid) return;

  const { error } = await supabase
    .from('service_regions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tid);
    
  if (error) throw error;
}

/**
 * Toggle region active state.
 */
export async function toggleRegion(id: string, isActive: boolean): Promise<Region> {
  const tid = getCurrentTenantId();
  if (!tid) throw new Error("Tenant ID não encontrado.");

  const { data, error } = await supabase
    .from<Region>('service_regions')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('tenant_id', tid)
    .select()
    .single();
    
  if (error) throw error;
  return data as Region;
}
