# Databricks notebook source
# DBTITLE 1,Setup & Config
# Foodboxd Agent Orchestrator
# Multi-agent system that routes prompts to specialized agents running in parallel
# Uses Databricks Foundation Model APIs (pay-per-token) — no external API key needed!
# NO PIP INSTALL NEEDED — uses requests (always available)
print("Cell 1 OK — no dependencies to install.")

# COMMAND ----------

# DBTITLE 1,Imports & Client Init
import os
import json
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional

# --- CONFIG ---
# Uses requests directly to call Databricks Foundation Model APIs
# Pre-authenticated via workspace token — zero config, no pip install!

DATABRICKS_HOST = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiUrl().getOrElse(None)
DATABRICKS_TOKEN = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().getOrElse(None)

# Databricks pay-per-token endpoint names (Claude models hosted BY Databricks)
# Tiers:
#   expert = Opus 4.8  (tarefas complexas: code review, UI/UX deep analysis)
#   deep   = Sonnet 4.6 (mid complexity: strategy, routing, synthesis)
#   fast   = Haiku 4.5  (intensive non-complex: copywriting, emails, tactical)
MODELS = {
    "orchestrator": "databricks-claude-sonnet-4-6",   # Router + Synthesizer (mid)
    "expert": "databricks-claude-opus-4-8",           # Complex: code review, UI/UX
    "deep": "databricks-claude-sonnet-4-6",           # Mid: strategy, analytics, SEO
    "fast": "databricks-claude-haiku-4-5",            # Intensive non-complex: copy, emails
}

# Parallel execution config
MAX_PARALLEL_AGENTS = 5
AGENT_TIMEOUT = 180  # seconds per agent (increased for complex tasks)

# --- LLM CLIENT (via requests, no external packages needed) ---

def llm_call(model: str, messages: list, max_tokens: int = 4096) -> dict:
    """
    Call a Databricks Foundation Model API endpoint.
    Uses the OpenAI-compatible chat/completions format via requests.
    Returns dict with 'content', 'prompt_tokens', 'completion_tokens'.
    """
    url = f"{DATABRICKS_HOST}/serving-endpoints/{model}/invocations"
    headers = {
        "Authorization": f"Bearer {DATABRICKS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messages": messages,
        "max_tokens": max_tokens
    }
    
    resp = requests.post(url, headers=headers, json=payload, timeout=AGENT_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    
    # Extract content from OpenAI-compatible response
    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    
    return {
        "content": content,
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0)
    }


print(f"Databricks host: {DATABRICKS_HOST}")
print(f"Token: {'OK' if DATABRICKS_TOKEN else 'MISSING'}")
print(f"\nModels (Databricks-hosted, pay-per-token):")
for tier, model in MODELS.items():
    print(f"  [{tier:12}] {model}")
print(f"\nZero dependencies — usa requests (built-in). Sem pip install.")

# COMMAND ----------

# DBTITLE 1,Agent Registry — Load all skills from .agents/skills/
@dataclass
class AgentConfig:
    """Configuration for a specialized agent."""
    name: str
    skill_path: str
    system_prompt: str
    model_tier: str = "deep"  # orchestrator, deep, fast, expert
    description: str = ""
    
    @property
    def model(self) -> str:
        return MODELS.get(self.model_tier, MODELS["deep"])


def load_agents(base_path: str = "/Workspace/Users/x251367@bcpcorp.net/dbdeai/.agents") -> dict:
    """Load all agent skills from the .agents/skills/ directory."""
    agents = {}
    skills_path = Path(base_path) / "skills"
    
    # Load product-marketing context (shared by marketing agents)
    pm_context = ""
    pm_path = Path(base_path) / "product-marketing.md"
    if pm_path.exists():
        pm_context = pm_path.read_text()
    
    # Load infrastructure context (shared by ALL agents)
    infra_context = ""
    infra_path = Path(base_path) / "databricks-context.md"
    if infra_path.exists():
        infra_context = infra_path.read_text()
        print(f"  Infra context loaded: {len(infra_context)} chars")
    
    # Load AGENTS.md for orchestration rules
    agents_md = ""
    agents_md_path = Path(base_path) / "AGENTS.md"
    if agents_md_path.exists():
        agents_md = agents_md_path.read_text()
    
    # Model tier assignment by agent type
    tier_map = {
        # Code review = expert (needs deep analysis)
        "code-review-security": "expert",
        "code-review-performance": "expert",
        "code-review-architecture": "expert",
        "ui-ux-mobile": "expert",
        "ui-ux-web": "expert",
        # Strategy agents = deep
        "content-strategy": "deep",
        "seo-audit": "deep",
        "cro": "deep",
        "analytics": "deep",
        "pricing": "deep",
        "customer-research": "deep",
        # Quick/tactical agents = fast
        "copywriting": "fast",
        "copy-editing": "fast",
        "categorize": "fast",
        "emails": "fast",
        "sms": "fast",
        "social": "fast",
    }
    
    if not skills_path.exists():
        print(f"WARNING: Skills path not found: {skills_path}")
        return agents
    
    for skill_dir in sorted(skills_path.iterdir()):
        if not skill_dir.is_dir():
            continue
        
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue
        
        skill_content = skill_file.read_text()
        
        # Load references if they exist
        refs_content = ""
        refs_dir = skill_dir / "references"
        if refs_dir.exists():
            for ref_file in refs_dir.glob("*.md"):
                refs_content += f"\n\n--- {ref_file.name} ---\n" + ref_file.read_text()
        
        # Extract description from frontmatter
        description = ""
        if "description:" in skill_content:
            for line in skill_content.split("\n"):
                if line.strip().startswith("description:"):
                    description = line.split("description:", 1)[1].strip().strip('"')
                    break
        
        agent_name = skill_dir.name
        tier = tier_map.get(agent_name, "deep")
        
        # Build full system prompt
        system_prompt = skill_content
        if refs_content:
            system_prompt += "\n\n# REFERENCES\n" + refs_content
        # ALL agents get infrastructure context (Firebase, GCP, deploy, data model)
        if infra_context:
            system_prompt += "\n\n# INFRASTRUCTURE CONTEXT (Firebase + GCP)\n" + infra_context
        # Marketing agents additionally get product-marketing context
        if agent_name in ["content-strategy", "copywriting", "social", "emails", 
                          "ads", "ad-creative", "launch", "product-marketing",
                          "community-marketing", "referrals", "cold-email",
                          "analytics", "seo-audit", "aso", "cro", "pricing",
                          "customer-research", "lead-magnets", "marketing-ideas",
                          "marketing-psychology", "site-architecture"]:
            system_prompt += "\n\n# PRODUCT MARKETING CONTEXT\n" + pm_context
        
        agents[agent_name] = AgentConfig(
            name=agent_name,
            skill_path=str(skill_dir),
            system_prompt=system_prompt,
            model_tier=tier,
            description=description[:200]
        )
    
    return agents, agents_md, pm_context


