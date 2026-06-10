"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import { exportCsv } from "@/lib/export";
import { formatCompact } from "@/lib/format";
import type { ProjectFeature, RegionMeta } from "@/lib/types";

const TOP_PROJECTS = 5;
const TOP_REGIONS = 6;

// Collapsible analytics card (bottom-left). Everything is derived from the
// projects currently passing the filters, so it doubles as live feedback on
// what the active search/region/category selection actually contains.
export default function InsightsPanel({
  features,
  regions,
  onPick,
}: {
  features: ProjectFeature[];
  regions: RegionMeta[];
  onPick: (f: ProjectFeature) => void;
}) {
  // Collapsed by default on small screens where the card would cover the map.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(!window.matchMedia("(max-width: 768px)").matches);
  }, []);
  const chartRef = useRef<HTMLDivElement>(null);

  const topProjects = useMemo(
    () =>
      [...features]
        .filter((f) => f.properties.total_funding > 0)
        .sort((a, b) => b.properties.total_funding - a.properties.total_funding)
        .slice(0, TOP_PROJECTS),
    [features]
  );

  const regionTotals = useMemo(() => {
    const names = new Map(regions.map((r) => [r.code, r.name]));
    const totals = new Map<number, number>();
    for (const f of features) {
      // Attribute each project to its first region so totals don't double-count.
      const code = f.properties.region_codes[0];
      if (code == null) continue;
      totals.set(code, (totals.get(code) ?? 0) + f.properties.total_funding);
    }
    return [...totals.entries()]
      .map(([code, value]) => ({ name: names.get(code) ?? `Region ${code}`, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_REGIONS);
  }, [features, regions]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || !open) return;
    el.innerHTML = "";
    if (!regionTotals.length) return;

    const chart = Plot.plot({
      width: 280,
      height: 22 * regionTotals.length + 8,
      marginTop: 4,
      marginBottom: 4,
      marginLeft: 0,
      marginRight: 44,
      x: { axis: null },
      y: { axis: null, domain: regionTotals.map((d) => d.name), padding: 0.25 },
      marks: [
        Plot.barX(regionTotals, { x: "value", y: "name", fill: "#005EB8", rx: 2, opacity: 0.25 }),
        Plot.text(regionTotals, {
          x: 0,
          y: "name",
          text: "name",
          textAnchor: "start",
          dx: 4,
          fill: "#222020",
          fontSize: 11,
        }),
        Plot.text(regionTotals, {
          x: "value",
          y: "name",
          text: (d: { value: number }) => formatCompact(d.value),
          textAnchor: "start",
          dx: 6,
          fill: "#005EB8",
          fontSize: 11,
          fontWeight: 600,
        }),
      ],
    });
    el.append(chart);
    return () => chart.remove();
  }, [regionTotals, open]);

  return (
    <div className="w-80 overflow-hidden rounded-md border border-qld-light bg-qld-white shadow-card">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-qld-info-lighter"
      >
        <span className="text-sm font-semibold text-qld-darkest">Insights</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          <path
            d="M3 9l4-4 4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-qld-dark"
          />
        </svg>
      </button>

      {open && (
        <div className="panel-scroll max-h-[46vh] overflow-y-auto border-t border-qld-light">
          {topProjects.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-qld-dark">
                Top projects shown
              </p>
              {topProjects.map((f) => (
                <button
                  key={f.properties.project_id}
                  onClick={() => onPick(f)}
                  title={f.properties.name ?? undefined}
                  className="flex w-full items-baseline gap-3 px-4 py-1.5 text-left text-sm transition-colors hover:bg-qld-info-lighter"
                >
                  <span className="flex-1 truncate text-qld-darkest">
                    {f.properties.name ?? "Untitled project"}
                  </span>
                  <span className="tabnum shrink-0 font-mono text-xs text-qld-blue">
                    {formatCompact(f.properties.total_funding)}
                  </span>
                </button>
              ))}
            </>
          )}

          {regionTotals.length > 0 && (
            <>
              <p className="border-t border-qld-light px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-qld-dark">
                Funding by region
              </p>
              <div ref={chartRef} className="px-4 pb-2" />
            </>
          )}

          {topProjects.length === 0 && regionTotals.length === 0 && (
            <p className="px-4 py-3 text-sm text-qld-dark">No funded projects in view.</p>
          )}

          <div className="border-t border-qld-light px-4 py-3">
            <button
              onClick={() => exportCsv(features)}
              disabled={!features.length}
              className="flex items-center gap-2 rounded-md border border-qld-blue px-3 py-1.5 text-xs font-medium text-qld-blue transition-colors hover:bg-qld-info-lighter disabled:opacity-40"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                <path
                  d="M8 2v8m0 0 3-3M8 10 5 7M3 13h10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export {features.length} projects (CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
