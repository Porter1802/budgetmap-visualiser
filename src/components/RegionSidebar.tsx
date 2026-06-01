"use client";

import { CATEGORY_HEX, CATEGORY_LABEL, QLD } from "@/lib/tokens";
import { CATEGORY_PATH, hasGlyph } from "@/lib/icons";
import type { ProjectCategory, RegionMeta } from "@/lib/types";

// Fixed display order; only categories present in the data are shown.
const CATEGORY_ORDER: ProjectCategory[] = ["capital", "other", "school", "police", "hospital"];

// Expandable left rail. Top section toggles the project/facility categories
// with colour-swatch legends; the list below filters/zooms by region.
export default function RegionSidebar({
  regions,
  selected,
  categoryCounts,
  selectedCategories,
  onToggleCategory,
  open,
  onToggleOpen,
  onFocus,
  onClear,
}: {
  regions: RegionMeta[];
  selected: Set<number>;
  categoryCounts: Record<ProjectCategory, number>;
  selectedCategories: Set<ProjectCategory>;
  onToggleCategory: (cat: ProjectCategory) => void;
  open: boolean;
  onToggleOpen: () => void;
  onFocus: (code: number) => void;
  onClear: () => void;
}) {
  const allActive = selected.size === 0;
  const cats = CATEGORY_ORDER.filter((c) => (categoryCounts[c] ?? 0) > 0);
  return (
    <div className="w-72 overflow-hidden rounded-md border border-qld-light bg-qld-white shadow-card">
      <button
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-qld-info-lighter"
      >
        <span className="text-sm font-semibold text-qld-darkest">Filters</span>
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
      </button>

      {open && (
        <div className="panel-scroll max-h-[60vh] overflow-y-auto border-t border-qld-light">
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-qld-dark">
            Project type
          </p>
          {cats.map((cat) => {
            const active = selectedCategories.has(cat);
            return (
              <button
                key={cat}
                onClick={() => onToggleCategory(cat)}
                aria-pressed={active}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-qld-info-lighter"
              >
                {hasGlyph(cat) ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    className="shrink-0"
                    aria-hidden
                  >
                    <path d={CATEGORY_PATH[cat]} fill={active ? CATEGORY_HEX[cat] : QLD.dark} />
                  </svg>
                ) : (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border"
                    style={{
                      background: active ? CATEGORY_HEX[cat] : "transparent",
                      borderColor: CATEGORY_HEX[cat],
                    }}
                    aria-hidden
                  />
                )}
                <span
                  className={[
                    "flex-1 truncate",
                    active ? "text-qld-darkest" : "text-qld-dark line-through",
                  ].join(" ")}
                >
                  {CATEGORY_LABEL[cat]}
                </span>
                <span className="tabnum text-xs text-qld-dark">{categoryCounts[cat]}</span>
              </button>
            );
          })}

          <p className="border-t border-qld-light px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-qld-dark">
            Regions
          </p>
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
