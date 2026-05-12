// Reference table of 33 GSM-R sites along the LGV Tanger–Kénitra.
// Each disconnection's Km (PK) is mapped to (lat, lng) by finding the nearest site —
// same logic as the Power BI DAX: NearestPK = MINX('Table1', ABS('Table1'[PK] - pk))
export const GSMR_SITES = [
  { name: 'GSMR_01', pk: 2.307, lat: 35.7643581, lng: -5.781276855 },
  { name: 'GSMR_33', pk: 4.125, lat: 34.29656131, lng: -6.519152573 },
  { name: 'GSMR_02', pk: 4.265, lat: 35.74794458, lng: -5.79070619 },
  { name: 'GSMR_03', pk: 9.745, lat: 35.70117271, lng: -5.800188011 },
  { name: 'GSMR_04', pk: 17.458, lat: 35.64227598, lng: -5.841120424 },
  { name: 'GSMR_05', pk: 23.558, lat: 35.61213575, lng: -5.896710561 },
  { name: 'GSMR_06', pk: 29.861, lat: 35.56828855, lng: -5.938885662 },
  { name: 'GSMR_07', pk: 36.338, lat: 35.51743759, lng: -5.974302664 },
  { name: 'GSMR_08', pk: 43.038, lat: 35.45940676, lng: -5.995431028 },
  { name: 'GSMR_09', pk: 49.319, lat: 35.40781843, lng: -6.018965514 },
  { name: 'GSMR_10', pk: 55.175, lat: 35.35543783, lng: -6.013592679 },
  { name: 'GSMR_11', pk: 60.164, lat: 35.31098571, lng: -6.011789737 },
  { name: 'GSMR_12', pk: 66.629, lat: 35.25599978, lng: -6.035292349 },
  { name: 'GSMR_13', pk: 71.3118, lat: 35.21726954, lng: -6.056111536 },
  { name: 'GSMR_14', pk: 72.3118, lat: 35.17226685, lng: -6.070946457 },
  { name: 'GSMR_15', pk: 80.729, lat: 35.13730412, lng: -6.090157851 },
  { name: 'GSMR_16', pk: 85.773, lat: 35.09928242, lng: -6.120536024 },
  { name: 'GSMR_17', pk: 92.591, lat: 35.05342581, lng: -6.169495694 },
  { name: 'GSMR_18', pk: 99.591, lat: 34.99488977, lng: -6.194974043 },
  { name: 'GSMR_19', pk: 105.348, lat: 34.94342464, lng: -6.201711781 },
  { name: 'GSMR_20', pk: 111.453, lat: 34.88909359, lng: -6.209431923 },
  { name: 'GSMR_21', pk: 118.921, lat: 34.82497611, lng: -6.232867406 },
  { name: 'GSMR_22', pk: 124.351, lat: 34.79623271, lng: -6.278901995 },
  { name: 'GSMR_23', pk: 128.971, lat: 34.77115468, lng: -6.31809553 },
  { name: 'GSMR_24', pk: 136.648, lat: 34.71811202, lng: -6.369784544 },
  { name: 'GSMR_25', pk: 143.221, lat: 34.66177917, lng: -6.39133312 },
  { name: 'GSMR_26', pk: 151.021, lat: 34.60148524, lng: -6.434788477 },
  { name: 'GSMR_27', pk: 157.531, lat: 34.54644481, lng: -6.458428137 },
  { name: 'GSMR_28', pk: 163.425, lat: 34.49678048, lng: -6.481059609 },
  { name: 'GSMR_29', pk: 163.425, lat: 34.45110758, lng: -6.498230283 },
  { name: 'GSMR_30', pk: 174.541, lat: 34.4001638, lng: -6.511485789 },
  { name: 'GSMR_31', pk: 182.851, lat: 34.32579967, lng: -6.504379373 },
  { name: 'GSMR_32', pk: 184.951, lat: 34.30708461, lng: -6.501782685 },
];

// Given a Km value, return { lat, lng, site, diff } of the nearest GSM-R site.
export function kmToCoords(km) {
  const kNum = Number(km);
  if (!isFinite(kNum)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const site of GSMR_SITES) {
    const diff = Math.abs(site.pk - kNum);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = site;
    }
  }
  return best ? { lat: best.lat, lng: best.lng, site: best.name, diff: bestDiff } : null;
}


// Parse an interval string like "GSMR_02/03" and return the midpoint coordinates
// between the two referenced sites. Returns null if the string doesn't match the
// expected format or either site isn't in the GSMR_SITES table.
//
// Accepts both zero-padded ("GSMR_02/03") and unpadded ("GSMR_2/3") formats just in case,
// and is forgiving about surrounding whitespace.
export function intervalToCoords(intervalString) {
  if (!intervalString) return null;
  const m = String(intervalString).trim().match(/^GSMR[_\s]*(\d{1,2})\s*\/\s*(\d{1,2})$/i);
  if (!m) return null;

  // Normalize both numbers to the zero-padded "GSMR_NN" form so we can look them up
  const lookup = (n) => 'GSMR_' + String(n).padStart(2, '0');
  const a = GSMR_SITES.find((s) => s.name === lookup(m[1]));
  const b = GSMR_SITES.find((s) => s.name === lookup(m[2]));
  if (!a || !b) return null;

  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
    siteA: a.name,
    siteB: b.name,
  };
}