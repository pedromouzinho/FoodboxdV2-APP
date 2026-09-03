# Foodboxd — brief de marca (ícone, logótipo e todos os formatos)

> **Como usar:** cola a secção "PROMPT" numa sessão nova do Claude, com acesso ao
> repositório. O resto do documento é contexto que a sessão deve ler.

---

## PROMPT

És um designer de marca. Vais **reimaginar a marca do Foodboxd** — diário pessoal
de restaurantes com camada social, hoje uma PWA em produção (foodboxd.pt) e a
caminho da App Store.

Já fizeste a revisão de UI/UX desta app: o sistema visual que está em produção é
teu, e está em [`design/handoff/`](design/handoff/). **A marca ficou de fora** —
é anterior ao redesenho e nunca foi tocada. É isso que se corrige agora.

**Não é um remendo.** Não queremos a marca atual com a cor certa e em 1024px.
Queremos que a repenses, com liberdade, dentro do sistema visual que definiste.
Se concluíres que o desenho atual está certo e só precisa de ser refeito, di-lo e
argumenta — mas a decisão parte de folha limpa.

Antes de desenhares, **lê o material**: a auditoria e os tokens em
`design/handoff/`, e os ficheiros atuais em `icons/`. E olha para a app: o que a
marca tem de fazer é pertencer àquilo.

Sê criticamente honesto. Se alguma restrição abaixo te parecer errada, argumenta
em vez de a contornar em silêncio.

---

## O produto

Cada pessoa mantém um mapa e uma lista dos seus restaurantes — onde quer ir, e
onde já foi, com estrelas, nota pessoal e pratos. Segue amigos e vê a atividade
deles. Há uma camada de IA que sugere sítios.

**Quem usa:** hoje oito pessoas, família e amigos, em Portugal. O objetivo é
crescer para além desse círculo **sem perder o tom pessoal** — nunca uma rede
social fria.

**Tom:** caloroso, editorial, português europeu. Títulos em Fraunces (serifa),
corpo em Manrope. Paleta quente de tasca portuguesa. Sem emojis como elementos
estruturais.

---

## O que existe hoje

### Duas marcas que não combinam

Este é o problema de fundo, e não é de qualidade — é de coerência.

1. **O ícone da app** (`icons/icon-512.png`) é um desenho próprio: garfo à
   esquerda, prato com círculo interior ao centro, faca à direita, em creme sobre
   terracota, num quadrado arredondado.
2. **A marca dentro da app** (`index.html:77`) é `#i-utensils` — **um glifo
   genérico do Lucide**, tirado do mesmo conjunto dos ícones de interface
   (definições, procura, mapa). É um garfo e uma faca de traço, sem relação com
   o ícone.

Nunca houve marca própria dentro da app. Quem vê o ícone no telemóvel e depois
abre a app vê duas coisas diferentes.

### Medições, não impressões

Valores amostrados dos ficheiros, não descritos de olho:

| | |
|---|---|
| Terracota do ícone | `#b5531f` |
| Creme da marca | `#fffaf4` |
| `--primary` do sistema atual | `#b04a1c` |
| `theme_color` do `manifest.webmanifest` | `#b04a1c` |

**O ícone está na cor de marca antiga.** A tua auditoria mudou o primary de
`#b5531f` para `#b04a1c` — dizes isso explicitamente a propósito do emblema de
wishlist — mas os ícones nunca foram refeitos. Estão fora da paleta desde a
Fase 1, e ninguém deu por isso porque ninguém os pôs ao lado da app.

### Outras lacunas encontradas ao levantar o material

- **Não há favicon.** O `index.html` não tem `<link rel="icon">`. O separador do
  browser mostra o ícone genérico.
- **O `apple-touch-icon` aponta para o de 192px**, quando o iOS quer 180×180.
- **`icon-512.png` tem cantos arredondados e alfa** — inútil para a App Store,
  que exige quadrado opaco (a Apple aplica a máscara).
- **Não existe fonte vetorial.** Só PNGs. É por isso que este brief existe: sem
  SVG, cada tamanho novo é uma ida ao designer.

---

## A restrição que mais condiciona o desenho

