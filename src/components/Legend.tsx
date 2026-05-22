"use client";

import { useState } from "react";
import { agencyBucket } from "@/lib/tokens";
import type { MapMode } from "@/lib/types";

// Mode-aware legend. Agency mode shows bucket swatches; hexbin shows the blue
// sequential ramp; blue mode explains size = funding.
export default function Legend({
  mode,
  agencies,
}: {
  mode: MapMode;
  agencies: { name: string; count: number }[];
}) {
  const [open, setOpen] = useState(true);

  const buckets = aggregateBuckets(agencies);

  return (
    <div className="w-56 overflow-hidden rounded-md border border-qld-light bg-qld-white shadow-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-qld-dark"
      >
        Legend
        <span className="text-qld-dark">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-qld-light px-3 py-2.5 text-xs text-qld-darker">
          {mode === "agency" && (
            <ul className="space-y-1.5">
              {buckets.map((b) => (
                <li key={b.label} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: b.css }} />
                  <span className="flex-1 truncate">{b.label}</span>
                  <span className="tabnum text-qld-dark">{b.count}</span>
                </li>
              ))}
            </ul>
          )}
          {mode === "hexbin" && (
            <div>
              <div
                className="h-3 w-full rounded-sm"
                style={{
                  background:
                    "linear-gradient(90deg,#EFF4F9,#E5EEF5,#80AFDC,#005EB8,#054B8F)",
                }}
              />
              <div className="mt-1 flex justify-between text-qld-dark">
                <span>Less</span>
                <span>Total funding</span>
                <span>More</span>
              </div>
            </div>
          )}
          {mode === "blue" && (
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                {[5, 9, 14].map((r, i) => (
                  <span
                    key={r}
                    className="rounded-full bg-qld-blue/75"
                    style={{ width: r * 2, height: r * 2 }}
                    aria-hidden
                  />
                ))}
                <span className="ml-1 text-qld-dark">size = funding</span>
              </div>
              <p className="text-qld-dark">Hover highlights in teal; click for detail.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function aggregateBuckets(agencies: { name: string; count: number }[]) {
  const map = new Map<string, { label: string; css: string; count: number }>();
  for (const a of agencies) {
    const b = agencyBucket(a.name);
    const cur = map.get(b.label) || { label: b.label, css: b.css, count: 0 };
    cur.count += a.count;
    map.set(b.label, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
