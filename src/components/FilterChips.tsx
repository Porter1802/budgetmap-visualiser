"use client";

// Agency multi-select. Active chip: solid blue, white text. Inactive: white
// with a blue hairline + blue text; hover fills info-lighter. "All" clears.

export default function FilterChips({
  agencies,
  selected,
  onToggle,
  onClear,
}: {
  agencies: { name: string; count: number }[];
  selected: Set<string>;
  onToggle: (name: string) => void;
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
        All
      </button>
      {agencies.map((a) => {
        const active = selected.has(a.name);
        return (
          <button
            key={a.name}
            onClick={() => onToggle(a.name)}
            aria-pressed={active}
            title={`${a.name} · ${a.count}`}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
              active
                ? "bg-qld-blue text-qld-white"
                : "border border-qld-blue bg-qld-white text-qld-blue hover:bg-qld-info-lighter",
            ].join(" ")}
          >
            {shorten(a.name)} <span className="tabnum opacity-70">{a.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function shorten(name: string): string {
  return name.replace(/^Department of (the )?/i, "").replace(/^Queensland /i, "");
}
