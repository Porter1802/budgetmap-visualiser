import type { ProjectFeature } from "./types";

// Download the currently visible projects as CSV. Runs entirely client-side —
// the data is already in memory, so this is just serialisation + a Blob link.
const COLUMNS = [
  "project_id",
  "name",
  "agency",
  "type",
  "category",
  "total_funding",
  "qld_funding",
  "fed_funding",
  "local_funding",
  "own_funding",
  "private_funding",
  "lga",
  "address",
  "longitude",
  "latitude",
] as const;

function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(features: ProjectFeature[]): void {
  const rows = features.map((f) => {
    const p = f.properties;
    const [lon, lat] =
      f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : ["", ""];
    return [
      p.project_id,
      p.name,
      p.agency,
      p.type,
      p.category,
      p.total_funding,
      p.qld_funding,
      p.fed_funding,
      p.local_funding,
      p.own_funding,
      p.private_funding,
      p.region_lga,
      p.address,
      lon,
      lat,
    ]
      .map(csvCell)
      .join(",");
  });
  const csv = [COLUMNS.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "qld-budget-projects.csv";
  a.click();
  URL.revokeObjectURL(url);
}
