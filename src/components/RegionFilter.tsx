"use client";

import type { RegionMeta } from "@/lib/types";

// Region multi-select. Active chip: solid blue, white text. Inactive: white
// with a blue hairline + blue text; hover fills info-lighter. "All" clears.
export default function RegionFilter({
  regions,
  selected,
  onToggle,
  onClear,
}: {
  regions: RegionMeta[];
  selected: Set<number>;
  onToggle: (code: number) => void;
  onClear: () => void;
}) {
  const allActive = selected.size === 0;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onClear}
        aria-pressed={allActive}
        className={[
          "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
          allActive
            ? "bg-qld-blue text-qld-white"
            : "border border-qld-blue bg-qld-white text-qld-blue hover:bg-qld-info-lighter",
        ].join(" ")}
      >
        All regions
      </button>
      {regions.map((r) => {
        const active = selected.has(r.code);
        return (
          <button
            key={r.code}
            onClick={() => onToggle(r.code)}
            aria-pressed={active}
            title={`${r.name} · ${r.count}`}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
              active
                ? "bg-qld-blue text-qld-white"
                : "border border-qld-blue bg-qld-white text-qld-blue hover:bg-qld-info-lighter",
            ].join(" ")}
          >
            {r.name} <span className="tabnum opacity-70">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}
