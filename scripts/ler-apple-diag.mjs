// Lê o diagnóstico da entrada com a Apple que a app deixa no localStorage.
//
//   npm run ios:apple-diag
//
// Porque existe: a Apple manda o nome UMA vez por autorização, e se o código o
// perder não há como voltar atrás sem um novo "parar de usar" em
// appleid.apple.com. Era preciso um instrumento que se pudesse ler depois, de
// fora, sem depender de alguém ter uma consola aberta no momento certo.
//
// A primeira versão da instrumentação escrevia para o `console.log` e o handoff
// mandava lê-la com `simctl spawn booted log stream`. **Não funciona:** o
// console da WKWebView não chega ao log do sistema. Procurei-o em 17 mil linhas
// do log do processo `App`, à volta de uma entrada real, e não estava lá.
// Documentar um comando que não sabe responder à pergunta é pior do que não ter
// instrumento nenhum, porque dá a sensação de estar coberto.
//
// Por isso agora é o localStorage, que sobrevive à sessão e se lê do disco.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const BUNDLE = "pt.foodboxd.app";
const CHAVE = "foodboxd.appleDiag";

function container() {
  try {
    return execFileSync("xcrun", ["simctl", "get_app_container", "booted", BUNDLE, "data"], { encoding: "utf8" }).trim();
  } catch (e) {
    console.error("Não encontrei a app instalada num simulador a correr.");
    console.error("Arranca o simulador e instala:  npm run ios:build");
    process.exit(2);
  }
}

// O caminho tem um hash da origem pelo meio que muda a cada instalação limpa,
// por isso procura-se em vez de se escrever à mão.
function bases(raiz) {
  const encontrados = [];
  (function anda(dir, fundo) {
    if (fundo > 8 || !existsSync(dir)) return;
    let entradas;
    try { entradas = readdirSync(dir); } catch (e) { return; }
    for (const nome of entradas) {
      const p = path.join(dir, nome);
      let st;
      try { st = statSync(p); } catch (e) { continue; }
      if (!st.isDirectory()) {
        if (nome === "localstorage.sqlite3") encontrados.push(p);
        continue;
      }
      anda(p, fundo + 1);
    }
  })(path.join(raiz, "Library", "WebKit"), 0);
  return encontrados;
}

const ficheiros = bases(container());
if (!ficheiros.length) {
  console.error("Não há localStorage nenhum — a app já alguma vez arrancou neste simulador?");
  process.exit(2);
}

let achou = false;
for (const f of ficheiros) {
  let hex = "";
  try {
    hex = execFileSync("sqlite3", [f, `select hex(value) from ItemTable where key = '${CHAVE}';`], { encoding: "utf8" }).trim();
  } catch (e) { continue; }
  if (!hex) continue;
  achou = true;
  // O WebKit guarda os valores em UTF-16; lidos como texto vêm com um NUL entre
  // cada caractere e o JSON.parse rebenta na posição 2.
  const buf = Buffer.from(hex, "hex");
  const texto = buf.includes(0) ? buf.toString("utf16le") : buf.toString("utf8");
  const entradas = JSON.parse(texto);
  console.log(`${entradas.length} entrada(s), da mais antiga para a mais recente:\n`);
  for (const e of entradas) {
    const veredicto = e.primeiraAutorizacao
      ? (e.nomeApanhado ? "PRIMEIRA e o nome VEIO" : "PRIMEIRA e o nome PERDEU-SE")
      : (e.nomeApanhado ? "repetida, mas veio nome (inesperado)" : "repetida — sem nome, é o normal");
    console.log(`  ${e.quando}  [${e.caminho}]  ${veredicto}`);
    console.log(`     nome=${JSON.stringify(e.nomeApanhado)} displayNameDoPlugin=${JSON.stringify(e.displayNameDoPlugin)} temUser=${e.temUser}`);
    console.log(`     chavesDoUser=${JSON.stringify(e.chavesDoUser)}`);
    console.log(`     chavesDoPerfil=${JSON.stringify(e.chavesDoPerfil)}\n`);
  }
}

if (!achou) {
  console.log("Ainda não há diagnóstico nenhum.");
  console.log("");
  console.log("Só se escreve quando alguém entra com a Apple, e só com uma build que já");
  console.log("leve a instrumentação. Se entraste antes de a instalar, a entrada não existe.");
}
