"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { buildLayers } from "@/lib/layers";
import { formatCompact } from "@/lib/format";
import type { ProjectFeature, ProjectProps, MapMode } from "@/lib/types";

const QLD_CENTER: [number, number] = [146.5, -20.5];
const HOVER_DELAY = 80;

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  funding: number;
}

export default function MapView({
  features,
  mode,
  visibleAgencies,
  selectedId,
  onSelect,
  reducedMotion,
}: {
  features: ProjectFeature[];
  mode: MapMode;
  visibleAgencies: Set<string> | null;
  selectedId: number | null;
  onSelect: (p: ProjectProps, coords: [number, number]) => void;
  reducedMotion: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  // Init MapLibre + deck.gl overlay once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "/style/qgds-light.json",
      center: QLD_CENTER,
      zoom: isMobile ? 3.6 : 4.6,
      minZoom: 3,
      maxZoom: 16,
      pitch: isMobile ? 0 : 0,
      attributionControl: { compact: true },
      dragRotate: !isMobile, // rotation off on mobile, pitch allowed on desktop
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
      mode,
      hoveredId,
      selectedId,
      visibleAgencies,
      reducedMotion,
    });

    overlay.setProps({
      layers,
      getCursor: ({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
      onHover: (info: { object?: unknown; x: number; y: number }) => {
        const obj = info.object as ProjectFeature | undefined;
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        if (!obj || !obj.properties) {
          setHover(null);
          setHoveredId(null);
          return;
        }
        setHoveredId(obj.properties.project_id);
        hoverTimer.current = setTimeout(() => {
          setHover({
            x: info.x,
            y: info.y,
            name: obj.properties.name || "Untitled project",
            funding: obj.properties.total_funding,
          });
        }, HOVER_DELAY);
      },
      onClick: (info: { object?: unknown }) => {
        const obj = info.object as ProjectFeature | undefined;
        if (!obj || !obj.properties || obj.geometry.type !== "Point") return;
        const coords = obj.geometry.coordinates as [number, number];
        mapRef.current?.flyTo({
          center: coords,
          zoom: Math.max(mapRef.current.getZoom(), 8),
          duration: reducedMotion ? 0 : 1200,
          essential: true,
        });
        onSelect(obj.properties, coords);
      },
    });
  }, [features, mode, hoveredId, selectedId, visibleAgencies, reducedMotion, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {hover && (
        <div
          className="pointer-events-none absolute z-30 max-w-[240px] rounded-md border border-qld-light bg-qld-white px-3 py-2 shadow-card"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="text-sm font-semibold leading-snug text-qld-darkest">{hover.name}</p>
          <p className="mt-0.5 font-mono text-xs tabnum text-qld-blue">
            {formatCompact(hover.funding)}
          </p>
        </div>
      )}
    </div>
  );
}
