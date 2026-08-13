// Geographic sanity check for the "add restaurant" flow.
// Given a region label and geocoded coords, checks whether the point falls
// inside an approximate bounding box. NON-BLOCKING heuristic — warn only.
// Fail-open: unknown region or missing coords → ok: true.
const GeoValidate = (() => {
  // Bounding boxes (NUTS-II + common district labels), padded ~0.15 deg.
  const REGION_BOUNDS = {
    "norte":    { latMin: 40.85, latMax: 42.20, lngMin: -8.90, lngMax: -6.15 },
    "centro":   { latMin: 39.40, latMax: 41.05, lngMin: -9.05, lngMax: -6.80 },
    "lisboa":   { latMin: 38.45, latMax: 39.45, lngMin: -9.55, lngMax: -8.55 },
    "alentejo": { latMin: 37.30, latMax: 39.50, lngMin: -8.95, lngMax: -6.90 },
    "algarve":  { latMin: 36.95, latMax: 37.55, lngMin: -9.00, lngMax: -7.35 },
    "acores":   { latMin: 36.90, latMax: 39.80, lngMin: -31.40, lngMax: -24.90 },
    "madeira":  { latMin: 32.35, latMax: 33.20, lngMin: -17.35, lngMax: -16.20 },
    "porto":    { latMin: 40.90, latMax: 41.50, lngMin: -8.75, lngMax: -7.90 },
    "braga":    { latMin: 41.30, latMax: 41.90, lngMin: -8.60, lngMax: -7.80 },
    "coimbra":  { latMin: 39.90, latMax: 40.50, lngMin: -8.90, lngMax: -7.80 },
    "faro":     { latMin: 36.95, latMax: 37.55, lngMin: -9.00, lngMax: -7.35 },
    "evora":    { latMin: 38.10, latMax: 38.90, lngMin: -8.30, lngMax: -7.20 },
    "setubal":  { latMin: 38.00, latMax: 38.80, lngMin: -9.30, lngMax: -8.40 },
    "aveiro":   { latMin: 40.40, latMax: 40.90, lngMin: -8.80, lngMax: -8.20 },
    "leiria":   { latMin: 39.40, latMax: 39.90, lngMin: -9.10, lngMax: -8.50 },
    "viseu":    { latMin: 40.50, latMax: 41.10, lngMin: -8.20, lngMax: -7.40 },
    "santarem": { latMin: 38.90, latMax: 39.70, lngMin: -9.00, lngMax: -8.00 }
  };
  const PORTUGAL_BOUNDS = { latMin: 32.30, latMax: 42.20, lngMin: -31.40, lngMax: -6.15 };

  function normalizeKey(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function inBox(box, lat, lng) {
    return lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax;
  }

  // `country` (optional): anything outside Portugal is out of scope for these
  // boxes, so we accept it rather than flagging every foreign place as wrong.
  function isWithinRegion(region, lat, lng, country) {
    if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
      return { ok: true, reason: "no-coords" };
    }
    const ck = normalizeKey(country);
    if (ck && ck !== "portugal") return { ok: true, reason: "foreign", expected: country };
    const key = normalizeKey(region);
    if (!key || key === "portugal") {
      return inBox(PORTUGAL_BOUNDS, lat, lng) ? { ok: true } : { ok: false, reason: "outside-portugal" };
    }
    const box = REGION_BOUNDS[key];
    if (!box) return { ok: true, reason: "unknown-region" };
    return inBox(box, lat, lng) ? { ok: true } : { ok: false, reason: "outside", expected: key };
  }

  return { isWithinRegion };
})();
