"""
SoloFlow — Hermes Plugin

Meta-skill that watches workflows and generates reusable skills automatically.
Replaces skill-factory with deeper integration and quality scoring.

Install:
    cp plugins/soloflow.py ~/.hermes/plugins/
    cp -r skills/meta/soloflow ~/.hermes/skills/meta/

Usage:
    /soloflow begin             Mark the start of a workflow you want to capture
    /soloflow end [name]        Mark the end, auto-flush as a pattern
    /soloflow propose           Analyze session and propose top detected skill
    /soloflow generate [name]   Generate and install a detected skill
    /soloflow list              List all detected patterns
    /soloflow skills            List all generated skills
    /soloflow status            Show tracking status
    /soloflow queue             Show pending pattern proposals
    /soloflow clear             Clear session tracking log
"""

from __future__ import annotations

import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from evolution.pattern_detector import PatternDetector, WorkflowExecution
from evolution.skill_packager import SkillPackager, Skill
from evolution.quality_scorer import QualityScorer, QualityScore

# ---------------------------------------------------------------------------
# Plugin metadata
# ---------------------------------------------------------------------------

PLUGIN_NAME = "soloflow"
PLUGIN_VERSION = "1.1.0"
PLUGIN_DESCRIPTION = "Meta-skill that watches workflows and generates reusable skills automatically"

# ---------------------------------------------------------------------------
# Step description enrichment
# ---------------------------------------------------------------------------

# Map tool names to human-readable step descriptions
_TOOL_DESCRIPTIONS = {
    "terminal": "Run shell command",
    "read_file": "Read file contents",
    "write_file": "Write file",
    "patch": "Edit file",
    "search_files": "Search files",
    "web_search": "Search the web",
    "web_extract": "Extract web page content",
    "browser_navigate": "Open web page",
    "browser_click": "Click browser element",
    "browser_type": "Type in browser",
    "mcp_pplx_perplexity_search": "Search with Perplexity",
    "mcp_pplx_perplexity_ask": "Ask Perplexity",
    "mcp_github_get_file_contents": "Read GitHub file",
    "mcp_github_create_pull_request": "Create pull request",
    "mcp_github_create_issue": "Create issue",
    "send_message": "Send message",
    "delegate_task": "Delegate to sub-agent",
    "skill_view": "Load skill",
    "memory": "Save to memory",
    "memos_search": "Search memories",
    "text_to_speech": "Generate speech",
    "vision_analyze": "Analyze image",
    "todo": "Update task list",
}


def _describe_step(tool_name: str, tool_args: dict) -> str:
    """Generate a human-readable step description from tool name and args."""
    # Start with known description or a generic one
    base = _TOOL_DESCRIPTIONS.get(tool_name, f"Use {tool_name}")

    if not isinstance(tool_args, dict):
        return base

    # Enrich with key arguments
    parts = []

    # File paths
    for key in ("path", "file_path", "url", "query", "command", "text", "expression"):
        if key in tool_args and tool_args[key]:
            val = str(tool_args[key])
            # Truncate long values
            if len(val) > 60:
                val = val[:57] + "..."
            parts.append(f"{key}={val}")

    if parts:
        return f"{base} ({', '.join(parts[:2])})"  # Max 2 args

    return base


# ---------------------------------------------------------------------------
# Workflow Builder — aggregates consecutive tool calls
# ---------------------------------------------------------------------------

# Seconds of inactivity before auto-flushing a workflow
AUTO_FLUSH_GAP_SECONDS = 60


