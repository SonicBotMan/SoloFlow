"""
SoloFlow - AI一人公司框架
基于「任务流水线 + 轻量状态机」的通用AI一人公司落地框架

Author: SonicBotMan Team
Version: v2.0.0
"""

__version__ = "2.0.0"
__author__ = "SonicBotMan"

from .fsm import TaskFSM, TaskStatus, Task
from .agent_loader import AgentLoader, AgentConfig
from .memory import PreferenceMemory
from .context_bus import ContextBus
from .drivers import BaseDriver, DriverResult, create_driver, list_drivers
from .runner import SoloFlowRunner

__all__ = [
    # Core
    "TaskFSM",
    "TaskStatus", 
    "Task",
    # Config
    "AgentLoader",
    "AgentConfig",
    # Memory
    "PreferenceMemory",
    # v2.0: Context
    "ContextBus",
    # v2.0: Driver
    "BaseDriver",
    "DriverResult",
    "create_driver",
    "list_drivers",
    # Runner
    "SoloFlowRunner",
]
