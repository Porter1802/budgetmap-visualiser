// Client for the FastAPI read layer. Base URL is build-time configurable; when
// unset (e.g. the static POC deploy) SA2 pages show a "configure API" notice
// rather than failing.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface Sa2Summary {
  sa2_code: string;
  sa2_name: string | null;
  sa4_name: string | null;
  financial_year: string;
  project_count: number;
  total_funding_aud: number;
  qld_funding_aud: number;
  fed_funding_aud: number;
  local_funding_aud: number;
  own_src_funding_aud: number;
  private_funding_aud: number;
  dominant_agency: string | null;
  irsd_decile: number | null;
  population: number | null;
}

export interface Sa2Project {
  project_id: number;
  name: string | null;
  agency_name: string | null;
  type_name: string | null;
  category: string;
  total_funding_aud: number;
  status: number | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const getSa2 = (code: string) => get<Sa2Summary>(`/sa2/${encodeURIComponent(code)}`);
export const getSa2Projects = (code: string) =>
  get<Sa2Project[]>(`/sa2/${encodeURIComponent(code)}/projects`);
