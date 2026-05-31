"""
SoloFlow — Hermes Plugin

Meta-skill that watches workflows and generates reusable skills automatically.
Replaces skill-factory with deeper integration and quality scoring.

Install:
    cp plugins/soloflow.py ~/.hermes/plugins/
    cp -r skills/meta/soloflow ~/.hermes/skills/meta/

Usage:
    /soloflow propose          Analyze session and propose top detected skill
    /soloflow generate <name>  Generate and install a detected skill
    /soloflow list             List all detected patterns
    /soloflow skills           List all generated skills
    /soloflow status           Show tracking status
    /soloflow queue            Show pending pattern proposals
    /soloflow clear            Clear session tracking log
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
PLUGIN_VERSION = "1.0.0"
PLUGIN_DESCRIPTION = "Meta-skill that watches workflows and generates reusable skills automatically"

# ---------------------------------------------------------------------------
# Global state (in-memory, per Hermes session)
# ---------------------------------------------------------------------------

class SessionTracker:
    """Tracks workflow patterns within the current Hermes session."""
    
    def __init__(self):
        self.detector = PatternDetector()
        self.packager = SkillPackager()
        self.scorer = QualityScorer()
        
        self.generated_skills: list[dict[str, Any]] = []
        self.proposal_queue: list[dict[str, Any]] = []
        self.last_proposal: dict[str, Any] | None = None
        self.last_generated_skill: Skill | None = None
        
        self.session_start = time.time()
        self.tool_calls_count = 0
        self.commands_count = 0
    
    def clear(self):
        """Reset session tracker."""
        self.detector.clear()
        self.packager = SkillPackager()
        self.generated_skills.clear()
        self.proposal_queue.clear()
        self.last_proposal = None
        self.last_generated_skill = None
        self.tool_calls_count = 0
        self.commands_count = 0
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
{score_text}
Generate:
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
    # /soloflow propose
    # ------------------------------------------------------------------
    @hermes.command(
        name="soloflow propose",
        description="Analyze the current session and propose the top detected workflow as a skill",
        usage="/soloflow propose",
    )
    async def cmd_propose(ctx, args: str = ""):
        """Trigger an immediate skill proposal from SoloFlow."""
        # Detect patterns
        patterns = _tracker.detector.detect_patterns(min_occurrences=2)
        
        if not patterns:
            await ctx.reply(
                "⚡ **SoloFlow** — No patterns detected yet.\n\n"
                "Keep working — I'm watching for repeated workflows. "
                "Run `/soloflow status` to see what I'm tracking.\n\n"
                "_Tip: Perform the same workflow 2+ times and I'll detect the pattern._"
            )
            return
        
        # Get the best pattern (most occurrences, highest success rate)
        best_pattern = max(patterns, key=lambda p: (p.occurrence_count, p.success_rate))
        
        # Calculate quality score
        # Create a temporary skill for scoring
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
        
        # Inject system message to guide AI behavior
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
        
        status = (
            f"⚡ **SoloFlow Status**\n\n"
            f"- Session duration: {minutes} min\n"
            f"- Tool calls tracked: {_tracker.tool_calls_count}\n"
            f"- Commands tracked: {_tracker.commands_count}\n"
            f"- Unique patterns: {len(patterns)}\n"
            f"- Skills in queue: {len(_tracker.proposal_queue)}\n"
            f"- Skills generated: {len(_tracker.generated_skills)}\n\n"
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
    # Hook: record tool calls for pattern detection
    # ------------------------------------------------------------------
    @hermes.on("tool_call")
    async def on_tool_call(ctx, tool_name: str, tool_args: dict, tool_result: Any):
        """Passively record tool calls for pattern analysis."""
        _tracker.tool_calls_count += 1
        
        # Record as a workflow execution
        # We treat each tool call as a single-step workflow
        _tracker.detector.record_execution(
            workflow={
                "id": str(uuid.uuid4()),
                "name": f"tool:{tool_name}",
                "steps": [
                    {
                        "id": "step_1",
                        "name": tool_name,
                        "prompt": f"Execute {tool_name}",
                    }
                ],
                "edges": [],
            },
            success=True,  # Assume success unless we can detect otherwise
            tools_used=[tool_name],
            metadata={
                "args_keys": list(tool_args.keys()) if isinstance(tool_args, dict) else [],
            },
        )
    
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
        
        # Record as a workflow execution
        _tracker.detector.record_execution(
            workflow={
                "id": str(uuid.uuid4()),
                "name": f"command:{command}",
                "steps": [
                    {
                        "id": "step_1",
                        "name": command,
                        "prompt": f"Execute command: /{command} {args}",
                    }
                ],
                "edges": [],
            },
            success=True,
            tools_used=[],
            metadata={
                "has_args": bool(args),
            },
        )
    
    # ------------------------------------------------------------------
    # Hook: record multi-step workflows
    # ------------------------------------------------------------------
    # Note: This is a placeholder for future integration with
    # SoloFlow's DAG engine. When a workflow is executed through
    # SoloFlow, we can capture the full multi-step pattern.
    
    # @hermes.on("workflow_start")
    # async def on_workflow_start(ctx, workflow_id: str, workflow_def: dict):
    #     """Record workflow start for pattern detection."""
    #     pass
    
    # @hermes.on("workflow_step")
    # async def on_workflow_step(ctx, workflow_id: str, step_id: str, result: Any):
    #     """Record workflow step completion."""
    #     pass
    
    # @hermes.on("workflow_end")
    # async def on_workflow_end(ctx, workflow_id: str, success: bool, duration_ms: int):
    #     """Record workflow completion for pattern detection."""
    #     pass
