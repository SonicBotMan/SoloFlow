"""
Agent Driver 抽象基类

每种 Driver 对应一种 Agent 运行时：
- LLMDriver: 直接调用 LLM
- OpenClawDriver: 接入 OpenClaw
- HTTPDriver: 接入外部 HTTP 服务
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class DriverResult:
    """Driver 执行结果"""
    content: str
    tool_calls: List[Dict] = field(default_factory=list)
    raw: Any = None
    tokens_used: int = 0
    success: bool = True
    error: Optional[str] = None


class BaseDriver(ABC):
    """
    Agent Driver 抽象基类。
    
    每种 Driver 对应一种 Agent 运行时。
    通过 YAML 中的 driver: llm/openclaw/http 字段选择。
    """
    
    @abstractmethod
    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: Optional[List[Dict]] = None,
        config: Optional[Dict] = None
    ) -> DriverResult:
        """
        执行 Agent 任务
        
        Args:
            system_prompt: 系统提示词
            user_message: 用户消息
            tools: 工具定义列表（可选）
            config: 运行时配置（可选）
            
        Returns:
            DriverResult: 执行结果
        """
        ...
    
    @abstractmethod
    async def health_check(self) -> bool:
        """
        检查 Driver 是否可用
        
        Returns:
            bool: 是否健康
        """
        ...
    
    def _to_openai_tools(self, tools: List[Dict]) -> List[Dict]:
        """
        将工具定义转换为 OpenAI function schema
        
        Args:
            tools: 工具定义列表
            
        Returns:
            List[Dict]: OpenAI function schema
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": t.get("name"),
                    "description": t.get("description", ""),
                    "parameters": t.get("parameters", {
                        "type": "object",
                        "properties": {}
                    })
                }
            }
            for t in tools
            if t.get("name")
        ]