# Load all agents
AGENT_REGISTRY, ORCHESTRATOR_CONTEXT, PM_CONTEXT = load_agents()
print(f"Loaded {len(AGENT_REGISTRY)} agents:")
for name, cfg in sorted(AGENT_REGISTRY.items()):
    print(f"  [{cfg.model_tier:6}] {name}")

# COMMAND ----------

# DBTITLE 1,Router — Decide which agents to invoke
ROUTER_SYSTEM = """Es o orquestrador central do Foodboxd agent network.
O teu UNICO trabalho e analisar o pedido do utilizador e decidir quais agentes especializados devem ser invocados.

Agentes disponiveis:
{agents_list}

Regras:
1. Escolhe 1 a 5 agentes (maximo) por pedido
2. Se o pedido e ambiguo, prefere menos agentes (2-3)
3. Code review completo = security + performance + architecture (sempre os 3)
4. UI review = ui-ux-mobile + ui-ux-web (ambos)
5. Agentes de marketing/content: inclui sempre o contexto de product-marketing
6. Se o pedido e APENAS uma pergunta simples, usa 1 agente

Responde APENAS com JSON valido (sem markdown, sem explicacao):
{{
  "agents": ["agent-name-1", "agent-name-2"],
  "reasoning": "breve justificacao",
  "parallel": true,
  "context_to_pass": "contexto adicional a enviar a cada agente (ex: ficheiro a analisar)"
}}
"""

def route_prompt(user_prompt: str, file_content: str = None) -> dict:
    """Use the orchestrator model to decide which agents to invoke."""
    
    # Build agents list for the router
    agents_list = "\n".join(
        f"- **{name}**: {cfg.description[:100]}" 
        for name, cfg in sorted(AGENT_REGISTRY.items())
    )
    
    system = ROUTER_SYSTEM.format(agents_list=agents_list)
    
    user_msg = f"PEDIDO DO UTILIZADOR:\n{user_prompt}"
    if file_content:
        user_msg += f"\n\nFICHEIRO ANEXO:\n```\n{file_content[:8000]}\n```"
    
    # Call Databricks Foundation Model API
    response = llm_call(
        model=MODELS["orchestrator"],
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg}
        ],
        max_tokens=800
    )
    
    # Parse JSON response
    text = response["content"].strip()
    # Handle potential markdown wrapping
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    
    import re
    try:
        routing = json.loads(text)
    except json.JSONDecodeError:
        # Try to extract agents array from partial JSON
        agents_match = re.findall(r'"([a-z-]+)"', text)
        valid_agents = [a for a in agents_match if a in AGENT_REGISTRY][:5]
        if valid_agents:
            routing = {"agents": valid_agents, "reasoning": "parsed from partial response", "parallel": True}
        else:
            # Last resort: infer from keywords in the prompt
            routing = {"agents": ["code-review-architecture"], "reasoning": "fallback", "parallel": True}
            if "segur" in user_prompt.lower() or "security" in user_prompt.lower():
                routing["agents"] = ["code-review-security"]
            elif "ux" in user_prompt.lower() or "mobile" in user_prompt.lower():
                routing["agents"] = ["ui-ux-mobile", "ui-ux-web"]
            elif "seo" in user_prompt.lower():
                routing["agents"] = ["seo-audit"]
            elif "review" in user_prompt.lower() or "revisa" in user_prompt.lower():
                routing["agents"] = ["code-review-security", "code-review-performance", "code-review-architecture"]
    
    # Validate agent names
    routing["agents"] = [a for a in routing.get("agents", []) if a in AGENT_REGISTRY]
    
    if not routing["agents"]:
        routing["agents"] = ["code-review-architecture"]  # safe fallback
    
    return routing

