// ============================================================================
//  CONFIGURATION  —  fill these in once (see README.md for step-by-step).
//  The app works with all of these left blank; filling them in unlocks more.
// ============================================================================

const CONFIG = {
  // 1) Google Maps key — enables the interactive map, trip planner and live
  //    ratings/photos/hours. Without it you still get the list + Maps links.
  GOOGLE_MAPS_API_KEY: "AIzaSyBscGcE9vFGaKYmV554-ZtfqtGsOLXU3T8",

  // 2) Firebase / Firestore — lets anyone add a restaurant from the form and
  //    have it appear for EVERYONE instantly (a shared cloud list). Same
  //    Google account you used for the Maps key. Without these, additions are
  //    saved only in the person's own browser.
  //    Both values are safe to publish (the API key just identifies the
  //    project; access is controlled by Firestore security rules — see README).
  FIREBASE_PROJECT_ID: "app-restaurantes-499400",
  FIREBASE_API_KEY: "AIzaSyC0jNIN7D7g5gTpMWZYC8pk36fvJXuUrnc"
};

// Expose on window so ES modules (e.g. the Firebase Auth bootstrap in
// index.html) can read it. A top-level `const` is a lexical global and does
// NOT become a property of window, so module scripts can't see bare CONFIG —
// without this, window.CONFIG is undefined and Firebase never initialises.
window.CONFIG = CONFIG;

// ---------------------------------------------------------------------------
//  Ambiente. Três sítios onde a app pode correr, e só um deles toca em dados
//  reais de escrita:
//
//    produção   foodboxd.pt              — a app a sério
//    canal QA   …--qa-xxxx.web.app       — build novo, MESMA base de dados
//    emulador   localhost                — tudo local, dados de brincar
//
//  A deteção é por hostname e falha sempre para o lado seguro: qualquer domínio
//  que não seja localhost fala com a nuvem real, nunca com um emulador que pode
//  não estar a correr.
// ---------------------------------------------------------------------------
CONFIG.EMULATORS = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
CONFIG.IS_PREVIEW = /--[a-z0-9-]+\.web\.app$/.test(location.hostname);
CONFIG.ENV = CONFIG.EMULATORS ? "emulador" : (CONFIG.IS_PREVIEW ? "QA" : "produção");

// Portas iguais às de firebase.json.
CONFIG.EMU = { firestore: 8080, auth: 9099, functions: 5001, storage: 9199 };
