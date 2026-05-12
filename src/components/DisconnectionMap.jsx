import { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import { intervalToCoords } from '../data/gsmrSites.js';
import { escapeHtml } from '../lib/markdown.js';
import { buildMapFallbackSVG } from '../lib/mapSvg.js';

// Compute color thresholds based on the number of weeks in the selected date range.
//
// Rule (linear, scales with rate per week):
//   Green:  1     to  2N         — normal, acceptable behavior
//   Yellow: 2N+1  to  3N         — mild degradation
//   Orange: 3N+1  to  4N         — significant issue
//   Red:    4N+1  and above      — critical
//
// Why this scaling? A site with 5 disconnections over 1 week is very different from 5
// over 4 weeks. Multiplying thresholds by N makes the coloring reflect the *rate* of
// disconnections, not the raw count — comparisons stay fair regardless of time window.
//
// Examples:
//   N=1:  green 1–2 · yellow 3 · orange 4 · red 5+      (boundaries: 2, 3, 4)
//   N=2:  green 1–4 · yellow 5–6 · orange 7–8 · red 9+  (boundaries: 4, 6, 8)
//   N=5:  green 1–10 · yellow 11–15 · orange 16–20 · red 21+
//   N=19: green 1–38 · yellow 39–57 · orange 58–76 · red 77+
//
// Weeks rounded to nearest integer, clamped to minimum 1 (so 3-day range uses week-1
// thresholds, 10 days rounds to 1 week, 11 days to 2 weeks, etc).
function computeThresholds(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) {
    return { weeks: 1, green: 2, yellow: 3, orange: 4 };
  }
  const msPerDay = 86400000;
  const days = (new Date(dateTo) - new Date(dateFrom)) / msPerDay + 1; // inclusive of both endpoints
  const weeks = Math.max(1, Math.round(days / 7));
  return {
    weeks,
    green: 2 * weeks,
    yellow: 3 * weeks,
    orange: 4 * weeks,
  };
}

// Bucket a count into a marker size+color class using the given thresholds.
function bucketForCount(count, t) {
  if (count <= t.green) return { sizeClass: 'low', size: 26 };
  if (count <= t.yellow) return { sizeClass: 'med', size: 34 };
  if (count <= t.orange) return { sizeClass: 'high', size: 42 };
  return { sizeClass: 'xhigh', size: 52 };
}

// Format a threshold range as a human-readable label.
// Single-value buckets ("1") collapse to just the number; ranges read as "1–3".
function formatRange(lo, hi) {
  if (lo === hi) return String(lo);
  return `${lo}–${hi}`;
}

// Aggregate disconnections by Intervalle.
// Every record with the same interval (e.g. "GSMR_02/03") becomes one bubble at the
// midpoint between the two sites. Records without an interval — or with one that
// doesn't match our GSMR site table — are counted as "unmapped" and shown in the legend.
function aggregateByInterval(data) {
  const byInterval = {};
  let mappedCount = 0;
  let unmappedCount = 0;

  for (const rec of data) {
    const intervalKey = rec.i ? String(rec.i).trim() : null;
    if (!intervalKey) {
      unmappedCount++;
      continue;
    }
    const coords = intervalToCoords(intervalKey);
    if (!coords) {
      unmappedCount++;
      continue;
    }
    mappedCount++;
    if (!byInterval[intervalKey]) {
      byInterval[intervalKey] = {
        lat: coords.lat,
        lng: coords.lng,
        siteA: coords.siteA,
        siteB: coords.siteB,
        interval: intervalKey,
        count: 0,
        subsystems: {},
      };
    }
    byInterval[intervalKey].count++;
    byInterval[intervalKey].subsystems[rec.s] = (byInterval[intervalKey].subsystems[rec.s] || 0) + 1;
  }

  return { aggregates: Object.values(byInterval), mappedCount, unmappedCount };
}

