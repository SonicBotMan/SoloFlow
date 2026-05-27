# SoloFlow Discipline-Aware Routing

Automatic task classification and routing to appropriate agent disciplines.

## Overview

This module classifies tasks by complexity and routes them to the appropriate
agent discipline for execution:

| Discipline | Response Time | Use Case |
|------------|---------------|----------|
| `quick` | ~2s | Simple tasks, yes/no answers, summaries |
| `deep` | ~30s | Complex analysis, research, code |
| `visual` | ~30s | Image generation, UI design, diagrams |
| `ultrabrain` | ~120s | Multi-agent coordination, debates |

## Quick Start

```python
from routing import TaskClassifier, DisciplineRouter, Discipline

# Create classifier
classifier = TaskClassifier()

# Classify a task
result = classifier.classify("Summarize this article in 3 bullet points")
print(result.discipline)  # Discipline.QUICK
print(result.confidence)  # 0.4
print(result.reasoning)   # "Detected features: simple..."

# Create router with executors
router = DisciplineRouter(classifier=classifier)

# Register executors
async def quick_handler(task: str) -> str:
    return f"Quick: {task}"

async def deep_handler(task: str) -> str:
    return f"Deep: {task}"

router.register_executor(Executor(
    name="quick-agent",
    discipline=Discipline.QUICK,
    handler=quick_handler,
))

router.register_executor(Executor(
    name="deep-agent",
    discipline=Discipline.DEEP,
    handler=deep_handler,
))

# Route and execute
result = await router.route_and_execute("Analyze the market trends")
```

## Architecture

```
routing/
├── __init__.py      # Package exports
├── classifier.py    # TaskClassifier + Discipline enum
└── router.py        # DisciplineRouter + Executor

tests/routing/
└── test_routing.py  # Tests (13 passing)
```

## API Reference

### TaskClassifier

```python
classifier = TaskClassifier(
    custom_patterns={"my_pattern": [r"\bmy_keyword\b"]}
)

# Classify a task
result = classifier.classify("task description")
# Returns: ClassificationResult(discipline, confidence, reasoning, features)

# Extract features
features = classifier.extract_features("task description")
# Returns: {"simple": True, "complex": False, ...}

# Batch classification
results = classifier.classify_batch(["task1", "task2"])
```

### Discipline

```python
class Discipline(str, Enum):
    QUICK = "quick"        # ~2s, simple tasks
    DEEP = "deep"          # ~30s, complex analysis
    VISUAL = "visual"      # ~30s, image/UI tasks
    ULTRABRAIN = "ultrabrain"  # ~120s, multi-agent
```

### DisciplineRouter

```python
router = DisciplineRouter(
    classifier=TaskClassifier(),
    default_discipline=Discipline.DEEP,
)

# Register executors
router.register_executor(Executor(
    name="my-agent",
    discipline=Discipline.QUICK,
    handler=my_handler,
))

# Route a task
result = router.route("task description")
# Returns: RoutingResult(classification, executor, task)

# Route and execute
output = await router.route_and_execute("task description")

# List executors
executors = router.list_executors()
# Returns: {"quick": ["my-agent"], "deep": [...]}
```

## Testing

```bash
python -m pytest tests/routing/ -v
```

## License

MIT
