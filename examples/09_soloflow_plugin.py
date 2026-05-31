"""
SoloFlow — Installation Example

Demonstrates how to install and use SoloFlow as a Hermes plugin.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from evolution.pattern_detector import PatternDetector
from evolution.skill_packager import SkillPackager
from evolution.quality_scorer import QualityScorer


async def main():
    print("=== SoloFlow Installation Example ===\n")
    
    # 1. Initialize components
    print("1. Initializing SoloFlow components...")
    
    detector = PatternDetector()
    packager = SkillPackager()
    scorer = QualityScorer()
    
    print("   ✓ PatternDetector")
    print("   ✓ SkillPackager")
    print("   ✓ QualityScorer")
    
    # 2. Simulate workflow executions
    print("\n2. Simulating workflow executions...")
    
    workflows = [
        {
            "id": "meeting_1",
            "name": "meeting-notes",
            "steps": [
                {"id": "record", "name": "Record audio"},
                {"id": "transcribe", "name": "Transcribe with Whisper"},
                {"id": "correct", "name": "LLM correction"},
                {"id": "save", "name": "Save to gbrain"},
                {"id": "sync", "name": "Sync to IMA"},
            ],
            "edges": [
                ("record", "transcribe"),
                ("transcribe", "correct"),
                ("correct", "save"),
                ("save", "sync"),
            ],
        },
        {
            "id": "meeting_2",
            "name": "meeting-notes",
            "steps": [
                {"id": "record", "name": "Record audio"},
                {"id": "transcribe", "name": "Transcribe with Whisper"},
                {"id": "correct", "name": "LLM correction"},
                {"id": "save", "name": "Save to gbrain"},
                {"id": "sync", "name": "Sync to IMA"},
            ],
            "edges": [
                ("record", "transcribe"),
                ("transcribe", "correct"),
                ("correct", "save"),
                ("save", "sync"),
            ],
        },
        {
            "id": "meeting_3",
            "name": "meeting-notes",
            "steps": [
                {"id": "record", "name": "Record audio"},
                {"id": "transcribe", "name": "Transcribe with Whisper"},
                {"id": "correct", "name": "LLM correction"},
                {"id": "save", "name": "Save to gbrain"},
                {"id": "sync", "name": "Sync to IMA"},
            ],
            "edges": [
                ("record", "transcribe"),
                ("transcribe", "correct"),
                ("correct", "save"),
                ("save", "sync"),
            ],
        },
    ]
    
    for wf in workflows:
        detector.record_execution(
            workflow=wf,
            success=True,
            duration_ms=1500 + hash(wf["id"]) % 500,
            tools_used=["audio_record", "whisper", "llm", "gbrain", "ima"],
        )
        print(f"   ✓ Recorded: {wf['id']}")
    
    # 3. Detect patterns
    print("\n3. Detecting patterns...")
    
    patterns = detector.detect_patterns(min_occurrences=2)
    
    print(f"   ✓ Found {len(patterns)} pattern(s)")
    
    for pattern in patterns:
        print(f"\n   Pattern: {pattern.name}")
        print(f"     Occurrences: {pattern.occurrence_count}")
        print(f"     Success rate: {pattern.success_rate:.1%}")
        print(f"     Avg duration: {pattern.avg_duration_ms:.0f}ms")
        print(f"     Tools: {', '.join(pattern.tools_used)}")
    
    # 4. Package pattern into skill
    print("\n4. Packaging skill...")
    
    if patterns:
        pattern = patterns[0]
        skill = packager.package_pattern(pattern)
        
        print(f"   ✓ Skill: {skill.name}")
        print(f"     Category: {skill.category}")
        print(f"     Description: {skill.description}")
        print(f"     Tags: {', '.join(skill.tags)}")
        
        # 5. Score the skill
        print("\n5. Scoring skill...")
        
        score = scorer.score_skill(skill, pattern)
        
        print(f"   ✓ Quality Score: {score.overall_score:.2f} (Grade: {score.grade})")
        print(f"     Reliability: {score.reliability_score:.2f}")
        print(f"     Efficiency: {score.efficiency_score:.2f}")
        print(f"     Maturity: {score.maturity_score:.2f}")
        print(f"     Reusability: {score.reusability_score:.2f}")
        
        # 6. Show generated files
        print("\n6. Generated files:")
        print(f"\n   === SKILL.md ===")
        print(skill.skill_md_content[:500])
        print("   ...")
        
        print(f"\n   === plugin.py ===")
        print(skill.plugin_py_content[:500])
        print("   ...")
        
        # 7. Install to Hermes directory (optional)
        print("\n7. Installation:")
        print("   To install this skill to Hermes:")
        print(f"   cp -r skills/meta/soloflow ~/.hermes/skills/meta/")
        print(f"   cp plugins/soloflow.py ~/.hermes/plugins/")
        print(f"   cp -r evolution ~/.hermes/plugins/")
        print(f"   hermes skills reload")
    
    # Cleanup
    detector.close()
    packager.close()
    
    print("\n=== Example Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
