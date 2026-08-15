# Foodboxd — Brief de revisão UI/UX (iOS PWA + futura app nativa)

> **Como usar:** cola a secção "PROMPT" numa sessão nova do Claude, com acesso ao
> repositório. O resto do documento é contexto que a sessão deve ler.

---

## PROMPT

És um designer de produto sénior especializado em iOS. Vais fazer uma revisão
completa de UI/UX do **Foodboxd** — um diário pessoal de restaurantes com uma
camada social entre amigos, hoje uma PWA em produção (foodboxd.pt) e em breve
também uma app nativa iOS na App Store.

A app foi construída por iterações rápidas: cada funcionalidade acrescentou
interface por cima da anterior. O resultado funciona, mas o dono descreve-a como
"um pouco não natural, com componentes mal alinhados". A tua missão é elevá-la a um
nível de qualidade de App Store **sem a tornar genérica**: é uma app pessoal, com
carácter editorial (tipografia serifada, paleta quente de tasca portuguesa), não um
clone das Human Interface Guidelines.

**Restrição de arquitetura que condiciona tudo:** a app nativa será a **mesma base
web embrulhada em Capacitor 6** (`capacitor.config.json`, `webDir: "www"`,
`appId: pt.foodboxd.app`) — não há duas bases de código. Portanto **toda a decisão
de design tem de funcionar nos dois contextos**. Onde isso for impossível, diz
explicitamente e propõe a variação mínima condicionada por plataforma.

Antes de propores seja o que for, **lê o código** (`index.html`, `css/style.css`,
`js/app.js`) e percorre os ecrãs mentalmente. Sê concreto e cita ficheiros e
seletores. Não reescrevas a app: propõe um sistema e as mudanças que dele decorrem,
priorizadas por impacto.

Sê criticamente honesto. Se algo estiver mal desenhado, di-lo e explica porquê,
com o princípio que está a ser violado — não suavizes. Se discordares de uma
decisão já tomada (ver "Decisões já tomadas"), argumenta.

---

## O produto

**O que é:** cada pessoa mantém um mapa e uma lista dos seus restaurantes —
*wishlist* (onde quero ir) e *logbook* (onde já fui, com estrelas, nota pessoal e
pratos). Segue amigos e vê a atividade deles. Há uma camada de IA (Claude) que
sugere sítios e descobre novos no Google Maps.

**Quem usa:** hoje 8 pessoas, família e amigos, em Portugal. O objetivo é escalar
para além desse círculo mantendo o tom pessoal — nunca uma rede social fria.

**Tom:** caloroso, editorial, português europeu. Sem emojis como elementos
estruturais. Títulos em serifa (Fraunces), corpo em Hanken Grotesk.

## Estado técnico (importante para as tuas propostas serem exequíveis)

- **Vanilla JS**, sem framework. Um `index.html`, um `css/style.css` (~1900
  linhas), módulos IIFE em `js/` (`app.js` é o grosso, ~3200 linhas).
- **Google Maps JS SDK** (mapa, Places, geocoding), **Firebase** (Auth Google,
  Firestore, Storage), **Cloud Function** que faz de proxy ao Claude.
- **PWA** com service worker; instalável; `viewport-fit=cover` e *safe areas*.
- **Capacitor 6 + iOS** já configurado: `@capacitor/ios`, `status-bar`,
  `splash-screen`, `app`. `backgroundColor: #f6f1e8`, `contentInset: "never"`.

### Sistema visual atual (tokens em `css/style.css`)

```
Cores    bg #f6f1e8 · surface #fffdf9 · text #2b2620 · primary #b5531f
         accent #5d7b4a · star #e0a52e · danger #c14b34
         13 cores de cozinha (--c-portuguesa … --c-cafe), tema claro + escuro
Raios    --r-sm 8 · --r-md 12 · --r-lg 18 · --r-pill 999
Espaço   --sp-1 4 · --sp-2 8 · --sp-3 12 · --sp-4 16 · --sp-5 24 · --sp-6 32
Tipo     --fs-xs 12 · --fs-sm 13 · --fs-base 15 · --fs-md 17 · --fs-lg 20 · --fs-xl 24
Fontes   Fraunces (display) · Hanken Grotesk (corpo) · IBM Plex Mono
Alturas  topbar 60 · tabbar 56
```

### Superfície a rever

**4 ecrãs** (tab bar): **Mapa** (mapa + lista lateral com filtros), **Memórias**
(grelha do logbook), **Críticas** (avaliações e comentários), **Amigos** (feed,
leaderboard, grupos, seguir).

**8 modais:** adicionar restaurante, IA ("Pergunta-me"), escolher foto de capa,
grupos, pessoas, perfil, iniciar sessão, sucesso.

**Componentes-chave:** cartão de restaurante, ficha de detalhe (4 separadores:
Restaurante / As minhas experiências / Críticas / Amigos), chips de filtro (dois
eixos: 13 cozinhas + 5 estilos), pins do mapa (cor por cozinha, cheio = visitado,
emblema = wishlist), lupa de exploração do mapa, cartões do feed, fluxo de
avaliação (estrelas → pratos → nota → data → acompanhantes).

