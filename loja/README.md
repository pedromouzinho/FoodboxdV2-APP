# Metadados da App Store — rascunho para aprovar

> ## Estado a 26/08/2026: o formulário está preenchido
>
> Os textos deste ficheiro foram passados para a App Store Connect (build 4,
> versão 1.0). O que ficou lá: descrição (1590), palavras-chave (90),
> subtítulo (28), copyright, nota ao revisor (2308), URL da privacidade, e as
> etiquetas de privacidade dos seis tipos de dados. O «Add for Review» ficou
> ativo, ou seja, não há campos em falta na página da versão.
>
> **Uma mudança que não estava neste ficheiro:** as palavras-chave que lá
> estavam incluíam `letterboxd`. É marca registada de outra empresa, e a Apple
> recusa metadados com marcas de terceiros — foi substituída pela lista deste
> README. Se a decisão for outra, muda-se, mas sabendo o risco.
>
> **Fechado nesse mesmo dia, pelo dono:**
>
> - **Etiquetas de privacidade publicadas.** Os seis tipos usados para *App
>   Functionality*, ligados à identidade, **nenhum** para rastreio. Na página
>   da loja aparece como «Data Linked to You: Contact Info · Location · User
>   Content · Identifiers».
> - **Digital Services Act — *In Review*** para 27 países. Era o bloqueador
>   mais silencioso da lista: cinco dos seis países de venda são da UE, e sem
>   a verificação de comerciante a app seria retirada lá.
> - **Content Rights → «Yes, this app has the necessary rights to its
>   third-party content.»** A app mostra fotografias, notas e críticas da
>   Google Places; os direitos vêm dos termos da Google Maps Platform.
> - **Conta bancária** da Caixa aceite, em processamento. O campo *Bank Code*
>   da Apple, para Portugal, quer o **balcão** (4 dígitos do meio do NIB) e
>   não o código do banco — o nome do campo engana, e só se descobre a
>   tentar. O *Account Number* são os 11 dígitos da conta, zeros à esquerda
>   incluídos.
> - **Lançamento automático** e **o screenshot 05-amigos**: decisões
>   aprovadas pelo dono depois de lhe serem postas à frente.
>
> **Fica só o botão «Add for Review»** — a submissão é do dono, não do agente.
>
> **Não é bloqueador:** o formulário fiscal W-8BEN está por completar. A app é
> grátis e sem compras, e para isso basta o *Free Apps Agreement*, que está
> Ativo; a conta bancária e os impostos pertencem ao *Paid Apps Agreement*,
> que só conta quando houver dinheiro a receber. Sem W-8BEN válido os EUA
> retêm 30% sobre royalties de vendas americanas — irrelevante a preço zero,
> obrigatório no dia em que houver preço ou compras dentro da app.

> **O que é isto:** tudo o que a App Store Connect pede ao lado da build, escrito
> para ser copiado campo a campo. Os textos são um rascunho do agente; **a
> decisão é do dono** — sobretudo a descrição, que é a promessa que a app faz a
> quem nunca a viu.
>
> Os limites de caracteres estão contados e verificados. Ultrapassá-los faz o
> formulário recusar, e reescrever à pressa no browser é como se perde o tom.

---

## Screenshots

`loja/screenshots/`, **1320 × 2868** — a medida de 6,9 polegadas (iPhone 17 Pro
Max), que é a que a App Store exige hoje para iPhone. As restantes medidas são
derivadas por ela, e por isso não é preciso tirá-las.

| # | Ficheiro | O que mostra | Porquê este, e por esta ordem |
| --- | --- | --- | --- |
| 1 | `01-mapa.png` | Portugal inteiro, pins de Braga ao Algarve, alguns já marcados | É o que a app é à primeira vista, e os pins preenchidos mostram que é *um diário*, não um directório |
| 2 | `02-pergunta-me.png` | A IA a responder: «Maria Catita · 4.7 (8558) · €€€ · 2 km», a citar o gosto de quem pergunta | **É o que mais distingue a app.** Cita o perfil de gosto e dá distâncias reais |
| 3 | `03-diario.png` | «16 restaurantes · 10 críticas · 18 pratos», com as fotos | A metade pessoal do produto, e a razão para voltar |
| 4 | `04-lista.png` | «68 RESTAURANTES», cartões com foto, nota, preço e especialidade | Densidade de informação sem ser preciso ler |
| 5 | `05-ficha.png` | Monte d'Açorda: foto, 4.6 (759), €€€, telefone, especialidade | O que se ganha ao tocar num sítio |
| 6 | `06-filtros.png` | Cozinha, estilo, região, preço | A lista dobra-se ao que apetece hoje |

