"""
SoloFlow - AI一人公司框架
基于「任务流水线 + 轻量状态机」的通用AI一人公司落地框架

Author: SonicBotMan Team
Version: v1.0.0
"""

__version__ = "1.0.0"
__author__ = "SonicBotMan"

from .fsm import TaskFSM, TaskStatus, Task
from .agent_loader import AgentLoader, AgentConfig
from .memory import PreferenceMemory
from .runner import SoloFlowRunner

__all__ = [
    "TaskFSM",
    "TaskStatus", 
    "Task",
    "AgentLoader",
    "AgentConfig",
    "PreferenceMemory",
    "SoloFlowRunner",
]
