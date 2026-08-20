# Handoff: Foodboxd — revisão UI/UX (PWA iOS + Capacitor)

## Overview

Redesenho completo da interface do **Foodboxd** (foodboxd.pt) — diário pessoal de restaurantes com camada social. O pacote cobre: a recriação fiel do estado atual (baseline), o redesenho dos ecrãs com nova navegação, os estados vazio/carregamento/erro, e uma auditoria escrita com plano faseado.

**Repositório de destino:** `pedromouzinho/FoodboxdV2-APP`, branch `claude/beautiful-davinci-vsyokk`.
**Stack de destino:** vanilla JS sem framework nem build, um `index.html`, um `css/style.css`, módulos IIFE em `js/`. **Não introduzir frameworks nem bibliotecas de componentes** — é uma decisão do dono do produto.

## About the Design Files

Os ficheiros `.dc.html` deste pacote são **referências de design criadas em HTML** — protótipos que mostram o aspeto e o comportamento pretendidos. **Não são código de produção para copiar.**

A tarefa é **reconstruir estes desenhos dentro do ambiente existente do repositório**: markup em `index.html`, estilos em `css/style.css`, lógica nos módulos IIFE de `js/`. Os protótipos usam estilos inline por serem documentos de design; no repositório, tudo deve passar por classes e tokens em `css/style.css`, seguindo as convenções que já lá estão.

## Fidelity

**Alta fidelidade.** Cores, tipografia, espaçamentos, raios e alturas são valores finais e devem ser reproduzidos exatamente. As fotografias e o mapa da Google aparecem como placeholders listrados com etiqueta monospace — no produto vêm da Places API e do Maps SDK.

## Ficheiros deste pacote

| Ficheiro | O que contém |
| --- | --- |
| `Foodboxd - Recriação.dc.html` | Canvas com 4 turnos: **turno 4** (vistas secundárias), **turno 3** (estados), **turno 2** (redesenho), **turno 1** (recriação fiel do estado atual). Abre no browser; usa pan/zoom. |
| `Foodboxd - Auditoria UI-UX.dc.html` | Documento imprimível em PT-PT: auditoria crítica, sistema de design, navegação, fluxos, iOS/App Store, plano faseado, riscos. **Ler primeiro.** |
| `doc-page.js`, `support.js` | Runtime dos ficheiros acima. Não são para o repositório de destino. |

Cada desenho tem um id visível (`1a`, `2b`, `3c`, `4d`…) usado como referência ao longo deste documento.

---

## Design Tokens

Substituem os quatro blocos `:root` que hoje existem em `css/style.css`. **Consolidar num só bloco, no topo do ficheiro.**

### Cor (tema claro)

| Token | Valor | Papel |
| --- | --- | --- |
| `--bg` | `#f6f1e7` | fundo da app |
| `--surface` | `#fffefb` | cartões, barras, sheets |
| `--surface-2` | `#f0e8d8` | chip inativo, campo, thumbnail |
| `--surface-3` | `#e7ddc8` | avatar vazio, faixa de progresso |
| `--text` | `#29231b` | texto principal; **também o fundo do chip ativo** |
| `--text-muted` | `#6b6152` | meta, descrições |
| `--text-faint` | `#a89c88` | datas, contagens — **ver nota de contraste** |
| `--hairline` | `#ece3d2` | separadores de 1px |
| `--border` | `#e3d8c3` | contornos onde ainda necessários |
| `--primary` | `#b04a1c` | **só** CTA, separador ativo, emblema de wishlist |
| `--primary-ink` | `#fffdf7` | texto sobre primary |
| `--accent` | `#5d7a47` | visitado, confirmações |
| `--accent-soft` | `#e6ecd9` | fundo do cartão de convite |
| `--accent-ink` | `#4e6a3a` | texto sobre accent-soft |
| `--star` | `#d39a23` | estrelas, e nada mais |
| `--danger` | `#c0492f` | terminar sessão, apagar |

**Nota de contraste (bloqueador):** `--text-faint #a89c88` sobre `--surface` dá ~2,5:1 e falha WCAG AA. Escurecer para cerca de `#8a7f6c` (~4,6:1) ou parar de o usar em informação (datas são informação).

### Cozinhas

