"""
Driver 注册表

通过 YAML 中的 driver: xxx 字段选择对应的 Driver 实现。
支持的 Driver 类型：
  - llm      : 直接调用 LLM（默认）
  - openclaw : 接入 OpenClaw 平台
  - mcp      : 接入任意 MCP Server（stdio/sse）
  - skill    : 本地 Python Skill 执行引擎
  - http     : 接入外部 HTTP 服务（预留）
"""

from .base import BaseDriver, DriverResult
from .llm_driver import LLMDriver
from .openclaw_driver import OpenClawDriver
from .mcp_driver import MCPDriver
from .skill_driver import SkillDriver

_DRIVER_REGISTRY = {
    "llm": LLMDriver,
    "openclaw": OpenClawDriver,
    "mcp": MCPDriver,
    "skill": SkillDriver,
}


def register_driver(name: str, driver_class):
    """注册自定义 Driver，支持用户扩展
    
    Args:
        name: driver 类型名称（对应 YAML driver 字段）
        driver_class: 继承 BaseDriver 的类
    """
    if not issubclass(driver_class, BaseDriver):
        raise TypeError(f"driver_class 必须继承 BaseDriver，当前: {driver_class}")
    _DRIVER_REGISTRY[name] = driver_class


def create_driver(driver_type: str, **kwargs) -> BaseDriver:
    """根据类型创建 Driver 实例
    
    Args:
        driver_type: driver 类型（llm/openclaw/mcp/skill/http）
        **kwargs: 传递给 Driver 构造函数的参数
        
    Returns:
        BaseDriver 实例
        
    Raises:
        ValueError: 未知的 driver 类型
    """
    driver_cls = _DRIVER_REGISTRY.get(driver_type)
    if not driver_cls:
        available = list(_DRIVER_REGISTRY.keys())
        raise ValueError(
            f"未知的 Driver 类型: '{driver_type}'。"
            f" 可用类型: {available}。"
            f" 可通过 register_driver() 注册自定义 Driver。"
        )
    return driver_cls(**kwargs)


__all__ = [
    "BaseDriver",
    "DriverResult",
    "LLMDriver",
    "OpenClawDriver",
    "MCPDriver",
    "SkillDriver",
    "create_driver",
    "register_driver",
]
