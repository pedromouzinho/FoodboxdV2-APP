# Foodboxd — Rede de Agentes

> Orquestrador central. Define todos os agentes disponiveis, quando activar cada um,
> e como colaboram entre si. Ultima actualizacao: 2026-06-15.

---

## Visao Geral

A rede de agentes do Foodboxd cobre 5 dominios:

```
┌─────────────────────────────────────────────────┐
│            ORCHESTRATOR (este ficheiro)           │
└────────┬────────┬────────┬────────┬────────┘
         │        │        │        │
    ┌────┴────┐ ┌┴──────┐┌┴──────┐┌┴──────┐┌┴──────┐
    │ PRODUTO │ │MARKETING││  CODE  ││ GROWTH ││  DATA  │
    │  & UX   │ │& CONTENT││ REVIEW ││& SALES ││& INTEL │
    └─────────┘ └────────┘└────────┘└────────┘└────────┘
```

---

## 1. PRODUTO & UX

Agentes focados na experiencia do utilizador e qualidade da interface.

| Agente | Skill Path | Quando Activar |
|--------|-----------|----------------|
| **UI/UX Mobile** | `skills/ui-ux-mobile` | Touch, gestos, PWA, iOS, mobile layout, performance percebida |
| **UI/UX Web** | `skills/ui-ux-web` | Responsivo, desktop, acessibilidade, design tokens, dark mode |
| **Onboarding** | `skills/onboarding` | Fluxo primeiro uso, tutorial, activacao |
| **Signup** | `skills/signup` | Registo, login, auth UX |
| **Pricing** | `skills/pricing` | Modelos de preco, freemium, paywall strategy |
| **Paywalls** | `skills/paywalls` | Implementacao de paywalls, upgrade flows |
| **CRO** | `skills/cro` | Conversao, landing pages, formularios |
| **A/B Testing** | `skills/ab-testing` | Desenho de experiencias, significancia |
| **Popups** | `skills/popups` | Modais de conversao, timing, triggers |
| **Free Tools** | `skills/free-tools` | Ferramentas gratuitas como lead magnet |

---

## 2. MARKETING & CONTENT

Agentes para aquisicao, conteudo e comunicacao.

| Agente | Skill Path | Quando Activar |
|--------|-----------|----------------|
| **Content Strategy** | `skills/content-strategy` | Plano editorial, pilares, calendario |
| **Copywriting** | `skills/copywriting` | Headlines, CTAs, body copy |
| **Copy Editing** | `skills/copy-editing` | Revisao, tom, consistencia |
| **SEO Audit** | `skills/seo-audit` | Audit tecnico, on-page, indexacao |
| **AI SEO** | `skills/ai-seo` | Optimizacao para AI search (SGE, Perplexity) |
| **Programmatic SEO** | `skills/programmatic-seo` | Paginas a escala, templates |
| **Emails** | `skills/emails` | Campanhas, sequences, newsletters |
| **SMS** | `skills/sms` | SMS marketing, notificacoes |
| **Social** | `skills/social` | Redes sociais, posting strategy |
| **Video** | `skills/video` | Video marketing, scripts, thumbnails |
| **Image** | `skills/image` | Visual content, design direction |
| **Ads** | `skills/ads` | Paid media strategy, targeting |
| **Ad Creative** | `skills/ad-creative` | Copy e visual de anuncios |
| **Product Marketing** | `skills/product-marketing` | Positioning, messaging, launches |
| **Launch** | `skills/launch` | Go-to-market, launch playbook |

---

## 3. CODE REVIEW

Agentes de qualidade de codigo, contextualizados ao stack Foodboxd.

| Agente | Skill Path | Quando Activar |
|--------|-----------|----------------|
| **Security** | `skills/code-review-security` | XSS, auth, Firebase rules, dados sensiveis |
| **Performance** | `skills/code-review-performance` | Lentidao, memory leaks, Lighthouse, cache |
| **Architecture** | `skills/code-review-architecture` | Refactor, patterns, convencoes, data model |

### Workflow de Code Review Combinado

Quando se pede um "code review completo", correr os 3 em sequencia:
1. **Security** (bloqueante — criticos impedem merge)
2. **Architecture** (convencoes e estrutura)
3. **Performance** (otimizacoes)

Output combinado:
```
## Code Review: [ficheiro]
### Security: N criticos, N altos
### Architecture: N violacoes
### Performance: N budget violations
### Veredicto: APROVADO / APROVADO COM NOTAS / BLOQUEADO
```

---

## 4. GROWTH & SALES

Agentes para crescimento, retencao e monetizacao.

| Agente | Skill Path | Quando Activar |
|--------|-----------|----------------|
| **Community Marketing** | `skills/community-marketing` | Comunidade, UGC, ambassadors |
| **Referrals** | `skills/referrals` | Programas de referencia, viralidade |
| **Lead Magnets** | `skills/lead-magnets` | Iscas de captacao, downloads |
| **Cold Email** | `skills/cold-email` | Outreach, templates, sequences |
| **Prospecting** | `skills/prospecting` | Identificar e qualificar leads |
| **Sales Enablement** | `skills/sales-enablement` | Material de vendas, pitch decks |
| **Co-Marketing** | `skills/co-marketing` | Parcerias, cross-promotion |
| **Churn Prevention** | `skills/churn-prevention` | Retencao, win-back, engagement |
| **RevOps** | `skills/revops` | Revenue operations, metricas |
| **Marketing Ideas** | `skills/marketing-ideas` | Brainstorm, taticas criativas |
| **Marketing Psychology** | `skills/marketing-psychology` | Nudges, framing, social proof |

