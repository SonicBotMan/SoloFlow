"""
SoloFlow Ebbinghaus Memory Example

Demonstrates the Ebbinghaus forgetting curve memory system.
"""

import asyncio
import time
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from memory.forgetting.curve import ForgettingCurve
from memory.forgetting.consolidation import MemoryConsolidator


async def main():
    print("=== SoloFlow Ebbinghaus Memory Example ===\n")
    
    # Initialize
    db_path = Path("memory_example.db")
    consolidator = MemoryConsolidator(db_path=db_path)
    curve = ForgettingCurve()
    
    # 1. Demonstrate forgetting curve
    print("1. Ebbinghaus Forgetting Curve:")
    print("   R(t) = base × e^(-t / stability)\n")
    
    stabilities = [1.0, 2.0, 5.0, 10.0]
    for stability in stabilities:
        retention_1h = curve.retention(3600, stability)
        retention_1d = curve.retention(86400, stability)
        print(f"   Stability {stability:.1f}:")
        print(f"     After 1 hour: {retention_1h:.1%}")
        print(f"     After 1 day:  {retention_1d:.1%}")
    
    # 2. Add memories
    print("\n2. Adding memories...")
    
    memories = [
        {"key": "user_name", "content": {"name": "Alice"}, "tier": "semantic", "stability": 5.0},
        {"key": "last_topic", "content": {"topic": "AI Agents"}, "tier": "episodic", "stability": 2.0},
        {"key": "current_task", "content": {"task": "Write article"}, "tier": "working", "stability": 1.0},
    ]
    
    for mem in memories:
        entry = await consolidator.add_memory(**mem)
        print(f"   Added: {mem['key']} (tier: {mem['tier']}, stability: {mem['stability']})")
    
    # 3. Access memories (increases stability)
    print("\n3. Accessing memories (increases stability)...")
    
    for _ in range(3):
        entry = await consolidator.get_memory("user_name")
        if entry:
            print(f"   Accessed 'user_name': stability={entry.stability:.2f}, count={entry.access_count}")
    
    # 4. Search memories
    print("\n4. Searching memories...")
    results = await consolidator.search_memories("AI")
    print(f"   Found {len(results)} result(s) for 'AI'")
    
    # 5. Run consolidation
    print("\n5. Running consolidation cycle...")
    stats = await consolidator.consolidate_all()
    print(f"   Consolidated: {stats['consolidated']}")
    print(f"   Expired: {stats['expired']}")
    print(f"   Promoted: {stats['promoted']}")
    
    # 6. Get statistics
    print("\n6. Memory Statistics:")
    mem_stats = await consolidator.get_memory_stats()
    print(f"   Total active: {mem_stats['total_active']}")
    print(f"   Total expired: {mem_stats['total_expired']}")
    
    # 7. Decay schedule
    print("\n7. Decay Schedule (stability=2.0):")
    schedule = curve.decay_schedule(stability=2.0, num_points=5)
    for time_elapsed, retention in schedule:
        hours = time_elapsed / 3600
        print(f"   {hours:6.1f} hours: {retention:.1%} retention")
    
    # Cleanup
    consolidator.close()
    db_path.unlink(missing_ok=True)
    
    print("\n=== Example Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