print("Router ready.")

# COMMAND ----------

# DBTITLE 1,Executor — Run agents in parallel
@dataclass
class AgentResult:
    """Result from a single agent execution."""
    agent_name: str
    model: str
    response: str
    duration_s: float
    tokens_in: int = 0
    tokens_out: int = 0
    error: Optional[str] = None


def run_single_agent(agent_name: str, user_prompt: str, context: str = "") -> AgentResult:
    """Execute a single agent with its specialized system prompt via Databricks Foundation Models."""
    
    agent = AGENT_REGISTRY[agent_name]
    start = time.time()
    
    try:
        user_msg = user_prompt
        if context:
            user_msg += f"\n\nCONTEXTO ADICIONAL:\n{context}"
        
        # Call Databricks Foundation Model API
        response = llm_call(
            model=agent.model,
            messages=[
                {"role": "system", "content": agent.system_prompt[:50000]},
                {"role": "user", "content": user_msg}
            ],
            max_tokens=4096
        )
        
        duration = time.time() - start
        
        return AgentResult(
            agent_name=agent_name,
            model=agent.model,
            response=response["content"],
            duration_s=round(duration, 2),
            tokens_in=response["prompt_tokens"],
            tokens_out=response["completion_tokens"]
        )
    
    except Exception as e:
        duration = time.time() - start
        return AgentResult(
            agent_name=agent_name,
            model=agent.model,
            response="",
            duration_s=round(duration, 2),
            error=str(e)
        )


def run_agents_parallel(agents: list, user_prompt: str, context: str = "") -> list:
    """Execute multiple agents in parallel using ThreadPoolExecutor."""
    
    results = []
    
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_AGENTS) as executor:
        futures = {
            executor.submit(run_single_agent, agent_name, user_prompt, context): agent_name
            for agent_name in agents
        }
        
        for future in as_completed(futures, timeout=AGENT_TIMEOUT * 2):
            agent_name = futures[future]
            try:
                result = future.result(timeout=AGENT_TIMEOUT)
                results.append(result)
                status = "OK" if not result.error else f"ERROR: {result.error[:50]}"
                print(f"  [{result.duration_s:5.1f}s] {agent_name} ({result.model.split('-')[1]}) — {status}")
            except Exception as e:
                results.append(AgentResult(
                    agent_name=agent_name,
                    model=AGENT_REGISTRY[agent_name].model,
                    response="",
                    duration_s=AGENT_TIMEOUT,
                    error=f"Timeout/Exception: {e}"
                ))
                print(f"  [TIMEOUT] {agent_name}")
    
    return sorted(results, key=lambda r: r.agent_name)

print("Parallel executor ready.")

# COMMAND ----------

# DBTITLE 1,Synthesizer — Combine parallel results into unified response
SYNTHESIZER_SYSTEM = """Es o sintetizador do Foodboxd agent network.
Recebes os outputs de multiplos agentes especializados que correram em paralelo.
O teu trabalho e:

1. Combinar os resultados numa resposta UNICA e coerente
2. Resolver conflitos (se um agente diz X e outro diz Y, nota o trade-off)
3. Priorizar por severidade (critico > alto > medio > baixo)
4. Remover redundancias
5. Manter o formato estruturado (headers, listas, codigo)

Regras:
- Portugues europeu, tom directo e tecnico
- Sem emojis
- Credita cada finding ao agente de origem: [security], [mobile], etc.
- Se um agente falhou, ignora-o
- Output maximo: ~3000 palavras (ser conciso mas completo)
"""

def synthesize_results(user_prompt: str, results: list, routing: dict) -> str:
    """Combine multiple agent results into a single coherent response."""
    
    # If only one agent, return its response directly (no synthesis needed)
    successful = [r for r in results if not r.error and r.response]
    
    if len(successful) == 0:
        return "Nenhum agente conseguiu responder. Verifica a API key e tenta novamente."
    
    if len(successful) == 1:
        return f"## [{successful[0].agent_name}]\n\n{successful[0].response}"
    
    # Build synthesis prompt
    agent_outputs = ""
    for r in successful:
        agent_outputs += f"\n\n{'='*60}\nAGENTE: {r.agent_name} (modelo: {r.model}, {r.duration_s}s)\n{'='*60}\n{r.response}"
    
    user_msg = f"""PEDIDO ORIGINAL DO UTILIZADOR:
{user_prompt}

AGENTES INVOCADOS: {', '.join(routing['agents'])}
RAZAO: {routing.get('reasoning', '')}

OUTPUTS DOS AGENTES:{agent_outputs}

Sintetiza tudo numa resposta unica, estruturada e actionable."""
    
    # Call Databricks Foundation Model API
    response = llm_call(
        model=MODELS["orchestrator"],
        messages=[
            {"role": "system", "content": SYNTHESIZER_SYSTEM},
            {"role": "user", "content": user_msg}
        ],
        max_tokens=6000
    )
    
    return response["content"]

print("Synthesizer ready.")

# COMMAND ----------

