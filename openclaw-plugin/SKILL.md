---
name: soloflow
description: "AI-powered workflow orchestration with cognitive memory and self-evolution. Create structured DAG workflows, route tasks to discipline-aware agents, and let the system learn from every execution."
author: SonicBotMan
tags:
  - latest
  - workflow
  - automation
  - ai-agent
  - productivity
---

# SoloFlow

**Turn messy multi-step AI tasks into structured, observable, retryable workflows.**

SoloFlow sits inside OpenClaw as a workflow orchestration engine. It combines DAG-based execution, finite state machine guards, discipline-aware agent routing, and a three-tier cognitive memory system that actually remembers what worked.

---

## Core Concepts

### Disciplines

Tasks automatically route to the right agent based on content analysis:

| Discipline | Use for | Default model |
|:-----------|:--------|:--------------|
| `deep` | Thorough research, architecture review | claude-3-opus |
| `quick` | Fast lookups, simple transformations | claude-3-haiku |
| `visual` | UI design, image generation | claude-3-sonnet |
| `ultrabrain` | Algorithm optimization, reasoning | o1 |

### Three-Tier Memory

- **Working** — current workflow context, step results, volatile
- **Episodic** — compressed execution history with forgetting curve
- **Semantic** — long-term facts and skills with spaced repetition

### Skill Evolution

SoloFlow watches for repeatable patterns across workflow runs. When detected, it auto-generates `SKILL.md` files you can share or reuse.

---

## Workflow Commands

### Create a workflow

```
→ soloflow_create(name="My Workflow", steps=[
  {id: "step1", name: "Fetch data", discipline: "quick", action: "Fetch the latest data from the API", dependencies: []},
  {id: "step2", name: "Analyze", discipline: "ultrabrain", action: "Find patterns in the data", dependencies: ["step1"]},
  {id: "step3", name: "Report", discipline: "deep", action: "Write a summary report", dependencies: ["step2"]}
])
```

### Start a workflow

```
→ soloflow_start(workflowId="wf_abc123")
```

### Check status

```
→ soloflow_status(workflowId="wf_abc123")
```

### Cancel a workflow

```
→ soloflow_cancel(workflowId="wf_abc123")
```

### List workflows

```
→ soloflow_list()                           # all workflows
→ soloflow_list(status="running")           # filter by status
→ soloflow_list(discipline="deep")          # filter by discipline
```

---

## Memory Commands

### Query memory

```
→ soloflow_memory(query="code review patterns", tier="episodic")
→ soloflow_memory(query="API best practices", tier="semantic")
```

Tiers: `working` | `episodic` | `semantic` | `entity` (default: all)

### Trigger skill evolution

```
→ soloflow_evolve()
```

Detects patterns from recent workflow runs and generates reusable skill templates.

### List evolved skills

```
→ soloflow_templates(query="data analysis")
→ soloflow_templates(type="workflow")
```

### Scan skill inventory

```
→ soloflow_skills_scan()     # rescan ~/.openclaw/workspace/skills/
→ soloflow_skills_list()     # show all registered skills
→ soloflow_skills_usage()    # usage analytics
```

---

## Workflow Lifecycle

```
idle → queued → running → completed
  │       │        │   ↑
  │       │        │   └── paused → running
  │       │        └── failed → queued (auto-retry)
  │       └── cancelled → queued
  └── force-cancel
```

SoloFlow wraps each step with exponential backoff retry and per-step timeouts. Downstream steps with failed dependencies skip automatically. Partial results are preserved.

---

## Configuration

```json
{
  "plugins": {
    "soloflow": {
      "enabled": true,
      "config": {
        "maxConcurrentWorkflows": 10,
        "defaultTimeout": 300000,
        "retryPolicy": {
          "maxAttempts": 3,
          "backoffMs": 1000
        },
        "gatewayUrl": "ws://localhost:3000"
      }
    }
  }
}
```

Environment variables:

```bash
export WORKFLOW_ENGINE_API_KEY="your-api-key"
export WORKFLOW_GATEWAY_URL="ws://localhost:3000"
```

---

## Prerequisites

- OpenClaw >= 2026.4.8
- Node.js >= 22
- Gateway >= 2.0.0

---

## Install

```bash
# Via ClawHub (once published)
clawhub install soloflow

# Or symlink manually
git clone https://github.com/SonicBotMan/SoloFlow.git
# then configure in openclaw.config.json
```
