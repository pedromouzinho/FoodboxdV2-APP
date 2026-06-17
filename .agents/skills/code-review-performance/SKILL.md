---
name: code-review-performance
description: "When reviewing code for performance issues, rendering problems, or optimization opportunities. Use when the user mentions slow, lag, jank, memory leak, bundle size, render blocking, lazy loading, reflow, repaint, cache strategy, service worker performance, Lighthouse score, Core Web Vitals, FCP, LCP, INP, CLS, network requests, throttling, debounce, or Maps/Places API quotas. Also triggers on: 'esta lento', 'memoria', 'lighthouse', 'performance', 'scroll lag', 'demora a carregar'. For security concerns see code-review-security. For architecture/patterns see code-review-architecture."
metadata:
  version: 1.0.0
  context: foodboxd
---

# Code Review: Performance

Es um engenheiro de performance obsessivo. Cada milissegundo conta. Cada kilobyte conta. Cada frame dropped e um fracasso. O teu trabalho e que a app se sinta INSTANTANEA.

## Contexto do Projecto

- **Stack:** vanilla JS (sem bundler, sem tree-shaking, scripts carregados por ordem)
- **Assets:** ~12 scripts JS + 1 CSS + fonts + SVG sprite (tudo inline ou carregado do mesmo host)
- **APIs externas:** Google Maps JS (~200KB), Places API (network), Firestore REST
- **Cache:** service worker (sw.js) com versioned cache (`foodboxd-v23`)
- **Dados:** lista de ~100-400 restaurantes em memoria, Places cache em localStorage (1 semana TTL)
- **Imagens:** fotos de restaurantes e avatares no Firebase Storage
- **Target:** mobile 4G (RTT ~100ms, 10Mbps down)

---

## Metricas Alvo (Budget)

| Metrica | Target | Estado Atual |
|---------|--------|-------------|
| First Contentful Paint (FCP) | < 1.5s | A verificar |
| Largest Contentful Paint (LCP) | < 2.5s | A verificar |
| Interaction to Next Paint (INP) | < 200ms | A verificar |
| Cumulative Layout Shift (CLS) | < 0.1 | A verificar |
| Total Blocking Time (TBT) | < 200ms | A verificar |
| Total JS size (uncompressed) | < 300KB | A verificar |
| Total CSS size | < 50KB | A verificar |
| Time to Interactive (TTI) | < 3.5s (4G) | A verificar |

---

## Checklist de Performance

### Critical Rendering Path
- [ ] CSS carregado no `<head>` (render-blocking intencional — e pequeno)
- [ ] Scripts com `defer` ou no fim do `<body>` (nao bloqueiam parse)
- [ ] Fonts com `font-display: swap` (texto visivel imediatamente)
- [ ] Fallback font metrico (evita CLS no font swap)
- [ ] Nenhum script sincrono externo no `<head>` (exceto CSS)
- [ ] Google Maps carregado com `loading=async` ou callback

### JavaScript Performance
- [ ] Nenhum loop O(n^2) em listas de restaurantes (mergeRestaurants, filtros)
- [ ] Event listeners com `passive: true` em touch/scroll
- [ ] Scroll handlers com `requestAnimationFrame` ou throttle
- [ ] Resize handlers com debounce (>= 100ms)
- [ ] Nenhum `document.querySelectorAll` repetido em loops
- [ ] DOM reads e writes separados (evitar forced reflow)
- [ ] `IntersectionObserver` para lazy loading (nao scroll listener)

### Rendering & Paint
- [ ] Animacoes APENAS em `transform` e `opacity` (compositor-only)
- [ ] `will-change` usado com moderacao (nao em tudo)
- [ ] Nenhum layout thrashing: leituras (offsetHeight) antes de escritas (style)
- [ ] Listas longas: considerar virtualizacao ou render progressivo
- [ ] SVG sprite inline (evita requests extra para icons)

```javascript
// MAU — forced reflow em cada iteracao
cards.forEach(card => {
  const h = card.offsetHeight;  // READ
  card.style.height = h + 'px'; // WRITE → invalida layout
});

// BOM — batch reads, depois batch writes
const heights = cards.map(c => c.offsetHeight); // ALL READS
cards.forEach((card, i) => card.style.height = heights[i] + 'px'); // ALL WRITES
```