# DBTITLE 1,Main Interface — ask()
def ask(prompt: str, file_path: str = None, verbose: bool = True) -> str:
    """
    Main entry point: ask anything and the orchestrator delegates to the right agents.
    
    Args:
        prompt: Your question or request in natural language
        file_path: Optional path to a file to include as context (e.g., "js/app.js")
        verbose: Print progress and timing info
    
    Returns:
        Synthesized response from all relevant agents
    
    Examples:
        ask("faz code review completo", file_path="js/app.js")
        ask("como melhoro o SEO do foodboxd.pt")
        ask("revisa a UX mobile do detalhe do restaurante", file_path="js/app.js")
        ask("preciso de ideias para crescer para 100 users")
    """
    
    total_start = time.time()
    
    # 1. Load file context if provided
    file_content = None
    if file_path:
        full_path = Path("/Workspace/Repos/x251367@bcpcorp.net/dbdeai") / file_path
        if full_path.exists():
            file_content = full_path.read_text()
            if verbose:
                print(f"Ficheiro carregado: {file_path} ({len(file_content)} chars)")
        else:
            print(f"AVISO: ficheiro nao encontrado: {full_path}")
    
    # 2. Route: decide which agents to invoke
    if verbose:
        print("\n[1/3] ROUTING — a decidir quais agentes invocar...")
    
    routing = route_prompt(prompt, file_content)
    
    if verbose:
        print(f"  Agentes selecionados: {routing['agents']}")
        print(f"  Razao: {routing.get('reasoning', '')}")
        print(f"  Paralelo: {routing.get('parallel', True)}")
    
    # 3. Execute agents in parallel
    if verbose:
        print(f"\n[2/3] EXECUTING — a correr {len(routing['agents'])} agentes em paralelo...")
    
    context = routing.get("context_to_pass", "")
    if file_content:
        context += f"\n\nFICHEIRO ({file_path}):\n```\n{file_content}\n```"
    
    results = run_agents_parallel(routing["agents"], prompt, context)
    
    # 4. Synthesize results
    if verbose:
        print(f"\n[3/3] SYNTHESIZING — a combinar resultados...")
    
    final = synthesize_results(prompt, results, routing)
    
    # 5. Summary
    total_time = time.time() - total_start
    successful = [r for r in results if not r.error]
    total_tokens_in = sum(r.tokens_in for r in successful)
    total_tokens_out = sum(r.tokens_out for r in successful)
    
    if verbose:
        print(f"\n{'='*60}")
        print(f"CONCLUIDO em {total_time:.1f}s")
        print(f"  Agentes: {len(successful)}/{len(results)} OK")
        print(f"  Tokens: {total_tokens_in:,} in + {total_tokens_out:,} out")
        print(f"  Custo estimado: ~${(total_tokens_in*3 + total_tokens_out*15) / 1_000_000:.4f}")
        print(f"{'='*60}\n")
    
    return final


# Helper to display markdown output in notebook
def show(prompt: str, file_path: str = None):
    """Ask and display the result as markdown."""
    result = ask(prompt, file_path)
    displayHTML(f"<div style='font-family: system-ui; line-height: 1.6; max-width: 900px;'><pre style='white-space: pre-wrap;'>{result}</pre></div>")
    return result

print("""
╔════════════════════════════════════════════════╗
║   FOODBOXD AGENT ORCHESTRATOR                   ║
╠════════════════════════════════════════════════╣
║   Uso:                                          ║
║     ask("faz code review", file_path="js/app.js") ║
║     ask("como melhoro o SEO")                    ║
║     ask("revisa a UX mobile")                    ║
║     ask("ideias para crescer para 100 users")    ║
║     show("...")  # mesmo mas render markdown      ║
╚════════════════════════════════════════════════╝
""")

# COMMAND ----------

# DBTITLE 1,Plan-Then-Execute — Data Models
@dataclass
class TaskSpec:
    """A single task within an execution plan."""
    id: int
    feature: str
    agent: str
    description: str
    depends_on: list = field(default_factory=list)
    priority: str = "medium"
    effort: str = ""
    files: list = field(default_factory=list)
    status: str = "pending"  # pending, running, done, skipped
    result: Optional[AgentResult] = None

@dataclass
class ExecutionPlan:
    """Full execution plan returned by the planner."""
    goal: str
    features: list = field(default_factory=list)
    tasks: list = field(default_factory=list)
    total_effort: str = ""
    execution_order: str = ""
    risks: list = field(default_factory=list)
    approved: bool = False
    _raw: dict = field(default_factory=dict, repr=False)

    def show(self):
        """Display the plan in a readable format."""
        print(f"\n{'='*65}")
        print(f"  PLANO DE EXECUCAO")
        print(f"{'='*65}")
        print(f"\n  Objectivo: {self.goal}")
        print(f"  Esforco total: {self.total_effort}")
        print(f"\n  FEATURES ({len(self.features)}):")
        for i, f in enumerate(self.features, 1):
            prio = f.get('priority', 'medium')
            marker = {'high': '!!!', 'medium': ' ! ', 'low': '   '}.get(prio, '   ')
            print(f"    {marker} {i}. {f.get('name', '?')} [{prio}] ({f.get('effort', '?')})")
            print(f"          {f.get('rationale', '')}")
        
        print(f"\n  TASKS ({len(self.tasks)}):")
        for t in self.tasks:
            deps = f" <- depende de [{','.join(str(d) for d in t.depends_on)}]" if t.depends_on else ""
            print(f"    [{t.id:2}] @{t.agent:28} | {t.feature}")
            print(f"         {t.description[:90]}")
            print(f"         Esforco: {t.effort} | Files: {t.files}{deps}")
        
        if self.risks:
            print(f"\n  RISCOS: {', '.join(self.risks)}")
        print(f"\n  Ordem: {self.execution_order}")
        print(f"\n{'='*65}")
        print(f"  >>> approve(plan)              # executa TODAS as tasks")
        print(f"  >>> approve(plan, only=[1,2])   # executa so tasks 1 e 2")
        print(f"  >>> approve(plan, skip=[4,5])   # executa tudo MENOS 4 e 5")
        print(f"{'='*65}\n")

