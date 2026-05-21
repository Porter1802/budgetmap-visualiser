"use client";

import type { MapMode } from "@/lib/types";

const MODES: { id: MapMode; label: string }[] = [
  { id: "blue", label: "Blue" },
  { id: "agency", label: "By agency" },
  { id: "hexbin", label: "Heatmap" },
];

export default function ModeToggle({
  mode,
  onChange,
}: {
  mode: MapMode;
  onChange: (m: MapMode) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-qld-light bg-qld-white shadow-card">
      {MODES.map((m, i) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            aria-pressed={active}
            className={[
              "px-3.5 py-2 text-sm font-medium transition-colors duration-200",
              i > 0 ? "border-l border-qld-light" : "",
              active ? "bg-qld-blue text-qld-white" : "bg-qld-white text-qld-darker hover:bg-qld-info-lighter",
            ].join(" ")}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
