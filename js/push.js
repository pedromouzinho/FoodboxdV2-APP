// Push nativo (F3, 25/08). Só faz alguma coisa dentro do Capacitor com o
// plugin PushNotifications à mão — na web é um no-op completo, de propósito:
// esta v1 não faz web push, e o sw.js di-lo no cabeçalho.
//
// O MOMENTO da licença é a decisão de desenho mais importante aqui: o iOS só
// deixa perguntar bem UMA vez, e perguntar no arranque — antes de a pessoa
// seguir alguém — é gastar essa vez sem razão à vista. Pede-se DEPOIS do
// primeiro follow (o gancho está no botão Seguir), e, para quem já segue
// gente de sessões antigas, na primeira sessão com o plugin presente — que é
// o mais perto de "a relação já existe" que essas contas têm.
//
// O token que se grava é o FCM (o AppDelegate troca o APNs por ele — ver o
// patch no scripts/ios-info.mjs); é o que o admin.messaging() do servidor
// sabe usar.
const Push = (() => {
  const plugin = () =>
    (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) || null;
  let aRegistar = false;

  async function ativar() {
    const pn = plugin();
    if (!pn || aRegistar) return;
    if (typeof UserData === "undefined" || !UserData.isCloud() || !UserData.isPushEnabled()) return;
    aRegistar = true;
    try {
      let perm = await pn.checkPermissions();
      if (perm.receive === "prompt") perm = await pn.requestPermissions();
      if (perm.receive !== "granted") return; // a pessoa disse não; respeita-se
      pn.addListener("registration", async (t) => {
        try {
          const fb = window.FirebaseAuth;
          const token = fb ? await fb.getToken() : null;
          await DB.savePushToken(UserData.me().uid, t.value, "ios", token);
        } catch (e) { /* fica para a próxima sessão */ }
      });
      pn.addListener("registrationError", (e) => {
        // Sem capability/APNs key isto é o caminho normal — a app segue sem
        // push, e quem investigar encontra a razão aqui.
        console.warn("push: registo recusado", e && e.error);
      });
      await pn.register();
    } catch (e) {
      /* sem push não é sem app */
    } finally {
      aRegistar = false;
    }
  }

  // Chamado no arranque (com sessão) e depois de cada follow: só pede a
  // licença quando há pelo menos uma pessoa seguida.
  function talvezAtivar() {
    try {
      if (typeof UserData !== "undefined" && UserData.isCloud() && UserData.getFollowing().length) ativar();
    } catch (e) { /* nada */ }
  }

  return { ativar, talvezAtivar };
})();
