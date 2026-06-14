// Google Places enrichment: rating, photos, opening hours, price, phone and
// reviews — shown inside the app (detail drawer) and as mini-stats on cards.
// Results are cached in localStorage for a week to limit API calls.

const PlacesModule = (() => {
  let service = null;

  function init() {
    if (!MapModule.isAvailable() || !google.maps.places) return;
    service = new google.maps.places.PlacesService(MapModule.getMap());
  }

  function isAvailable() {
    return !!service;
  }

  function priceLabel(level) {
    return typeof level === "number" ? "€".repeat(Math.max(1, level)) : "";
  }

  // Resolve full details for a restaurant (cached). Resolves to data or null.
  function fetchDetails(restaurant) {
    return new Promise((resolve) => {
      const cached = Storage.getCachedPlace(restaurant.id);
      if (cached) return resolve(cached);
      if (!service) return resolve(null);

      service.findPlaceFromQuery(
        { query: restaurant.mapsQuery, fields: ["place_id"] },
        (results, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !results || !results[0]) {
            return resolve(null);
          }
          service.getDetails(
            {
              placeId: results[0].place_id,
              fields: [
                "rating",
                "user_ratings_total",
                "price_level",
                "types",
                "opening_hours",
                "photos",
                "reviews",
                "formatted_phone_number",
                "website",
                "url"
              ]
            },
            (place, st) => {
              if (st !== google.maps.places.PlacesServiceStatus.OK || !place) return resolve(null);
              const data = {
                rating: place.rating,
                userRatingsTotal: place.user_ratings_total,
                priceLevel: priceLabel(place.price_level),
                priceLevelNum: typeof place.price_level === "number" ? place.price_level : null,
                types: place.types || [],
                openNow: place.opening_hours ? place.opening_hours.isOpen() : undefined,
                weekdayText: place.opening_hours ? place.opening_hours.weekday_text || null : null,
                phone: place.formatted_phone_number || null,
                website: place.website || null,
                googleUrl: place.url || null,
                photos: (place.photos || []).slice(0, 6).map((p) => p.getUrl({ maxWidth: 800 })),
                reviews: (place.reviews || []).slice(0, 4).map((r) => ({
                  author: r.author_name,
                  rating: r.rating,
                  text: r.text,
                  when: r.relative_time_description,
                  photo: r.profile_photo_url || null
                }))
              };
              Storage.setCachedPlace(restaurant.id, data);
              resolve(data);
            }
          );
        }
      );
    });
  }

  // Inline rating + open-now for a sidebar card meta element.
  async function enrichCard(restaurant, metaEl) {
    if (!metaEl) return;
    const data = await fetchDetails(restaurant);
    if (!data) return;
    const parts = [];
    if (typeof data.rating === "number") {
      parts.push(
        `<span class="rating"><svg class="icon"><use href="#i-star"/></svg>${data.rating.toFixed(1)} <span class="count">(${data.userRatingsTotal || 0})</span></span>`
      );
    }
    if (typeof data.openNow === "boolean") {
      parts.push(`<span class="open-now ${data.openNow ? "open" : "closed"}">${data.openNow ? "Aberto" : "Fechado"}</span>`);
    }
    if (data.priceLevel) parts.push(`<span class="muted" style="font-size:0.82rem">${data.priceLevel}</span>`);
    metaEl.innerHTML = parts.join("");
  }

  return { init, isAvailable, fetchDetails, enrichCard };
})();