Manter os 13 trios `--c-<cozinha>` / `-ink` / `-soft` já existentes em `css/style.css`. Nos desenhos, a etiqueta de cozinha usa sempre a variante `-ink`:
`portuguesa #93561f` · `mariscos #336674` · `mediterranica #3f7458` · `doces #a4456c` · `churrasco #8b3423` · `italiana #4e6a3a` · `japonesa #763c59` · `asiatica #a3661a` · `indiana #834612` · `americana #584636` · `mexicana #a83d27` · `vegetariana #587730` · `cafe #725a3e`.

### Tipografia

Corpo: **Manrope** (substitui Hanken Grotesk — mais denso aos tamanhos pequenos onde a app vive).
Títulos: **Fraunces** (mantém-se, mas restrito a títulos de ecrã e nomes de restaurante).
Numérico: **IBM Plex Mono** (datas, contagens).

```
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Papel | Fonte | Tamanho | Peso | Line-height | Letter-spacing |
| --- | --- | --- | --- | --- | --- |
| Título de ecrã | Fraunces | 34px | 600 | 1.08 | −0.025em |
| Título de sheet | Fraunces | 26px | 600 | 1.1 | −0.02em |
| Título de secção | Fraunces | 20px | 600 | 1.2 | −0.02em |
| Título de cartão | Fraunces | 18px | 600 | 1.15 | −0.02em |
| Título de cartão (grelha) | Fraunces | 17px | 600 | 1.15 | −0.02em |
| Corpo | Manrope | 15px | 400 | 1.5 | 0 |
| Item de lista | Manrope | 16px | 600 | 1.4 | 0 |
| **Campo de texto** | Manrope | **16px mínimo** | 400 | — | 0 |
| Botão / chip | Manrope | 14px | 700 | 1 | 0 |
| Meta | Manrope | 13px | 400 | 1.45 | 0 |
| Etiqueta | Manrope | 12px | 700 | 1 | 0.06em, caixa alta |
| Separador (tab bar) | Manrope | 11px | 700 | 1 | 0 |
| Numérico | IBM Plex Mono | 12–13px | 400–500 | 1 | 0 |

⚠️ **Nunca descer abaixo de 16px em `input`, `textarea` ou `select`.** O iOS amplia a página e não volta atrás. A regra `input, textarea, select { font-size: max(16px, var(--fs-base)) }` já existe em `css/style.css` — **não a remover**.

### Espaço, raio, elevação, alturas

- **Espaço:** 4 / 8 / 12 / 16 / 20 / 24 / 32. Dentro de um cartão só 8 e 12; entre cartões 8 ou 10; margem lateral de ecrã 20 (era 16).
- **Raio:** **três valores apenas** — `16px` (cartão, botão, campo, thumbnail), `32px` (sheet, modal), `999px` (chip, avatar, ação circular). Eliminar 8, 12, 18 e 24.
- **Elevação:** cartões **planos**, sem sombra. `--surface` sobre `--bg` já os separa. Sombra só em elementos que flutuam: sheet, modal, cartão sobre o mapa.
- **Alturas de controlo:** **três apenas** — `36px` (chip; área de toque estendida a 44 por padding), `44px` (botão, campo, item de lista), `52px` (ação primária de sheet). Substitui as sete atuais (34/36/38/40/44/46/48).
- **Molduras:** tab bar `56px + env(safe-area-inset-bottom)`; barra superior `60px + env(safe-area-inset-top)`.

---

## Navegação (mudança estrutural)

A tab bar passa de **Mapa · Memórias · Críticas · Amigos** para:

### **Mapa · Diário · Amigos · Perfil**

1. **Críticas funde-se em Diário.** `gatherMemories()` e `gatherMyRatingCritiques()` leem a mesma estrutura (`UserData.getRating`) — são a mesma entidade vista de dois ângulos. O Diário tem três vistas em chips: **Restaurantes · Críticas · Pratos**.
2. **Mapa e Lista passam a dois modos do mesmo separador**, com controlo segmentado no topo. O `#sidebar` deixa de ser gaveta.
3. **Perfil sai da barra superior e passa a 4.º separador.** O conteúdo vem do modal `#profile-modal`, mais a definição de privacidade que hoje está enterrada no ecrã Amigos.
4. **Ficha de detalhe: 4 separadores → 2.** "O sítio" e "A minha experiência". A informação de amigos passa a ser uma linha dentro de "O sítio" (avatares + média do grupo), não um separador.

