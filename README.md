# Restaurantes Portugal 🍽️

An interactive map of restaurants in Portugal you want to visit — built as a static site for GitHub Pages. Each restaurant links straight to Google Maps for reviews, photos, hours and directions.

First batch: 10 spots in the **Alentejo**, taken from a personal wishlist.

## Features

- 🗺️ Interactive map (Google Maps) with color-coded pins by category
- 📋 Sidebar list grouped by region, with search and filters (region, category, dish tags)
- ✅ "Visited" tracker — check off places you've been, saved in your browser
- 🎲 "Escolher por mim" — randomly picks an unvisited restaurant for your next trip
- 🚗 Trip planner — enter a "from" and "to", and it suggests restaurants near your driving route
- ➕ "Adicionar restaurante" — add new places via a form (saved locally, or copy as JSON to add permanently)
- ⭐ Optional live Google ratings, photos, opening hours via the Places API

## Publishing on GitHub Pages

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch".
4. Choose the branch (e.g. `main`) and folder `/ (root)`, then save.
5. After a minute, your site will be live at `https://<your-username>.github.io/<repo-name>/`.

No build step is needed — it's plain HTML/CSS/JS.

## Optional: enable the Google Maps integration

Without any setup, the app works fully: you get the restaurant list, search, filters, visited tracker, and "Open in Google Maps" links. Adding a Google Maps API key unlocks the **interactive map**, the **trip planner**, and **live ratings/photos/hours**.

### 1. Create a Google Cloud project and API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or reuse one).
2. Enable billing for the project (Google requires this even for free-tier usage — for personal/low-traffic use you'll typically stay within the free monthly allowances).
3. Enable these APIs (APIs & Services → Library):
   - **Maps JavaScript API**
   - **Places API**
   - **Directions API**
   - **Geocoding API**
4. Go to **APIs & Services → Credentials → Create Credentials → API key**.
5. **Restrict the key** (important, since it will be public in this repo):
   - Application restrictions → **HTTP referrers** → add `https://<your-username>.github.io/*`
   - API restrictions → limit to the 4 APIs enabled above.

### 2. Add the key to the app

Open `js/config.js` and paste your key:

```js
const CONFIG = {
  GOOGLE_MAPS_API_KEY: "YOUR_KEY_HERE"
};
```

Commit and push. Because the key is restricted to your GitHub Pages domain, it's safe to have it in the public repo.

## Project structure

```
index.html              – page structure
css/style.css           – styling
js/config.js            – Google Maps API key (optional)
js/app.js                – main app: state, filters, rendering
js/map.js                – Google Maps setup, markers, info windows
js/storage.js            – localStorage helpers (visited, custom restaurants, Places cache)
js/planner.js            – trip planner (route + nearby restaurants)
js/addRestaurant.js      – "Add restaurant" form
js/places.js             – optional Places API enrichment
data/restaurants.json    – the restaurant data
```

## Adding restaurants

### Quick way (your browser only)

Click **"➕ Adicionar restaurante"**, fill in the form, and use **"📍 Encontrar localização"** to auto-fill coordinates (requires the Google Maps API key). Click **"Guardar"** — the restaurant appears on your map/list immediately, stored in your browser's `localStorage`. This is per-browser and won't show up for other people.

### Permanent way (for everyone)

In the same form, click **"Copiar como JSON"** to copy a ready-made entry, then paste it into the array in `data/restaurants.json`, e.g.:

```json
{
  "id": "my-new-spot-town",
  "name": "My New Spot",
  "town": "Town",
  "region": "Alentejo",
  "category": "tradicional",
  "lat": 38.1234,
  "lng": -8.1234,
  "notes": "What to order",
  "tags": ["tradicional"],
  "mapsQuery": "My New Spot, Town, Portugal"
}
```

Fields:
- `category`: one of `tradicional`, `petiscos`, `pastelaria`, `fine-dining` (controls the pin color)
- `region`: groups restaurants in the sidebar (add new regions freely as you expand beyond Alentejo)
- `tags`: free-form, used by the search box
- `mapsQuery`: text used to build the "Open in Google Maps" / "Directions" links

Commit and push — the new restaurant will show up for everyone visiting the site.

## Notes on the trip planner

The "🚗 Planeador de viagem" section geocodes your "from"/"to" with Google, draws the driving route on the map, and lists restaurants within the chosen distance of that route — handy for picking a lunch stop on a road trip.
