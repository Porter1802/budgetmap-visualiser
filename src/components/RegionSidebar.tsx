"use client";

import type { RegionMeta } from "@/lib/types";

// Expandable left-rail list of regions. Clicking a region filters to it and
// zooms the map to its bounds; "All regions" clears and zooms back out.
export default function RegionSidebar({
  regions,
  selected,
  open,
  onToggleOpen,
  onFocus,
  onClear,
}: {
  regions: RegionMeta[];
  selected: Set<number>;
  open: boolean;
  onToggleOpen: () => void;
  onFocus: (code: number) => void;
  onClear: () => void;
}) {
  const allActive = selected.size === 0;
  return (
    <div className="w-72 overflow-hidden rounded-md border border-qld-light bg-qld-white shadow-card">
      <button
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-qld-info-lighter"
      >
        <span className="text-sm font-semibold text-qld-darkest">Regions</span>
        <span className="flex items-center gap-2">
          <span className="tabnum text-xs text-qld-dark">{regions.length}</span>
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
              d="M3 5l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-qld-dark"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div className="panel-scroll max-h-[55vh] overflow-y-auto border-t border-qld-light">
          <button
            onClick={onClear}
            aria-pressed={allActive}
            className={[
              "flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium transition-colors",
              allActive
                ? "bg-qld-blue text-qld-white"
                : "text-qld-darkest hover:bg-qld-info-lighter",
            ].join(" ")}
          >
            All regions
          </button>
          {regions.map((r) => {
            const active = selected.has(r.code);
            return (
              <button
                key={r.code}
                onClick={() => onFocus(r.code)}
                aria-pressed={active}
                title={`${r.name} · ${r.count} projects`}
                className={[
                  "flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-qld-blue text-qld-white"
                    : "text-qld-darkest hover:bg-qld-info-lighter",
                ].join(" ")}
              >
                <span className="truncate">{r.name}</span>
                <span
                  className={[
                    "ml-3 tabnum text-xs",
                    active ? "text-qld-white/80" : "text-qld-dark",
                  ].join(" ")}
                >
                  {r.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
