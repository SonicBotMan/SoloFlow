# SoloFlow Code Style Guide

## Python Style

### General
- Follow PEP 8
- Use type hints for all functions
- Use docstrings for all public functions
- Keep functions focused and small
- Use meaningful variable names

### Imports
```python
# Good
from typing import Optional, List
from pathlib import Path

# Bad
from typing import *
import os, sys
```

### Type Hints
```python
# Good
def process(data: dict[str, Any]) -> list[str]:
    ...

# Bad
def process(data):
    ...
```

### Docstrings
```python
# Good
def calculate_retention(time_elapsed: float, stability: float) -> float:
    """Calculate memory retention using Ebbinghaus curve.
    
    Args:
        time_elapsed: Time in seconds since last access
        stability: Memory stability factor
        
    Returns:
        Retention value between 0.0 and 1.0
    """
    ...

# Bad
def calculate_retention(t, s):
    # Calculate retention
    ...
```

## Testing Style

### Test Naming
```python
# Good
def test_create_workflow_with_valid_steps():
    ...

def test_create_workflow_with_empty_steps_raises_error():
    ...

# Bad
def test_workflow():
    ...
```

### Test Structure
```python
# Arrange
store = SQLiteStore(db_path)
store.initialize()
service = WorkflowService(store)

# Act
result = await service.create_workflow(...)

# Assert
assert result["state"] == "draft"
```

## Documentation Style

### README
- Clear project description
- Quick start guide
- API reference
- Examples

### Code Comments
- Explain why, not what
- Keep comments up to date
- Remove commented-out code
