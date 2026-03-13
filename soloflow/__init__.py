"""
SoloFlow - AI一人公司框架 v2.1

让一个人也能拥有完整的 AI 创作团队。

核心组件：
- FlowEngine: 任务流执行引擎
- AgentLoader: YAML 驱动的 Agent 加载器
- SkillRegistry: 统一 Skill 注册与执行系统
- ContextBus: 任务间数据传递总线
- PreferenceMemory: 用户偏好记忆
- TaskFSM: 任务状态机

Driver 系统（选择 Agent 运行时）：
- LLMDriver: 直接调用 LLM（默认），支持工具调用循环
- MCPDriver: 接入 MCP 工具服务器
- OpenClawDriver: 接入 OpenClaw 平台

快速开始：
```python
from soloflow import FlowEngine

engine = FlowEngine()
result = await engine.dispatch("帮我写一篇关于AI的文章")
print(result)
```

注册 Skill：
```python
from soloflow.skill_registry import skill

@skill(name="web_search", description="搜索互联网")
async def web_search(query: str) -> str:
    # 实现搜索逻辑
    return f"搜索结果: {query}"
```
"""

from .flow_engine import FlowEngine
from .runner import SoloFlowRunner
from .agent_loader import AgentLoader, AgentConfig, AgentSkill
from .memory import PreferenceMemory
from .context_bus import ContextBus
from .fsm import TaskFSM, TaskStatus
from .skill_registry import SkillRegistry, skill
from .drivers import (
    BaseDriver,
    DriverResult,
    LLMDriver,
    MCPDriver,
    OpenClawDriver,
    create_driver,
    register_driver,
    list_drivers
)

__version__ = "2.1.0"
__author__ = "SonicBotMan"

__all__ = [
    # 核心引擎
    "FlowEngine",
    "SoloFlowRunner",
    # Agent
    "AgentLoader",
    "AgentConfig",
    "AgentSkill",
    # Skill
    "SkillRegistry",
    "skill",
    # 内存
    "PreferenceMemory",
    "ContextBus",
    # 状态机
    "TaskFSM",
    "TaskStatus",
    # Drivers
    "BaseDriver",
    "DriverResult",
    "LLMDriver",
    "MCPDriver",
    "OpenClawDriver",
    "create_driver",
    "register_driver",
    "list_drivers",
]
