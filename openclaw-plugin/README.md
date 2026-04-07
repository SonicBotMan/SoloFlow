<div align="center">

# ⚡ SoloFlow

### Workflow Orchestration for the AI Agent Era

**Turn chaotic multi-step AI tasks into structured, observable, retryable workflows.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/runtime-Node.js%20%3E%3D22-339933?logo=node.js)](https://nodejs.org)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Bundle](https://img.shields.io/badge/bundle-~500KB-orange)](./dist)
[![Tools](https://img.shields.io/badge/tools-15%20registered-blue)](./src)

```
  ███████╗███████╗ ██████╗ ███╗   ██╗ ██████╗ ███████╗██╗         ██████╗ ██╗      ██████╗
  ██╔════╝██╔════╝██╔═══██╗████╗  ██║██╔═══██╗██╔════╝██║         ██╔══██╗██║     ██╔════╝
  ███████╗█████╗  ██║   ██║██╔██╗ ██║██║   ██║███████╗██║         ██████╔╝██║     ██║     
  ╚════██║██╔══╝  ██║   ██║██║╚██╗██║██║   ██║╚════██║██║         ██╔═══╝ ██║     ██║     
  ███████║██║     ╚██████╔╝██║ ╚████║╚██████╔╝███████║███████╗     ██║     ███████╗╚██████╗
  ╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚══════╝     ╚═╝     ╚══════╝ ╚═════╝
```

| Metric | Value |
|:-------|:------|
| Bundle size | ~500KB |
| Source files | 78 TypeScript files |
| Language | TypeScript (strict) |
| Runtime | Node.js >= 22 |
| Registered tools | 15 |

</div>

---

## The Problem

Current AI agent frameworks force a painful choice: **structure** or **flexibility**. You either get rigid pipelines that break when reality deviates, or free-form agents that spiral into chaos.

The real pain runs deeper:

- **No memory.** Every task starts from zero. Agents relearn what they already knew yesterday, burning tokens and time.
- **No discipline.** A quick lookup hits the same heavyweight model as a deep architecture review. Costly, slow, wasteful.
- **No visibility.** Multi-step tasks run as black boxes. When something fails, you're left guessing which step broke and why.
- **No learning.** Your agents repeat the same workflows manually, every single time. Patterns stay invisible.
- **No recovery.** A timeout or API blip at step 7 of 10 means starting over from scratch.

Teams shipping AI-powered products need workflows that are **observable**, **resilient**, and **intelligent** about how they route work. Existing tools deliver one or two of these. SoloFlow delivers all three.

---

## The Solution

SoloFlow is a workflow orchestration plugin for [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) that transforms messy multi-step AI tasks into structured DAG pipelines. Each step gets routed to the right agent, governed by a strict state machine, wrapped in retry logic, and backed by a cognitive memory system that actually remembers.

Here's what that looks like:

```typescript
// Define a 3-step code review pipeline
const { id } = await api.rpc.call("workflow.create", {
  steps: [
    { id: "read",    name: "Fetch diff",       discipline: "quick",      dependencies: [],          config: { prompt: "..." } },
    { id: "analyze", name: "Find issues",      discipline: "ultrabrain", dependencies: ["read"],    config: { prompt: "..." } },
    { id: "report",  name: "Write review",     discipline: "deep",       dependencies: ["analyze"], config: { prompt: "..." } },
  ],
});

await api.rpc.call("workflow.start", { id });
// Steps execute in parallel where possible, retry on failure, and track every state change.
```

**Four key capabilities set SoloFlow apart:**

1. **Discipline-Aware Routing** tasks land on the right agent automatically
2. **Cognitive Memory** agents remember across sessions with a science-backed forgetting curve
3. **Skill Evolution** repeated patterns get detected and packaged into reusable skills
4. **DAG + FSM Hybrid** workflow graph expressiveness meets state machine rigor

---

## Who It's For

**Developer building AI-powered tools.** You wire LLM calls together with bash scripts and prayer. SoloFlow gives you a proper scheduler, retry logic, and state machine so your pipeline stops breaking at 2am.

```typescript
// Before: fragile chaining
const data = await callLLM("fetch data");          // no retry
const result = await callLLM("analyze " + data);   // no memory
const report = await callLLM("report " + result);  // no observability

// After: structured workflow
const { id } = await api.rpc.call("workflow.create", { steps: pipeline });
await api.rpc.call("workflow.start", { id });  // retry, logging, memory all built in
```

**Researcher running complex experiments.** Your workflow is a DAG: gather papers, extract claims, run analysis, synthesize findings. SoloFlow models that DAG natively, executes layers in parallel, and remembers what worked last time.

**Team lead deploying AI agents at scale.** You need structured workflows, cognitive memory, and self-evolving skills. SoloFlow provides the workflow engine that makes agent systems reliable enough for production.

**Investor evaluating the agent orchestration space.** The AI agent market is projected to hit $65B+ by 2030. SoloFlow occupies the infrastructure layer: the picks and shovels that every agent deployment needs. It's not another chatbot wrapper. It's the workflow engine that makes agent systems reliable enough for production.

---

## Product Story

The idea started with a frustration: every AI agent framework treated workflow as an afterthought. You'd describe a task, the agent would run it, and if something went wrong halfway through, you'd start over. No checkpoint. No resume. No memory of what worked.

SoloFlow was built to fix that. It treats agent workflows as first-class citizens: directed acyclic graphs with finite state machine guards, discipline-aware routing, and a three-tier memory system that lets agents learn from experience.

The vision is an agent ecosystem where workflows compose, skills evolve, and teams share patterns through a marketplace. Where deploying a new agent pipeline is as easy as pulling a template. Where the system gets better at its job every time it runs.

---

## Market

The AI agent infrastructure market is growing fast. Gartner projects that by 2028, 33% of enterprise software will include agentic AI, up from less than 1% in 2024. The TAM for agent orchestration tooling alone is estimated at $8-12B by 2027.

**Why now:**

- LLM costs dropped 90% in 18 months, making multi-step agent workflows economically viable for the first time.
- Enterprise teams are moving from "can we use AI?" to "how do we run AI in production?" and hitting workflow management walls.
- No dominant standard exists for agent workflow orchestration. The field is fragmented.

### Competitive Landscape

| Feature | SoloFlow | CrewAI | LangGraph | AutoGPT | n8n |
|:--------|:---------|:-------|:----------|:--------|:----|
| DAG workflow engine | Yes | Partial | Yes | No | Yes |
| FSM state machine | Yes | No | Partial | No | No |
| Discipline-aware routing | Yes | No | No | No | No |
| Cognitive memory (3-tier) | Yes | No | No | Partial | No |
| Forgetting curve | Yes | No | No | No | No |
| Skill auto-evolution | Yes | No | No | No | No |
| Visual builder | ✅ | No | Yes (Studio) | No | Yes |
| Agent marketplace | Future | No | No | No | Yes |
| OpenClaw integration | Native | No | No | No | No |
| Multi-user RBAC | Future | No | No | No | Yes |

SoloFlow is the only solution that combines structured workflow execution with intelligent routing, cognitive memory, and self-evolving skills in a single package.

---

## Architecture

SoloFlow sits as a plugin inside the OpenClaw host, exposing slash commands, RPC methods, and shared services.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          OpenClaw Host                              │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐   │
│  │  Commands     │   │    RPC       │   │      Services         │   │
│  │  /workflow    │   │  10 methods  │   │ state · scheduler     │   │
│  │  /wf (alias)  │   │  JSON-RPC    │   │ agent · hooks         │   │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬────────────┘   │
│         └──────────────────┼──────────────────────┘                 │
│                            ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    SoloFlow Plugin Core                       │   │
│  │                                                              │   │
│  │  ┌──────────────────┐    ┌────────────────────────────────┐ │   │
│  │  │  WorkflowService  │    │         Scheduler              │ │   │
│  │  │  (CRUD + FSM)     │    │  (DAG execution loop)          │ │   │
│  │  └────────┬─────────┘    └─────────────┬──────────────────┘ │   │
│  │           │                            │                    │   │
│  │  ┌────────▼──────────┐    ┌────────────▼──────────────────┐ │   │
│  │  │       DAG          │    │    Discipline Agents          │ │   │
│  │  │  toposort · deps   │    │  deep · quick · visual        │ │   │
│  │  │  cycle detection   │    │  · ultrabrain                 │ │   │
│  │  └───────────────────┘    └───────────────────────────────┘ │   │
│  │                                                              │   │
│  │  ┌──────────────────┐    ┌────────────────────────────────┐ │   │
│  │  │  Three-Tier       │    │    Skill Evolution             │ │   │
│  │  │  Memory System    │    │  pattern detect · SKILL.md     │ │   │
│  │  │  W / E / S tiers  │    │  auto-generate · score         │ │   │
│  │  └──────────────────┘    └────────────────────────────────┘ │   │
│  │                                                              │   │
│  │  ┌──────────────────┐    ┌────────────────────────────────┐ │   │
│  │  │   HookSystem      │    │       Planner                 │ │   │
│  │  │  lifecycle events  │    │  interview · classify         │ │   │
│  │  │  custom handlers   │    │  template generation          │ │   │
│  │  └──────────────────┘    └────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Source Layout

```
src/
├── index.ts                    # Plugin entry: activate / deactivate
├── types.ts                    # Shared type definitions (297 lines)
├── core/
│   ├── dag.ts                  # DAG builder, toposort, cycle detection
│   └── fsm.ts                  # FSM transition validation
├── agents/
│   ├── index.ts                # Agent step executor
│   └── discipline.ts           # 4 discipline configs, keyword router, agent class
├── services/
│   ├── workflow-service.ts     # Workflow CRUD, FSM transitions, events
│   ├── scheduler.ts            # DAG execution loop, retry, timeout, concurrency
│   ├── planner.ts              # Interview-style planner
│   └── template-registry.ts    # Template management
├── memory/
│   ├── working-memory.ts       # Volatile workflow context
│   ├── episodic-memory.ts      # Compressed execution history
│   ├── semantic-memory.ts      # Facts, skills, forgetting curve
│   └── bridge.ts               # LobsterPress adapter
├── skills/
│   ├── evolver.ts              # Pattern detection, SKILL.md generation
│   ├── task-detector.ts        # Repeatable pattern identification
│   └── registry.ts             # Skill CRUD and scoring
├── vector/
│   ├── embedder.ts             # Vector embedding generation
│   ├── indexer.ts              # Vector index management
│   └── retriever.ts            # Similarity search
├── mcp/
│   ├── server.ts               # MCP server for tool integration
│   └── soloflow-tools.ts       # Built-in MCP tools
├── visual/
│   └── yaml-sync.ts            # YAML ↔ visual builder sync
├── api/
│   ├── router.ts               # REST API router
│   ├── websocket.ts            # WebSocket real-time updates
│   └── middleware/auth.ts      # JWT authentication
├── multiuser/
│   ├── auth.ts                 # Authentication
│   ├── rbac.ts                 # Role-based access control
│   └── namespace.ts            # Multi-tenant isolation
├── marketplace/
│   ├── registry.ts             # Plugin registry
│   ├── publisher.ts            # Publishing workflow
│   └── ratings.ts              # Community ratings
├── hooks/index.ts              # Lifecycle hooks + OpenClaw bridge
├── commands/index.ts           # /workflow slash commands
└── rpc/index.ts                # 10 RPC method router
```

---

### Cognitive Memory Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SoloFlow Memory System                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐  │
│  │   Working     │    │      Episodic Memory         │  │
│  │   Memory      │    │  ┌─────────────────────────┐ │  │
│  │  (session)    │    │  │  FTS5 Full-Text Search   │ │  │
│  │  ──────────── │    │  │  + Vector Embeddings     │ │  │
│  │  • Context    │    │  │  + Semantic Forgetting   │ │  │
│  │  • Scratch    │    │  │  + C-HLR+ Half-Life      │ │  │
│  │  • Current    │    │  └─────────────────────────┘ │  │
│  │    Task       │    │  DAG Tree Compression        │  │
│  └──────┬───────┘    └──────────────┬───────────────┘  │
│         │                           │                   │
│         ▼                           ▼                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Unified Retriever (RRF Fusion)       │  │
│  │     FTS5 + Vector + Semantic + InMemory          │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │             R³Mem Entity Graph                    │  │
│  │  Document → Paragraph → Entity Extraction         │  │
│  │  • Person / Project / Tool / Concept              │  │
│  │  • Entities outlive documents                     │  │
│  │  • Auto-inject on workflow completion             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Semantic Memory (Long-term)            │  │
│  │  • Knowledge facts with confidence scores         │  │
│  │  • Spaced repetition + forgetting curve           │  │
│  │  • SQLite + optional LobsterPress compression     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Unique Innovations

### 1. Discipline-Aware Routing

Tasks automatically route to specialized agents based on content analysis. No manual configuration required.

```typescript
import { routeToDiscipline } from "@soloflow/openclaw-plugin";

routeToDiscipline("Research quantum computing applications in drug discovery");
// → "deep" (thorough research agent, claude-3-opus)

routeToDiscipline("Quick lookup: what's the capital of Uruguay?");
// → "quick" (fast agent, claude-3-haiku)

routeToDiscipline("Design a responsive dashboard layout with dark mode");
// → "visual" (UI agent, claude-3-sonnet)

routeToDiscipline("Optimize this O(n²) algorithm to O(n log n)");
// → "ultrabrain" (reasoning agent, o1)
```

Each discipline ships with tuned defaults for model, token limits, temperature, and tool access:

| Discipline | Model | Max Tokens | Temp | Default Tools |
|:-----------|:------|:-----------|:-----|:--------------|
| `deep` | claude-3-opus | 8,192 | 0.3 | web-search, code-runner, data-analysis |
| `quick` | claude-3-haiku | 2,048 | 0.5 | web-search, http-request |
| `visual` | claude-3-sonnet | 4,096 | 0.6 | image-gen, screenshot, browser |
| `ultrabrain` | o1 | 16,384 | 0.2 | code-runner, data-analysis, web-search |

Routing uses weighted keyword matching. Longer keyword matches score higher, so "deep dive" wins over "deep" for the deep discipline.

### 2. Cognitive Memory (Three-Tier)

Inspired by human memory models from cognitive science. Three distinct tiers, each with its own storage strategy, eviction policy, and retrieval mechanism.

```
┌─────────────────────────────────────────────────────────┐
│                   Three-Tier Memory                      │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │  Working Memory  │  │     Episodic Memory           │  │
│  │                  │  │                                │  │
│  │  Current context │  │  Past executions (compressed) │  │
│  │  Step results    │  │  DAG-structured summaries     │  │
│  │  User input      │  │  Success/failure patterns     │  │
│  │                  │  │                                │  │
│  │  LRU eviction    │  │  Capacity-triggered compress  │  │
│  │  256 entries     │  │  Raw data → DAG skeleton      │  │
│  └─────────────────┘  └──────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Semantic Memory                          ││
│  │                                                       ││
│  │  Facts · Preferences · Skills · Patterns · Rules     ││
│  │                                                       ││
│  │  Forgetting curve:  R(t) = base × e^(-t/stability)   ││
│  │  Access count boosts stability                       ││
│  │  Vector embeddings for similarity search             ││
│  │  LobsterPress backend for persistence                ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Working Memory** holds the current workflow's step results, user inputs, and system state. LRU eviction keeps it bounded at 256 entries. This is volatile: it clears between workflow runs.

**Episodic Memory** stores compressed records of past workflow executions. When capacity is reached, raw execution data gets compressed into DAG skeletons that preserve structure while discarding transient details.

**Semantic Memory** is the long-term knowledge store. It implements a forgetting curve derived from Ebbinghaus's research on memory retention:

```
R(t) = base × e^(-t / stability)
```

Where `stability` scales with importance (range: 0.5x to 1.5x the base half-life of 14 days). Every time a fact is retrieved, its access count increments and its effective stability increases. Facts that fall below the retrievability threshold (default: 0.45) get pruned automatically.

### 3. Skill Evolution

SoloFlow watches your workflows and detects repeatable patterns. When it spots the same sequence of steps recurring across multiple runs, it proposes a reusable skill:

```
Workflow run 1: fetch-data → analyze → chart     ─┐
Workflow run 2: fetch-data → analyze → chart      ├── Pattern detected!
Workflow run 3: fetch-data → analyze → chart     ─┘
                                                    │
                                                    ▼
                                        Auto-generated Skill
                                        with SKILL.md docs
```

The `SkillEvolver` evaluates patterns using an LLM (when available) to determine if a pattern is coherent enough to become a skill. Each skill gets scored on four dimensions:

- **Success rate** (40% weight): how often does this pattern complete without errors?
- **Usage frequency** (30%): how often does it recur?
- **Recency** (20%): is it still relevant?
- **Simplicity** (10%): simpler skills compose better

Generated skills produce `SKILL.md` documentation automatically, making them shareable and discoverable.

### 4. DAG + FSM Hybrid

### 5. Visual Builder

Drag-and-drop DAG workflow editor accessible at `/soloflow/builder`. SVG-based canvas with:
- Draggable nodes with dependency connections
- Real-time execution status (auto-polling every 2s)
- Template gallery for one-click workflow creation
- Dark theme, zero external dependencies

---

The DAG (Directed Acyclic Graph) defines *what* steps exist and *in what order* they can run. The FSM (Finite State Machine) defines *what states* a workflow can be in and *which transitions* are legal.

```
FSM State Transitions:

  idle ──→ queued ──→ running ──→ completed
    │         │         │   ↑
    │         │         │   │
    │         │         ├──→ paused ──→ running
    │         │         │
    │         │         ├──→ failed ──→ queued (retry)
    │         │         │
    │         └──→ cancelled ──→ queued (retry)
    │                   ↑
    └───────────────────┘  (force cancel)
```

The DAG scheduler computes topological layers and runs each layer in parallel, bounded by a concurrency semaphore. Individual step failures don't crash the whole workflow: downstream steps with failed dependencies get skipped, and the workflow reports partial completion.

```typescript
// DAG layers from a 5-step pipeline:
//   Layer 0: [fetch-api, fetch-db]         ← parallel
//   Layer 1: [merge-data]                  ← waits for Layer 0
//   Layer 2: [analyze, generate-charts]    ← parallel
//   Layer 3: [compile-report]              ← waits for Layer 2
```

The scheduler wraps each step with exponential backoff retry (`delay = backoffMs × 2^attempt`) and per-step timeouts. Workflow-level timeouts are computed as `stepTimeout × totalSteps × 5` to prevent runaway execution.

---

## Research Foundation

SoloFlow's memory system is built on foundations from cognitive science and the [LobsterPress](https://github.com/SonicBotMan/lobster-press) memory engine:

**Ebbinghaus Forgetting Curve** (1885). The core insight: memory retention decays exponentially without reinforcement. SoloFlow implements this as `R(t) = base × e^(-t/stability)`, where retrieval events boost stability. This is the same model Anki and other spaced repetition systems use.

**Multi-Store Memory Model** (Atkinson & Shiffrin, 1968). Working, episodic, and semantic memory map to sensory register, short-term store, and long-term store respectively. Each tier has distinct capacity limits, retention characteristics, and transfer mechanisms.

**DAG Compression for Episodic Memory** builds on graph summarization research. Raw execution traces get compressed to DAG skeletons that preserve structural information while discarding transient detail, similar to how human episodic memory retains the shape of past events while losing specifics.

The `LobsterPressAdapter` interface bridges SoloFlow's memory to the LobsterPress backend for persistent vector storage and cross-session retrieval.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 22
- [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) >= 2.0.0 with Gateway >= 2.0.0

### Install

```bash
# Clone the SoloFlow repo into your OpenClaw plugins directory (or symlink this folder)
git clone https://github.com/SonicBotMan/SoloFlow.git
cd SoloFlow/openclaw-plugin

npm install
npm run build
```

### Configure

Register the plugin in your OpenClaw configuration:

```jsonc
// openclaw.config.json
{
  "plugins": {
    "workflow-orchestration": {
      "enabled": true,
      "config": {
        "gatewayUrl": "ws://localhost:3000",
        "maxConcurrentWorkflows": 10,
        "defaultTimeout": 300000,
        "retryPolicy": {
          "maxAttempts": 3,
          "backoffMs": 1000
        }
      }
    }
  }
}
```

Set environment variables:

```bash
export WORKFLOW_ENGINE_API_KEY="your-api-key"
export WORKFLOW_GATEWAY_URL="ws://localhost:3000"
```

### Quick Start (3 steps)

SoloFlow works through your AI agent — just ask naturally. No slash commands needed.

**Step 1: Install & Restart**

```bash
# Install via ClawHub
clawhub install soloflow

# Restart gateway to load the plugin
openclaw gateway restart
```

**Step 2: Create Your First Workflow**

Just tell your agent what you need. Examples:

```
"Create a 3-step workflow: research AI frameworks (deep), analyze findings (ultrabrain), write a report (deep)"
```

Or use the tool directly:

```
→ soloflow_create(name="Code Review", steps=[
    {id: "read", name: "Read code", discipline: "deep", action: "Review the PR diff"},
    {id: "analyze", name: "Analyze", discipline: "ultrabrain", action: "Find issues and suggest fixes", dependencies: ["read"]},
    {id: "report", name: "Report", discipline: "quick", action: "Summarize findings", dependencies: ["analyze"]}
  ])
```

**Step 3: Start & Monitor**

```
→ soloflow_start(workflowId="...")
→ soloflow_status(workflowId="...")
```

The agent automatically executes steps in dependency order, routing each to the right discipline model.

### Visual Builder

Open `/soloflow/builder` in your browser for a drag-and-drop DAG editor:

- Create workflows visually with drag-and-drop
- Edit node prompts by double-clicking
- Start / cancel / save workflows
- Real-time execution status (auto-refresh)
- Template gallery for one-click creation

### Skill Auto-Evolution

After running workflows, SoloFlow learns from them:

```
→ soloflow_evolve()
→ soloflow_templates(query="weather")
```

Evolved skill patterns are automatically written as `SKILL.md` files to `~/.openclaw/workspace/skills/`, ready for immediate use.

### Cognitive Memory

SoloFlow remembers every workflow execution:

```
→ soloflow_memory(query="code review findings", tier="episodic")
→ soloflow_memory(query="best practices", tier="semantic")
```

Memory tiers:
- **Working** — current session context
- **Episodic** — past workflow executions (with forgetting curve)
- **Semantic** — distilled knowledge (with spaced repetition)
- **Entity** — R³Mem knowledge graph (auto-extracted entities)

---

## Registered Tools

| Tool | Description |
|------|-------------|
| `soloflow_create` | Create a new workflow |
| `soloflow_start` | Start workflow execution |
| `soloflow_status` | Get workflow status |
| `soloflow_list` | List all workflows (filter by status/discipline) |
| `soloflow_cancel` | Cancel a running workflow |
| `soloflow_ready_steps` | Get steps ready to execute |
| `soloflow_advance_step` | Mark step as completed |
| `soloflow_memory` | Query cognitive memory |
| `soloflow_evolve` | Trigger skill auto-evolution |
| `soloflow_templates` | List evolved templates/skills |
| `soloflow_skills_list` | List skill inventory |
| `soloflow_skills_usage` | Get skill usage analytics |
| `soloflow_skills_scan` | Scan and update skill inventory |
| `mcp_servers` | List MCP servers and tools |
| `mcp_stats` | Get MCP usage statistics |

---

## Roadmap

### Phase 1: Foundation ✅ DONE

15 registered tools, cognitive memory system, skill evolution engine, Visual Builder, DAG scheduling, FSM state machine, four discipline agents, lifecycle hooks, slash commands.

### Phase 2: Intelligence ✅ DONE

C-HLR+ half-life regression, R³Mem entity graph, unified retriever (RRF fusion), auto-evolution engine, LobsterPress backend adapter, semantic forgetting.

### Phase 3: Visualization ✅ DONE

SVG-based visual workflow builder at `/soloflow/builder`, real-time execution viewer, template gallery, dark theme, zero external dependencies.

### Phase 4: Platform (current)

- GitHub publishing (pending account recovery)
- OpenClaw Skill Market listing
- Type safety improvements (reduce `any` usage)
- Test suite

---

<div align="center">

### Built for the AI agents that ship to production.

**[Get started](#getting-started)** with SoloFlow today.

Star the repo if you find it useful. Contributions, issues, and ideas welcome.

[GitHub — SoloFlow](https://github.com/SonicBotMan/SoloFlow) · [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) · [LobsterPress](https://github.com/SonicBotMan/lobster-press)

MIT License · Built by [SonicBotMan](https://github.com/SonicBotMan)

</div>
