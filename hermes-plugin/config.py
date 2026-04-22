"""
Configuration management for SoloFlow plugin.

Provides paths and settings for data storage and execution defaults.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

# Base directories
HERMES_HOME = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
SOLOFLOW_DATA_DIR = HERMES_HOME / "soloflow-data"
SOLOFLOW_DB_PATH = SOLOFLOW_DATA_DIR / "soloflow.db"

# Default configuration values
DEFAULT_CONFIG: dict[str, Any] = {
    "max_parallelism": 4,
    "default_timeout": 300,  # seconds
    "retry_delay": 5,  # seconds
    "max_retries": 2,
}


def get_data_dir() -> Path:
    """Get the data directory for SoloFlow, creating it if it doesn't exist."""
    SOLOFLOW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    return SOLOFLOW_DATA_DIR


def get_db_path() -> Path:
    """Get the database path for SoloFlow."""
    return SOLOFLOW_DB_PATH


def get_config() -> dict[str, Any]:
    """Get the plugin configuration, merged with defaults."""
    config = dict(DEFAULT_CONFIG)

    if env_val := os.environ.get("SOLOFLOW_MAX_PARALLELISM"):
        try:
            config["max_parallelism"] = int(env_val)
        except ValueError:
            pass

    if env_val := os.environ.get("SOLOFLOW_DEFAULT_TIMEOUT"):
        try:
            config["default_timeout"] = int(env_val)
        except ValueError:
            pass

    if env_val := os.environ.get("SOLOFLOW_RETRY_DELAY"):
        try:
            config["retry_delay"] = int(env_val)
        except ValueError:
            pass

    if env_val := os.environ.get("SOLOFLOW_MAX_RETRIES"):
        try:
            config["max_retries"] = int(env_val)
        except ValueError:
            pass

    return config