class WorkflowBuilder:
    """Accumulates consecutive tool calls into a multi-step workflow."""

    def __init__(self):
        self.steps: list[dict[str, Any]] = []
        self.tools_used: list[str] = []
        self.start_time: float = 0
        self.last_step_time: float = 0
        self.explicit: bool = False  # True = user called /soloflow begin
        self.name: str = ""

    def add_step(self, tool_name: str, tool_args: dict) -> None:
        """Add a tool call as a workflow step."""
        if not self.steps:
            self.start_time = time.time()

        step_id = f"step_{len(self.steps) + 1}"
        self.steps.append({
            "id": step_id,
            "name": tool_name,
            "prompt": _describe_step(tool_name, tool_args),
        })

        if tool_name not in self.tools_used:
            self.tools_used.append(tool_name)

        self.last_step_time = time.time()

    def is_empty(self) -> bool:
        return len(self.steps) == 0

    def is_stale(self) -> bool:
        """True if gap since last step exceeds auto-flush threshold."""
        if self.is_empty():
            return False
        return (time.time() - self.last_step_time) > AUTO_FLUSH_GAP_SECONDS

    def is_multi_step(self) -> bool:
        """Only worth recording as a workflow if 2+ steps."""
        return len(self.steps) >= 2

    def build(self, name: str = "") -> dict[str, Any]:
        """Build a workflow dict suitable for PatternDetector.record_execution()."""
        if not name:
            # Auto-generate name from tool sequence
            tool_names = [s["name"] for s in self.steps]
            name = "-".join(dict.fromkeys(tool_names))  # dedupe preserving order
            if len(name) > 50:
                name = name[:47] + "..."

        edges = []
        for i in range(len(self.steps) - 1):
            edges.append((self.steps[i]["id"], self.steps[i + 1]["id"]))

        return {
            "id": str(uuid.uuid4()),
            "name": name,
            "steps": self.steps,
            "edges": edges,
        }

    def duration_ms(self) -> int:
        if self.is_empty():
            return 0
        return int((self.last_step_time - self.start_time) * 1000)

    def reset(self) -> None:
        self.steps.clear()
        self.tools_used.clear()
        self.start_time = 0
        self.last_step_time = 0
        self.explicit = False
        self.name = ""


# ---------------------------------------------------------------------------
# Session Tracker
# ---------------------------------------------------------------------------

class SessionTracker:
    """Tracks workflow patterns within the current Hermes session."""

    def __init__(self):
        self.detector = PatternDetector()
        self.packager = SkillPackager()
        self.scorer = QualityScorer()
        self.builder = WorkflowBuilder()

        self.generated_skills: list[dict[str, Any]] = []
        self.proposal_queue: list[dict[str, Any]] = []
        self.last_proposal: dict[str, Any] | None = None
        self.last_generated_skill: Skill | None = None

        self.session_start = time.time()
        self.tool_calls_count = 0
        self.commands_count = 0
        self.workflows_recorded = 0

    def flush_builder(self, name: str = "") -> bool:
        """Flush the current workflow builder into the detector. Returns True if flushed."""
        if not self.builder.is_multi_step():
            self.builder.reset()
            return False

        workflow = self.builder.build(name)
        self.detector.record_execution(
            workflow=workflow,
            success=True,
            duration_ms=self.builder.duration_ms(),
            tools_used=list(self.builder.tools_used),
        )
        self.workflows_recorded += 1
        self.builder.reset()
        return True

    def clear(self):
        """Reset session tracker."""
        self.detector.clear()
        self.packager = SkillPackager()
        self.builder.reset()
        self.generated_skills.clear()
        self.proposal_queue.clear()
        self.last_proposal = None
        self.last_generated_skill = None
        self.tool_calls_count = 0
        self.commands_count = 0
        self.workflows_recorded = 0
        self.session_start = time.time()


# Global tracker instance
_tracker = SessionTracker()


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def format_duration(ms: float) -> str:
    """Format duration in milliseconds to human-readable string."""
    if ms < 1000:
        return f"{ms:.0f}ms"
    elif ms < 60000:
        return f"{ms/1000:.1f}s"
    else:
        return f"{ms/60000:.1f}min"


