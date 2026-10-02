// src/types/react-leaflet-draw.d.ts
declare module "react-leaflet-draw" {
  import { ComponentType } from "react";
  import { EditControl as LeafletEditControl } from "leaflet-draw";

  export const EditControl: ComponentType<any>;

  // Re-export everything from leaflet-draw for convenience
  export * from "leaflet-draw";
}
