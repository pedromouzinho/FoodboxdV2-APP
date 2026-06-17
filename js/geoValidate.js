// Sanity-checks that a restaurant's coordinates fall inside its declared region,
// so ambiguous town names (e.g. "Oura" exists in both the Algarve and the north)
// don't drop a pin in the wrong place. Coarse NUTS-II bounding boxes; fail-open
// by design (never blocks saving — only warns).

const GeoValidate = (() => {
  // [latMin, latMax, lngMin, lngMax] for the app's region buckets.
  const REGION_BOUNDS = {
    "norte":    { latMin: 40.85, latMax: 42.20, lngMin: -8.90, lngMax: -6.15 },
    "centro":   { latMin: 39.40, latMax: 41.10, lngMin: -9.05, lngMax: -6.80 },
    "lisboa":   { latMin: 38.40, latMax: 39.45, lngMin: -9.55, lngMax: -8.45 },
    "alentejo": { latMin: 37.25, latMax: 39.40, lngMin: -8.95, lngMax: -6.90 },
    "algarve":  { latMin: 36.95, latMax: 37.55, lngMin: -9.00, lngMax: -7.35 },
    "acores":   { latMin: 36.90, latMax: 39.80, lngMin: -31.40, lngMax: -24.90 },
    "madeira":  { latMin: 32.35, latMax: 33.20, lngMin: -17.35, lngMax: -16.20 }
  };

  function normalizeKey(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  }
  function inBox(box, lat, lng) {
    return lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax;
  }

  // → { ok, reason, expected }. ok=false only when we KNOW the region and the
  // point is clearly outside it. Everything uncertain returns ok=true (fail-open).
  function isWithinRegion(region, lat, lng) {
    if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
      return { ok: true, reason: "no-coords" };
    }
    const box = REGION_BOUNDS[normalizeKey(region)];
    if (!box) return { ok: true, reason: "unknown-region", expected: region };
    if (inBox(box, lat, lng)) return { ok: true, reason: "inside", expected: region };
    return { ok: false, reason: "outside", expected: region };
  }

  return { isWithinRegion };
})();
