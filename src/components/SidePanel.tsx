"use client";

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import { agencyBucket, statusMeta } from "@/lib/tokens";
import { formatCompact, formatFull } from "@/lib/format";
import type { ProjectProps, MapMode } from "@/lib/types";

const OFFICIAL = "https://budgetmap.treasury.qld.gov.au/";

// All five funding segments are tints of the one brand blue (oklch mixes).
const SEGMENTS: { key: keyof ProjectProps; label: string; color: string }[] = [
  { key: "qld_funding", label: "QLD", color: "#005EB8" },
  { key: "fed_funding", label: "Federal", color: "color-mix(in oklch, #005EB8, #FFFFFF 25%)" },
  { key: "local_funding", label: "Local", color: "color-mix(in oklch, #005EB8, #FFFFFF 45%)" },
  { key: "own_funding", label: "Own-source", color: "color-mix(in oklch, #005EB8, #FFFFFF 65%)" },
  { key: "private_funding", label: "Private", color: "color-mix(in oklch, #005EB8, #FFFFFF 80%)" },
];

export default function SidePanel({
  project,
  mode,
  onClose,
}: {
  project: ProjectProps | null;
  mode: MapMode;
  onClose: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || !project) return;
    el.innerHTML = "";

    const data = SEGMENTS.map((s) => ({
      label: s.label,
      value: (project[s.key] as number) || 0,
      color: s.color,
    })).filter((d) => d.value > 0);

    if (!data.length) return;

    const chart = Plot.plot({
      width: 372,
      height: 38,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      x: { axis: null },
      color: { domain: data.map((d) => d.label), range: data.map((d) => d.color) },
      marks: [
        Plot.barX(data, {
          x: "value",
          fill: "label",
          rx: 2,
          insetRight: 1,
        }),
      ],
    });
    el.append(chart);
    return () => chart.remove();
  }, [project]);

  if (!project) return null;

  const bucket = agencyBucket(project.agency);
  const tabColor = mode === "agency" ? bucket.css : "#005EB8";
  const status = statusMeta(project.status);
  const segs = SEGMENTS.map((s) => ({
    ...s,
    value: (project[s.key] as number) || 0,
  })).filter((s) => s.value > 0);

  return (
    <aside className="panel-in panel-scroll absolute right-0 top-0 z-20 flex h-full w-[420px] flex-col overflow-y-auto border-l border-qld-light bg-qld-white">
      <div className="relative flex items-start gap-3 px-6 pb-4 pt-5">
        <span className="absolute left-0 top-0 h-full w-1" style={{ background: tabColor }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-qld-dark">
            {project.agency}
          </p>
          <h2 className="mt-1 text-[28px] font-semibold leading-tight text-qld-darkest">
            {project.name}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {project.type && (
              <span className="rounded-full bg-qld-info-lighter px-2.5 py-1 text-xs font-medium text-qld-blue">
                {project.type}
              </span>
            )}
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: status.css, color: status.text }}
            >
              {status.label}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-md p-1.5 text-qld-dark hover:bg-qld-lightest"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="border-t border-qld-light px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-qld-dark">Total funding</p>
        <p className="mt-1 font-mono text-[32px] font-medium tabnum text-qld-blue">
          {formatCompact(project.total_funding)}
        </p>
        {segs.length > 0 && (
          <>
            <div ref={chartRef} className="mt-3" />
            <ul className="mt-3 space-y-1.5">
              {segs.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-xs text-qld-darker">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="flex-1">{s.label}</span>
                  <span className="tabnum text-qld-darkest">{formatFull(s.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {project.description && (
        <div className="border-t border-qld-light px-6 py-5">
          <p className="max-w-[70ch] whitespace-pre-line text-[16px] leading-relaxed text-qld-darker">
            {project.description}
          </p>
        </div>
      )}

      {(project.region_lga || project.region_sed || project.region_sa4 || project.address) && (
        <div className="border-t border-qld-light px-6 py-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-qld-dark">Location</p>
          {project.address && <p className="mb-2 text-sm text-qld-darker">{project.address}</p>}
          <div className="flex flex-wrap gap-2">
            {[project.region_lga, project.region_sed, project.region_sa4]
              .filter(Boolean)
              .map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-qld-light bg-qld-lightest px-2.5 py-1 text-xs text-qld-darker"
                >
                  {tag}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-qld-light px-6 py-4">
        <a
          href={project.web_link || OFFICIAL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-qld-blue underline underline-offset-2"
        >
          View on official Budget Map →
        </a>
      </div>
    </aside>
  );
}