## Decisões já tomadas (discorda se achares errado, mas argumenta)

1. **Dois eixos de categoria** — Cozinha (primária, dá a cor do pin) + Estilo
   (secundário, acumulável).
2. **Modelo social de seguir**, não amizade simétrica. Só vês quem segues.
3. **A lista não é uma checklist** — um sítio visitado não é "concluído" nem fica
   apagado; continua relevante para voltar.
4. **Uma só entrada de IA** ("Pergunta-me" na barra superior) em vez de vários
   botões espalhados.
5. **Ida conjunta** — marcas quem foi contigo; a visita só entra no logbook do
   outro depois de ele confirmar (limitação real das regras do Firestore).

## Problemas conhecidos (não é lista fechada — encontra mais)

- Sensação geral de componentes desalinhados entre funcionalidades de "eras"
  diferentes; ritmo de espaçamento inconsistente.
- Hierarquia pouco clara na ficha de detalhe: muitos botões com o mesmo peso.
- O ecrã do Mapa acumula pesquisa, progresso, chips de cozinha, chips de estilo,
  preço, dois interruptores, planeador de viagem e dois botões de adicionar —
  demasiada densidade antes de se chegar à lista.
- A camada de IA e a lupa foram acrescentadas por último e não conversam
  visualmente com o resto.
- Estados vazios, de carregamento e de erro foram feitos ad-hoc, sem sistema.
- Ainda não há revisão séria de acessibilidade (contraste, alvos de toque,
  leitores de ecrã, Dynamic Type).

---

## DELIVERABLES

Entrega em Markdown, em português europeu, nesta ordem. Sê específico: nomes de
ficheiros, seletores, valores. Nada de conselhos genéricos.

### 1. Auditoria crítica (o mais importante)
Por ecrã e por componente: o que está mal e **porquê** (o princípio violado), com
severidade (bloqueador / importante / polimento). Inclui o que está **bem** e não
se deve mexer — igualmente útil. Máximo 2 páginas de texto denso.

### 2. Sistema de design consolidado
Uma especificação única que sirva PWA e nativo:
- Escala tipográfica com **papéis** (título de ecrã, título de cartão, corpo, meta,
  etiqueta) e a regra do mínimo de 16px em campos de texto (o iOS amplia a página
  abaixo disso — já corrigido, não regredir).
- Cor: papéis semânticos, as 13 cozinhas, contraste verificado (WCAG AA) em claro
  e escuro.
- Espaçamento, raios, elevação, e uma escala de **alturas de controlo** (hoje há
  30/34/38/40/44/46px a competir).
- Inventário de componentes: estados (repouso, toque, foco, carregamento, vazio,
  erro, desativado). O que se funde, o que se elimina.

### 3. Navegação e arquitetura de informação
A tab bar de 4 separadores é a certa? A ficha de detalhe com 4 separadores? Propõe
a estrutura que defendes, com o raciocínio e o custo da migração.

### 4. Fluxos-chave, redesenhados
Passo a passo (podem ser wireframes em ASCII/Markdown ou descrição precisa):
- **Registar uma visita** (o fluxo central da app)
- **Descobrir e adicionar um sítio novo** (IA + lupa do mapa)
- **Primeira utilização** — conta nova que ainda não segue ninguém e tem a lista
  vazia. Hoje é fraco e é o que decide a retenção.
- **Seguir alguém / ver a atividade dos amigos**

### 5. iOS: PWA hoje, nativo depois
- O que muda entre os dois contextos (safe areas, gestos de voltar, *haptics*,
  barra de estado, splash, teclado, *scroll bounce*) e **como resolver com uma só
  base de código** — CSS condicional, plugins Capacitor, deteção de contexto.
- O que **não** deve ser copiado do iOS nativo por prejudicar o carácter da app.
- Checklist de conformidade da App Store com impacto em design (privacidade,
  permissões de localização com justificação, apagar conta, Sign in with Apple se
  houver login social, ícone, *screenshots*).

### 6. Plano faseado
Fases com critério de "feito", ordenadas por **impacto ÷ risco**, sabendo que:
- Fase 1 tem de ser aplicável só em CSS (sem tocar em JS).
- Cada fase tem de poder ir para produção isoladamente.
- Há 8 utilizadores reais com dados em produção — nada pode partir o que existe.

### 7. Riscos e o que ficaste sem saber
O que não conseguiste avaliar sem ver a app a funcionar, e que perguntas farias ao
dono antes de implementar.

---

## Regras de entrega

- **Português europeu**, sem emojis como elementos estruturais.
- Prioriza **o que muda a experiência**, não o que é fácil de escrever.
- Se recomendares eliminar uma funcionalidade, di-lo claramente.
- Não proponhas frameworks, bibliotecas de componentes nem reescritas totais: a
  app é vanilla por opção e vai continuar a ser.
- Onde houver um compromisso entre PWA e nativo, mostra as duas opções e
  **recomenda uma**.
