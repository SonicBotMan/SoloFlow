# SoloFlow Ebbinghaus Forgetting Curve

Memory decay modeling and automatic consolidation based on cognitive science.

## Overview

This module implements the Ebbinghaus forgetting curve:

```
R(t) = base × e^(-t / stability)
```

Where:
- `R(t)` = retention at time t
- `base` = initial retention (1.0 = 100%)
- `t` = time elapsed since last access
- `stability` = memory stability (higher = slower decay)

## Key Concepts

### Memory Stability

Stability determines how fast a memory decays:
- **Low stability (1.0)**: Forgets quickly (~37% retention after 1 time unit)
- **High stability (10.0)**: Forgets slowly (~37% retention after 10 time units)

### Spacing Effect

Each successful retrieval increases stability by a growth factor (default: 1.5x):
```
new_stability = old_stability × growth_factor
```

This models the spacing effect: spaced repetition improves long-term retention.

### Memory Tiers

Memories are organized in three tiers:
- **Working**: Current context (fast access, small capacity)
- **Episodic**: Past experiences (medium access, timestamped)
- **Semantic**: Abstracted knowledge (slow access, persistent)

## Quick Start

```python
from memory.forgetting import ForgettingCurve, MemoryConsolidator

# Create forgetting curve
curve = ForgettingCurve()

# Calculate retention
retention = curve.retention(
    time_elapsed=3600,  # 1 hour
    stability=1.0,
)
print(f"Retention: {retention:.2%}")

# Create consolidator
consolidator = MemoryConsolidator(db_path=Path("memory.db"))

# Add memories
await consolidator.add_memory(
    key="user_preference",
    content={"theme": "dark", "language": "zh"},
    tier="episodic",
    stability=1.0,
)

# Access memory (increases stability)
entry = await consolidator.get_memory("user_preference")
print(f"Access count: {entry.access_count}")
print(f"Stability: {entry.stability}")

# Consolidate all memories
stats = await consolidator.consolidate_all()
print(f"Consolidated: {stats['consolidated']}")
print(f"Expired: {stats['expired']}")
```

## Architecture

```
memory/
└── forgetting/
    ├── __init__.py        # Package exports
    ├── curve.py           # ForgettingCurve + MemoryEntry
    └── consolidation.py   # MemoryConsolidator

tests/memory/
└── test_forgetting.py     # Tests (19 passing)
```

## API Reference

### ForgettingCurve

```python
curve = ForgettingCurve(
    stability_growth_factor=1.5,  # How much stability increases per access
    min_retention_threshold=0.1,  # Below this, memory is "forgotten"
)

# Calculate retention
retention = curve.retention(time_elapsed, stability, base_retention)

# Check if memory needs consolidation
should_consolidate = curve.should_consolidate(entry)

# Consolidate memory (increase stability)
entry = curve.consolidate(entry)

# Calculate time until target retention
time_until = curve.time_until_forget(stability, base_retention, target_retention)

# Generate decay schedule
schedule = curve.decay_schedule(stability, base_retention, num_points=10)
```

### MemoryEntry

```python
entry = MemoryEntry(
    key="unique_key",
    content={"data": "value"},
    stability=1.0,
    base_retention=1.0,
)

# Access memory (increases access count)
entry.access()

# Calculate current retention
retention = entry.current_retention(curve)

# Serialize
d = entry.to_dict()
entry = MemoryEntry.from_dict(d)
```

### MemoryConsolidator

```python
consolidator = MemoryConsolidator(
    db_path=Path("memory.db"),
    curve=ForgettingCurve(),
    consolidation_interval=300.0,  # 5 minutes
)

# Start/stop consolidation loop
await consolidator.start()
await consolidator.stop()

# Add/get/search memories
entry = await consolidator.add_memory(key, content, tier, stability)
entry = await consolidator.get_memory(key)
entries = await consolidator.search_memories(query, tier, limit)

# Consolidate all memories
stats = await consolidator.consolidate_all()

# Get statistics
stats = await consolidator.get_memory_stats()

# Cleanup expired memories
count = await consolidator.cleanup_expired(older_than_hours=24)
```

## Testing

```bash
python -m pytest tests/memory/ -v
```

## References

- Ebbinghaus, H. (1885). Memory: A Contribution to Experimental Psychology.
- Wozniak, P. A. (1990). Optimization of learning.
- Spaced repetition: https://en.wikipedia.org/wiki/Spaced_repetition

## License

MIT