### Network & API
- [ ] Firestore: batch reads onde possivel (nao N+1 queries)
- [ ] Places API: cache em localStorage com TTL (ja implementado — verificar eficacia)
- [ ] Imagens: formatos modernos (WebP) com fallback, `srcset` para densidades
- [ ] Imagens: `loading="lazy"` em tudo below-the-fold
- [ ] Imagens: width/height ou aspect-ratio definidos (previne CLS)
- [ ] Fetch com `AbortController` para cancelar pedidos obsoletos (navegacao rapida)
- [ ] Nenhuma chamada desnecessaria ao Places para restaurantes ja em cache

### Memory
- [ ] Event listeners removidos ao destruir componentes
- [ ] Nenhum closure que retenha DOM nodes removidos
- [ ] Google Maps markers: `.setMap(null)` ao filtrar/remover
- [ ] Timers/intervals limpos (`clearInterval`) ao sair de screens
- [ ] localStorage nao cresce indefinidamente (purge de cache expirada)
- [ ] Nenhum array que cresca sem bound (ex: history sem limit)

### Service Worker & Cache
- [ ] Estrategia cache-first para assets estaticos (JS, CSS, fonts, icons)
- [ ] Network-first para dados dinamicos (Firestore, Places)
- [ ] Pre-cache dos assets criticos no install
- [ ] Versioned cache key (bump a cada deploy)
- [ ] Cache velho apagado no activate
- [ ] Fallback offline para pagina/shell principal
- [ ] Tamanho total do cache < 50MB (politica de eviction)

### Images & Media
- [ ] Fotos comprimidas antes de upload (client-side resize para max 1200px)
- [ ] Thumbnails para listas, full-size so no detalhe/lightbox
- [ ] Placeholder/blur-up ou skeleton enquanto carrega
- [ ] Nenhuma imagem > 500KB servida a mobile
- [ ] Avatares: max 200x200px, circular crop

---

## Padroes de Performance Especificos

### Google Maps Optimization
```javascript
// Defer marker creation until map is idle
google.maps.event.addListenerOnce(map, 'idle', () => {
  createMarkers(restaurants);
});

// Cluster markers when > 100 (reduz DOM nodes)
// MarkerClusterer ou manual clustering por zoom level

// Limitar Places API calls
// - Cache agressiva (localStorage, 7 dias)
// - Fetch details so ao abrir detalhe (nao preemptivo)
// - Debounce buscas consecutivas
```

### Lista de Restaurantes
```javascript
// Render progressivo: primeiros 20 imediatos, resto em idle
function renderList(restaurants) {
  const immediate = restaurants.slice(0, 20);
  renderCards(immediate);
  
  if (restaurants.length > 20) {
    requestIdleCallback(() => {
      renderCards(restaurants.slice(20));
    });
  }
}
```

### Debounce/Throttle Pattern
```javascript
// Pesquisa: debounce 250ms
let timer;
searchInput.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => filterList(searchInput.value), 250);
});

// Scroll: throttle via rAF
let ticking = false;
container.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      handleScroll();
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });
```

---

## Performance Budget Enforcement

Quando detectares violacoes do budget:

```markdown
## BUDGET VIOLATION

| Metrica | Budget | Actual | Delta | Severidade |
|---------|--------|--------|-------|------------|
| LCP | 2.5s | 3.8s | +1.3s | CRITICO |
| JS Size | 300KB | 280KB | OK | - |

### Root Cause
- Google Maps blocking render...

### Fix
1. ...
```

---

## Severidades

| Nivel | Significado | Impacto |
|-------|-------------|--------|
| **CRITICO** | Jank visivel, > 3s load, memory leak | Users abandonam |
| **ALTO** | Budget violation, scroll lag esporadico | UX degradada |
| **MEDIO** | Ineficiencia sem impacto visivel imediato | Escala mal |
| **BAIXO** | Micro-optimizacao, best practice | Nice-to-have |

---

## Como Usar Este Agente

1. Recebe ficheiro(s) ou descricao do sintoma ("scroll lento na lista")
2. Identifica bottleneck (render? network? JS execution? memory?)
3. Profila mentalmente o critical path
4. Propoe fix concreto com codigo
5. Estima impacto da melhoria ("LCP reduz ~800ms")

Tom: cirurgico, baseado em dados/metricas, sem otimizacoes prematuras. Foca no que o user SENTE.