export default function DisconnectionMap({ data, dateFrom, dateTo }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const boundsRef = useRef(null);
  const firstRenderRef = useRef(true);

  const [exporting, setExporting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const { aggregates, mappedCount, unmappedCount } = useMemo(() => aggregateByInterval(data), [data]);

  // Recompute color thresholds whenever the date range changes.
  // Memoized so we don't trigger marker re-render unnecessarily during unrelated state updates.
  const thresholds = useMemo(() => computeThresholds(dateFrom, dateTo), [dateFrom, dateTo]);

  // Init Leaflet once on mount
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO',
      maxZoom: 18,
      subdomains: 'abcd',
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);

    // Custom Recenter control — sits under Leaflet's zoom +/- in the top-left
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
      const { lat, lng, interval, count, subsystems } = agg;

      // Bucket comes from thresholds computed from the current date-range filter.
      // Same count can be green in a long window and red in a short one — that's the point.
      const { sizeClass, size } = bucketForCount(count, thresholds);

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

      // Popup is simpler now — every bubble is exactly one interval, so the header
      // is always the interval name and we don't need the multi-interval breakdown.
      const popupHtml = `
        <div><span class="popup-count">${count}</span><strong>${escapeHtml(interval)}</strong></div>
        <div style="font-size:11px;color:var(--slate-400);margin-top:2px">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        <hr />
        <div style="font-size:11.5px;color:var(--slate-500);margin-bottom:4px">Sous-systèmes :</div>
        <div class="popup-list">${topSubs}</div>
      `;

      const marker = L.marker([lat, lng], { icon })
        .addTo(layer)
        .bindPopup(popupHtml, { maxWidth: 240, minWidth: 180 });

      // Always-visible label next to the marker showing the interval name
      marker.bindTooltip(interval, {
        permanent: true,
        direction: 'right',
        offset: [size / 2 + 4, 0],
        className: 'map-marker-label',
        opacity: 1,
      });
    });

    if (aggregates.length > 0) {
      boundsRef.current = L.latLngBounds(aggregates.map((a) => [a.lat, a.lng]));
    } else {
      boundsRef.current = L.latLngBounds([[34.28, -6.55], [35.78, -5.75]]);
    }

    if (firstRenderRef.current) {
      map.fitBounds(boundsRef.current, { padding: [30, 30], maxZoom: 11 });
      firstRenderRef.current = false;
    }

    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* noop */ }
    }, 100);
  }, [aggregates, thresholds]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timeoutId = setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* map gone */ }
    }, 60);
    return () => clearTimeout(timeoutId);
  }, [fullscreen]);

  const exportMapAsPng = async () => {
    if (exporting) return;
    setExporting(true);

    const mapEl = mapContainerRef.current;
    if (!mapEl) {
      setExporting(false);
      return;
    }
    const zone = mapEl.closest('.map-zone') || mapEl.parentElement;

    const actionsEl = zone.querySelector('.map-actions');
    const prevActionsDisplay = actionsEl ? actionsEl.style.display : '';
    if (actionsEl) actionsEl.style.display = 'none';

    const prevMapHTML = mapEl.innerHTML;
    const prevBg = mapEl.style.background;
    mapEl.innerHTML = buildMapFallbackSVG(data);
    mapEl.style.background = '#F8FAFC';

    await new Promise((r) => setTimeout(r, 200));

    try {
      const canvas = await html2canvas(zone, {
        scale: 3,
        backgroundColor: '#FFFFFF',
        useCORS: true,
        logging: false,
        imageTimeout: 15000,
      });

      const stamp = new Date().toISOString().slice(0, 10);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ONCF_carte_deconnexions_${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (e) {
      alert("Erreur lors de l'export de la carte : " + (e.message || e));
      console.error('Map export error:', e);
    } finally {
      mapEl.innerHTML = prevMapHTML;
      mapEl.style.background = prevBg;
      if (actionsEl) actionsEl.style.display = prevActionsDisplay;
      window.dispatchEvent(new CustomEvent('oncf:export-done'));
      setExporting(false);
    }
  };

  return (
    <div className={`map-zone ${fullscreen ? 'is-fullscreen' : ''}`}>
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
          sur <strong style={{ color: 'var(--ink-900)' }}>{aggregates.length}</strong> intervalles
          {unmappedCount > 0 && (
            <> <span style={{ color: 'var(--slate-300)' }}>·</span> {unmappedCount} sans intervalle</>
          )}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-low"></span>{formatRange(1, thresholds.green)}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-med"></span>{formatRange(thresholds.green + 1, thresholds.yellow)}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-high"></span>{formatRange(thresholds.yellow + 1, thresholds.orange)}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="map-dot map-dot-xhigh"></span>{thresholds.orange + 1}+
        </span>
        <span style={{ color: 'var(--slate-300)', fontStyle: 'italic' }}>
          · seuils sur {thresholds.weeks} sem.
        </span>

        <div className="map-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className="map-action-btn"
            onClick={exportMapAsPng}
            disabled={exporting}
            title="Exporter la carte en PNG"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? 'Export…' : 'Carte PNG'}
          </button>

          <button
            className="map-action-btn"
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? 'Réduire (Esc)' : 'Plein écran'}
          >
            {fullscreen ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8V5a2 2 0 0 1 2-2h3" />
                <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
                <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              </svg>
            )}
            {fullscreen ? 'Réduire' : 'Plein écran'}
          </button>
        </div>
      </div>

      <div
        ref={mapContainerRef}
        id="disconnectMap"
        style={{
          height: fullscreen ? 'calc(100vh - 80px)' : 460,
          width: '100%',
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--slate-200)',
        }}
      ></div>
    </div>
  );
}