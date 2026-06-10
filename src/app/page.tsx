"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import SearchBox from "@/components/SearchBox";
import RegionSidebar from "@/components/RegionSidebar";
import SidePanel from "@/components/SidePanel";
import InsightsPanel from "@/components/InsightsPanel";
import { formatCompact } from "@/lib/format";
import { allRegionsBounds, regionBounds, type Bounds } from "@/lib/geo";
import { readUrlState, writeUrlState } from "@/lib/urlState";
import type {
  FeatureCollection,
  ProjectCategory,
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

const ALL_CATEGORIES: ProjectCategory[] = ["capital", "other", "school", "police", "hospital"];
const SEARCH_RESULTS_MAX = 8;

function passesRegion(f: ProjectFeature, selected: Set<number>): boolean {
  if (selected.size === 0) return true;
  return f.properties.region_codes.some((c) => selected.has(c));
}

function coordsOf(f: ProjectFeature): [number, number] | null {
  return f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : null;
}

export default function Page() {
  const [features, setFeatures] = useState<ProjectFeature[]>([]);
  const [regions, setRegions] = useState<RegionCollection | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<Set<number>>(new Set());
  const [categories, setCategories] = useState<Set<ProjectCategory>>(
    new Set<ProjectCategory>(ALL_CATEGORIES)
  );
  const [sizeByFunding, setSizeByFunding] = useState(false);
  const [members, setMembers] = useState<ProjectProps[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusBounds, setFocusBounds] = useState<{ bounds: Bounds; nonce: number } | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ coords: [number, number]; nonce: number } | null>(
    null
  );
  const focusNonce = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // URL state is applied once after data loads; only then start writing it back.
  const hydrated = useRef(false);

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

      // Restore a shared view from the URL hash (filters + selected project).
      const url = readUrlState();
      if (url.q) setSearch(url.q);
      if (url.regions.length) setSelectedRegions(new Set(url.regions));
      if (url.categories) setCategories(new Set(url.categories));
      if (url.sizeByFunding) setSizeByFunding(true);
      if (url.projectId != null) {
        const f = fc.features.find((x) => x.properties.project_id === url.projectId);
        if (f) {
          const coords = coordsOf(f);
          const siblings = coords
            ? fc.features.filter((x) => {
                const c = coordsOf(x);
                return c && c[0] === coords[0] && c[1] === coords[1];
              })
            : [f];
          setMembers(siblings.map((s) => s.properties));
          setActiveIndex(siblings.indexOf(f));
          if (coords) setFocusPoint({ coords, nonce: ++focusNonce.current });
        }
      }
      hydrated.current = true;
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

  const categoryFiltered = useMemo(
    () => searched.filter((f) => categories.has(f.properties.category)),
    [searched, categories]
  );

  const shown = useMemo(
    () => categoryFiltered.filter((f) => passesRegion(f, selectedRegions)),
    [categoryFiltered, selectedRegions]
  );

  const totalShown = useMemo(
    () => shown.reduce((s, f) => s + f.properties.total_funding, 0),
    [shown]
  );

  // Dropdown feed: the highest-funded matches within the active filters.
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    return [...shown]
      .sort((a, b) => b.properties.total_funding - a.properties.total_funding)
      .slice(0, SEARCH_RESULTS_MAX);
  }, [shown, search]);

  const selected = members ? members[activeIndex] ?? null : null;

  // Keep the URL in sync so any view is shareable.
  useEffect(() => {
    if (!hydrated.current) return;
    writeUrlState({
      q: search,
      regions: [...selectedRegions],
      categories: categories.size === ALL_CATEGORIES.length ? null : [...categories],
      projectId: selected?.project_id ?? null,
      sizeByFunding,
    });
  }, [search, selectedRegions, categories, selected, sizeByFunding]);

  // Global shortcuts: "/" focuses search, Esc closes the panel / clears search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && !typing) {
        if (members) setMembers(null);
        else if (search) setSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [members, search]);

  // Open a specific project (search result or insights row): select it along
  // with any co-located siblings, and fly the map to it.
  const openProject = (f: ProjectFeature) => {
    const coords = coordsOf(f);
    const siblings = coords
      ? features.filter((x) => {
          const c = coordsOf(x);
          return c && c[0] === coords[0] && c[1] === coords[1];
        })
      : [f];
    setMembers(siblings.map((s) => s.properties));
    setActiveIndex(Math.max(0, siblings.indexOf(f)));
    if (coords) setFocusPoint({ coords, nonce: ++focusNonce.current });
  };

  const focusRegion = (code: number) => {
    setSelectedRegions(new Set([code]));
    if (!regions) return;
    const b = regionBounds(regions, code);
    if (b) setFocusBounds({ bounds: b, nonce: ++focusNonce.current });
  };

  const clearRegions = () => {
    setSelectedRegions(new Set());
    if (!regions) return;
    const b = allRegionsBounds(regions);
    if (b) setFocusBounds({ bounds: b, nonce: ++focusNonce.current });
  };

  const toggleCategory = (cat: ProjectCategory) =>
    setCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <MapView
        features={categoryFiltered}
        regions={regions}
        selectedRegions={selectedRegions}
        selectedId={selected?.project_id ?? null}
        onSelect={(m) => {
          setMembers(m);
          setActiveIndex(0);
        }}
        reducedMotion={reducedMotion}
        focusBounds={focusBounds}
        focusPoint={focusPoint}
        sizeByFunding={sizeByFunding}
      />

      {/* Top-left: title + search */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-3">
        <div className="pointer-events-auto rounded-md border border-qld-light bg-qld-white px-4 py-3 shadow-card">
          <h1 className="text-base font-semibold text-qld-darkest">Queensland Budget Map</h1>
          <p className="mt-0.5 text-xs text-qld-dark">
            {meta ? (
              <>
                <span className="tabnum">{shown.length}</span> locations ·{" "}
                <span className="tabnum">{formatCompact(totalShown)}</span> funding
              </>
            ) : (
              "Loading map data…"
            )}
          </p>
        </div>
        <div className="pointer-events-auto">
          <SearchBox
            value={search}
            onChange={setSearch}
            results={searchResults}
            onPick={openProject}
            inputRef={searchInputRef}
          />
        </div>
        {meta && (
          <div className="pointer-events-auto">
            <RegionSidebar
              regions={meta.regions}
              selected={selectedRegions}
              categoryCounts={meta.categories}
              selectedCategories={categories}
              onToggleCategory={toggleCategory}
              open={sidebarOpen}
              onToggleOpen={() => setSidebarOpen((o) => !o)}
              onFocus={focusRegion}
              onClear={clearRegions}
              sizeByFunding={sizeByFunding}
              onToggleSizeByFunding={() => setSizeByFunding((v) => !v)}
            />
          </div>
        )}
      </div>

      {/* Bottom-left: live insights for the current filter */}
      {meta && (
        <div className="absolute bottom-4 left-4 z-10">
          <InsightsPanel features={shown} regions={meta.regions} onPick={openProject} />
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