A mesma marca tem de funcionar a **1024px** na App Store e a **16px** no
separador do browser. Não é uma nota de rodapé — é o que decide se a ideia serve.

Uma marca com três elementos e contornos finos morre aos 16px. Uma marca que
funciona aos 16px pode parecer pobre aos 1024. Resolve isto no desenho, não na
exportação: se for preciso uma versão simplificada para tamanhos pequenos, entrega
as duas e diz a partir de que tamanho se troca.

**Restrições da Apple, não negociáveis:**
- 1024×1024, **quadrado**, **opaco**, sem cantos arredondados, sem transparência
- Nada crítico nos ~10% de bordo (a máscara come os cantos)
- Sem texto pequeno, sem réplicas de elementos de interface do iOS
- Não pode parecer um ícone de sistema nem imitar outra app

---

## DELIVERABLES

### 1. A marca
SVG mestre, e o raciocínio: o que mudaste, porquê, e o que rejeitaste. Se
propuseres uma versão simplificada para tamanhos pequenos, entrega-a e diz o
limiar.

### 2. A marca dentro da app
O `#i-utensils` deixa de ser um ícone do Lucide e passa a ser a marca. SVG com
`viewBox="0 0 24 24"`, para entrar no sprite do `index.html`. Se a marca não
sobreviver a 22px em `--primary` sobre `--surface`, que é onde ela vive na barra
de topo, diz — e propõe o que fazer.

> **Não mexer no resto do sprite.** Os ícones de interface são Lucide, traço 2,
> extremidades redondas. Ficam como estão. Este é o único que sai.

### 3. Todos os formatos

Levantados do repositório, tal como a app os consome hoje:

| Onde | Ficheiro | Requisito |
|---|---|---|
| App Store | `resources/icon.png` | **1024×1024, quadrado, opaco** |
| Capacitor | `resources/splash.png` | 2732×2732, marca centrada em `#f6f1e7` |
| PWA | `icons/icon-192.png` | 192×192 |
| PWA | `icons/icon-512.png` | 512×512 |
| PWA | `icons/icon-maskable-512.png` | 512×512, marca dentro da zona segura |
| iOS web | `icons/apple-touch-icon.png` | 180×180, opaco |
| Browser | `favicon.ico` ou `icons/favicon.svg` | **novo** — hoje não existe |
| iOS web | `icons/splash/*.png` | **8 tamanhos**, listados abaixo |
| Fonte | SVG mestre | o que falta e o que evita voltar aqui |

Os oito splashes da PWA, com os nomes exatos que o `index.html:15-22` espera:

```
750x1334    828x1792    1125x2436   1170x2532
1179x2556   1242x2688   1284x2778   1290x2796
```

São ecrãs de arranque: marca centrada sobre `#f6f1e7`, sem texto.

### 4. Nota de aplicação
Onde a marca pode e não pode ser usada, tamanho mínimo, margem de respiro, e o
que fazer sobre fundo escuro — a app tem tema escuro (`--bg: #181511`) e os
ícones atuais nunca foram pensados para ele.

---

## Regras de entrega

- **Português europeu**, sem emojis como elementos estruturais.
- **SVG como fonte de tudo.** Os PNGs derivam dele; sem ele voltamos aqui.
- Não proponhas alterações ao sistema de design (tipografia, paleta, componentes)
  — isso já foi feito e está em produção. Se a marca nova exigir uma exceção,
  di-lo em vez de a aplicares.
- Se recomendares manter o desenho atual, **argumenta**. É uma conclusão
  legítima, mas tem de ser uma decisão e não uma omissão.

## Contexto no repositório

| Ficheiro | O que é |
|---|---|
| [`design/handoff/`](design/handoff/) | O teu handoff de UI/UX: tokens, 12 ecrãs, auditoria |
| [`DESIGN-HANDOFF.md`](DESIGN-HANDOFF.md) | Índice, estado das fases, desvios deliberados |
| [`icons/`](icons/) | Os ficheiros atuais |
| `css/style.css` | Um só bloco `:root` no topo, com todos os tokens |
| `manifest.webmanifest` | Nome, cores e ícones da PWA |