**Custo:** o router em `app.js` já é uma máquina de estados por `data-screen`; fundir Críticas em Diário é acrescentar uma vista ao `state.criticasView` existente. Nenhuma destas mudanças toca em dados.

---

## Screens / Views

### 1. Mapa — modo mapa (`2a`)

**Objetivo:** ver os sítios no território e abrir um.

**Layout (de cima para baixo):**
- Barra superior 60px, `--surface`, `border-bottom: 1px solid --hairline`, padding lateral 16. Marca à esquerda (ícone `i-utensils` 22px em `--primary` + "Foodboxd" em Fraunces 21/600/−0.02em). À direita, botão "Pergunta-me": altura 36, padding 0 14, `border-radius: 999px`, fundo `--surface-2`, **sem borda e sem gradiente**, ícone `i-sparkles` 16px em `currentColor`, texto 14/700.
- **Barra de procura e modos**, 12px de padding, `--surface`, `border-bottom: 1px solid --hairline`:
  - Campo de procura: altura **48**, `border-radius: 999px`, fundo `--surface-2`, **sem borda**, padding esquerdo 44 para o ícone `i-search` 18px posicionado a 15px, placeholder "Nome, localidade ou prato", `font-size: 16px`.
  - Linha com: controlo segmentado **Mapa | Lista** (track `--surface-2`, padding 3, radius 999; segmento ativo `--surface`, altura 32, padding 0 14, radius 999, 14/700) e, encostado à direita, botão **Filtros** (altura 38, padding 0 14, fundo `--text` `#29231b`, texto `#f6f1e7` 14/700, ícone `i-sliders` 15px) com contador: pílula `min-width 18px`, altura 18, fundo `--primary`, texto `--primary-ink` 11/800.
- **Mapa** ocupa o resto. Controlos flutuantes à direita: lupa e recentrar, 40×40, `border-radius: 999px`, fundo `--surface`, **sem borda nem sombra**, topo 12 e 60.
- **Cartão do sítio selecionado**, ancorado em baixo com 12px de margem: `--surface`, radius 16, padding 10, altura de thumbnail 56 (radius 16), etiqueta de cozinha, nome em Fraunces 18, meta 13, e botão "Abrir" (altura 40, padding 0 16, `--primary`, radius 999).

**Pins:** manter `getMarkerIcon()` de `js/map.js` exatamente como está — é a melhor peça de design da app. Única alteração: a cor do emblema de wishlist passa de `#b5531f` para `#b04a1c`, para alinhar com `--primary`.

### 2. Mapa — modo lista (`2b`)

Mesma cabeça. O corpo passa a lista, padding lateral 16:
- Cabeçalho de região: nome em Fraunces 20/600 à esquerda, contagem em IBM Plex Mono 12 `--text-faint` à direita.
- **Cartão de restaurante:** `display: grid; grid-template-columns: 76px 1fr; gap: 12px; padding: 10px; border-radius: 16px; background: --surface`. Sem sombra, sem borda, **sem a barra vertical de cor** que hoje existe (`.card.rcard::before`) — a cor vive na etiqueta de cozinha.
  - Thumbnail 76×76, radius 16.
  - Corpo (`padding-right: 40px` para não passar por baixo do botão): etiqueta de cozinha 12/700/0.06em/caixa alta na cor `-ink`; nome Fraunces 18/600 com `text-overflow: ellipsis`; linha de localidade + especialidade 13 `--text-muted`, uma linha, com ellipsis; linha de meta 13 com estrela 13px `--star`, valor a 700 `--text`, preço, e o estado pessoal ("foste em ago", "1 amigo foi").
  - Botão de marcar visitado: `position: absolute; top: 10px; right: 10px`, 36×36, radius 999. Ligado: fundo `--accent`, ícone `--primary-ink`. Desligado: fundo `--surface-2`, ícone `--text-muted`. Ícone `i-check` 17px, `stroke-width: 2.5`.

**Nota:** as três linhas de texto do corpo são de altura fixa. `PlacesModule.enrichCard` deve escrever numa linha **já reservada**, para acabar com o salto de layout (ver `3c`).

### 3. Filtros — bottom sheet (`2c`)

Substitui tudo o que hoje está no `#sidebar` acima da lista. Scrim `rgba(30,22,12,.5)`; folha `border-radius: 32px 32px 0 0`, `--surface`, altura ~660px.

