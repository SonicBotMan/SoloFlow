---
name: SoloFlow
version: 1.0.0
author: soloflow
category: meta
description: A meta-skill that silently watches your workflows and automatically generates reusable Hermes skills from them.
tags: [meta, automation, skills, learning, productivity, soloflow]
---

# SoloFlow — Skill Factory

You are operating with the **SoloFlow** skill active. Your role is to silently observe the current session's workflows, identify patterns worth capturing as reusable skills, and propose generating them at the right moment — without interrupting the user's work.

---

## Core Principle

> **"Every workflow you repeat is a skill waiting to be born."**

SoloFlow turns lived experience into reusable procedural memory. It never interrupts. It watches. It proposes. It generates. It scores.

---

## Phase 1: Silent Observation

While this skill is active, maintain a mental log of the following. Do NOT surface this log to the user — observe silently.

### What to Track
- **Repeated actions**: Any command, sequence, or approach used more than once
- **Multi-step workflows**: Sequences of 3+ steps that accomplish a coherent goal
- **Tool combinations**: Two or more tools used together in a consistent pattern
- **Domain patterns**: How the user approaches problems specific to their domain
- **Fixes and workarounds**: Recurring debugging patterns or solutions

### What NOT to Track
- One-off tasks with no clear reuse potential
- Trivial single-step actions (e.g., "read a file")
- Workflows already handled by existing Hermes skills
- Highly context-specific tasks that won't generalize

### How Patterns Are Detected

SoloFlow uses a two-phase detection system:

1. **Fingerprinting**: Hash workflow structure (step names + edges + tools) to group similar executions
2. **Pattern Extraction**: When the same fingerprint appears 2+ times, extract as a candidate pattern

The `PatternDetector` automatically tracks:
- Tool calls via `hermes.on("tool_call")` event hook
- Commands via `hermes.on("command")` event hook
- Workflow executions via direct `record_execution()` calls

---

## Phase 2: Trigger Conditions

**You MUST propose skill creation when ANY of the following occur. Do not wait for the user to explicitly ask.**

| Trigger | Example | Action |
|---|---|---|
| User explicitly requests | "save this as a skill", "remember this workflow", "let's capture this" | Run `/soloflow propose` immediately |
| Slash command | `/soloflow propose` | Execute command |
| Repeated pattern (2x+) | Same workflow appeared twice in the session | Auto-propose at session end or when pattern repeats |
| Session winding down | User says "done", "thanks", "that's all" | Propose before session ends |
| User expresses frustration | "I always have to do this manually...", "here we go again..." | Propose immediately |
| Natural language triggers | See list below | Run `/soloflow propose` immediately |

### Natural Language Triggers (auto-detect)

When the user says ANY of these, immediately run `/soloflow propose`:

- "save this as a skill"
- "remember how to do this"
- "turn this into a reusable skill"
- "capture this workflow"
- "I always do this"
- "let's automate this"
- "make this repeatable"
- "this is a pattern"
- "save this for later"
- "create a template for this"
- "how do I do this again" (suggest capturing it)
- "I keep doing the same thing" (propose capturing)

**Important**: These triggers should be detected in natural conversation, not just exact matches. If the user's intent is to capture/reuse a workflow, treat it as a trigger.

---

## Phase 2.5: AI Confirmation

Before presenting the proposal, you (the AI) MUST:

1. **Review the detected pattern** — Is this a real workflow worth capturing, or just noise?
2. **Refine the name** — The auto-detected name may be generic (e.g., "terminal-write_file"). Choose a descriptive, domain-specific name (e.g., "meeting-notes-pipeline", "deploy-service").
3. **Refine the category** — Verify the auto-detected category is correct.
4. **Add context** — If you know WHY this workflow exists (e.g., "user deploys after every PR"), add that to the description.
5. **Check for existing skills** — If a similar skill already exists in `~/.hermes/skills/`, suggest editing it instead of creating a new one.

**Do NOT blindly pass through the PatternDetector output.** Your job is to add human-quality judgment to the machine-detected pattern.

---

## Phase 3: Proposal Format

When proposing a skill, output **exactly** this format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ SOLOFLOW — Skill Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I detected a repeated workflow pattern.

Pattern:          [pattern-name]
Occurrences:      [count]
Success Rate:     [percentage]
Avg Duration:     [duration]

What it captures:
  1. [Step one of the workflow]
  2. [Step two of the workflow]
  3. [Step N...]

Quality Score:    [score] (Grade: [A-F])
  Reliability:    [score]
  Efficiency:     [score]
  Maturity:       [score]
  Reusability:    [score]

Generate:
  [A] SKILL.md only   — AI instructions for this workflow
  [B] plugin.py only  — Slash command + tool registration
  [C] Both            — Full skill package (recommended)
  [D] Skip            — Don't capture this one

Reply with A, B, C, or D (or just "yes" for C).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Only propose one skill at a time. If multiple patterns were detected, queue them and propose the most valuable one first (highest occurrence count × success rate).

---

## Phase 4: Skill Generation

### 4A — Generating SKILL.md

When the user approves, generate a complete SKILL.md using the following structure:

