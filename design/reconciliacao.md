# Reconciliação com o handoff

Passagem ecrã a ecrã do que está no código contra o que está em
[`handoff/README.md`](handoff/README.md). A anterior foi feita de memória, antes
de o handoff estar em disco; esta foi feita contra o texto, e cada linha aponta
para o ficheiro onde se confirma.

Data: agosto de 2026. Commits de referência: `2970f02` a `cd4af41`.

## Conforme

Verificado valor a valor, não por impressão.

| O que o handoff pede | Onde se confirma |
| --- | --- |
| Corpo em Manrope, títulos em Fraunces, numérico em IBM Plex Mono | `css/style.css:7,52,53` |
| `--text-faint` escurecido (pedia ~`#8a7f6c`) | `css/style.css:22` — está a `#6e6350`, mais escuro ainda |
| Três raios apenas: 16 / 32 / 999 | `--r-sm`, `--r-md`, `--r-lg` todos a 16px; `--r-xl` 32; `--r-pill` 999 |
| Alturas: 44 de controlo, topbar 60, tabbar 56 | `css/style.css:40,54,55` |
| Campo de procura 48px, pílula, `--surface-2`, sem borda, padding esquerdo 44 | `.search-wrap input` |
| Contador de filtros: min-width 18, altura 18, `--primary`, 11/800 | `.filters-count` (`--fs-2xs` = 11px) |
| Chips de cozinha começam **desligados** | `js/app.js:160,186` |
| `opacity: 0.55` nos chips desligados eliminada | ausente da folha |
| Barra vertical de cor no cartão (`.card.rcard::before`) eliminada | ausente da folha |
| Diário: `grid-auto-rows: 230px`, gap 8, foto 150px, corpo `10px 12px 12px` | `#memorias-list.screen-list`, `.memory .ph`, `.memory-body` |
| Pílula de nota sobre a foto: altura 24, padding 0 9, pílula | `.memory-score` |
| Texto da crítica em `--text` (era `--text-muted`), 15/1.5 | `.critique-note` |
| Mensagem de upload reescrita, sem mencionar serviços | `js/app.js:1292,1747,2100` |
| Ícones novos: livro, lista, wifi-off | `index.html`, sprite |
| Emblema de wishlist a `#b04a1c` | `js/map.js` |
| "Quem vê a minha atividade" no Perfil | `js/app.js:2907`, dentro da groupbar — forma diferente da lista de definições que o handoff desenha, mas presente e no ecrã certo |

## Desvios encontrados — corrigidos

Quatro, todos pequenos, todos explicitamente escritos no handoff. Corrigidos
nesta passagem.

1. **`.topbar-ai` ainda tem borda.** O handoff diz do botão "Pergunta-me":
   *"fundo `--surface-2`, **sem borda e sem gradiente**"*. O gradiente saiu; a
   borda ficou (`border: 1px solid var(--border-strong)`).
2. **`.card.rcard` ainda tem borda.** O ecrã `2b` diz: *"Sem sombra, sem borda,
   sem a barra vertical de cor"*. A barra saiu, a sombra saiu, a borda ficou.
3. **O banner do mapa nomeia o serviço e um ficheiro de código.**
   `index.html:147` diz *"Adiciona a tua chave da Google Maps em `js/config.js`"*
   — texto de programador, mostrado a quem usa a app. O handoff é categórico:
   *"Nenhuma mensagem deve mencionar Firebase, Google ou qualquer serviço."*
   Aparece sempre que a chave falhar (quota, referrer), não só em
   desenvolvimento.
4. **Perfil (`2f`), duas diferenças de texto.** A tile dizia "Sítios"; o handoff
   diz "Restaurantes". E faltava a linha *"Desde \<mês\> de \<ano\>"* por baixo do
   nome — passa a vir do `metadata.creationTime` da conta, que não era usado.
   Sem data, a linha não aparece: mais vale calar do que inventar.

## Uma coisa a decidir, não a corrigir

**`.card.rcard.visited { opacity: .72 }`** — os cartões de sítios visitados estão
esbatidos. O handoff não fala disto, mas cita com aprovação a decisão 3 do brief:

> "A lista **não é uma checklist** — um sítio visitado não é 'concluído' nem fica
> apagado; continua relevante para voltar."

Esbater é literalmente ficar apagado. E é a mesma razão pela qual a auditoria
mandou a barra de progresso fora (*"transforma a lista numa checklist, que
contraria explicitamente a decisão 3"*) e pela qual a opacidade saiu dos chips.

Não mexi: é uma mudança visível na lista e não está escrita em lado nenhum do
handoff. Fica para decidires.

## Fora desta passagem

- **"Apagar conta"** falta, mas é a Fase 6 — está no plano, não é dívida desta
  reconciliação.
- **Desvios deliberados** (cartão de gosto fora do Perfil, barra de progresso
  eliminada, regras de ecrã grande): ver [`../DESIGN-HANDOFF.md`](../DESIGN-HANDOFF.md).
- Diferenças de 1px em posicionamento de ícone não foram tratadas como desvio.

## O que esta passagem não prova

Comparei valores declarados na folha de estilos com valores escritos no handoff.
Isso apanha o que está errado no código; **não apanha o que está certo no código e
errado no ecrã** — composição, ritmo, o que acontece com dados reais e nomes
compridos. Para isso é preciso abrir os `.dc.html` ao lado da app e olhar, e isso
continua por fazer.
