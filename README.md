# Restaurantes Portugal 🍽️

An interactive map of restaurants in Portugal you want to visit — built as a static site for GitHub Pages. Each restaurant links straight to Google Maps for reviews, photos, hours and directions.

First batch: 10 spots in the **Alentejo**, taken from a personal wishlist.

## Features

- 🗺️ Interactive map (Google Maps) with color-coded pins by category
- 📋 Sidebar list grouped by region, with search and filters (region, category, dish tags, **price**)
- ✅ "Visited" tracker — check off places you've been, saved in your browser
- 🎲 "Surpreende-me" — randomly picks an unvisited restaurant for your next trip
- 🚗 Trip planner — enter a "from" and "to", and it suggests restaurants near your driving route
- ➕ "Adicionar restaurante" — add new places with a dead-simple form (just name + town + type). The location is found automatically; with Firebase set up, additions are shared with everyone instantly
- ⭐ Optional live Google ratings, photos, opening hours, phone (Call CTA) via the Places API
- 🏷️ In-app category editing (shared via Firebase) plus an automatic **category suggestion** from Google's place types
- 📱 Installable as a PWA (Add to Home Screen) and works offline for the base list

## Category criteria

Categories describe **what the place is**, not just one dish:

| Category | When to use |
| --- | --- |
| **Tradicional** | Full sit-down regional / home cooking (default for a tasca / restaurante típico) |
| **Petiscos / Tasca** | Small plates, snacks, beer, casual (snack-bar, cervejaria) |
| **Doces / Pastelaria** | Main draw is pastry / sweets / coffee |
| **Fine Dining** | Chef-driven, tasting menu, reservation-led, higher price |

The colour of each pin follows the category. You can change a restaurant's category from
inside the detail drawer (shared with everyone when Firebase is configured), and when live
Google data is available the app may suggest a better category to apply with one tap.

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
js/config.js            – Google Maps key + Firebase config (optional)
js/app.js                – main app: state, filters, rendering
js/map.js                – Google Maps setup, markers, info windows
js/db.js                 – shared cloud list (Firebase Firestore REST)
js/geocode.js            – auto-locate a place from its name + town
js/storage.js            – localStorage helpers (visited, custom restaurants, Places cache)
js/planner.js            – trip planner (route + nearby restaurants)
js/addRestaurant.js      – "Add restaurant" form
js/places.js             – optional Places API enrichment
data/restaurants.json    – the curated restaurant data (in git)
```

## Optional: shared "add a restaurant" via Firebase (recommended)

By default, when someone uses the **"➕ Adicionar restaurante"** form, the place is saved **only in their own browser**. To let anyone (e.g. friends) add a restaurant and have it appear for **everyone**, connect a free **Firebase Firestore** database. This uses the **same Google account** as your Maps key.

Once set up, the form needs nothing technical from your friends: they type a name, a town and a type, hit one button, and it's geocoded and saved for everyone automatically — no GitHub, no accounts, no coordinates.

### 1. Create the database

1. Go to the [Firebase console](https://console.firebase.google.com/) and click **Add project**. You can pick the **same Google Cloud project** you used for the Maps key.
2. In the left menu, open **Build → Firestore Database → Create database**.
3. Choose a location (e.g. `eur3` / Europe) and start in **production mode**.

### 2. Allow reading and adding (security rules)

In **Firestore → Rules**, paste the following and **Publish**. This lets anyone read the list and add a restaurant, but not edit or delete existing ones (you stay in control — you can delete anything from the Firebase console). The same rules are saved in `firebase/firestore.rules`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /restaurants/{doc} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;
    }
    match /overrides/{doc} {
      allow read: if true;
      allow create, update: if true;
      allow delete: if false;
    }
  }
}
```

The `overrides` collection stores shared edits (like changing a restaurant's category from inside the app) so corrections show up for everyone.

### 3. Get your config values

1. In the Firebase console, open **Project settings** (gear icon) → **General**.
2. Under "Your apps", click the **Web** icon (`</>`) to register a web app (any nickname; you don't need Hosting).
3. From the shown `firebaseConfig`, copy the **`projectId`** and the **`apiKey`**.
4. Paste them into `js/config.js`:

```js
const CONFIG = {
  GOOGLE_MAPS_API_KEY: "...",
  FIREBASE_PROJECT_ID: "your-project-id",
  FIREBASE_API_KEY: "your-web-api-key"
};
```

These two values are safe to publish — the API key only identifies the project, and the security rules above are what actually control access.

Commit and push. From now on, restaurants added via the form are shared with everyone and tagged **"comunidade"** in the list. Curated places in `data/restaurants.json` always take priority and stay version-controlled.

> Tip: to lock additions down later (e.g. stop spam), tighten the `create` rule or add [Firebase App Check](https://firebase.google.com/docs/app-check).

## Adding restaurants by hand (permanent, in git)

You can also add your own curated entries directly to `data/restaurants.json`. Use **"Opções avançadas → Copiar como JSON"** in the form to get a ready-made entry, then paste it into the array, e.g.:

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