- Pega: 44×5, radius 999, `--border`, centrada, 10px do topo.
- Cabeçalho: "Filtros" em Fraunces 26/600 à esquerda; "Limpar tudo" como botão de texto 14/700 `--text-muted` à direita.
- Secções com etiqueta 12/700/0.08em/caixa alta `--text-faint` e 10px de gap:
  - **Cozinha** — chips altura 36, padding 0 14, radius 999, com ponto de 8px da cor da cozinha. **Inativo:** fundo `--surface-2`, texto `--text`. **Ativo:** fundo `--text` `#29231b`, texto `#f6f1e7`. Depois de seis chips, um chip tracejado "+ 7 cozinhas" (`border: 1px dashed --border-strong`, fundo transparente).
  - **Estilo** — mesmos chips, sem ponto.
  - **Preço** — quatro botões `flex: 1`, altura 44, radius **16** (não pílula), mesma lógica de inversão.
  - **Interruptores** — linhas de 52px separadas por `1px solid --hairline`: rótulo 16/600 à esquerda, interruptor 50×30 à direita (radius 999, padding 3, botão 24×24 `--surface`; desligado `--surface-3`, ligado `--primary`). "Esconder visitados", "Só a minha wishlist".
  - **Planear uma viagem** — linha de 52px com ícone e chevron, abre o painel existente. **O planeador não se elimina** (é usado) — muda de sítio.
- Rodapé fixo: `border-top: 1px solid --hairline`, padding `14px 20px 30px`, botão de largura total altura **52**, radius 16, `--primary`, texto 16/700 — com contagem em direto: "Ver 18 restaurantes".

⚠️ **Estado inicial dos filtros:** hoje `buildCategoryFilters()` liga os 13 chips de cozinha (`aria-pressed="true"`). Inverter: começar todos **desligados** = sem filtro. O contador no botão "Filtros" comunica o estado.

⚠️ **Remover `.chip[aria-pressed="false"] { opacity: 0.55 }`** — falha WCAG AA (~2,6:1) e confunde "desligado" com "desativado". O estado passa a ser codificado por inversão de fundo.

### 4. Diário — Restaurantes (`2d`)

- Cabeça 20px de padding lateral: "Diário" em Fraunces 34; sub-linha 14 `--text-muted` ("10 restaurantes · 7 críticas · 23 pratos"); botão "Gosto" à direita (altura 36, `--surface-2`, radius 999).
- Chips de vista: **Restaurantes · Críticas · Pratos**, altura 36, padding 0 16, ativo invertido para `--text`.
- Grelha de 2 colunas, `gap: 8px`, **`grid-auto-rows: 230px`** e `align-items: stretch` — **todos os cartões têm a mesma altura**. Cartão: `--surface`, radius 16, sem sombra; foto de **150px** de altura no topo; corpo com padding `10px 12px 12px`, etiqueta de cozinha 11/700, nome Fraunces 17, meta 13 com a data em IBM Plex Mono.
- Sobre a foto, canto inferior esquerdo: pílula de nota — altura 24, padding 0 9, fundo `--surface`, estrela 12px + número 12/700.

### 5. Diário — Críticas (`4a`)

Lista vertical, `gap: 10px`. Cartão `--surface`, radius 16, padding 14:
- Linha de topo: thumbnail 44×44 radius 12; nome Fraunces 18 + "localidade · cozinha" 13 `--text-muted`; data em IBM Plex Mono 12 `--text-faint` à direita, `flex: none`.
- Estrelas 16px, `gap: 2px` (vazias em `--surface-3`).
- Texto da crítica 15/1.5 em `--text` (hoje é `--text-muted` — a crítica é o conteúdo, não meta).
- Chips de prato: altura 28, padding 0 11, radius 999, `--surface-2`, 13/600.

### 6. Diário — Pratos (`4b`)

Vista nova. O ativo mais invisível da app: 23 pratos registados que hoje não têm onde ser vistos.

Agrupada por cozinha com etiqueta 12/700/0.08em/caixa alta e contagem ("Portuguesa · 9"). Cada prato é uma linha de **52px** separada por `1px solid --hairline`: nome 16/600 a ocupar o espaço, restaurante 13 `--text-muted`, e a nota que deste (estrela 13px + número 13/700).

### 7. Perfil de gosto — sheet (`4c`)