print("Plan data models ready.")

# COMMAND ----------

# DBTITLE 1,Plan-Then-Execute — plan() function
PLANNER_SYSTEM = """Es o planeador estrategico do Foodboxd agent network.
Recebes uma lista de funcionalidades/ideias e o teu trabalho e:

1. Analisar viabilidade de cada feature no contexto do projecto (vanilla JS, Firebase, PWA)
2. Priorizar por impacto vs esforco (quick wins primeiro)
3. Identificar dependencias entre features
4. Decompor cada feature em TASKS concretas, cada uma atribuida a UM agente
5. Estimar esforco por task (em horas)
6. Definir ordem de execucao (o que e paralelo vs sequencial)

Contexto tecnico do projecto:
- Stack: vanilla JS (IIFE modules), sem framework, sem bundler, sem TypeScript
- Firebase: Firestore (REST) + Auth (Google) + Storage + Hosting
- PWA + Capacitor (iOS nativo)
- Ficheiro principal: js/app.js (~1900 linhas)
- CSS: ficheiro unico css/style.css, custom properties (--*)
- Convencoes: createElement (nao innerHTML), sem emojis na UI, portugues europeu
- Deploy: firebase deploy --only hosting (estatico)

Agentes disponiveis (atribui UM agente por task):
{agents_list}

Responde APENAS com JSON valido (sem markdown wrapping, sem explicacao fora do JSON):
{{
  "goal": "descricao concisa do objectivo global",
  "features": [
    {{
      "name": "nome da feature",
      "priority": "high|medium|low",
      "effort": "Xh total",
      "rationale": "porque esta prioridade (1 frase)"
    }}
  ],
  "tasks": [
    {{
      "id": 1,
      "feature": "nome da feature (deve corresponder a um nome em features)",
      "agent": "nome-exacto-do-agente",
      "description": "instrucao concreta e especifica do que o agente deve produzir",
      "depends_on": [],
      "effort": "Xh",
      "files": ["caminho/ficheiro.js"]
    }}
  ],
  "execution_order": "descricao de como correr: paralelo onde possivel, sequencial onde ha dependencias",
  "risks": ["risco 1", "risco 2"],
  "total_effort": "Xh"
}}
"""


