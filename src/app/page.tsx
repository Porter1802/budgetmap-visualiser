"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import SearchBox from "@/components/SearchBox";
import RegionFilter from "@/components/RegionFilter";
import SidePanel from "@/components/SidePanel";
import { formatCompact } from "@/lib/format";
import type {
  FeatureCollection,
  ProjectFeature,
  ProjectProps,
  RegionCollection,
  Meta,
} from "@/lib/types";

// MapLibre needs the DOM; load the map client-side only.
const MapView = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <SkeletonMap />,
});

function passesRegion(f: ProjectFeature, selected: Set<number>): boolean {
  if (selected.size === 0) return true;
  return f.properties.region_codes.some((c) => selected.has(c));
}

export default function Page() {
  const [features, setFeatures] = useState<ProjectFeature[]>([]);
  const [regions, setRegions] = useState<RegionCollection | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<Set<number>>(new Set());
  const [members, setMembers] = useState<ProjectProps[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    Promise.all([
      fetch("/data/projects.geojson").then((r) => r.json() as Promise<FeatureCollection>),
      fetch("/data/regions.geojson").then((r) => r.json() as Promise<RegionCollection>),
      fetch("/data/meta.json").then((r) => r.json() as Promise<Meta>),
    ]).then(([fc, rc, m]) => {
      setFeatures(fc.features);
      setRegions(rc);
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

  const shown = useMemo(
    () => searched.filter((f) => passesRegion(f, selectedRegions)),
    [searched, selectedRegions]
  );

  const totalShown = useMemo(
    () => shown.reduce((s, f) => s + f.properties.total_funding, 0),
    [shown]
  );

  const toggleRegion = (code: number) =>
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  const selected = members ? members[activeIndex] ?? null : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <MapView
        features={searched}
        regions={regions}
        selectedRegions={selectedRegions}
        selectedId={selected?.project_id ?? null}
        onSelect={(m) => {
          setMembers(m);
          setActiveIndex(0);
        }}
        reducedMotion={reducedMotion}
      />

      {/* Top-left: title + search */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-3">
        <div className="pointer-events-auto rounded-md border border-qld-light bg-qld-white px-4 py-3 shadow-card">
          <h1 className="text-base font-semibold text-qld-darkest">Queensland Budget Map</h1>
          <p className="mt-0.5 text-xs text-qld-dark">
            {meta ? (
              <>
                <span className="tabnum">{shown.length}</span> projects ·{" "}
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

      {/* Top-center: region filter */}
      {meta && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 hidden max-w-[52vw] -translate-x-1/2 lg:block">
          <div className="pointer-events-auto max-h-[40vh] overflow-y-auto rounded-md border border-qld-light bg-qld-white/95 px-3 py-2 shadow-card backdrop-blur-sm">
            <RegionFilter
              regions={meta.regions}
              selected={selectedRegions}
              onToggle={toggleRegion}
              onClear={() => setSelectedRegions(new Set())}
            />
          </div>
        </div>
      )}

      <SidePanel
        project={selected}
        siblings={members && members.length > 1 ? members : null}
        activeIndex={activeIndex}
        onSwitch={setActiveIndex}
        onClose={() => setMembers(null)}
      />

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
