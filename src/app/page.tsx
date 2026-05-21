"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ModeToggle from "@/components/ModeToggle";
import SearchBox from "@/components/SearchBox";
import FilterChips from "@/components/FilterChips";
import Legend from "@/components/Legend";
import SidePanel from "@/components/SidePanel";
import { formatCompact } from "@/lib/format";
import type { FeatureCollection, ProjectFeature, ProjectProps, MapMode, Meta } from "@/lib/types";

// MapLibre needs the DOM; load the map client-side only.
const MapView = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <SkeletonMap />,
});

export default function Page() {
  const [features, setFeatures] = useState<ProjectFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<MapMode>("blue");
  const [search, setSearch] = useState("");
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProjectProps | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    Promise.all([
      fetch("/data/projects.geojson").then((r) => r.json() as Promise<FeatureCollection>),
      fetch("/data/meta.json").then((r) => r.json() as Promise<Meta>),
    ]).then(([fc, m]) => {
      setFeatures(fc.features);
      setMeta(m);
      setLoading(false);
    });
  }, []);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return features;
    return features.filter(
      (f) =>
        f.properties.name?.toLowerCase().includes(q) ||
        f.properties.agency?.toLowerCase().includes(q)
    );
  }, [features, search]);

  const visibleAgencies = selectedAgencies.size === 0 ? null : selectedAgencies;

  const totalShown = useMemo(
    () =>
      searched
        .filter((f) => !visibleAgencies || visibleAgencies.has(f.properties.agency))
        .reduce((s, f) => s + f.properties.total_funding, 0),
    [searched, visibleAgencies]
  );

  const toggleAgency = (name: string) =>
    setSelectedAgencies((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <MapView
        features={searched}
        mode={mode}
        visibleAgencies={visibleAgencies}
        selectedId={selected?.project_id ?? null}
        onSelect={(p) => setSelected(p)}
        reducedMotion={reducedMotion}
      />

      {/* Top-left: title + search */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-3">
        <div className="pointer-events-auto rounded-md border border-qld-light bg-qld-white px-4 py-3 shadow-card">
          <h1 className="text-base font-semibold text-qld-darkest">Queensland Budget Map</h1>
          <p className="mt-0.5 text-xs text-qld-dark">
            {meta ? (
              <>
                <span className="tabnum">{meta.mapped_projects}</span> projects ·{" "}
                <span className="tabnum">{formatCompact(totalShown)}</span> shown
              </>
            ) : (
              "Loading capital projects…"
            )}
          </p>
        </div>
        <div className="pointer-events-auto">
          <SearchBox value={search} onChange={setSearch} />
        </div>
      </div>

      {/* Top-right: mode toggle */}
      <div className="absolute right-4 top-4 z-10">
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* Top-center: agency filter chips */}
      {meta && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 hidden max-w-[46vw] -translate-x-1/2 lg:block">
          <div className="pointer-events-auto rounded-md border border-qld-light bg-qld-white/95 px-3 py-2 shadow-card backdrop-blur-sm">
            <FilterChips
              agencies={meta.agencies}
              selected={selectedAgencies}
              onToggle={toggleAgency}
              onClear={() => setSelectedAgencies(new Set())}
            />
          </div>
        </div>
      )}

      {/* Bottom-left: legend */}
      {meta && (
        <div className="absolute bottom-6 left-4 z-10">
          <Legend mode={mode} agencies={meta.agencies} />
        </div>
      )}

      <SidePanel project={selected} mode={mode} onClose={() => setSelected(null)} />

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="rounded-md border border-qld-light bg-qld-white px-4 py-2 text-sm text-qld-dark shadow-card">
            Loading projects…
          </div>
        </div>
      )}
    </main>
  );
}

function SkeletonMap() {
  return (
    <div className="absolute inset-0 bg-qld-lightest">
      <div className="absolute inset-0 opacity-60 [background:radial-gradient(circle_at_50%_45%,#E5EEF5_0,#F5F5F5_55%)]" />
    </div>
  );
}