**A ordem não é decorativa:** na App Store, os dois primeiros são os que aparecem
nos resultados de pesquisa sem ninguém abrir a página. Por isso o mapa abre e o
«Pergunta-me» vem logo a seguir — é o que ninguém mais faz.

> 🔴 **Cinco dos seis são anteriores a 25/08 e já não mostram esta app.**
> Verificado imagem a imagem:
>
> | # | O que está lá e não devia | Porquê |
> | --- | --- | --- |
> | 1, 3 | Barra de cima sem o botão **+** | O «+» é a única forma de acrescentar um sítio desde 25/08 |
> | 4, 5, 6 | Barra de cima com o botão **Entrar** | Sem sessão já não se chega a ecrã nenhum — este estado deixou de existir |
> | 4 | Os botões **Wishlist** e **Já fui** no topo da lista | Foram substituídos pelo «+» |
>
> Só o 2 escapa, porque é uma folha que tapa a barra toda. A diretriz **2.3.3**
> é exatamente sobre isto: os screenshots têm de mostrar a app que se submete.
> **Tirá-los outra vez é trabalho a fazer antes de submeter**, e não é decisão
> nenhuma — é uma correção.

O 2 e o 3 mostram a conta do dono, com dados reais.

> ⚠️ **Repara no que o 2 e o 3 mostram de verdade:** restaurantes que o dono
> visitou, e um texto da IA que cita o gosto dele por nome. É a conta real. Numa
> montra pública isso é uma escolha, não um detalhe — se preferires ecrãs com
> dados neutros, é preciso uma conta de demonstração povoada de propósito.

---

## Campos de texto

> **Copia do [`submissao.html`](submissao.html), não daqui.** Nestes blocos os
> textos estão dobrados a 78 colunas para se lerem numa página; as quebras
> iriam com eles para o formulário. O número de caracteres é o mesmo nos dois
> sítios — dobrar troca um espaço por uma mudança de linha, e não acrescenta
> nada. A nota ao revisor é a exceção: as quebras dela são de propósito.

### Nome · máx. 30
```
Foodboxd
```

### Subtítulo · máx. 30 (usa 28)
```
O teu diário de restaurantes
```

### Texto promocional · máx. 170 (usa 153)
Muda-se sem submeter versão nova — é o sítio para novidades sazonais.
```
Um mapa dos sítios que valem a pena e um diário do que comeste. Cria conta,
marca onde já foste e onde queres ir, e pergunta à app o que te apetece hoje.
```

### Palavras-chave · máx. 100, separadas por vírgulas, sem espaços depois
Não repetir o nome da app nem a categoria: já são indexados.
```
restaurantes,tascas,petiscos,onde comer,diario,mapa,marisqueira,portugal,avaliacoes,pratos
```

### Descrição · máx. 4000 (usa 1590)

```
O Foodboxd é um mapa dos restaurantes que valem a pena e um diário do que
comeste neles.

Não é mais um agregador de avaliações anónimas. É o teu registo: onde foste, o
que pediste, e o que achaste — para não voltares a olhar para uma lista de
sítios sem saber qual deles já te correu bem.

PARA COMEÇAR
Precisas de conta. Cria uma com email e palavra-passe, ou entra com a Apple ou
com a Google. Não começas do zero: a lista de restaurantes já lá está, com
avaliação, escala de preços, telefone e a especialidade da casa.

O MAPA
Todos os sítios num mapa, de Braga ao Algarve. Filtra por cozinha, por estilo
— tasca, petiscos, casual, fine dining — por região e por preço. Ou escreve o
nome de um prato e encontra quem o faz.

O DIÁRIO
Marca como visitado, dá estrelas, escreve o que quiseres e regista os pratos
que provaste. Junta fotografias. Da próxima vez que passares à porta, sabes o
que pedir.

A LISTA DE DESEJOS
Marca os sítios onde ainda queres ir. Deixa de haver aquele restaurante de que
te lembras vagamente e nunca mais encontras.

PERGUNTA-ME
Descreve o que te apetece — «peixe fresco, barato, perto e tranquilo» — e a
app sugere, cruzando o teu gosto, a tua lista e onde estás. A localização é
pedida só aqui, nunca ao abrir, e a app funciona sem ela.

OS AMIGOS
Segue quem quiseres acompanhar e vê onde andaram e o que acharam. Cria grupos
para separares a malta do trabalho da malta do costume.

O QUE NÃO HÁ
Sem publicidade. Sem seguimento para publicidade. Sem venda de dados. Apagas a
conta dentro da app, e apaga mesmo — incluindo as fotografias.

Feito em Portugal.
```

