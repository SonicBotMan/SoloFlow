"""Pytest configuration for SoloFlow hermes-plugin tests."""

import sys
from pathlib import Path

# Add hermes-plugin core directories to path so imports work
# This avoids importing the package __init__.py which has external deps
plugin_root = Path(__file__).parent.parent
sys.path.insert(0, str(plugin_root / "core"))
sys.path.insert(0, str(plugin_root / "memory"))
sys.path.insert(0, str(plugin_root / "services"))
sys.path.insert(0, str(plugin_root / "store"))
sys.path.insert(0, str(plugin_root))  # for models.py