---

## 5. DATA & INTELLIGENCE

Agentes para analytics, insights e inteligencia competitiva.

| Agente | Skill Path | Quando Activar |
|--------|-----------|----------------|
| **Analytics** | `skills/analytics` | Tracking, GA4, eventos, medicao |
| **ASO** | `skills/aso` | App Store Optimization |
| **Competitors** | `skills/competitors` | Analise competitiva geral |
| **Competitor Profiling** | `skills/competitor-profiling` | Perfil detalhado de competidor |
| **Customer Research** | `skills/customer-research` | Entrevistas, surveys, personas |
| **Directory Submissions** | `skills/directory-submissions` | Listar em directorios/agregadores |
| **Schema** | `skills/schema` | Structured data, rich snippets |
| **Site Architecture** | `skills/site-architecture` | Estrutura de navegacao, IA |

---

## Como Invocar Agentes

### Invocacao Directa
```
@ui-ux-mobile revisa este componente: [codigo/screenshot]
@code-review-security audita js/db.js
@seo-audit analisa foodboxd.pt
```

### Invocacao por Contexto (automatica)
O orchestrador detecta a intencao e roteia:
- "isto no telemovel esta mal" → `ui-ux-mobile`
- "revisa este codigo" → `code-review-security` + `code-review-architecture`
- "como melhoro o SEO" → `seo-audit`
- "preciso de mais utilizadores" → `marketing-ideas` + `community-marketing`

### Combinacao de Agentes
Algumas tarefas beneficiam de multiplos agentes:

| Tarefa | Agentes | Sequencia |
|--------|---------|----------|
| Nova feature | architecture → mobile → web → security | Paralelo: mobile+web |
| Landing page | copywriting → cro → seo-audit | Sequencial |
| Release | code-review (3) → performance → aso | Sequencial |
| Growth sprint | customer-research → marketing-ideas → content-strategy | Sequencial |
| Novo componente UI | ui-ux-web + ui-ux-mobile → code-review-architecture | Paralelo depois seq |

---

## Dependencias entre Agentes

```
customer-research ───┐
                      ├───▶ content-strategy ──▶ copywriting
competitor-profiling ─┘
                      ┌───▶ ads
marketing-ideas ─────┼───▶ social
                      └───▶ emails

ui-ux-mobile ───┐
               ├───▶ code-review-architecture
ui-ux-web ─────┘

analytics ────────▶ ab-testing ──▶ cro

seo-audit ──────┬─▶ programmatic-seo
               └─▶ schema
```

---

## Regras Globais (todos os agentes)

1. **Contexto:** antes de agir, ler `CONTEXT.md` e o skill SKILL.md relevante
2. **Tom:** portugues europeu, directo, sem emojis, tecnico mas acessivel
3. **Output:** actionable — cada recomendacao inclui o "como" (codigo, passos, ou template)
4. **Prioridade:** classificar findings por impacto (critico > alto > medio > baixo)
5. **Convencoes:** respeitar SEMPRE as decisoes do CONTEXT.md (stack, naming, patterns)
6. **Nao sobre-engenheirar:** o projecto e vanilla JS sem framework — propostas devem caber nesta realidade
7. **Nao contradizer:** agentes nao se contradizem; se houver conflito (ex: performance vs security), declarar o trade-off e deixar o humano decidir

---

## Configuracao (envs/secrets)

Para agentes que precisam de APIs externas:

| Agente | API Necessaria | Como |
|--------|----------------|------|
| Analytics | GA4 API | Measurement Protocol ou Admin API |
| SEO Audit | Google Search Console | OAuth ou service account |
| ASO | App Store Connect | API key (quando app iOS estiver live) |
| Ads | Google/Meta Ads API | OAuth tokens |
| Competitors | SimilarWeb/SEMrush | API key |

Para MVP: muitos agentes funcionam APENAS com analise de codigo/site (sem APIs externas). Priorizar estes.

---

## Roadmap de Activacao

### Fase 1 — Core (imediato)
- [x] UI/UX Mobile
- [x] UI/UX Web
- [x] Code Review: Security
- [x] Code Review: Performance
- [x] Code Review: Architecture
- [ ] Analytics (adaptar ao Foodboxd)
- [ ] SEO Audit (adaptar ao Foodboxd)

### Fase 2 — Growth (semana 1-2)
- [ ] Content Strategy (adaptar)
- [ ] Community Marketing (adaptar)
- [ ] Referrals (adaptar)
- [ ] CRO (adaptar)
- [ ] ASO (quando app iOS existir)

### Fase 3 — Scale (semana 3-4)
- [ ] Ads + Ad Creative
- [ ] Cold Email + Prospecting
- [ ] Competitor Profiling
- [ ] Customer Research

### Fase 4 — Data Layer (Databricks)
- [ ] Ingestao Firestore → Delta tables
- [ ] Dashboards automaticos (KPIs, retention, feature adoption)
- [ ] Alertas (churn risk, engagement drops)
- [ ] Agent Analytics (quais agentes dao mais valor)

---

## Metricas da Rede

Avaliar regularmente:
- **Agentes activos:** quantos foram usados esta semana
- **Findings criticos resolvidos:** seguranca + performance
- **Impacto medido:** metricas antes/depois de agir nas recomendacoes
- **Conflitos detectados:** recomendacoes contraditorias entre agentes
- **Cobertura:** % do codebase/site revisado por agentes
