import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RouteResponse } from '../types';

type Pos = [number, number];

const isPos = (p: readonly number[]): p is Pos => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** GeoJSON [lng, lat] -> Leaflet [lat, lng]; undefined when malformed. */
function fromGeoJson(c: unknown): Pos | undefined {
  if (!Array.isArray(c) || c.length < 2) return undefined;
  const p = [Number(c[1]), Number(c[0])];
  return isPos(p) ? p : undefined;
}

/** The live API sends a GeoJSON Point ({coordinates:[lng,lat]}); the docs show {coordinates:{latitude,longitude}}. Accept both. */
function lastKnown(v: unknown): Pos | undefined {
  const c = (v as { coordinates?: unknown } | undefined)?.coordinates;
  if (Array.isArray(c)) return fromGeoJson(c);
  if (c && typeof c === 'object') {
    const { latitude, longitude } = c as { latitude?: unknown; longitude?: unknown };
    const p = [Number(latitude), Number(longitude)];
    return isPos(p) ? p : undefined;
  }
  return undefined;
}

function Fit({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => { map.fitBounds(bounds, { padding: [32, 32], maxZoom: 6 }); }, [map, bounds]);
  return null;
}

export default function RouteMap({ route }: { route?: RouteResponse['data'] }) {
  const { lines, stops, last, bounds } = useMemo(() => {
    const segments = route?.route ?? [];

    const lines = segments
      .map((s) => ({
        pts: (s.points?.geometry?.coordinates ?? []).map(fromGeoJson).filter((p): p is Pos => !!p),
        est: s.eventClassifierCode === 'EST',
      }))
      // drop degenerate legs (e.g. the few-metre truck hop inside a terminal)
      .filter((l) => new Set(l.pts.map(String)).size > 1);

    // Named stops only. Endpoints carrying a "status" are the container's own position marker, not a place.
    const seen = new Map<string, { pos: Pos; name: string }>();
    for (const s of segments) {
      for (const p of [s.from, s.to]) {
        const pos = fromGeoJson(p?.geometry?.coordinates);
        if (!pos || p.properties?.status) continue;
        const key = pos.join(',');
        if (!seen.has(key)) seen.set(key, { pos, name: [p.properties?.name, p.properties?.country].filter(Boolean).join(', ') });
      }
    }
    const stops = [...seen.values()];
    const last = lastKnown(route?.lastKnownPosition);

    const all: Pos[] = [...lines.flatMap((l) => l.pts), ...stops.map((s) => s.pos), ...(last ? [last] : [])];
    return { lines, stops, last, bounds: all.length ? L.latLngBounds(all) : undefined };
  }, [route]);

  if (!bounds) return <p className="text-sm text-slate-500">No route geometry available yet.</p>;

  return (
    <div>
      <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-96 w-full rounded-lg border border-slate-200">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit bounds={bounds} />
        {lines.map((l, i) => (
          <Polyline key={i} positions={l.pts}
            pathOptions={{ color: l.est ? '#64748b' : '#0e6f7e', weight: 3, dashArray: l.est ? '6 8' : undefined }} />
        ))}
        {stops.map((s) => (
          <CircleMarker key={s.pos.join(',')} center={s.pos} radius={5}
            pathOptions={{ color: '#12303f', fillColor: '#fff', fillOpacity: 1, weight: 2 }}>
            <Tooltip>{s.name}</Tooltip>
          </CircleMarker>
        ))}
        {last && (
          <CircleMarker center={last} radius={8} pathOptions={{ color: '#fff', fillColor: '#d97706', fillOpacity: 1, weight: 2 }}>
            <Tooltip direction="top">Last known position</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
      <p className="mt-2 text-xs text-slate-500">Solid line: completed leg. Dashed line: estimated route. Orange dot: last known position.</p>
    </div>
  );
}