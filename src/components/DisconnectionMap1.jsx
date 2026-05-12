import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { kmToCoords } from '../data/gsmrSites.js';
import { escapeHtml } from '../lib/markdown.js';

// Aggregate records by mapped site for visualizing as bubbles
function aggregateByMap(data) {
  const byCoord = {};
  let mappedCount = 0;
  let unmappedCount = 0;
  for (const rec of data) {
    if (rec.k == null) {
      unmappedCount++;
      continue;
    }
    const c = kmToCoords(rec.k);
    if (!c) {
      unmappedCount++;
      continue;
    }
    mappedCount++;
    const key = c.site;
    if (!byCoord[key]) {
      byCoord[key] = {
        lat: c.lat,
        lng: c.lng,
        site: c.site,
        count: 0,
        subsystems: {},
        intervalles: {}, // NEW — track which intervals from the data hit this site
      };
    }
    byCoord[key].count++;
    byCoord[key].subsystems[rec.s] = (byCoord[key].subsystems[rec.s] || 0) + 1;
    // Record the interval from the Excel ('i' field). Multiple records at the same site
    // can have different intervals (e.g. GSMR_12/13 and GSMR_11/12 both nearest to GSMR_12),
    // so we count occurrences and show them sorted by frequency.
    if (rec.i) {
      byCoord[key].intervalles[rec.i] = (byCoord[key].intervalles[rec.i] || 0) + 1;
    }
  }
  return { aggregates: Object.values(byCoord), mappedCount, unmappedCount };
}

export default function DisconnectionMap({ data }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const boundsRef = useRef(null);
  const firstRenderRef = useRef(true);

  const { aggregates, mappedCount, unmappedCount } = useMemo(() => aggregateByMap(data), [data]);

  // Init Leaflet once on mount
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false, // avoid hijacking dashboard scroll
      attributionControl: true,
    });

    // Clean CartoDB Positron tiles — reads better than default OSM for dashboards
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO',
      maxZoom: 18,
      subdomains: 'abcd',
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);

    // Custom Recenter control — resets to fit all currently-visible markers
    const RecenterControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const btn = L.DomUtil.create('a', 'leaflet-recenter-btn');
        btn.href = '#';
        btn.title = 'Recentrer sur toutes les déconnexions';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Recentrer');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"/>
          <polyline points="9 21 3 21 3 15"/>
          <line x1="21" y1="3" x2="14" y2="10"/>
          <line x1="3" y1="21" x2="10" y2="14"/>
        </svg>`;
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.preventDefault(e);
          if (mapRef.current && boundsRef.current) {
            mapRef.current.flyToBounds(boundsRef.current, {
              padding: [30, 30],
              maxZoom: 11,
              duration: 0.6,
            });
          }
        });
        return btn;
      },
    });
    map.addControl(new RecenterControl());

    mapRef.current = map;

    return () => {
      // Clean up on unmount (when navigating away from the dashboard)
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
        boundsRef.current = null;
        firstRenderRef.current = true;
      }
    };
  }, []);

  // Update markers whenever the aggregated data changes
  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    aggregates.forEach((agg) => {
      const { lat, lng, site, count, subsystems, intervalles } = agg;

      let sizeClass, size;
      if (count <= 2) { sizeClass = 'low'; size = 26; }
      else if (count <= 10) { sizeClass = 'med'; size = 34; }
      else if (count <= 30) { sizeClass = 'high'; size = 42; }
      else { sizeClass = 'xhigh'; size = 52; }

      const icon = L.divIcon({
        className: 'disc-marker',
        html: `<div class="disc-marker-inner ${sizeClass}" style="width:${size}px;height:${size}px">${count}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const topSubs = Object.entries(subsystems)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `<div>${escapeHtml(k)} <span style="color:var(--slate-400)">(${v})</span></div>`)
        .join('');

      // Build the intervalles list. Sorted by frequency, capped at 3 to keep the popup readable.
const sortedIntervalles = Object.entries(intervalles || {}).sort((a, b) => b[1] - a[1]);
const topIntervalles = sortedIntervalles
  .slice(0, 3)
  .map(([k, v]) =>
    sortedIntervalles.length > 1 || v > 1
      ? `<div>${escapeHtml(k)} <span style="color:var(--slate-400)">(${v})</span></div>`
      : `<div>${escapeHtml(k)}</div>`
  )
  .join('');

// Header line: prefer the actual interval from the Excel when there's only one;
// otherwise show the snapped site as a fallback. This way "GSMR_12/13" appears as
// the title for a normal popup, instead of just "GSMR_12".
const headerLabel =
  sortedIntervalles.length === 1
    ? sortedIntervalles[0][0]
    : site;

const popupHtml = `
  <div><span class="popup-count">${count}</span><strong>${escapeHtml(headerLabel)}</strong></div>
  <div style="font-size:11px;color:var(--slate-400);margin-top:2px">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
  <hr />
  ${
    sortedIntervalles.length > 0
      ? `<div style="font-size:11.5px;color:var(--slate-500);margin-bottom:4px">Intervalle${sortedIntervalles.length > 1 ? 's' : ''} :</div>
         <div class="popup-list" style="margin-bottom:8px">${topIntervalles}</div>`
      : ''
  }
  <div style="font-size:11.5px;color:var(--slate-500);margin-bottom:4px">Sous-systèmes :</div>
  <div class="popup-list">${topSubs}</div>
`;

      L.marker([lat, lng], { icon })
        .addTo(layer)
        .bindPopup(popupHtml, { maxWidth: 240, minWidth: 180 });
    });

    // Compute & remember bounds for the Recenter button
    if (aggregates.length > 0) {
      boundsRef.current = L.latLngBounds(aggregates.map((a) => [a.lat, a.lng]));
    } else {
      boundsRef.current = L.latLngBounds([[34.28, -6.55], [35.78, -5.75]]);
    }

    // Only auto-fit on the first render — don't yank the user's view when they tweak filters
    if (firstRenderRef.current) {
      map.fitBounds(boundsRef.current, { padding: [30, 30], maxZoom: 11 });
      firstRenderRef.current = false;
    }

    // Leaflet sometimes needs a size recalc when the container was just revealed
    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* noop */ }
    }, 100);
  }, [aggregates]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 10,
          fontSize: 11,
          color: 'var(--slate-400)',
          flexWrap: 'wrap',
        }}
      >
        <span>
          <strong style={{ color: 'var(--ink-900)' }}>{mappedCount}</strong> déconnexions localisées
          sur <strong style={{ color: 'var(--ink-900)' }}>{aggregates.length}</strong> sites
          {unmappedCount > 0 && (
            <> <span style={{ color: 'var(--slate-300)' }}>·</span> {unmappedCount} sans Km</>
          )}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-low"></span>1–2
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-med"></span>3–10
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-high"></span>11–30
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-xhigh"></span>30+
        </span>
      </div>
      <div
        ref={mapContainerRef}
        id="disconnectMap"
        style={{
          height: 460,
          width: '100%',
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--slate-200)',
        }}
      ></div>
    </>
  );
}
