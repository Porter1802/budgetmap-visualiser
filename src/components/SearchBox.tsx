"use client";

import { useEffect, useState, type RefObject } from "react";
import { formatCompact } from "@/lib/format";
import type { ProjectFeature } from "@/lib/types";

// Search input with a typeahead dropdown. Results fly the map to the project;
// arrow keys + Enter drive the list, "/" (wired in page.tsx) focuses the input.
export default function SearchBox({
  value,
  onChange,
  results,
  onPick,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  results: ProjectFeature[];
  onPick: (f: ProjectFeature) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => setActive(0), [value]);

  const showList = open && value.trim().length > 0;

  const pick = (f: ProjectFeature) => {
    onPick(f);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList || !results.length) {
      if (e.key === "Escape") inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-qld-dark"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="m14 14 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Search projects…  ( / )"
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-autocomplete="list"
        className="w-72 rounded-md border border-qld-light bg-qld-white py-2 pl-9 pr-3 text-sm text-qld-darkest shadow-card outline-none placeholder:text-qld-dark focus:border-qld-blue focus:ring-2 focus:ring-qld-blue/30"
      />
      {showList && (
        <ul
          id="search-results"
          role="listbox"
          className="panel-scroll absolute left-0 top-full z-30 mt-1.5 max-h-72 w-[340px] overflow-y-auto rounded-md border border-qld-light bg-qld-white py-1 shadow-card"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-qld-dark">No matching projects</li>
          )}
          {results.map((f, i) => {
            const p = f.properties;
            return (
              <li key={p.project_id} role="option" aria-selected={i === active}>
                <button
                  // onMouseDown beats the input's onBlur so the click registers.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(f);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={[
                    "block w-full px-3 py-2 text-left",
                    i === active ? "bg-qld-info-lighter" : "",
                  ].join(" ")}
                >
                  <span className="block truncate text-sm font-medium text-qld-darkest">
                    {p.name ?? "Untitled project"}
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-qld-dark">
                    <span className="truncate">{p.agency}</span>
                    {p.total_funding > 0 && (
                      <span className="tabnum shrink-0 font-mono text-qld-blue">
                        {formatCompact(p.total_funding)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
