# CI Fix Guide

## Problem

The CI workflow at `.github/workflows/ci.yml` has a test script that uses incorrect API methods.

## Solution

Update the `Run integration tests` step in the `python-test` job:

### Changes Needed

1. **Add import for StepState:**
```python
from models import StepState
```

2. **Replace `get_ready_steps()` with checking step states:**
```python
# Old:
ready = await ws.get_ready_steps(wf["id"])
check("a ready", "a" in ready)

# New:
started = await ws.start_workflow(wf["id"])
check("started", started["state"] == "running")
steps_status = {s["id"]: s["state"] for s in started["steps"]}
check("a ready", steps_status.get("a") == StepState.READY.value)
```

3. **Replace `get_workflow_status()` with `get_status()`:**
```python
# Old:
status = await ws.get_workflow_status(wf["id"])

# New:
status = await ws.get_status(wf["id"])
```

## How to Apply

1. Go to https://github.com/SonicBotMan/SoloFlow/blob/main/.github/workflows/ci.yml
2. Click the edit button (pencil icon)
3. Apply the changes above
4. Commit directly to main or create a PR
