export interface ProjectProps {
  project_id: number;
  name: string | null;
  description: string | null;
  agency: string;
  type: string | null;
  status: number | null;
  qld_funding: number;
  fed_funding: number;
  local_funding: number;
  own_funding: number;
  private_funding: number;
  total_funding: number;
  region_lga: string | null;
  region_sed: string | null;
  region_sa4: string | null;
  address: string | null;
  web_link: string | null;
}

export interface ProjectFeature {
  type: "Feature";
  geometry: { type: string; coordinates: number[] | number[][] | number[][][] };
  properties: ProjectProps;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: ProjectFeature[];
}

export type MapMode = "blue" | "agency" | "hexbin";

export interface Meta {
  total_projects: number;
  mapped_projects: number;
  agencies: { name: string; count: number }[];
  total_funding: number;
}