def plan(prompt: str, file_paths: list = None) -> ExecutionPlan:
    """
    Plan a course of action for features/ideas. Returns a plan to approve before execution.
    
    Args:
        prompt: Describe what you want (list of features, ideas, improvements)
        file_paths: Optional list of files to include as context
    
    Examples:
        p = plan("Quero: 1) dark mode 2) partilha por link 3) push notifications")
        p = plan("Melhorar performance e SEO", file_paths=["js/app.js", "index.html"])
        p = plan("Sistema de badges, gamification, streaks de visitas")
    """
    print(f"\n{'='*65}")
    print(f"  [PLANNER] Opus 4.8 a analisar e decompor...")
    print(f"{'='*65}")
    
    # Load files
    files_context = ""
    if file_paths:
        base = Path("/Workspace/Repos/x251367@bcpcorp.net/dbdeai")
        for fp in file_paths:
            full = base / fp
            if full.exists():
                content = full.read_text()
                files_context += f"\n\n--- {fp} (primeiras 4000 chars) ---\n{content[:4000]}"
                print(f"  Ficheiro: {fp} ({len(content)} chars)")
    
    # Build agents list
    agents_list = "\n".join(
        f"- {name} [{AGENT_REGISTRY[name].model_tier}]: {AGENT_REGISTRY[name].description[:80]}"
        for name in sorted(AGENT_REGISTRY.keys())
    )
    
    system = PLANNER_SYSTEM.format(agents_list=agents_list)
    user_msg = f"PEDIDO:\n{prompt}"
    if files_context:
        user_msg += f"\n\nFICHEIROS:{files_context}"
    
    start = time.time()
    response = llm_call(
        model=MODELS["expert"],  # Opus 4.8
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg}
        ],
        max_tokens=4096
    )
    duration = time.time() - start
    
    # Parse response
    text = response["content"].strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
    
    import re
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e1:
        # Try to fix common JSON issues from LLMs
        fixed = text
        # Remove trailing commas before } or ]
        fixed = re.sub(r',\s*([}\]])', r'\1', fixed)
        # Fix unescaped newlines inside strings
        fixed = re.sub(r'(?<=\")([^\"]*?)\n([^\"]*?)(?=\")', lambda m: m.group(0).replace('\n', '\\n'), fixed)
        try:
            data = json.loads(fixed)
        except json.JSONDecodeError:
            # Last resort: extract the JSON object
            match = re.search(r'\{.*\}', fixed, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group())
                except json.JSONDecodeError:
                    # Nuclear option: use ast.literal_eval-style repair
                    print(f"AVISO: JSON malformado, a tentar reparar...")
                    # Try truncating at last valid point
                    for end_pos in range(len(text), 100, -1):
                        try:
                            data = json.loads(text[:end_pos] + ']}')  
                            break
                        except:
                            try:
                                data = json.loads(text[:end_pos] + '"]}]}') 
                                break
                            except:
                                continue
                    else:
                        print(f"ERRO ao parsear resposta do planner (char {e1.pos}):\n{text[max(0,e1.pos-100):e1.pos+100]}")
                        data = {"goal": prompt, "features": [], "tasks": [], "total_effort": "?", "risks": []}
            else:
                print(f"ERRO: nenhum JSON encontrado na resposta")
                data = {"goal": prompt, "features": [], "tasks": [], "total_effort": "?", "risks": []}
    
    # Build TaskSpecs
    tasks = []
    for t in data.get("tasks", []):
        agent_name = t.get("agent", "code-review-architecture")
        if agent_name not in AGENT_REGISTRY:
            # Try fuzzy match
            matches = [a for a in AGENT_REGISTRY if agent_name in a or a in agent_name]
            agent_name = matches[0] if matches else "code-review-architecture"
        
        tasks.append(TaskSpec(
            id=t.get("id", len(tasks) + 1),
            feature=t.get("feature", ""),
            agent=agent_name,
            description=t.get("description", ""),
            depends_on=t.get("depends_on", []),
            priority=t.get("priority", "medium"),
            effort=t.get("effort", ""),
            files=t.get("files", [])
        ))
    
    exec_plan = ExecutionPlan(
        goal=data.get("goal", prompt),
        features=data.get("features", []),
        tasks=tasks,
        total_effort=data.get("total_effort", "?"),
        execution_order=data.get("execution_order", ""),
        risks=data.get("risks", []),
        _raw=data
    )
    
    tokens_in = response["prompt_tokens"]
    tokens_out = response["completion_tokens"]
    print(f"\n  Planeamento concluido em {duration:.1f}s ({tokens_in}+{tokens_out} tokens)")
    
    exec_plan.show()
    return exec_plan

print("plan() ready. Uso: p = plan('lista de features...')")

# COMMAND ----------