---

## Nota ao revisor · *App Review Information → Notes*

É o que a App Review lê antes de abrir a app. Desde 25/08 a app **exige conta**,
e por isso esta nota tem uma tarefa concreta: dizer como se entra, antes que
alguém conclua que não dá.

**As credenciais não se escrevem aqui.** Vão nos campos *Sign-In Information*
do mesmo formulário, ao lado deste — [[CREDENCIAIS: o dono preenche no
formulário]]. O texto abaixo aponta para lá e cola-se tal como está, sem
substituir nada.

```
Foodboxd is a restaurant diary for Portugal: a map of places worth
going to, and a private log of what you ate and what you thought of it.

AN ACCOUNT IS REQUIRED. The app opens on a sign-in screen and shows
nothing until you are signed in. There are two ways in, and either one
is enough to review the whole app.

1. The demo account. Its email and password are in the Sign-In
   Information fields of this same App Review Information section. Type
   them into "Email" and "Palavra-passe" on the first screen, then tap
   "Entrar".

2. Your own Apple ID. Tap "Continuar com a Apple". Sign in with Apple is
   fully supported, including "Hide My Email" - the app works normally
   with a privaterelay.appleid.com address. "Continuar com a Google"
   works the same way, and "Criar conta" opens an account from any email
   and password. There is no email verification step.

Once you are in, the shared list of 68 restaurants across Portugal is
there immediately, with rating, price range, phone number and signature
dishes. On a brand-new account the Diário and the Amigos feed start
empty. That is intended: both are built from what you log and who you
follow, and the empty feed offers "Descobrir pessoas" to get started.

Where things are (bottom tab bar):
  Mapa    - the map and the restaurant list; tap any pin or card
  Diário  - your own visits, reviews and dishes
  Amigos  - activity feed and leaderboard
  Perfil  - your account, and "Apagar conta"

Adding a place: the "+" button in the top bar. You choose "Quero ir"
(want to go) or "Já fui" (been there); "Já fui" also marks the place as
visited and lets you attach a photo.

Location (5.1.1): asked only inside "Pergunta-me", the sparkle button in
the top bar, and only when you ask it for a suggestion. Never at launch.
The app works without it.

Reporting and blocking (1.2): open any photo or comment posted by
another person and use the flag icon / "Denunciar". Blocking is offered
in the same sheet. Blocked people can be restored in Perfil, in the
"Pessoas bloqueadas" row that appears once you have blocked someone.

Account deletion (5.1.1(v)): Perfil -> "Apagar conta". It asks you to
type APAGAR to confirm, then deletes the account for real: the Firestore
data, the photos in Storage, and the Auth user.

The app is in Portuguese.
```

Usa 2308 caracteres; o campo aceita 4000.

**Porque é que a nota oferece duas entradas.** A conta de teste é a que a Apple
pede. O Sign in with Apple com o Apple ID do próprio revisor é a rede de
segurança: se a conta de teste falhar por alguma razão — e é a rejeição 2.1 mais
comum — o revisor tem outra porta sem ter de nos escrever e esperar um dia.

---

## Escolhas do formulário

| Campo | Resposta | Porquê |
| --- | --- | --- |
| Categoria principal | **Food & Drink** | É o que a app é |
| Categoria secundária | **Travel** | Apanha quem procura onde comer numa viagem |
| Idioma principal | **Português (Portugal)** | A app é toda em português |
| Privacy Policy URL | `https://foodboxd.pt/privacidade` | Já está no ar, verificada com HTTP 200 |
| Support URL | `https://foodboxd.pt/ajuda` | ✅ no ar, HTTP 200 |
| Marketing URL | `https://foodboxd.pt` | Opcional, mas já existe |
| Sign-in required | **YES** | Desde 25/08 a app não mostra nada sem sessão — o ecrã de entrada cobre tudo |

