"""
SoloFlow Skill Evolution Example

Demonstrates the skill auto-evolution system.
"""

import asyncio
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from evolution.pattern_detector import PatternDetector
from evolution.skill_packager import SkillPackager
from evolution.quality_scorer import QualityScorer


async def main():
    print("=== SoloFlow Skill Evolution Example ===\n")
    
    # Initialize
    patterns_db = Path("patterns_example.db")
    skills_db = Path("skills_example.db")
    
    detector = PatternDetector(db_path=patterns_db)
    packager = SkillPackager(db_path=skills_db)
    scorer = QualityScorer()
    
    # 1. Simulate workflow executions
    print("1. Simulating workflow executions...")
    
    workflows = [
        {
            "id": "wf_research_1",
            "name": "research-report",
            "steps": [
                {"name": "选题", "prompt": "确定研究方向"},
                {"name": "搜索", "prompt": "搜索资料"},
                {"name": "撰写", "prompt": "写报告"},
            ],
            "edges": [("选题", "搜索"), ("搜索", "撰写")],
        },
        {
            "id": "wf_research_2",
            "name": "research-report",
            "steps": [
                {"name": "选题", "prompt": "确定研究方向"},
                {"name": "搜索", "prompt": "搜索资料"},
                {"name": "撰写", "prompt": "写报告"},
            ],
            "edges": [("选题", "搜索"), ("搜索", "撰写")],
        },
        {
            "id": "wf_research_3",
            "name": "research-report",
            "steps": [
                {"name": "选题", "prompt": "确定研究方向"},
                {"name": "搜索", "prompt": "搜索资料"},
                {"name": "撰写", "prompt": "写报告"},
            ],
            "edges": [("选题", "搜索"), ("搜索", "撰写")],
        },
    ]
    
    for i, wf in enumerate(workflows):
        detector.record_execution(
            workflow=wf,
            success=True,
            duration_ms=1000 + i * 100,
        )
        print(f"   Recorded: {wf['id']}")
    
    # 2. Detect patterns
    print("\n2. Detecting patterns...")
    patterns = detector.detect_patterns(min_occurrences=2)
    
    for pattern in patterns:
        print(f"   Pattern: {pattern.name}")
        print(f"     Occurrences: {pattern.occurrence_count}")
        print(f"     Success rate: {pattern.success_rate:.1%}")
        print(f"     Fingerprint: {pattern.fingerprint}")
    
    # 3. Package patterns into skills
    print("\n3. Packaging skills...")
    
    for pattern in patterns:
        skill = packager.package_pattern(pattern)
        print(f"   Skill: {skill.name}")
        print(f"     ID: {skill.skill_id}")
        print(f"     Version: {skill.version}")
        
        # Convert to MCP tool
        mcp_tool = skill.to_mcp_tool()
        print(f"     MCP Tool: {mcp_tool['name']}")
    
    # 4. Score skills
    print("\n4. Scoring skills...")
    
    skills = packager.list_skills()
    for skill in skills:
        # Find matching pattern
        pattern = next((p for p in patterns if p.pattern_id == skill.pattern_id), None)
        score = scorer.score_skill(skill, pattern)
        
        print(f"   {skill.name}:")
        print(f"     Overall: {score.overall_score:.2f} (Grade: {score.grade})")
        print(f"     Reliability: {score.reliability_score:.2f}")
        print(f"     Efficiency: {score.efficiency_score:.2f}")
        print(f"     Maturity: {score.maturity_score:.2f}")
        print(f"     Reusability: {score.reusability_score:.2f}")
    
    # 5. Rank skills
    print("\n5. Ranking skills...")
    ranked = scorer.rank_skills(skills, patterns={p.pattern_id: p for p in patterns})
    
    for i, (skill, score) in enumerate(ranked, 1):
        print(f"   #{i}: {skill.name} - {score.grade} ({score.overall_score:.2f})")
    
    # Cleanup
    detector.close()
    packager.close()
    patterns_db.unlink(missing_ok=True)
    skills_db.unlink(missing_ok=True)
    
    print("\n=== Example Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