Substitui o botão dentro do modal de perfil. Folha de ~700px, radius 32.
- "O meu gosto" em Fraunces 26.
- Parágrafo de resumo a **17px/1.55** — é o conteúdo principal, não uma legenda.
- "O que procuras": chips 36px `--surface-2`.
- Três tiles `flex: 1`, `--surface-2`, radius 16, padding 14: valor em Fraunces 24/600 e etiqueta 12/700/caixa alta.
- "Podias gostar": linhas com thumbnail 48, nome Fraunces 17, distância real, e botão "Guardar" (fundo `--text`, radius 999, altura 36). **Mostrar sempre a distância real** — nunca apresentar longe como perto.
- Rodapé: "Descobrir mais sítios assim" + linha de proveniência 12 `--text-faint` ("Escrito a partir das tuas 7 críticas e 23 pratos").

### 8. Amigos — Atividade (`2e`) e filtros (`4d`, `4e`, `4f`)

- Cabeça: "Amigos" Fraunces 34 + "Segues 6 · grupo Todos" 14; botão "Seguir" à direita.
- Chips de filtro em linha com scroll horizontal: **Tudo · Avaliações · Visitas · Fotos**. (O filtro "Quer ir" desaparece — cabe em Tudo.)
- **A barra de grupo sai do topo do feed** para o Perfil. Era configuração à frente de conteúdo.
- **Convites de ida conjunta sobem para o topo do feed** (`4e`): cartão `--accent-soft`, radius 16, borda nenhuma, avatar 36, texto 15/1.35, e dois botões — "Confirmar" (`--accent-ink`, texto `--primary-ink`) e "Não fui" (texto simples `--accent-ink`).
- **Cartão de atividade:** `--surface`, radius 16, padding 12. Linha de autor (avatar 32, "**Nome** verbo", data mono 12 à direita), depois o bloco do restaurante (`--surface-2`, radius 12, padding 8, thumbnail 48 radius 12, chevron à direita), depois estrelas e citação em itálico 15 `--text-muted`.
- **Fotos (`4f`):** a foto deixa de viver dentro de um cartão branco. Cabeçalho de autor solto, depois grelha de fotos edge-to-edge com `gap: 8px`, radius 16. Uma foto: 4:5. Duas: 2 colunas 4:5. Três ou mais: `2fr 1fr` com a terceira célula a mostrar "+N". A foto é o conteúdo — o chrome sai da frente.

### 9. Seguir pessoas — sheet (`4g`)

- Campo de procura 48px pílula.
- **"Talvez conheças"**: linhas de 64px separadas por hairline. Avatar 44, nome 16/700, razão 13 `--text-muted` ("2 amigos em comum", "Também anda pelo Alentejo"). Botão à direita: "Seguir" (fundo `--text`, texto `#f6f1e7`) ou "A seguir" (fundo `--surface-2`, texto `--text-muted`).
- **"Já segues · 6"**: mesma linha.
- Rodapé: "Convidar por código" + "Só vês a atividade de quem segues" 12 `--text-faint`.

### 10. Perfil (`2f`)

Novo separador. Conteúdo do `#profile-modal` mais o que estava disperso.
- Avatar 76 + nome Fraunces 28 + "Desde março de 2025" 14.
- Três tiles de números (`Restaurantes`, `Pratos`, `Amigos`): valor em Fraunces 26/600, etiqueta 12/700/caixa alta `--text-faint`.
- Cartão do perfil de gosto: resumo 15/1.5 + chips.
- Lista de definições, linhas de 56px separadas por hairline, com ícone 19px, rótulo 16/600, valor 14 `--text-faint` e chevron: **Grupos**, **Quem vê a minha atividade**, **Rever tutorial**, **Terminar sessão** (`--danger`).
- ⚠️ **Falta implementar: "Apagar conta"** — obrigatório para a App Store (guideline 5.1.1v). Ver secção iOS.

### 11. Registar uma visita — sheet (`2g`)

**O fluxo central da app.** Hoje está escondido no separador "As minhas experiências" da ficha; passa a ter botão próprio e evidente na ficha de detalhe.

Folha de ~790px. Cabeçalho com thumbnail 52, etiqueta de cozinha, nome Fraunces 22, e botão de fechar 36×36 circular. Corpo com cinco passos numerados, cada um com etiqueta 12/700/0.08em/caixa alta:

