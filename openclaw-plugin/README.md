# SoloFlow — Workflow Orchestration for OpenClaw

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/runtime-bun%20%3E%3D1.0-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-TypeScript-3178c6?logo=typescript)](https://www.typescriptlang.org/)

> DAG-based multi-step workflow orchestration with discipline-aware agent routing for the [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) AI agent framework.

---

## Overview

SoloFlow is a plugin for OpenClaw that turns ad-hoc agent tasks into structured, observable, and retryable workflows. It decomposes work into steps arranged in a **directed acyclic graph (DAG)**, routes each step to the best-fit **discipline agent**, and drives execution through a **finite state machine (FSM)** with hooks, timeouts, and concurrency control.

**Key idea:** Describe *what* needs to happen and *in what order* — SoloFlow handles the scheduling, retries, and lifecycle.

---

## Features

- **DAG-based workflow scheduling** — steps declare dependencies; the scheduler executes layers in parallel, bounded by a configurable concurrency semaphore.
- **Discipline agents** — four built-in profiles that automatically route tasks to the right model and toolset:
  | Discipline | Purpose | Default Model |
  |------------|---------|---------------|
  | `deep` | Thorough research, multi-step analysis | `claude-3-opus` |
  | `quick` | Fast lookups, simple conversions | `claude-3-haiku` |
  | `visual` | UI design, frontend code, image gen | `claude-3-sonnet` |
  | `ultrabrain` | Hard logic, algorithms, architecture | `o1` |
- **FSM state machine** — strict state transitions (`idle → queued → running → completed/failed/cancelled`) with validation and event emission.
- **Hook system** — subscribe to lifecycle events (`workflow:started`, `step:completed`, `workflow:failed`, …) for logging, metrics, and custom integrations.
- **Prometheus-style interview planning** — an interactive planner that asks clarifying questions, detects ambiguity, classifies the discipline, and generates structured workflow templates.
- **OpenClaw Gateway integration** — connects via WebSocket RPC for cross-plugin communication, event bridging, and service discovery.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    OpenClaw Host                      │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Commands │  │   RPC    │  │     Services      │  │
│  │ /workflow│  │ Methods  │  │ state · scheduler │  │
│  └────┬─────┘  └────┬─────┘  │ agent · hooks     │  │
│       │              │        └────────┬──────────┘  │
│       └──────┬───────┘                 │             │
│              ▼                         │             │
│  ┌─────────────────────────────────────▼───────────┐ │
│  │              SoloFlow Plugin Core               │ │
│  │                                                 │ │
│  │  ┌─────────────────┐  ┌──────────────────────┐ │ │
│  │  │  WorkflowService │  │      Scheduler       │ │ │
│  │  │  (CRUD + FSM)    │  │ (DAG execution loop) │ │ │
│  │  └────────┬────────┘  └──────────┬───────────┘ │ │
│  │           │                      │              │ │
│  │  ┌────────▼────────┐  ┌─────────▼────────────┐ │ │
│  │  │      DAG        │  │  Discipline Agents    │ │ │
│  │  │ (toposort,deps) │  │ deep · quick · visual │ │ │
│  │  └─────────────────┘  │ · ultrabrain          │ │ │
│  │                       └──────────────────────┘ │ │
│  │  ┌─────────────────┐  ┌──────────────────────┐ │ │
│  │  │   HookSystem    │  │      Planner         │ │ │
│  │  │ (lifecycle evt) │  │ (interview + plan)   │ │ │
│  │  └─────────────────┘  └──────────────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Source Layout

```
src/
├── index.ts                 # Plugin entry point — activate/deactivate
├── types.ts                 # Shared type definitions
├── core/
│   ├── dag.ts               # DAG builder, topological sort, cycle detection
│   └── fsm.ts               # FSM transition validation
├── agents/
│   ├── index.ts             # Agent step executor
│   └── discipline.ts        # Discipline configs, keyword router, DisciplineAgent class
├── services/
│   ├── workflow-service.ts  # Workflow CRUD, FSM transitions, event emission
│   ├── scheduler.ts         # DAG execution loop, retry, timeout, concurrency
│   ├── planner.ts           # Prometheus-style interview planner
│   └── index.ts             # Service type re-exports
├── commands/
│   └── index.ts             # /workflow slash-command handlers
├── hooks/
│   └── index.ts             # HookSystem, built-in hooks, OpenClaw bridge
└── rpc/
    └── index.ts             # RPC method router (workflow.*, agent.*)
```

---

## Installation

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) >= 2.0.0 with Gateway >= 2.0.0

### Install

```bash
# Clone into your OpenClaw plugins directory
git clone https://github.com/SonicBotMan/openclaw-plugin.git
cd openclaw-plugin

# Install dependencies
bun install

# Build
bun run build
```

### Register with OpenClaw

Copy (or symlink) the built plugin into your OpenClaw plugins directory and reference it in your OpenClaw configuration:

