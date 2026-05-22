export type ProjectCategory = "capital" | "other" | "school" | "police" | "hospital";

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
  region_codes: number[];
  region_lga: string | null;
  region_sed: string | null;
  region_sa4: string | null;
  address: string | null;
  web_link: string | null;
  category: ProjectCategory;
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

export interface RegionProps {
  RDP_code: number;
  Name: string;
}

export interface RegionFeature {
  type: "Feature";
  id?: number;
  geometry: { type: string; coordinates: unknown };
  properties: RegionProps;
}

export interface RegionCollection {
  type: "FeatureCollection";
  features: RegionFeature[];
}

export interface RegionMeta {
  code: number;
  name: string;
  count: number;
}

export interface Meta {
  total_projects: number;
  mapped_projects: number;
  regions: RegionMeta[];
  categories: Record<ProjectCategory, number>;
  total_funding: number;
}
