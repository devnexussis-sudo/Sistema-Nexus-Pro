// src/types/region.ts
export interface Region {
  id: string;
  name: string;
  description?: string;
  color: string; // hex color code
  is_active: boolean;
  technician_ids: string[]; // list of technician UUIDs
  polygon_geojson: any; // GeoJSON representation (MultiPolygon allowed)
}