```jsonc
// openclaw.config.json
{
  "plugins": {
    "workflow-orchestration": {
      "enabled": true,
      "config": {
        "gatewayUrl": "ws://localhost:3000",
        "maxConcurrentWorkflows": 10,
        "defaultTimeout": 300000
      }
    }
  }
}
```

Set the required environment variables:

```bash
export WORKFLOW_ENGINE_API_KEY="your-api-key"
export WORKFLOW_GATEWAY_URL="ws://localhost:3000"
```

---

## Usage

### Slash Commands

All commands are available under `/workflow` (alias: `/wf`).

#### Start a Workflow

```
/workflow start --steps "research:deep,analyze:ultrabrain:research,summarize:quick:analyze"
```

| Flag | Type | Description |
|------|------|-------------|
| `--steps` | `string` | Inline step definitions (comma-separated). Format: `name:discipline:dep1+dep2` |
| `--template` | `string` | Load from a saved template name |
| `--name` | `string` | Human-readable workflow name |
| `--params` | `json` | Parameters to pass into steps |

#### Check Workflow Status

```
/workflow status <workflow-id>
/workflow status <workflow-id> --verbose
```

| Flag | Description |
|------|-------------|
| `--verbose`, `-v` | Show per-step details, results, timing, and DAG info |

#### List Workflows

```
/workflow list
/workflow list --status running --limit 10
```

| Flag | Description |
|------|-------------|
| `--status` | Filter by state: `idle`, `queued`, `running`, `paused`, `completed`, `failed`, `cancelled` |
| `--template` | Filter by template name |
| `--limit` | Max results (default: all) |
| `--offset` | Skip first N results |

#### Cancel a Workflow

```
/workflow cancel <workflow-id>
/workflow cancel <workflow-id> --force
```

| Flag | Description |
|------|-------------|
| `--force`, `-f` | Force-cancel from any non-terminal state |

#### Help

```
/workflow help
```

### RPC Methods

For programmatic access, use the JSON-RPC methods registered on the OpenClaw host:

#### `workflow.create`

Create a new workflow from inline step definitions.

```typescript
const result = await api.rpc.call("workflow.create", {
  steps: [
    { id: "research", name: "Research topic", discipline: "deep", config: { prompt: "..." } },
    { id: "analyze", name: "Analyze findings", discipline: "ultrabrain", dependencies: ["research"], config: {} },
    { id: "report", name: "Write report", discipline: "quick", dependencies: ["analyze"], config: {} },
  ],
  params: { topic: "AI agents" },
  timeout: 120000,
});
// → { id: "wf_...", status: "idle", createdAt: 1712300000000 }
```

#### `workflow.start`

Transition a workflow to `running` and begin execution.

```typescript
await api.rpc.call("workflow.start", { id: "wf_..." });
// → { id: "wf_...", status: "running", startedAt: 1712300001000 }
```

#### `workflow.status`

Query the current status of a workflow.

```typescript
await api.rpc.call("workflow.status", { id: "wf_...", verbose: true });
// → { id, status, steps: [...], createdAt, updatedAt }
```

#### `workflow.list`

List workflows with optional filters.

```typescript
await api.rpc.call("workflow.list", { status: "running", limit: 10, offset: 0 });
// → { workflows: [...], total: 42 }
```

#### `workflow.pause` / `workflow.resume`

Pause or resume a running workflow.

```typescript
await api.rpc.call("workflow.pause", { id: "wf_..." });
await api.rpc.call("workflow.resume", { id: "wf_..." });
```

#### `workflow.cancel`

Cancel a workflow (optionally force-cancel from any non-terminal state).

```typescript
await api.rpc.call("workflow.cancel", { id: "wf_...", force: true });
```

#### `workflow.retry`

Retry a failed or cancelled workflow by re-queuing it.

```typescript
await api.rpc.call("workflow.retry", { id: "wf_..." });
```

#### `workflow.delete`

Permanently delete a workflow.

```typescript
await api.rpc.call("workflow.delete", { id: "wf_..." });
// → { deleted: true }
```

#### `agent.listDisciplines`

List available discipline agents and their configurations.

```typescript
await api.rpc.call("agent.listDisciplines", {});
// → { disciplines: [{ name, description, defaultModel, maxTokens, tools }] }
```

#### `soloflow.metrics`

Get workflow orchestration metrics (started, completed, failed, total duration).

```typescript
await api.rpc.call("soloflow.metrics", {});
```

---

## Configuration

All configuration is defined in `openclaw.plugin.json` under `configSchema`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Master enable/disable toggle |
| `gatewayUrl` | `string` | `ws://localhost:3000` | OpenClaw Gateway WebSocket URL |
| `maxConcurrentWorkflows` | `number` | `10` | Max simultaneous workflows (`0` = unlimited) |
| `defaultTimeout` | `number` | `300000` | Per-workflow timeout in ms |
| `persistence` | `"memory" \| "sqlite"` | `"memory"` | State storage backend |
| `sqlitePath` | `string` | — | SQLite file path (when `persistence=sqlite`) |
| `retryPolicy` | `object` | — | Retry config for failed steps |
| `templates` | `object` | — | Pre-registered workflow templates |
| `hooks` | `object` | — | Lifecycle hook handlers |