**Sign-in required liga-se, e os campos ao lado preenchem-se.** *User Name* e
*Password* da conta de teste — [[CREDENCIAIS: o dono preenche no formulário]].
Não vão para este ficheiro nem para o repositório. Deixar o campo desligado com
a app a exigir conta é a rejeição 2.1 servida em bandeja: a revisão abre, dá com
o ecrã de entrada, e não tem por onde passar.

**✅ A página de ajuda está no ar** — [`ajuda.html`](../ajuda.html), servida em
`/ajuda`, publicada e verificada a 25/08 (HTTP 200, com o contacto e o link para
a privacidade). O dono deixou a decisão ao agente, e a decisão foi não usar o atalho:
apontar o *Support* para a política de privacidade é obrigar quem tem um
problema a ler um texto legal, e nota-se.

Responde ao que uma pessoa presa realmente pergunta — preciso de conta, entrei
pela Google e perdi o que tinha na Apple, porque me pede a localização, quem vê o
que escrevo, como denuncio, como apago a conta — e tem o email em cima, antes de
tudo. Faz de caminho um segundo serviço: **a diretriz 1.2 exige contacto
publicado**, e agora há um.

---

## Classificação etária

O questionário da Apple pergunta pelo conteúdo. A resposta que importa:

> **A app tem conteúdo gerado por utilizadores?** — **Sim.** Fotografias e
> críticas escritas por pessoas, visíveis a outras.

Isto é o que ativa a exigência da diretriz 1.2 — **e essa parte está cumprida**:
há denunciar, há bloquear, há desbloquear, e as denúncias vão para o Firestore.
Ver a secção 4.0 do handoff, com as medições.

Tudo o resto é **Nenhum/Não**: sem violência, sem conteúdo sexual, sem jogo a
dinheiro, sem álcool ou tabaco como tema (que apareçam num prato ou numa carta
de vinhos não conta), sem acesso irrestrito à web.

> **Nota sobre a última:** a app abre o Google Maps e a política de privacidade
> num browser externo. São destinos fixos, não um browser dentro da app — a
> resposta continua a ser *não*.

Com estas respostas a classificação esperada é **12+** (por causa do UGC). Se o
formulário devolver outra coisa, vale a pena reler as respostas antes de aceitar.

---

## Conformidade de exportação

> **A app usa encriptação?** — Usa **apenas HTTPS**, e nada mais.

Isso cai na isenção habitual. Na prática responde-se que a app usa encriptação,
e a seguir que é **só encriptação padrão do sistema** (HTTPS/TLS), o que dispensa
a documentação de exportação.

**✅ E já não é preciso responder em cada versão.** O
`ITSAppUsesNonExemptEncryption = false` está no [`ios-info.json`](../ios-info.json),
versionado como os textos de permissão, e o `scripts/ios-info.mjs` escreve-o no
`Info.plist` a cada `npm run sync`.

> **O tipo importava, e quase passava.** O script escrevia tudo como *string*, e
> `"false"` num plist é um valor presente que a Apple lê como verdadeiro — a
> pergunta voltaria em cada versão, que é o oposto do que a chave existe para
> fazer. Passou a escrever `bool` quando o valor é booleano. Confirmado com
> `plutil -p`: `"ITSAppUsesNonExemptEncryption" => false`, sem aspas.

---

## O que fica por decidir

1. **Se os screenshots 2 e 3 podem levar dados reais** — ver o aviso lá em cima.
2. **Se a descrição diz «Precisas de conta» logo à terceira linha** — diz, e é
   deliberado. Quem descobre a exigência só depois de instalar dá uma estrela e
   escreve porquê. Se preferires que a exigência apareça mais abaixo, muda-se —
   o que não se faz é escondê-la.
3. **A descrição** — está escrita, e é a peça que mais merece ser lida devagar.
   O «O QUE NÃO HÁ» no fim é uma aposta deliberada: numa loja cheia de apps que
   vivem de publicidade, dizer que não há nenhuma é o argumento mais forte que
   esta app tem. Se soar a arrogante, corta-se.
