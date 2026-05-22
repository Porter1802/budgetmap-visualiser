"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { buildLayers, type ClusterPoint } from "@/lib/layers";
import { formatCompact } from "@/lib/format";
import type { ProjectFeature, ProjectProps, RegionCollection } from "@/lib/types";
import type { Bounds } from "@/lib/geo";

const QLD_CENTER: [number, number] = [146.5, -20.5];
const HOVER_DELAY = 80;

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  funding: number;
  count: number;
}

export default function MapView({
  features,
  regions,
  selectedRegions,
  selectedId,
  onSelect,
  reducedMotion,
  focusBounds,
}: {
  features: ProjectFeature[];
  regions: RegionCollection | null;
  selectedRegions: Set<number>;
  selectedId: number | null;
  onSelect: (members: ProjectProps[], coords: [number, number]) => void;
  reducedMotion: boolean;
  focusBounds: { bounds: Bounds; nonce: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  // Init MapLibre + deck.gl overlay once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "/style/qgds-dark.json",
      center: QLD_CENTER,
      zoom: isMobile ? 3.6 : 4.6,
      minZoom: 3,
      maxZoom: 16,
      pitch: 0,
      attributionControl: { compact: true },
      dragRotate: !isMobile,
      pitchWithRotate: !isMobile,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    if (isMobile) map.touchZoomRotate.disableRotation();

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay);

    map.on("load", () => setReady(true));
    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // Push layers + interaction handlers whenever inputs change.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !ready) return;

    const layers = buildLayers({
      features,
      regions,
      selectedRegions,
      hoveredKey,
      selectedId,
      reducedMotion,
    });

    overlay.setProps({
      layers,
      getCursor: ({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
      onHover: (info: { object?: unknown; x: number; y: number }) => {
        const obj = info.object as ClusterPoint | undefined;
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        if (!obj || !obj.members) {
          setHover(null);
          setHoveredKey(null);
          return;
        }
        setHoveredKey(obj.key);
        hoverTimer.current = setTimeout(() => {
          const funding = obj.members.reduce((s, m) => s + m.properties.total_funding, 0);
          setHover({
            x: info.x,
            y: info.y,
            name: obj.members[0].properties.name || "Untitled project",
            funding,
            count: obj.members.length,
          });
        }, HOVER_DELAY);
      },
      onClick: (info: { object?: unknown }) => {
        const obj = info.object as ClusterPoint | undefined;
        if (!obj || !obj.members) return;
        mapRef.current?.flyTo({
          center: obj.coords,
          zoom: Math.max(mapRef.current.getZoom(), 8),
          duration: reducedMotion ? 0 : 1200,
          essential: true,
        });
        onSelect(
          obj.members.map((m) => m.properties),
          obj.coords
        );
      },
    });
  }, [features, regions, selectedRegions, hoveredKey, selectedId, reducedMotion, ready]);

  // Zoom to a region's bounds when the sidebar requests focus. The nonce lets
  // the same region re-trigger a fly-to on repeated clicks.
  useEffect(() => {
    if (!focusBounds || !mapRef.current || !ready) return;
    mapRef.current.fitBounds(focusBounds.bounds, {
      padding: { top: 80, bottom: 80, left: 320, right: 80 },
      maxZoom: 10,
      duration: reducedMotion ? 0 : 1000,
      essential: true,
    });
  }, [focusBounds, ready, reducedMotion]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {hover && (
        <div
          className="pointer-events-none absolute z-30 max-w-[240px] rounded-md border border-qld-light bg-qld-white px-3 py-2 shadow-card"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="text-sm font-semibold leading-snug text-qld-darkest">
            {hover.count > 1 ? `${hover.count} projects here` : hover.name}
          </p>
          <p className="mt-0.5 font-mono text-xs tabnum text-qld-blue">
            {formatCompact(hover.funding)}
          </p>
        </div>
      )}
    </div>
  );
}
