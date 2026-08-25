// Registo de erros do cliente — a resposta à maior lacuna da SWOT de 25/08:
// quando um deploy parte alguma coisa, ninguém do lado de cá fica a saber até
// um utilizador escrever. (Já aconteceu: o limite diário da IA esteve dias a
// falhar aberto e só um instrumento o teria apanhado. Não havia instrumento.)
//
// O desenho, e porquê:
//
//   - Grava numa coleção write-only (`errosClient`), como as denúncias: o
//     cliente escreve e mais nada; lê-se na consola do Firestore. Um serviço
//     externo seria mais confortável e é mais uma conta, mais um SDK e mais
//     um sítio para falhar — isto são zero dependências e chega para saber
//     QUE partiu e ONDE.
//
//   - Exige sessão. A regra pede `uid == request.auth.uid`, portanto os erros
//     do ecrã de entrada (antes de haver sessão) perdem-se. É deliberado:
//     abrir a coleção ao anonimato seria reabrir o buraco que se fechou nos
//     overrides no mesmo dia. O coletor de arranque do index.html guarda-os
//     na mesma — se a pessoa entrar, são drenados; se não, morrem com a página.
//
//   - Nunca pode piorar as coisas: tudo aqui é melhor-esforço dentro de
//     try/catch, com teto por sessão e dedup por mensagem. Um bug no registo
//     de bugs que deitasse a app abaixo seria o cúmulo.
//
// O test:persistencia exercita isto de ponta a ponta (registar → corpo do
// POST), incluindo o truncar e o dedup.

const Erros = (() => {
  const MAX_POR_SESSAO = 10; // um cliente em loop de erro não inunda a coleção
  const MAX_MSG = 500;       // o mesmo limite da regra do Firestore
  const MAX_STACK = 1500;

  const enviados = new Set(); // chaves (mensagens) já gravadas nesta sessão
  let aEnviar = Promise.resolve(); // fila: um POST de cada vez, pela ordem

  function normalizar(err, origem) {
    let msg = "";
    let stack = "";
    try {
      if (err instanceof Error) {
        msg = err.message || String(err);
        stack = err.stack || "";
      } else if (err && typeof err === "object") {
        msg = err.message || JSON.stringify(err);
      } else {
        msg = String(err);
      }
    } catch (e) { msg = "erro por descrever"; }
    return {
      msg: (origem ? origem + ": " : "") + msg.slice(0, MAX_MSG),
      stack: String(stack).slice(0, MAX_STACK)
    };
  }

  async function despachar(entrada) {
    // Cada condição é um "ainda não" ou um "não é para gravar" — nunca um erro.
    if (typeof DB === "undefined" || !DB.isAvailable() || !DB.addErro) return;
    if (typeof UserData === "undefined" || !UserData.isCloud()) return;
    const fb = window.FirebaseAuth;
    if (!fb || !fb.configured) return;
    const t = await fb.getToken();
    if (!t) return;
    await DB.addErro({
      uid: UserData.me().uid,
      msg: entrada.msg,
      stack: entrada.stack,
      onde: (window.location && window.location.pathname) || "",
      ua: (typeof navigator !== "undefined" && navigator.userAgent || "").slice(0, 200)
    }, t);
  }

  function registar(err, origem) {
    try {
      const entrada = normalizar(err, origem);
      // A mensagem truncada é a chave do dedup: o mesmo erro em loop conta uma vez.
      if (!entrada.msg || enviados.has(entrada.msg) || enviados.size >= MAX_POR_SESSAO) return;
      enviados.add(entrada.msg);
      aEnviar = aEnviar.then(() => despachar(entrada)).catch(() => {});
    } catch (e) { /* o registo de erros não pode ser fonte deles */ }
  }

  // O coletor de arranque (inline no index.html) apanha o que rebenta antes
  // de este ficheiro carregar. A partir daqui, quem apanha somos nós.
  try {
    (window.__errosPendentes || []).forEach((e) => registar(e.err, e.origem));
    window.__errosPendentes = [];
    window.__registarErro = registar;
  } catch (e) { /* sem coletor não há nada para drenar */ }

  return { registar };
})();
