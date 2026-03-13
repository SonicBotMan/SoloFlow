"""
Agent Driver 注册表

通过 driver 字符串名称选择对应的 Driver 类型。
YAML 配置示例：
```yaml
driver: llm  # 或 openclaw
driver_config:
  endpoint: http://localhost:3100
  timeout: 600
```
"""

from typing import Any, Dict, Type
from .base import BaseDriver, DriverResult
from .llm_driver import LLMDriver
from .openclaw_driver import OpenClawDriver


# Driver 注册表
DRIVER_REGISTRY: Dict[str, Type[BaseDriver]] = {
    "llm": LLMDriver,
    "openclaw": OpenClawDriver,
    # 未来可扩展：
    # "http": HTTPDriver,
    # "mock": MockDriver,
}


def create_driver(driver_type: str, **kwargs) -> BaseDriver:
    """
    创建 Driver 实例
    
    Args:
        driver_type: Driver 类型（llm/openclaw/...）
        **kwargs: Driver 配置参数
        
    Returns:
        BaseDriver: Driver 实例
        
    Raises:
        ValueError: 未知的 driver 类型
    """
    cls = DRIVER_REGISTRY.get(driver_type)
    if not cls:
        available = list(DRIVER_REGISTRY.keys())
        raise ValueError(
            f"Unknown driver: {driver_type}. Available: {available}"
        )
    return cls(**kwargs)


def register_driver(name: str, driver_cls: Type[BaseDriver]):
    """
    注册新的 Driver 类型
    
    Args:
        name: Driver 名称
        driver_cls: Driver 类
    """
    DRIVER_REGISTRY[name] = driver_cls


def list_drivers() -> Dict[str, Type[BaseDriver]]:
    """
    列出所有注册的 Driver
    
    Returns:
        Dict[str, Type[BaseDriver]]: Driver 注册表
    """
    return DRIVER_REGISTRY.copy()


# 导出
__all__ = [
    "BaseDriver",
    "DriverResult",
    "LLMDriver",
    "OpenClawDriver",
    "create_driver",
    "register_driver",
    "list_drivers",
]
