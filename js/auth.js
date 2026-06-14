// Google Sign-In UI + glue. The actual Firebase Auth SDK is loaded as an ES
// module in index.html, which (once ready) exposes window.FirebaseAuth and
// fires a "firebase-auth-ready" event. This classic script wires that into the
// topbar and tells the App when the signed-in user changes.
//
// Degrades silently when Firebase isn't configured / the SDK fails to load:
// the sign-in button stays hidden and the app runs in anonymous/local mode.

const AuthModule = (() => {
  let fb = null; // window.FirebaseAuth
  let onUser = null; // (user|null, getTokenFn) => void
  let btn, chip, chipImg, chipName, signoutBtn;

  function init(opts) {
    onUser = (opts && opts.onUser) || null;
    btn = document.getElementById("signin-btn");
    chip = document.getElementById("user-chip");
    chipImg = document.getElementById("user-chip-img");
    chipName = document.getElementById("user-chip-name");
    signoutBtn = document.getElementById("signout-btn");

    if (btn) btn.addEventListener("click", signIn);
    if (signoutBtn) signoutBtn.addEventListener("click", signOut);

    if (window.FirebaseAuth && window.FirebaseAuth.configured) {
      wire();
    } else {
      document.addEventListener("firebase-auth-ready", wire, { once: true });
    }
  }

  function wire() {
    fb = window.FirebaseAuth;
    if (!fb || !fb.configured) return;
    fb.onChange((user) => {
      renderUI(user);
      if (onUser) onUser(user, fb.getToken);
    });
  }

  function signIn() {
    if (!fb) return;
    fb.signIn().catch((e) => {
      // Common when the Google provider isn't enabled yet, or popup blocked.
      console.warn("Sign-in failed:", e && e.message);
    });
  }
  function signOut() {
    if (fb) fb.signOut().catch(() => {});
  }

  function renderUI(user) {
    if (!btn || !chip) return;
    if (user) {
      btn.classList.add("hidden");
      chip.classList.remove("hidden");
      if (chipName) chipName.textContent = user.displayName || user.email || "Conta";
      if (chipImg) {
        if (user.photoURL) {
          chipImg.src = user.photoURL;
          chipImg.classList.remove("hidden");
          chipImg.removeAttribute("data-initial");
        } else {
          chipImg.classList.add("hidden");
        }
      }
    } else {
      chip.classList.add("hidden");
      btn.classList.remove("hidden");
    }
  }

  return { init, signIn };
})();
