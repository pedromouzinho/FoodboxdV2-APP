// Google Places enrichment: rating, photos, opening hours, price, phone and
// reviews — shown inside the app (detail drawer) and as mini-stats on cards.
// Cache em três camadas: localStorage (30 dias) → Firestore partilhado
// (30 dias, pago uma vez por sítio para TODOS os dispositivos) → rede.

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

  // Só o que já está em cache local — SEM rede, nunca. É o que a lista e os
  // thumbnails podem usar: em agosto de 2026 cada cartão chamava a Google
  // (Find Place + Details + fotos) em cada dispositivo de cache fresca, e a
  // fatura passou o crédito em €108 com 8 utilizadores. A rede é para quando
  // se ABRE a ficha; um cartão sem cache fica sem estrelinha até lá.
  // Uma entrada com URLs do GetPhoto está a apodrecer: eles morrem em dias e a
  // janela da cache é de 30. Sem isto as entradas velhas AUTO-PERPETUAM-SE — o
  // fetchDetails encontra-as, dá-as por válidas e nunca vai buscar nada.
  //
  // MAS SÓ AS VELHAS. Um GetPhoto acabado de vir da Google funciona, e é o que
  // mostra a foto no segundo em que se abre a ficha; deitá-lo fora pelo tipo
  // partia o caminho normal — foi o que fiz à primeira, e três casos deste
  // arnês ficaram vermelhos a dizê-lo.
  //
  // O dia é o limite conservador: medi mortos aos 5–8 dias e vivos ao minuto,
  // e não sei onde fica a fronteira. Errar para o lado de refazer custa uma
  // ida à Google; errar para o outro custa um cartão sem foto durante um mês.
  // E é uma migração, não um custo permanente: o que fica guardado no lugar é
  // o `lh3`, que nunca é considerado podre.
  const PODRE_MS = 24 * 60 * 60 * 1000;

  function temEfemero(data) {
    return !!(data && Array.isArray(data.photos) && data.photos.length &&
              data.photos.some((u) => /PhotoService\.GetPhoto/.test(u)));
  }
  function podreLocal(id) {
    if (!Storage.getPlacesCache) return false;
    let e = null;
    try { e = Storage.getPlacesCache()[id] || null; } catch (err) { return false; }
    if (!e || !temEfemero(e.data)) return false;
    return Date.now() - e.fetchedAt > PODRE_MS;
  }

  function fromCache(restaurant) {
    const d = Storage.getCachedPlace(restaurant.id);
    if (!d) return null;
    // O thumbnail não pode pedir um URL que já morreu: paga a chamada e recebe
    // a cruz. O resto da entrada — nota, preço — continua bom e fica.
    return podreLocal(restaurant.id) ? Object.assign({}, d, { photos: [] }) : d;
  }

  // Resolve full details for a restaurant (cached). Resolves to data or null.
  //
  // Três camadas, da mais barata para a mais cara: cache local (30 dias) →
  // cache PARTILHADA no Firestore (o primeiro dispositivo que busca um sítio
  // paga a chamada; todos os outros leem de graça) → a Google. Sem a camada
  // partilhada, o custo crescia com o número de DISPOSITIVOS — cada telemóvel,
  // browser e reinstalação pagava a vassourada inteira outra vez.
  async function fetchDetails(restaurant, opts) {
    const force = opts && opts.force; // bypass + overwrite cache (e.g. expired photo URLs)
    if (!force) {
      const local = Storage.getCachedPlace(restaurant.id);
      if (local && !podreLocal(restaurant.id)) return local;
      try {
        const partilhada = await DB.fetchPlaceCache(restaurant.id);
        // Na partilhada não se sabe a idade daqui, e não é preciso: desde esta
        // versão só lá entram URLs duráveis. Um GetPhoto ali é herança de
        // agosto — conta como ausente, e a próxima abertura substitui-o.
        if (partilhada && !temEfemero(partilhada)) {
          Storage.setCachedPlace(restaurant.id, partilhada);
          return partilhada;
        }
      } catch (e) { /* sem cache partilhada segue-se para a rede */ }
    }
    const data = await daRede(restaurant);
    if (data) {
      // Melhor-esforço: a escrita partilhada exige sessão (regras), e falhar
      // aqui nunca pode estragar a ficha de quem está a olhar para ela.
      //
      // A tradução dos URLs corre EM SEGUNDO PLANO e não atrasa quem está a
      // olhar para a ficha: o `data` que se devolve leva os URLs frescos do
      // GetPhoto, que funcionam agora mesmo. O que fica GUARDADO — nas duas
      // caches — é a versão durável, quando ela chegar.
      duravelEGuardar(restaurant.id, data);
    }
    return data;
  }

  // Os URLs do GetPhoto expiram em dias e a cache guarda-os 30 (medido a
  // 03/09/2026: quatro URLs de 26–29/08, todos 403 com a cruz de 100×100; um
  // pedido fresco no mesmo minuto, 302 → 200). A função `foto` troca-os pelo
  // `lh3` para onde o 302 aponta, que serve a foto sem chave nem referrer.
  //
  // Falhar aqui não estraga nada: fica o que já estava, e a foto de hoje
  // aparece na mesma. Só a de daqui a uma semana é que se perde — que é
  // exatamente o estado de antes desta função existir.
  function endpointFoto() {
    if (!CONFIG.EMULATORS) return (CONFIG.API_BASE || "") + "/api/foto";
    return `http://127.0.0.1:${CONFIG.EMU.functions}/${CONFIG.FIREBASE_PROJECT_ID}/europe-west1/foto`;
  }

  async function duravelEGuardar(id, data) {
    let token = null;
    try {
      const fb = window.FirebaseAuth;
      token = fb && fb.configured ? await fb.getToken() : null;
    } catch (e) { /* sem sessão não há escrita partilhada nem função */ }
    if (!token) return;

    const originais = Array.isArray(data.photos) ? data.photos : [];
    const porTraduzir = originais.filter((u) => /PhotoService\.GetPhoto/.test(u));
    let guardar = data;

    if (porTraduzir.length) {
      try {
        const res = await fetch(endpointFoto(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ urls: originais })
        });
        if (res.ok) {
          const traduzidos = ((await res.json()).result || {}).urls || [];
          // Um por um: onde a tradução falhou fica o original, que pelo menos
          // funciona hoje. Nunca se guarda um buraco.
          const photos = originais.map((u, i) => traduzidos[i] || u);
          if (photos.some((u, i) => u !== originais[i])) {
            guardar = Object.assign({}, data, { photos });
            // A cache local também: senão este dispositivo continua a ver o
            // URL que morre, e era metade do problema.
            try { Storage.setCachedPlace(id, guardar); } catch (e) {}
          }
        }
      } catch (e) { /* fica o original */ }
    }

    // A partilhada é lida por todos os dispositivos: só lá entra o que dura.
    // Se a tradução falhou, não se guarda — degrada para o que havia antes
    // desta função (cada dispositivo busca o seu), em vez de espalhar um URL
    // que morre daqui a três dias por toda a gente.
    if (temEfemero(guardar)) return;
    try { DB.savePlaceCache(id, guardar, token).catch(() => {}); } catch (e) {}
  }

  function daRede(restaurant) {
    return new Promise((resolve) => {
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
                "geometry",
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
                lat: place.geometry && place.geometry.location ? place.geometry.location.lat() : null,
                lng: place.geometry && place.geometry.location ? place.geometry.location.lng() : null,
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

  // Details for a place we DISCOVERED (not yet a restaurant in the app) — used by
  // the preview card inside the AI modal. Cached in memory per placeId; doesn't
  // touch the per-restaurant Storage cache.
  const placeIdCache = new Map();
  function detailsByPlaceId(placeId) {
    if (!placeId) return Promise.resolve(null);
    if (placeIdCache.has(placeId)) return Promise.resolve(placeIdCache.get(placeId));
    return new Promise((resolve) => {
      if (!service) return resolve(null);
      service.getDetails(
        {
          placeId,
          fields: [
            "photos", "rating", "user_ratings_total", "price_level",
            "opening_hours", "formatted_address", "url", "website", "formatted_phone_number"
          ]
        },
        (place, st) => {
          if (st !== google.maps.places.PlacesServiceStatus.OK || !place) return resolve(null);
          const data = {
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
            priceLevel: priceLabel(place.price_level),
            openNow: place.opening_hours ? place.opening_hours.isOpen() : undefined,
            weekdayText: place.opening_hours ? place.opening_hours.weekday_text || null : null,
            address: place.formatted_address || "",
            phone: place.formatted_phone_number || null,
            website: place.website || null,
            googleUrl: place.url || null,
            photos: (place.photos || []).slice(0, 3).map((p) => p.getUrl({ maxWidth: 800 }))
          };
          placeIdCache.set(placeId, data);
          resolve(data);
        }
      );
    });
  }

  // Discover NEW places from Google Maps by free-text query (e.g. the taste-
  // driven searches the AI proposes). Resolves to a compact array of candidates,
  // or [] on any failure. `opts.location` ({lat,lng}) biases results to a zone.
  function textSearch(query, opts) {
    return new Promise((resolve) => {
      if (!service || !query) return resolve([]);
      const limit = (opts && opts.limit) || 6;
      const request = { query };
      if (opts && opts.location && typeof opts.location.lat === "number") {
        request.location = new google.maps.LatLng(opts.location.lat, opts.location.lng);
        request.radius = (opts.radiusKm || 20) * 1000;
      }
      service.textSearch(request, (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) return resolve([]);
        const out = results
          .slice(0, limit)
          .map((p) => ({
            placeId: p.place_id,
            name: p.name,
            address: p.formatted_address || p.vicinity || "",
            lat: p.geometry && p.geometry.location ? p.geometry.location.lat() : null,
            lng: p.geometry && p.geometry.location ? p.geometry.location.lng() : null,
            rating: typeof p.rating === "number" ? p.rating : null,
            userRatingsTotal: p.user_ratings_total || 0,
            priceLevelNum: typeof p.price_level === "number" ? p.price_level : null,
            priceLevel: priceLabel(p.price_level),
            types: p.types || []
          }))
          .filter((p) => p.name && p.lat != null);
        resolve(out);
      });
    });
  }

  // Inline rating + open-now for a sidebar card meta element.
  // SÓ de cache: um cartão de lista nunca paga uma chamada à Google.
  async function enrichCard(restaurant, metaEl) {
    if (!metaEl) return null;
    const data = fromCache(restaurant);
    if (!data) return null;
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
    return data;
  }

  return { init, isAvailable, fromCache, fetchDetails, detailsByPlaceId, textSearch, enrichCard };
})();