1. **A tua nota** — cinco estrelas de **40px**, `gap: 6px`. Vazias em `--surface-3`.
2. **Pratos** — chips removíveis (fundo `--text`, texto `#f6f1e7`, altura 36, `padding: 0 10px 0 14px`, com ✕ de 14px), mais um chip tracejado "+ prato".
3. **Nota pessoal** — caixa `--surface-2`, radius 16, padding 14, `min-height: 76px`, texto 16/1.45.
4. **Quando** — **linha própria**, altura 52, `--surface-2`, radius 16: ícone de relógio, "Hoje", data em IBM Plex Mono 15 encostada à direita (`margin-left: auto`), chevron. Abre seletor de data.
5. **Com quem** — chips de acompanhante com avatar 30 embutido (`padding: 0 14px 0 6px`, altura 44). Selecionado: `--primary`. Abaixo, nota explicativa 13 `--text-muted`: "A Leonor recebe um pedido para confirmar — só depois entra no diário dela."

Rodapé fixo: "Registar visita" (altura 52, radius 16, `--primary`) + "Podes acrescentar fotos depois" 13 `--text-faint`.

**Regras de comportamento:**
- Só as estrelas são obrigatórias. O botão fica desativado sem elas — mas a mensagem explicativa aparece **junto ao passo 1**, não por baixo do botão.
- As fotos saem deste fluxo. Registar é rápido; fotografar é depois.
- Com `contentInset: "never"` no Capacitor, o teclado tapa os campos. Mover o CTA para cima do teclado com `visualViewport.resize` — funciona em PWA e nativo, dispensa plugin.

### 12. Estados (`3a`, `3b`, `3c`, `3d`)

Hoje há quatro classes a fazer a mesma coisa (`.empty`, `.screen-empty`, `.photo-empty`, `.cover-empty`), todas texto cinzento centrado sem ação. **Fundir num só componente:** ilustração ou grupo de formas, título, uma frase, uma saída.

- **Diário vazio (`3a`):** cartão `--surface` radius **32**, padding `32px 24px`, centrado. Três retângulos 52×66 radius 12 com o padrão listrado, rodados −8°/0/+8°. Título Fraunces 24 "O teu diário começa na primeira refeição", frase 15/1.5 `--text-muted`, CTA primário "Registar onde já fui" e CTA secundário de texto "Ver o mapa primeiro".
- **Amigos vazio (`3b`):** três avatares 44 sobrepostos (`margin-left: -14px`, `border: 3px solid --surface`), título "Sozinho sabe pior", e **sugestões concretas de quem seguir** por baixo — nunca um beco sem saída. Rodapé "Convidar por código".
- **A carregar (`3c`):** blocos `--hairline` / `--surface-3` com as **dimensões exatas** do conteúdo que vão substituir (thumbnail 76 radius 16; linhas de 11, 17, 12, 12px). O ponto não é a animação — é reservar a altura antes de a Google responder, para a lista não saltar. Aplicar também a `renderComments`, `renderAmigosFeed` e `renderPhotos`, que hoje usam três alturas diferentes.
- **Erros (`3d`), três níveis:**
  - **Em linha** (falhou algo pequeno): faixa `--c-petiscos-soft #f7e1da`, radius 16, ícone e texto em `#a83d27`, título 15/700, explicação 14, botão "Repetir" à direita.
  - **De secção** (a lista não veio): cartão centrado, círculo 44 `--surface-2` com ícone, título 17/700, frase 14/1.5, botão "Tentar de novo".
  - **Sem resultados** (não é erro): cartão com o estado dos filtros em texto ("Tens 2 filtros ativos: Mariscos e €€€") e duas saídas — "Limpar filtros" e "Procurar no mapa".

⚠️ **Reescrever a mensagem de erro de upload.** Hoje `renderPhotos` diz: *"Não foi possível enviar. As fotos já estão ativadas no Firebase?"* — está a pedir diagnóstico do backend ao utilizador. Passa a: **"A foto não subiu — fica guardada e tentamos outra vez quando houver rede."** Nenhuma mensagem deve mencionar Firebase, Google ou qualquer serviço.

---

## Interactions & Behavior

