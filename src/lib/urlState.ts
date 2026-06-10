import type { ProjectCategory } from "./types";

// Shareable view state, serialised into the URL hash (the app is a static
// export, so hash params keep deep links working without a server).
//   #q=search&r=1,4&c=capital,school&p=12345&fund=1
export interface UrlState {
  q: string;
  regions: number[];
  categories: ProjectCategory[] | null; // null = all categories
  projectId: number | null;
  sizeByFunding: boolean;
}

const ALL_CATEGORIES: ProjectCategory[] = ["capital", "other", "school", "police", "hospital"];

export function readUrlState(): UrlState {
  const empty: UrlState = { q: "", regions: [], categories: null, projectId: null, sizeByFunding: false };
  if (typeof window === "undefined") return empty;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return empty;
  const params = new URLSearchParams(hash);

  const regions = (params.get("r") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);

  // Distinguish "param absent" (all categories) from an explicit — possibly
  // empty — selection, so a view with everything toggled off round-trips.
  const cParam = params.get("c");
  const cats = (cParam ?? "")
    .split(",")
    .filter((s): s is ProjectCategory => (ALL_CATEGORIES as string[]).includes(s));

  const pid = Number(params.get("p"));

  return {
    q: params.get("q") ?? "",
    regions,
    categories: cParam == null || cats.length >= ALL_CATEGORIES.length ? null : cats,
    projectId: Number.isInteger(pid) && pid > 0 ? pid : null,
    sizeByFunding: params.get("fund") === "1",
  };
}

export function writeUrlState(state: UrlState): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.regions.length) params.set("r", state.regions.join(","));
  if (state.categories) params.set("c", state.categories.join(","));
  if (state.projectId != null) params.set("p", String(state.projectId));
  if (state.sizeByFunding) params.set("fund", "1");
  const next = params.toString();
  const url = next ? `#${next}` : window.location.pathname + window.location.search;
  history.replaceState(null, "", url);
}