# DBTITLE 1,Plan-Then-Execute — approve() + execute()
def approve(exec_plan: ExecutionPlan, only: list = None, skip: list = None, stream: bool = True) -> str:
    """
    Approve and execute a plan. Each agent receives FULL context of the plan.
    STREAMING: prints each agent's output immediately when it finishes.
    
    Args:
        exec_plan: The plan returned by plan()
        only: Execute only these task IDs (e.g., [1, 2, 3])
        skip: Execute all EXCEPT these task IDs (e.g., [4, 5])
        stream: Print each agent's result immediately (default: True)
    
    Returns:
        Synthesized response from all executed agents
    """
    exec_plan.approved = True
    
    # Determine which tasks to run
    tasks_to_run = exec_plan.tasks[:]
    if only:
        tasks_to_run = [t for t in tasks_to_run if t.id in only]
    if skip:
        tasks_to_run = [t for t in tasks_to_run if t.id not in skip]
    
    if not tasks_to_run:
        return "Nenhuma task selecionada para execucao."
    
    print(f"\n{'='*65}")
    print(f"  [EXECUTING] Plano aprovado — {len(tasks_to_run)} tasks a executar")
    print(f"  Timeout por agente: {AGENT_TIMEOUT}s | Max paralelo: {MAX_PARALLEL_AGENTS}")
    print(f"  Streaming: {'ON' if stream else 'OFF'}")
    print(f"{'='*65}")
    
    # Build shared plan context that ALL agents will receive
    plan_context = f"""=== PLANO APROVADO (contexto partilhado) ===
OBJECTIVO GLOBAL: {exec_plan.goal}

TODAS AS TASKS DO PLANO:
{chr(10).join(f'  [{t.id}] @{t.agent}: {t.description[:60]}' for t in exec_plan.tasks)}

TASKS EM EXECUCAO AGORA (paralelo): {', '.join(f'[{t.id}] @{t.agent}' for t in tasks_to_run)}

IMPORTANTE:
- Foca-te APENAS na tua task especifica (indicada abaixo)
- Os outros agentes tratam das tasks deles — nao dupliques trabalho
- O plano foi APROVADO pelo utilizador — se assertivo, produz output concreto
- Produz codigo/recomendacoes ACTIONABLE, nao exploracoes teoricas
=== FIM DO CONTEXTO DO PLANO ==="""
    
    # Resolve dependencies: group tasks into waves
    waves = []
    executed_ids = set()
    remaining = tasks_to_run[:]
    
    while remaining:
        current_wave = [t for t in remaining if all(d in executed_ids for d in t.depends_on)]
        if not current_wave:
            current_wave = remaining[:]
        waves.append(current_wave)
        executed_ids.update(t.id for t in current_wave)
        remaining = [t for t in remaining if t.id not in executed_ids]
    
    print(f"\n  Waves de execucao: {len(waves)}")
    for i, wave in enumerate(waves, 1):
        print(f"    Wave {i}: {[f'[{t.id}] @{t.agent}' for t in wave]}")
    
    # Execute wave by wave with STREAMING output
    all_results = []
    total_start = time.time()
    completed_count = 0
    
    for wave_idx, wave in enumerate(waves, 1):
        print(f"\n  {'='*61}")
        print(f"  WAVE {wave_idx}/{len(waves)} — {len(wave)} agents em paralelo")
        print(f"  {'='*61}")
        
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_AGENTS) as executor:
            futures = {}
            for task in wave:
                task_prompt = f"""A TUA TASK ESPECIFICA (task #{task.id}):
Feature: {task.feature}
Instrucao: {task.description}
Ficheiros relevantes: {task.files}
Estado: APROVADO — produz output concreto e actionable."""
                
                # Load file contents for this task
                task_files_content = ""
                base = Path("/Workspace/Repos/x251367@bcpcorp.net/dbdeai")
                for fp in task.files:
                    full = base / fp
                    if full.exists():
                        content = full.read_text()
                        # Limit per file to avoid token overflow
                        task_files_content += f"\n\n--- {fp} ({len(content)} chars) ---\n{content[:80000]}"
                
                full_context = plan_context
                if task_files_content:
                    full_context += f"\n\nFICHEIROS DA TUA TASK:{task_files_content}"
                
                futures[executor.submit(
                    run_single_agent, task.agent, task_prompt, full_context
                )] = task
            
            # STREAMING: print each result immediately as it arrives
            for future in as_completed(futures, timeout=AGENT_TIMEOUT * 2):
                task = futures[future]
                try:
                    result = future.result(timeout=AGENT_TIMEOUT)
                    task.status = "done"
                    task.result = result
                    all_results.append(result)
                    completed_count += 1
                    
                    # === STREAM OUTPUT IMMEDIATELY ===
                    if stream and not result.error:
                        elapsed = time.time() - total_start
                        print(f"\n  {'~'*61}")
                        print(f"  [{completed_count}/{len(tasks_to_run)}] Task {task.id} @{task.agent} ")
                        print(f"  Feature: {task.feature} | {result.duration_s:.0f}s | {result.tokens_out} tokens out")
                        print(f"  {'~'*61}")
                        # Print first 2000 chars of the response
                        output_preview = result.response[:3000]
                        print(output_preview)
                        if len(result.response) > 3000:
                            print(f"\n  [...{len(result.response)-3000} chars mais — ver resultado completo no final]")
                        print(f"  {'~'*61}")
                    elif result.error:
                        print(f"  [ERRO] Task {task.id} @{task.agent} — {result.error[:80]}")
                    else:
                        print(f"  [OK] Task {task.id} @{task.agent} ({result.duration_s:.0f}s)")
                        
                except Exception as e:
                    task.status = "error"
                    err_result = AgentResult(
                        agent_name=task.agent, model=AGENT_REGISTRY[task.agent].model,
                        response="", duration_s=AGENT_TIMEOUT, error=str(e)
                    )
                    task.result = err_result
                    all_results.append(err_result)
                    completed_count += 1
                    print(f"  [FAIL] Task {task.id} @{task.agent} — {e}")
    
    # Synthesize all results
    successful = [r for r in all_results if not r.error and r.response]
    total_time = time.time() - total_start
    total_in = sum(r.tokens_in for r in successful)
    total_out = sum(r.tokens_out for r in successful)
    
    print(f"\n\n{'='*65}")
    print(f"  EXECUCAO COMPLETA em {total_time:.1f}s")
    print(f"  Tasks: {len(successful)}/{len(all_results)} OK")
    print(f"  Tokens: {total_in:,} in + {total_out:,} out")
    print(f"  Custo estimado: ~${(total_in*15 + total_out*75) / 1_000_000:.2f} (Opus)")
    print(f"                  ~${(total_in*3 + total_out*15) / 1_000_000:.2f} (se Sonnet)")
    print(f"{'='*65}")
    
    if len(successful) > 1:
        print(f"\n  [SYNTHESIZING] A combinar {len(successful)} resultados...")
        routing = {
            "agents": [t.agent for t in tasks_to_run],
            "reasoning": f"Plano aprovado: {exec_plan.goal}"
        }
        final = synthesize_results(exec_plan.goal, all_results, routing)
        print(f"\n{'='*65}")
        print(f"  SINTESE FINAL:")
        print(f"{'='*65}")
        print(final)
        return final
    elif len(successful) == 1:
        return successful[0].response
    else:
        return "Nenhum agente respondeu com sucesso."

print("""approve() ready [STREAMING MODE].

Fluxo:
  1. p = plan("features...")
  2. result = approve(p)   # streaming: mostra cada resultado ao vivo
  Timeout: """ + str(AGENT_TIMEOUT) + """s por agente
""")

# COMMAND ----------

# DBTITLE 1,Exemplo — Plan + Approve (Features)
# =====================================================
# PLAN: Fix photo bugs (Places intermitente + Grid overlap)
# =====================================================

