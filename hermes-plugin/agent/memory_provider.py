"""Re-export MemoryProvider from hermes_agent.agent.memory_provider."""

from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

# Add hermes-agent root to sys.path using a unique name to avoid conflicts
_HERMES = _Path(__file__).resolve().parents[4]  # soloflow/agent/ → soloflow/ → memory/ → plugins/ → hermes-agent/
if str(_HERMES) not in _sys.path:
    _sys.path.insert(0, str(_HERMES))

# Import from hermes_agent.agent.memory_provider (NOT 'agent.memory_provider' which is the plugin's own file!)
import hermes_agent.agent.memory_provider as _mp

MemoryProvider = _mp.MemoryProvider

__all__ = ["MemoryProvider"]
