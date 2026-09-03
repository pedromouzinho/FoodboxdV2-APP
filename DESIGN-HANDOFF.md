# Handoff de design — índice e estado

O pacote entregue pelo Claude Design está em [`design/handoff/`](design/handoff/),
tal como veio. **Este ficheiro não repete o handoff** — indexa-o, diz o que já foi
aplicado, e regista os desvios deliberados.

Existe porque durante a implementação o handoff só vivia numa conversa. Sem ele
em disco não havia como verificar o que tinha sido aplicado, e perderam-se os
desenhos do ecrã do Mapa sem ninguém dar por isso até o dono perguntar. O
documento é a fonte; a memória de quem implementa não é.

## O que está em `design/handoff/`

| Ficheiro | O que é |
| --- | --- |
| `README.md` | O handoff. Tokens, os 12 ecrãs, comportamento, iOS, ordem de implementação. **Começar aqui.** |
| `auditoria.dc.html` | Auditoria crítica em PT-PT, imprimível. Abrir no browser. |
| `recriacao.dc.html` | Canvas com 4 turnos: recriação do estado antigo, redesenho, estados, vistas secundárias. Pan/zoom. |
| `auditoria.txt` | Extração automática da auditoria, só para pesquisar com `grep`. O original é o `.dc.html`. |
| `doc-page.js`, `support.js` | Runtime dos `.dc.html`. O handoff diz que não são para o repositório de destino — estão cá porque **sem eles os desenhos não abrem**, e um handoff que não se consegue ver não serve para verificar nada. Não são para produção. |

Os dois `.dc.html` foram renomeados (o original tinha espaços e acentos escapados
no zip). O conteúdo não foi tocado.

## Referências dos desenhos

Cada desenho tem um id usado ao longo do handoff.

| Ecrã | Id |
| --- | --- |
| Mapa — modo mapa | `2a` |
| Mapa — modo lista | `2b` |
| Filtros — sheet | `2c` |
| Diário — Restaurantes | `2d` |
| Diário — Críticas | `4a` |
| Diário — Pratos | `4b` |
| Perfil de gosto — sheet | `4c` |
| Amigos — Atividade, e filtros | `2e`, `4d`, `4e`, `4f` |
| Seguir pessoas — sheet | `4g` |
| Perfil | `2f` |
| Registar uma visita — sheet | `2g` |
| Estados (vazio, carregamento, erro) | `3a`, `3b`, `3c`, `3d` |

## Estado das fases

| Fase | Estado | Commit |
| --- | --- | --- |
| 1 · Só CSS — tokens num só bloco | feito | `2970f02` (e `f04e011`, que repôs o chip que a consolidação partiu) |
| 2 · Primeira utilização | feito | `13ef4a0` |
| 3 · Filtros em sheet | feito | `0f08a94` |
| 4 · Sheet de registar visita + estados | feito | `d0c96a8` |
| 5 · Nova navegação | feito | `1381540`, `a54c344` |
| — · Reconciliação com os desenhos | parcial | `8337bb3`, `df2c67e`, `1759536` |
| 6 · Requisitos App Store | **por fazer** | — |

A reconciliação está marcada como parcial de propósito: foi feita de memória,
antes de o handoff estar em disco. Uma passagem ecrã a ecrã contra o texto ainda
não foi feita.

## Desvios deliberados

Decisões do dono do produto que contrariam o handoff. **São decisões, não dívida
técnica** — não devem ser "corrigidas" numa reconciliação futura.

- **Perfil (`2f`) — sem cartão de gosto inline.** O handoff põe um resumo do
  perfil de gosto no ecrã Perfil. Foi retirado: a entrada para a folha `4c`
  já está na lista de definições, e ter as duas era dizer o mesmo duas vezes.
- **Barra de progresso eliminada.** A auditoria criticava-a como um dos nove
  blocos que empurravam o primeiro restaurante para fora do ecrã, e propunha
  movê-la. Foi eliminada, que vai mais longe do que o handoff pedia.
- **Ecrã grande.** O handoff é só de telemóvel. As regras acima dos 861px não
  vêm de lá — ver o bloco no fim de `css/style.css`.

## O que fica por decidir

Assuntos levantados depois do handoff, que ele não cobre:

- **Perfil de gosto público** e campo de texto livre a alimentar as sugestões.
- **Ecrã de entrada / bloqueio sem sessão** — em conflito com o catálogo
  partilhado ser público por desenho (`firebase/firestore.rules`) e com a
  partilha por mensagem.
- **Partilha por mensagem** com cartão de pré-visualização (em standby).
