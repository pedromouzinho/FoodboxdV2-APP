// Arranca os emuladores do Firebase, encontrando o Java primeiro.
//
// Porque existe: o emulador do Firestore é uma aplicação Java, e o macOS não
// traz Java nenhum. O `brew install openjdk` instala uma fórmula **keg-only** —
// fica em /opt/homebrew/opt/openjdk e **não** é ligada ao PATH, de propósito.
// Resultado: `firebase emulators:start` morre com "Unable to locate a Java
// Runtime" numa máquina onde o Java está instalado.
//
// A tentação é escrever o caminho à mão no `package.json`. Já custou duas vezes
// neste repositório — foi assim que dois arneses ficaram com o Chromium do
// contentor escrito no código e nunca arrancaram no Mac. Um arnês que só
// funciona numa máquina não é um arnês, é um hábito. Por isso isto **procura**,
// por ordem, e quando não encontra diz o que falta em vez de despejar um erro
// de Java a quem não pediu Java nenhum.

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const PROJETO = "app-restaurantes-499400";

// Devolve a pasta `bin` a acrescentar ao PATH, ou "" se o Java já lá está.
function encontrarJava() {
  // 1. Já está no PATH? Então não se mexe em nada.
  try {
    execFileSync("java", ["-version"], { stdio: "ignore" });
    return "";
  } catch (e) { /* segue */ }

  // 2. O mecanismo oficial do macOS. Só responde a JDKs registados em
  //    /Library/Java/JavaVirtualMachines — o `brew install openjdk` não regista
  //    o dele sem um symlink com sudo, mas quem instalou um .pkg da Oracle ou o
  //    Temurin cai aqui.
  try {
    const home = execFileSync("/usr/libexec/java_home", [], { encoding: "utf8" }).trim();
    if (home && existsSync(path.join(home, "bin", "java"))) return path.join(home, "bin");
  } catch (e) { /* segue */ }

  // 3. O Homebrew, keg-only, nas duas arquiteturas. Inclui as versões com
  //    sufixo (openjdk@21) porque é como muita gente as fixa.
  const raizes = ["/opt/homebrew/opt", "/usr/local/opt"];
  for (const raiz of raizes) {
    if (!existsSync(raiz)) continue;
    const candidatos = readdirSync(raiz)
      .filter((n) => n === "openjdk" || n.startsWith("openjdk@"))
      // `openjdk` sem sufixo primeiro; os restantes por ordem decrescente, para
      // a versão mais recente ganhar.
      .sort((a, b) => (a === "openjdk" ? -1 : b === "openjdk" ? 1 : b.localeCompare(a, undefined, { numeric: true })));
    for (const nome of candidatos) {
      const bin = path.join(raiz, nome, "bin");
      if (existsSync(path.join(bin, "java"))) return bin;
    }
  }

  return null;
}

const bin = encontrarJava();

if (bin === null) {
  console.error("Os emuladores precisam de Java (o do Firestore é uma app Java) e não encontrei nenhum.");
  console.error("");
  console.error("  brew install openjdk");
  console.error("");
  console.error("Não é preciso mexer no PATH nem correr sudo: este script encontra a fórmula");
  console.error("keg-only do Homebrew sozinho. Se preferires um JDK do sistema, serve qualquer");
  console.error("um que o /usr/libexec/java_home reconheça.");
  process.exit(2);
}

const env = { ...process.env };
if (bin) {
  env.PATH = `${bin}${path.delimiter}${env.PATH || ""}`;
  console.log(`java: ${path.join(bin, "java")}`);
}

// Tudo o que vier a seguir ao `--` na linha de comandos passa à frente, para
// `npm run emu:start -- --only firestore` continuar a funcionar.
const extra = process.argv.slice(2);
const args = extra.length
  ? extra
  : ["emulators:start", "--only", "auth,firestore,functions,storage", "--project", PROJETO];

const p = spawn("firebase", args, { stdio: "inherit", env });
p.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));
p.on("error", (e) => {
  console.error("Não consegui arrancar o firebase-tools:", e.message);
  console.error("Está instalado? `npm install -g firebase-tools`");
  process.exit(2);
});