- **Toque em cartão:** `transform: scale(0.99)`; chips e botões `scale(0.97)`. Manter o que já existe.
- **Transições:** 200ms `cubic-bezier(0.16, 1, 0.3, 1)` para estado; 120ms para toque.
- **Sheets:** entram de baixo, 340ms, mesma curva. Arrastar para baixo fecha — reutilizar o gesto já implementado em `.detail-card.dragging`.
- **Chips de filtro:** alternam imediatamente e re-filtram; o contador no botão "Filtros" atualiza em direto, tal como a contagem no CTA do rodapé do sheet.
- **`prefers-reduced-motion`:** a regra que anula animações já existe em `css/style.css`. Manter.

## State Management

Nenhum estado novo além do que `app.js` já mantém:
- `state.currentScreen` — passa a aceitar `"perfil"`; `"criticas"` desaparece.
- `state.criticasView` — passa a ser a vista do Diário: `"restaurantes" | "criticas" | "pratos"`.
- `state.mapMode` — **novo**, `"mapa" | "lista"`.
- `state.filtersOpen` — **novo**, booleano para o sheet.
- `state.amigosFilter` — perde o valor `"priority"`.

## Assets

- **Ícones:** o sprite SVG em `index.html` (estilo Lucide, `stroke-width: 2`) já cobre tudo. Ícones novos necessários: livro (Diário), lista (modo lista), wifi-off (erro de rede). Desenhar no mesmo estilo, `viewBox="0 0 24 24"`, traço de 2, extremidades redondas. **Não usar SF Symbols** — perde-se a coerência com a web.
- **Fotografias:** Google Places API e Cloud Storage, como hoje. Nos protótipos são placeholders listrados.
- **Mapa:** Google Maps JS SDK, sem alterações.

## iOS — o que fazer antes de submeter

- **Detetar contexto:** classe no `<html>` no arranque — `is-native` se `window.Capacitor?.isNativePlatform()`, `is-standalone` se `navigator.standalone`. Todo o CSS condicional pendura-se daí.
- **`capacitor.config.json` declara `backgroundColor: #f6f1e8` mas `--bg` é `#f6f1e7`.** Um dígito, mas é um flash visível no arranque. Alinhar os dois, e também os dois `theme-color` do `index.html`.
- **Sign in with Apple** (guideline 4.8): obrigatório porque há login Google. Tem regras próprias de tamanho e cor; o ecrã de sessão passa a ter duas opções.
- **Apagar conta** (5.1.1v): não existe hoje. Vai no fim do Perfil, com ecrã de confirmação que diga o que desaparece (críticas, fotos, visitas) e o que fica (restaurantes que adicionaste, que outros já usam).
- **Permissões:** `NSLocationWhenInUseUsageDescription` com justificação concreta em português ("para encontrar a morada do sítio que estás a adicionar"), pedida só ao tocar em "Encontrar localização". `NSCameraUsageDescription` e `NSPhotoLibraryUsageDescription` para as fotos.
- **Haptics:** só no nativo, e só em marcar visitado, registar visita e confirmar convite. Nunca em navegação.
- **Não copiar do iOS:** títulos grandes colapsantes (matam o Fraunces), listas agrupadas estilo Definições no ecrã principal, azul de sistema.

## Ordem de implementação

Cada fase pode ir a produção isoladamente. Detalhe e critérios de "feito" na auditoria.

1. **Só CSS, sem tocar em JS** — consolidar os quatro `:root` num só e apagar declarações duplicadas; tirar a opacidade dos chips; três alturas, três raios, cartões sem sombra; escurecer `--text-faint`; trocar a família de corpo para Manrope; tirar o gradiente do "Pergunta-me".
2. **Primeira utilização** — três ecrãs de arranque (cidade → "já foste a algum destes?" → "quem conheces?"). Subiu de última para segunda porque escalar é objetivo deste ano; sem ela, cada convite queima-se numa conta vazia.
3. **Filtros em sheet** — o planeador vai junto. `getFiltered()` não muda.
4. **Sheet de registar visita + estados.**
5. **Nova navegação** — Diário, Perfil, ficha de 4 para 2 separadores.
6. **Requisitos App Store** — pode correr em paralelo a partir da 3.

## Riscos

Há **oito utilizadores com dados em produção** e nenhuma rede de segurança visível: sem ambiente de testes, sem sinalizadores de funcionalidade, e um service worker que serve versão em cache até ao próximo bump do `CACHE` em `sw.js` (**fazer bump a cada deploy com mudança de assets**). A fase 1 é segura por ser CSS. Da fase 3 em diante, vale mais um ambiente de pré-produção do que qualquer recomendação deste documento.
