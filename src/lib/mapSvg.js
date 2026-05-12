import { GSMR_SITES, kmToCoords } from '../data/gsmrSites.js';

// Build a static SVG version of the disconnection map — used during PDF/PNG export because
// html2canvas can't capture Leaflet's cross-origin tile images. The SVG shows the 33 sites
// along the LGV corridor with count-sized bubbles at each aggregated location.
export function buildMapFallbackSVG(data) {
  // Aggregate the same way the live Leaflet map does (snap-to-nearest-site)
  const byCoord = {};
  for (const rec of data) {
    if (rec.k == null) continue;
    const c = kmToCoords(rec.k);
    if (!c) continue;
    const key = c.site;
    if (!byCoord[key]) byCoord[key] = { lat: c.lat, lng: c.lng, site: c.site, count: 0 };
    byCoord[key].count++;
  }
  const aggregates = Object.values(byCoord);

  // SVG canvas size matches the map container at export width (1600 CSS px)
  const W = 1568;
  const H = 460;
  const PAD_X = 30;
  const PAD_Y = 40;

  // Lat/lng bounding box covering the whole LGV (same as Leaflet fitBounds)
  const LAT_MIN = 34.28;
  const LAT_MAX = 35.78;
  const LNG_MIN = -6.55;
  const LNG_MAX = -5.75;

  // Preserve geographic aspect ratio. Mercator ≈ linear at this latitude & small area.
  const latRange = LAT_MAX - LAT_MIN;
  const lngRange = LNG_MAX - LNG_MIN;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const metersPerDegLat = 111000;
  const metersPerDegLng = 111000 * Math.cos(((LAT_MIN + LAT_MAX) / 2) * Math.PI / 180);
  const bboxWidth = lngRange * metersPerDegLng;
  const bboxHeight = latRange * metersPerDegLat;
  const scale = Math.min(innerW / bboxWidth, innerH / bboxHeight);
  const drawW = bboxWidth * scale;
  const drawH = bboxHeight * scale;
  const offsetX = PAD_X + (innerW - drawW) / 2;
  const offsetY = PAD_Y + (innerH - drawH) / 2;

  const project = (lat, lng) => {
    const x = offsetX + (lng - LNG_MIN) * metersPerDegLng * scale;
    const y = offsetY + (LAT_MAX - lat) * metersPerDegLat * scale; // flip Y (lat increases up)
    return { x, y };
  };

  // Rail line path (all sites sorted by PK)
  const sortedSites = [...GSMR_SITES].sort((a, b) => a.pk - b.pk);
  const linePoints = sortedSites.map((s) => project(s.lat, s.lng));
  const linePath = linePoints
    .map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1))
    .join(' ');

  const first = sortedSites[0];
  const last = sortedSites[sortedSites.length - 1];
  const firstP = project(first.lat, first.lng);
  const lastP = project(last.lat, last.lng);

  // Marker bubbles sized & colored by count (largest drawn first so small ones sit on top)
  const markers = aggregates
    .map((agg) => {
      const p = project(agg.lat, agg.lng);
      let colorStart, colorEnd, r;
      if (agg.count <= 2) { colorStart = '#7DD3FC'; colorEnd = '#0EA5E9'; r = 11; }
      else if (agg.count <= 10) { colorStart = '#FCD34D'; colorEnd = '#F39200'; r = 15; }
      else if (agg.count <= 30) { colorStart = '#FB7185'; colorEnd = '#DC2626'; r = 19; }
      else { colorStart = '#C084FC'; colorEnd = '#7C3AED'; r = 24; }
      const gradId = 'g_' + agg.site.replace(/\W/g, '');
      return { x: p.x, y: p.y, r, count: agg.count, site: agg.site, gradId, colorStart, colorEnd };
    })
    .sort((a, b) => b.r - a.r);

  const gradients = markers
    .map(
      (m) => `
    <radialGradient id="${m.gradId}" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="${m.colorStart}"/>
      <stop offset="100%" stop-color="${m.colorEnd}"/>
    </radialGradient>`
    )
    .join('');

  const siteDots = GSMR_SITES.map((s) => {
    const p = project(s.lat, s.lng);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2" fill="#94A3B8" opacity="0.55"/>`;
  }).join('');

  const markerEls = markers
    .map(
      (m) => `
    <g>
      <circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="${m.r + 2}" fill="white" opacity="0.9"/>
      <circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="${m.r}" fill="url(#${m.gradId})" stroke="white" stroke-width="1.5"/>
      <text x="${m.x.toFixed(1)}" y="${(m.y + m.r * 0.33).toFixed(1)}" text-anchor="middle"
            font-family="'Inter Tight', sans-serif" font-size="${Math.max(10, m.r * 0.7)}" font-weight="700" fill="white">${m.count}</text>
    </g>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="background:#F8FAFC">
    <defs>${gradients}</defs>
    <path d="${linePath}" stroke="#64748B" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 4" opacity="0.55"/>
    ${siteDots}
    <text x="${(firstP.x - 5).toFixed(1)}" y="${(firstP.y - 10).toFixed(1)}" font-family="'Inter Tight', sans-serif" font-size="11" font-weight="700" fill="#0B1220" text-anchor="end">TANGER</text>
    <text x="${(lastP.x + 5).toFixed(1)}" y="${(lastP.y + 18).toFixed(1)}" font-family="'Inter Tight', sans-serif" font-size="11" font-weight="700" fill="#0B1220">KÉNITRA</text>
    ${markerEls}
  </svg>`;
}