def format_proposal(pattern, score: Optional[QualityScore] = None) -> str:
    """Format a skill proposal for display."""
    # Build steps summary
    steps_summary = []
    for i, step in enumerate(pattern.steps[:5], 1):  # Show max 5 steps
        step_name = step.get("name", step.get("id", f"Step {i}"))
        step_desc = step.get("prompt", "")
        if step_desc and step_desc != step_name:
            steps_summary.append(f"  {i}. {step_name} — {step_desc}")
        else:
            steps_summary.append(f"  {i}. {step_name}")

    if len(pattern.steps) > 5:
        steps_summary.append(f"  ... and {len(pattern.steps) - 5} more steps")

    steps_text = "\n".join(steps_summary)

    # Build score section
    score_text = ""
    if score:
        score_text = f"""
Quality Score:    {score.overall_score:.2f} (Grade: {score.grade})
  Reliability:    {score.reliability_score:.2f}
  Efficiency:     {score.efficiency_score:.2f}
  Maturity:       {score.maturity_score:.2f}
  Reusability:    {score.reusability_score:.2f}
"""

    return f"""━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ SOLOFLOW — Skill Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I detected a repeated workflow pattern.

Pattern:          {pattern.name}
Occurrences:      {pattern.occurrence_count}
Success Rate:     {pattern.success_rate:.1%}
Avg Duration:     {format_duration(pattern.avg_duration_ms)}

What it captures:
{steps_text}
{score_text}Generate:
  [A] SKILL.md only   — AI instructions for this workflow
  [B] plugin.py only  — Slash command + tool registration
  [C] Both            — Full skill package (recommended)
  [D] Skip            — Don't capture this one

Reply with A, B, C, or D (or just "yes" for C).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"""