p = plan("""
Bugs a corrigir no sistema de fotos (mobile PWA + Safari iOS):

1. FOTOS GOOGLE PLACES NAO CARREGAM (intermitente)
   CAUSA RAIZ IDENTIFICADA: TTL desalinhado no cache.
   - O cache local (Storage.setCachedPlace) guarda URLs do Places com TTL de 7 dias
   - Mas os tokens nas URLs do Places expiram em horas (sao session tokens)
   - Resultado: cache hit com URL expirada = 403 = imagem nao aparece
   - Mesmo restaurante funciona num dia (cache miss = URL fresca) e falha noutro (cache hit = URL morta)
   CAUSA SECUNDARIA: referrerPolicy="no-referrer" nos <img> conflita com a restricao por HTTP referrer na API key do Google.
   FIXES NECESSARIOS:
   a) places.js: TTL separado de 6h para URLs de fotos (campo photosFetchedAt)
   b) places.js: funcao refreshPhotos() que so re-fetcha fotos sem repetir todo o getDetails
   c) app.js: retry com fallback no array de URLs + invalidacao de cache quando todas falham
   d) app.js: remover referrerPolicy="no-referrer" dos imgs de Places
   e) js/storage.js: adicionar clearCachedPlace(id) para invalidacao

2. FOTOS UPLOADED FAZEM OVERLAP NO GRID
   CAUSA RAIZ IDENTIFICADA: CSS incompleto.
   - .photo-grid e .photo-tile nao tem aspect-ratio definido
   - Browser reserva 0px antes do load, depois a imagem empurra o layout (CLS)
   - Mix de fotos verticais e horizontais piora porque alturas intrinsecas sao diferentes
   - Em iOS Safari o reflow e mais agressivo
   FIXES NECESSARIOS:
   a) css/style.css: .photo-grid com display:grid + gap
   b) css/style.css: .photo-tile com aspect-ratio:1/1, position:relative, overflow:hidden
   c) css/style.css: .photo-tile img com position:absolute + inset:0 + object-fit:cover
   d) css/style.css: .gallery (strip horizontal) com flex:0 0 auto nos filhos + aspect-ratio
   e) app.js: photoTile() e paintPhotoGrid() devem usar createElement (nao innerHTML) com as classes correctas
""", file_paths=["js/places.js", "css/style.css"])

# COMMAND ----------

# DBTITLE 1,Exemplo — Code Review Completo
# Aprovar e executar o plano completo (8 tasks, streaming)
result = approve(p)

# COMMAND ----------

# DBTITLE 1,Exemplo — Growth Strategy
# Exemplo: Pedir ideias de growth
# Descomenta para correr:

# result = ask("Preciso de um plano para crescer de 10 para 100 utilizadores activos. Que canais e tacticas devo usar?")
# print(result)

# COMMAND ----------

# DBTITLE 1,Exemplo — UI/UX Review
# Exemplo: Review de UX mobile + web
# Descomenta para correr:

# result = ask("Revisa a UX do detalhe do restaurante (mobile e desktop)", file_path="js/app.js")
# print(result)

# COMMAND ----------

# DBTITLE 1,Configurar API Key (Databricks Secrets)
# ============================================================
# MODELOS DISPONIVEIS (Databricks Foundation Model APIs)
# ============================================================
#
# ZERO CONFIG: autenticacao automatica via workspace token.
# Nao precisas de API key, secret scope, nem configuracao extra.
#
# Modelos Claude disponiveis (pay-per-token, hosted by Databricks):
#   - databricks-claude-opus-4-8      (expert: complex analysis)
#   - databricks-claude-sonnet-4-6    (deep: mid complexity, routing)
#   - databricks-claude-haiku-4-5     (fast: intensive non-complex)
#
# Outros modelos disponiveis no workspace:
#   - databricks-meta-llama-3-3-70b-instruct  (open-source, gratis)
#   - databricks-dbrx-instruct                (Databricks own model)
#
# Para mudar modelos, edita o dict MODELS na celula de config.
# Exemplo: trocar "fast" para Llama (gratis, open-source):
#   MODELS["fast"] = "databricks-meta-llama-3-3-70b-instruct"
#
# ============================================================
# ALTERNATIVA: API Anthropic directa (se preferires)
# ============================================================
# %pip install anthropic
# from anthropic import Anthropic
# client = Anthropic(api_key=dbutils.secrets.get("foodboxd", "anthropic-api-key"))
# (requer adaptar as chamadas de client.chat.completions para client.messages)
#
# ============================================================
# CUSTOS ESTIMADOS (pay-per-token)
# ============================================================
# Opus 4.8:  ~$15/M input + ~$75/M output tokens  (complex tasks)
# Sonnet 4.6: ~$3/M input + ~$15/M output tokens   (mid complexity)
# Haiku 4.5:  ~$0.80/M input + ~$4/M output tokens  (non-complex intensive)
#
# Custos por tipo de ask():
#   Code review completo (3x Opus):      ~50K in + ~6K out = ~$1.20
#   Growth strategy (2x Sonnet + Haiku): ~40K in + ~5K out = ~$0.30
#   Copy/tactical (3x Haiku):            ~30K in + ~4K out = ~$0.04
#
# Dica: usa Haiku para iteracao rapida, Opus so para analise profunda.
print("Modelos Databricks Foundation Model APIs - zero config needed.")