### Retry Policy

```jsonc
{
  "retryPolicy": {
    "maxAttempts": 3,       // Max retries per step (default: 3)
    "backoffMs": 1000,      // Base delay — uses exponential backoff (default: 1000)
    "retryOn": ["timeout", "network"]  // Error types that trigger retry
  }
}
```

### Lifecycle Hooks

```jsonc
{
  "hooks": {
    "onWorkflowStart": "function-or-script-path",
    "onWorkflowComplete": "function-or-script-path",
    "onWorkflowFail": "function-or-script-path",
    "onStepComplete": "function-or-script-path"
  }
}
```

### Scheduler Tuning (Plugin Config)

When registering the plugin via the `activate()` function, pass scheduler options:

```typescript
interface PluginConfig {
  maxConcurrency?: number;   // Max parallel steps (default: 4)
  retryAttempts?: number;    // Retries per step (default: 3)
  retryDelayMs?: number;     // Base backoff in ms (default: 1000)
  stepTimeoutMs?: number;    // Per-step timeout in ms (default: 60000)
  defaultDiscipline?: "deep" | "quick" | "visual" | "ultrabrain";
}
```

---

## API Reference

### Programmatic Usage

```typescript
import activate, {
  WorkflowService,
  Scheduler,
  HookSystem,
  DisciplineAgent,
  allAgents,
  getAgent,
} from "@soloflow/openclaw-plugin";

// Or import types
import type {
  Workflow,
  WorkflowStep,
  WorkflowState,
  AgentDiscipline,
  DAG,
  StateEvent,
} from "@soloflow/openclaw-plugin";
```

### Services Registered with OpenClaw

The plugin registers these services on the OpenClaw host for other plugins to consume:

| Service Name | Description |
|---|---|
| `soloflow.workflow-service` | Direct access to `WorkflowService` (CRUD, FSM) |
| `soloflow.scheduler-service` | Scheduler façade (`execute`, `cancel`, `getStatus`) |
| `soloflow.agent-service` | Discipline routing and execution |
| `soloflow.state-service` | Read-only workflow state + event subscription |
| `soloflow.hook-system` | Hook system for lifecycle event listeners |

### FSM State Transitions

```
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

---

## Examples

### Inline Workflow via Command

```
/workflow start --steps "fetch-data:quick,process-data:deep:fetch-data,generate-chart:visual:process-data"
```

### Programmatic Workflow via RPC

```typescript
// Create and start a 3-step research pipeline
const { id } = await api.rpc.call("workflow.create", {
  steps: [
    { id: "s1", name: "Research competitor landscape", discipline: "deep", config: { prompt: "..." } },
    { id: "s2", name: "Analyze market positioning", discipline: "ultrabrain", dependencies: ["s1"], config: {} },
    { id: "s3", name: "Create executive dashboard", discipline: "visual", dependencies: ["s2"], config: {} },
  ],
});

await api.rpc.call("workflow.start", { id });
```

### Using the Planner

```typescript
import { Planner } from "@soloflow/openclaw-plugin";

const planner = new Planner({ maxQuestions: 3, confidenceThreshold: 0.8 });

// Start an interactive planning session
const session = planner.startSession("Research AI agent frameworks and build a comparison matrix");

// Ask clarifying questions
const question = planner.getNextQuestion(session);
console.log(question);
// → "Could you clarify the scope of this task? ..."

// Provide answers
planner.processAnswer(session, "Focus on TypeScript-based frameworks, include pricing and features");

// Generate the plan
if (session.phase === "planning" || session.confidenceSufficient) {
  const plan = planner.generatePlan(session);
  console.log(plan.template.steps);
  console.log(`Discipline: ${plan.discipline}, Confidence: ${(plan.confidence * 100).toFixed(0)}%`);
}
```

### Custom Hook Handler

```typescript
const hookSystem = api.services.get<HookSystem>("soloflow.hook-system");

const unsubscribe = hookSystem.register("step:completed", (ctx) => {
  console.log(`Step "${ctx.step?.name}" completed in ${ctx.workflow?.id}`);
  console.log(`Duration: ${ctx.step?.completedAt && ctx.step?.startedAt ? ctx.step.completedAt - ctx.step.startedAt : '?'}ms`);
});

// Later: unsubscribe()
```

---

## Development

```bash
# Install dependencies
bun install

# Development with hot reload
bun run dev

# Type checking
bun run typecheck

# Build for production
bun run build

# Run tests
bun test

# Clean build artifacts
bun run clean
```

---

## License

[MIT](./LICENSE) © SonicBotMan