def format_skill_list(skills: list[Skill]) -> str:
    """Format a list of skills for display."""
    if not skills:
        return "No skills generated yet. Run `/soloflow propose` to detect patterns."

    lines = ["⚡ **SoloFlow Generated Skills:**\n"]

    for skill in skills:
        lines.append(f"- **{skill.display_name}** ({skill.category})")
        lines.append(f"  {skill.description}")
        lines.append(f"  Quality: {skill.quality_score:.2f} | Uses: {skill.use_count}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Plugin registration
# ---------------------------------------------------------------------------

def register(hermes):
    """Register SoloFlow commands with the Hermes agent."""

    # ------------------------------------------------------------------
    # DAG Engine Integration — auto-feed completed workflows to PatternDetector
    # ------------------------------------------------------------------
    def _on_workflow_complete(workflow_id: str, success: bool, duration_ms: int, workflow_def: dict):
        """Callback when a DAG workflow completes. Feeds to PatternDetector."""
        steps = workflow_def.get("steps", [])
        edges_raw = workflow_def.get("edges", [])

        # Normalize edges
        edges = []
        for e in edges_raw:
            if isinstance(e, dict):
                edges.append((e["from"], e["to"]))
            elif isinstance(e, (list, tuple)):
                edges.append((e[0], e[1]))

        # Build step list with prompts
        step_list = []
        for s in steps:
            step_list.append({
                "id": s.get("id", ""),
                "name": s.get("name", s.get("id", "")),
                "prompt": s.get("prompt", s.get("description", "")),
            })

        tools = list(set(s.get("discipline", "general") for s in steps))

        _tracker.detector.record_execution(
            workflow={
                "id": workflow_id,
                "name": workflow_def.get("name", "dag-workflow"),
                "steps": step_list,
                "edges": edges,
            },
            success=success,
            duration_ms=duration_ms,
            tools_used=tools,
        )
        _tracker.workflows_recorded += 1

    # Try to hook into WorkflowService if available
    try:
        import importlib
        ws_mod = importlib.import_module("services.workflow_service")
        if hasattr(ws_mod, "WorkflowService"):
            # Patch the constructor to auto-register our callback
            _orig_init = ws_mod.WorkflowService.__init__
            def _patched_init(self, store, *args, **kwargs):
                _orig_init(self, store, *args, **kwargs)
                self.set_on_complete(_on_workflow_complete)
            ws_mod.WorkflowService.__init__ = _patched_init
    except (ImportError, AttributeError):
        pass  # WorkflowService not available, rely on event hooks only

    # ------------------------------------------------------------------
    # /soloflow begin — explicit workflow start
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow begin",
        description="Mark the start of a workflow you want SoloFlow to capture",
        usage="/soloflow begin [workflow-name]",
    )
    async def cmd_begin(ctx, args: str = ""):
        """Start capturing a workflow explicitly."""
        # Flush any pending implicit workflow
        if not _tracker.builder.is_empty():
            _tracker.flush_builder()

        _tracker.builder.explicit = True
        _tracker.builder.name = args.strip() if args.strip() else ""
        _tracker.builder.start_time = time.time()

        name_hint = f' as "{_tracker.builder.name}"' if _tracker.builder.name else ""
        await ctx.reply(
            f"⚡ **Recording workflow{name_hint}...**\n\n"
            "Perform your steps now. Run `/soloflow end` when done.\n"
            "_Tip: You can also just work — I'll auto-detect multi-step workflows._"
        )

    # ------------------------------------------------------------------
    # /soloflow end — explicit workflow end
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow end",
        description="Mark the end of the current workflow and record it",
        usage="/soloflow end [workflow-name]",
    )
    async def cmd_end(ctx, args: str = ""):
        """Stop capturing and record the workflow."""
        name = args.strip() if args.strip() else _tracker.builder.name

        if _tracker.builder.is_empty():
            await ctx.reply("⚡ No workflow steps recorded. Nothing to save.")
            return

        if not _tracker.builder.is_multi_step():
            await ctx.reply(
                f"⚡ Only {_tracker.builder.steps.__len__()} step(s) recorded. "
                "A workflow needs at least 2 steps. Keep working or use `/soloflow begin` again."
            )
            return

        steps_count = len(_tracker.builder.steps)
        flushed = _tracker.flush_builder(name)

        if flushed:
            await ctx.reply(
                f"✅ **Workflow recorded** ({steps_count} steps)\n\n"
                "Run `/soloflow propose` to see detected patterns and generate a skill."
            )
        else:
            await ctx.reply("⚡ Workflow too short to record.")

    # ------------------------------------------------------------------
    # /soloflow propose
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow propose",
        description="Analyze the current session and propose the top detected workflow as a skill",
        usage="/soloflow propose",
    )
    async def cmd_propose(ctx, args: str = ""):
        """Trigger an immediate skill proposal from SoloFlow."""
        # Flush any pending workflow first
        _tracker.flush_builder()

        # Detect patterns
        patterns = _tracker.detector.detect_patterns(min_occurrences=2)

        if not patterns:
            await ctx.reply(
                "⚡ **SoloFlow** — No patterns detected yet.\n\n"
                "Keep working — I'm watching for repeated workflows. "
                "Run `/soloflow status` to see what I'm tracking.\n\n"
                "_Tip: Perform the same workflow 2+ times and I'll detect the pattern._\n"
                "_Use `/soloflow begin` and `/soloflow end` to mark workflow boundaries._"
            )
            return

        # Get the best pattern (most occurrences, highest success rate)
        best_pattern = max(patterns, key=lambda p: (p.occurrence_count, p.success_rate))

        # Calculate quality score
        temp_skill = _tracker.packager.package_pattern(best_pattern)
        score = _tracker.scorer.score_skill(temp_skill, best_pattern)

        # Format and display proposal
        proposal_text = format_proposal(best_pattern, score)

        # Store proposal for later use
        _tracker.last_proposal = {
            "pattern": best_pattern,
            "skill": temp_skill,
            "score": score,
        }

        # Also add to queue
        _tracker.proposal_queue.append(_tracker.last_proposal)

        await ctx.reply(proposal_text)

        await ctx.inject_system_message(
            "The user has triggered /soloflow propose. "
            "A skill proposal has been presented. "
            "Wait for the user's response (A/B/C/D or 'yes'). "
            "When they respond, use the appropriate action to generate the skill."
        )

    # ------------------------------------------------------------------
    # /soloflow generate <name>
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow generate",
        description="Generate and install a skill from the last proposal",
        usage="/soloflow generate [skill-name]",
    )
    async def cmd_generate(ctx, args: str = ""):
        """Generate and install a skill from the last proposal."""
        if not _tracker.last_proposal:
            await ctx.reply(
                "No skill proposal active. Run `/soloflow propose` first."
            )
            return

        pattern = _tracker.last_proposal["pattern"]
        score = _tracker.last_proposal["score"]

        # Use provided name or generate from pattern
        skill_name = args.strip() if args.strip() else None

        # Package the skill
        skill = _tracker.packager.package_pattern(
            pattern,
            tags=["auto-generated", "soloflow"],
        )

        # Override name if provided
        if skill_name:
            skill.name = skill_name.lower().replace(" ", "-").replace("_", "-")
            skill.display_name = skill_name.replace("-", " ").replace("_", " ").title()

        # Install to Hermes directory
        installed_files = _tracker.packager.install_skill(skill)

        # Update skill quality scores
        skill.quality_score = score.overall_score
        skill.reliability_score = score.reliability_score
        skill.efficiency_score = score.efficiency_score
        skill.maturity_score = score.maturity_score
        skill.reusability_score = score.reusability_score

        # Track generated skill
        _tracker.generated_skills.append({
            "name": skill.name,
            "display_name": skill.display_name,
            "files": [str(f) for f in installed_files],
            "generated_at": datetime.now().isoformat(),
            "quality_score": score.overall_score,
        })

        _tracker.last_generated_skill = skill

        # Format response
        files_list = "\n".join(f"- `{f}`" for f in installed_files)

        await ctx.reply(
            f"✅ **Skill '{skill.display_name}' generated and installed!**\n\n"
            f"Files written:\n{files_list}\n\n"
            f"Quality Score: {score.overall_score:.2f} (Grade: {score.grade})\n\n"
            f"Next steps:\n"
            f"1. Run `hermes skills reload` or restart Hermes to activate\n"
            f"2. Use `/{skill.name}` to trigger the workflow\n"
            f"3. Edit the generated files to refine the implementation"
        )

    # ------------------------------------------------------------------
    # /soloflow list
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow list",
        description="List all detected patterns in the current session",
        usage="/soloflow list",
    )
    async def cmd_list(ctx, args: str = ""):
        """Show detected patterns in the current session."""
        _tracker.flush_builder()

        patterns = _tracker.detector.detect_patterns(min_occurrences=2)

        if not patterns:
            await ctx.reply(
                "⚡ No patterns detected yet. Keep working — "
                "I'll detect repeated workflows automatically."
            )
            return

        lines = [f"⚡ **Detected Patterns** ({len(patterns)} found)\n"]

        for i, pattern in enumerate(patterns[:10], 1):  # Show top 10
            lines.append(
                f"{i}. **{pattern.name}** — {pattern.occurrence_count} occurrences, "
                f"{pattern.success_rate:.0%} success"
            )
            lines.append(f"   {pattern.description}")
            lines.append("")

        if len(patterns) > 10:
            lines.append(f"_... and {len(patterns) - 10} more patterns_")

        await ctx.reply("\n".join(lines))

    # ------------------------------------------------------------------
    # /soloflow skills
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow skills",
        description="List all skills generated by SoloFlow",
        usage="/soloflow skills",
    )
    async def cmd_skills(ctx, args: str = ""):
        """Show skills generated during the current session."""
        skills = _tracker.packager.list_skills()

        if not skills:
            await ctx.reply(format_skill_list([]))
            return

        await ctx.reply(format_skill_list(skills))

    # ------------------------------------------------------------------
    # /soloflow status
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow status",
        description="Show what patterns SoloFlow is currently tracking",
        usage="/soloflow status",
    )
    async def cmd_status(ctx, args: str = ""):
        """Display the current session tracking status."""
        session_age = time.time() - _tracker.session_start
        minutes = int(session_age / 60)

        # Count unique patterns
        patterns = _tracker.detector.detect_patterns(min_occurrences=1)

        # Builder status
        builder_steps = len(_tracker.builder.steps)
        builder_hint = f"\n- Current workflow: {builder_steps} steps (recording)" if builder_steps > 0 else ""

        status = (
            f"⚡ **SoloFlow Status**\n\n"
            f"- Session duration: {minutes} min\n"
            f"- Tool calls tracked: {_tracker.tool_calls_count}\n"
            f"- Commands tracked: {_tracker.commands_count}\n"
            f"- Workflows recorded: {_tracker.workflows_recorded}\n"
            f"- Unique patterns: {len(patterns)}\n"
            f"- Skills in queue: {len(_tracker.proposal_queue)}\n"
            f"- Skills generated: {len(_tracker.generated_skills)}"
            f"{builder_hint}\n\n"
            f"_SoloFlow is watching silently. "
            f"Run `/soloflow propose` to surface a proposal now._"
        )
        await ctx.reply(status)

    # ------------------------------------------------------------------
    # /soloflow queue
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow queue",
        description="Show all detected patterns queued for skill proposals",
        usage="/soloflow queue",
    )
    async def cmd_queue(ctx, args: str = ""):
        """Show the pending proposal queue."""
        if not _tracker.proposal_queue:
            await ctx.reply(
                "⚡ No patterns queued yet. Keep working — "
                "SoloFlow will detect repeatable workflows automatically."
            )
            return

        lines = [f"⚡ **Proposal Queue** ({len(_tracker.proposal_queue)} pending)\n"]

        for i, proposal in enumerate(_tracker.proposal_queue, 1):
            pattern = proposal["pattern"]
            score = proposal.get("score")
            score_text = f" | Score: {score.overall_score:.2f}" if score else ""

            lines.append(
                f"{i}. **{pattern.name}** — {pattern.occurrence_count} occurrences{score_text}"
            )
            lines.append(f"   {pattern.description}")
            lines.append("")

        lines.append("Run `/soloflow propose` to step through them.")

        await ctx.reply("\n".join(lines))

    # ------------------------------------------------------------------
    # /soloflow clear
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow clear",
        description="Clear the current session tracking log",
        usage="/soloflow clear",
    )
    async def cmd_clear(ctx, args: str = ""):
        """Reset the session tracker."""
        _tracker.clear()
        await ctx.reply("⚡ Session log cleared. SoloFlow is watching fresh.")

    # ------------------------------------------------------------------
    # Hook: aggregate tool calls into multi-step workflows
    # ------------------------------------------------------------------
    @hermes.on("tool_call")
    async def on_tool_call(ctx, tool_name: str, tool_args: dict, tool_result: Any):
        """Passively record tool calls for pattern analysis."""
        _tracker.tool_calls_count += 1

        # Skip internal soloflow tools to avoid noise
        if tool_name.startswith("soloflow"):
            return

        # Auto-flush if the builder has been stale (gap > threshold)
        if _tracker.builder.is_stale():
            _tracker.flush_builder()

        # Add this tool call as a step in the current workflow
        _tracker.builder.add_step(tool_name, tool_args or {})

    # ------------------------------------------------------------------
    # Hook: record commands for pattern detection
    # ------------------------------------------------------------------
    @hermes.on("command")
    async def on_command(ctx, command: str, args: str):
        """Passively record commands for pattern analysis."""
        _tracker.commands_count += 1

        # Skip soloflow commands themselves to avoid noise
        if command.startswith("soloflow"):
            return

        # Commands can also be workflow steps
        # But flush any pending workflow first if there's been a gap
        if _tracker.builder.is_stale():
            _tracker.flush_builder()