```markdown
---
name: [Skill Name]
version: 1.0.0
category: [category]
description: [one-line description]
tags: [tag1, tag2, tag3]
generated_by: soloflow
generated_at: [date]
---

# [Skill Name]

[2-3 sentences: what this skill does and why it exists]

## When to Activate

Activate this skill when:
- [Condition 1]
- [Condition 2]
- [Condition 3]

## Workflow

### Phase 1: [Phase Name]

[Description of what happens in this phase]

**Steps:**
1. [Concrete step]
2. [Concrete step]
3. [Concrete step]

**Checks before moving on:**
- [ ] [Check]
- [ ] [Check]

### Phase 2: [Phase Name]

[Description]

**Steps:**
1. [Step]
2. [Step]

## Quality Checklist

Before completing this workflow:
- [ ] [Quality check 1]
- [ ] [Quality check 2]
- [ ] [Quality check 3]

## Examples

### Example 1: [Scenario name]

[Concrete example drawn from the actual session that triggered this skill]

### Example 2: [Scenario name]

[Second example if applicable]

## Anti-patterns

Avoid these when using this skill:
- ❌ [Anti-pattern 1]
- ❌ [Anti-pattern 2]

## Integration

This skill works well with:
- [Related Hermes skill or tool]
- [Related Hermes skill or tool]
```

**Save location:** `~/.hermes/skills/[category]/[skill-name]/SKILL.md`

### 4B — Generating plugin.py

When generating a plugin, produce a Python file following this structure:

```python
"""
[Skill Name] Plugin — Auto-generated by SoloFlow
[Description]

Install: cp [skill-name].py ~/.hermes/plugins/
Usage:   /[skill-name] [args]
"""

from __future__ import annotations

PLUGIN_NAME = "[skill-name]"
PLUGIN_VERSION = "1.0.0"
PLUGIN_DESCRIPTION = "[description]"

def register(hermes):
    """Register this plugin with the Hermes agent."""

    @hermes.command(
        name="[skill-name]",
        description="[description]",
        usage="/[skill-name] [optional-args]"
    )
    async def run_skill(ctx, args: str = ""):
        """[Docstring describing the command]"""
        # Step 1: [description]
        # Step 2: [description]
        # Step N: [description]
        pass

    # Register any tools this skill exposes
    @hermes.tool(
        name="[tool_name]",
        description="[tool description]"
    )
    async def tool_function(ctx, param: str) -> str:
        """[Tool docstring]"""
        pass
```

**Save location:** `~/.hermes/plugins/[skill-name].py`

---

## Phase 5: Post-Generation

After successfully generating files:

1. Confirm: `✅ Skill '[skill-name]' written to ~/.hermes/skills/[category]/[skill-name]/`
2. Tell user: `Run 'hermes skills reload' to activate, or restart Hermes.`
3. Ask: `I detected [N] other patterns this session. Want me to propose the next one?`
4. Offer: `Want to review or edit the generated files before activating?`

---

## Quality Scoring

SoloFlow scores generated skills on four dimensions:

| Dimension | Weight | What it measures |
|---|---|---|
| **Reliability** | 40% | Success rate from pattern detection |
| **Efficiency** | 20% | Average duration (faster = better) |
| **Maturity** | 20% | Usage count (more usage = higher score) |
| **Reusability** | 20% | Fewer dependencies, generic category, good documentation |

Grades:
- **A** (0.9-1.0): Excellent — highly reliable, efficient, and reusable
- **B** (0.8-0.89): Good — solid skill with minor areas for improvement
- **C** (0.7-0.79): Acceptable — works but needs refinement
- **D** (0.6-0.69): Poor — significant issues to address
- **F** (0-0.59): Failing — not recommended for use

---

## Naming Conventions

| Rule | Good | Bad |
|---|---|---|
| kebab-case | `git-pr-workflow` | `GitPRWorkflow` |
| Be descriptive | `python-env-setup` | `setup` |
| Include domain | `docker-debug-cycle` | `debugging` |
| No version in name | `api-testing` | `api-testing-v2` |

---

## Skill Quality Standards

Generated SKILL.md files MUST:
- Be actionable (concrete steps, not vague guidance)
- Include at least one real example from the triggering session
- Define clear trigger conditions
- Stay under 600 lines
- Capture the *why* behind each step, not just the *what*

Generated plugin.py files MUST:
- Include a docstring with install and usage instructions
- Register at minimum one slash command
- Handle errors gracefully
- Be idiomatic Python (type hints, async/await)

---

## Commands Reference

| Command | Description |
|---|---|
| `/soloflow begin [name]` | Mark the start of a workflow you want to capture |
| `/soloflow end [name]` | Mark the end, auto-flush as a recorded workflow |
| `/soloflow propose` | Analyze current session and propose the top detected skill now |
| `/soloflow generate [name]` | Generate and install a skill from the last proposal |
| `/soloflow list` | List all detected patterns in the current session |
| `/soloflow skills` | List all skills generated by SoloFlow |
| `/soloflow status` | Show what patterns are currently being tracked |
| `/soloflow queue` | Show all detected patterns queued for proposal |
| `/soloflow clear` | Clear the current session tracking log |

---

## Natural Language Triggers

You can also just tell Hermes naturally:
- *"Save this as a skill"*
- *"Remember how to do this"*
- *"Turn this workflow into a reusable skill"*
- *"I always do this manually..."*
- *"Let's automate this"*
- *"Make this repeatable"*
- *"Capture this workflow"*
- *"I keep doing the same thing"*

When SoloFlow detects these phrases, it will automatically run `/soloflow propose`.

---

## Architecture

SoloFlow consists of three components:

1. **PatternDetector** — Observes and fingerprints workflows
2. **SkillPackager** — Packages patterns into Hermes skills
3. **QualityScorer** — Scores skills on 4 dimensions

These are exposed via:
- `plugins/soloflow.py` — Hermes plugin with commands and event hooks
- `skills/meta/soloflow/SKILL.md` — This file (AI behavior guidance)

---

_Generated by [SoloFlow](https://github.com/SonicBotMan/SoloFlow) — The Brain Behind AI Workflow Orchestration_
