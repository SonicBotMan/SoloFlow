"""
LLM Driver - 直接调用 LLM

这是默认的 Driver，直接通过 OpenAI SDK 调用大模型。
支持：
- OpenAI GPT 系列
- 国内部署的 OpenAI 兼容接口（如 MiniMax、智谱）
"""

from typing import Any, Dict, List, Optional
from openai import AsyncOpenAI
from .base import BaseDriver, DriverResult


class LLMDriver(BaseDriver):
    """
    LLM Driver。
    
    直接调用 LLM，不经过 OpenClaw。
    适用于：
    - OpenAI GPT 系列
    - 国内部署的 OpenAI 兼容接口
    - 任何 OpenAI SDK 支持的模型
    """
    
    def __init__(
        self,
        api_key: str = None,
        base_url: str = None,
        default_model: str = "gpt-4o",
        **kwargs
    ):
        """
        初始化 LLM Driver
        
        Args:
            api_key: API Key（可选，从环境变量读取）
            base_url: Base URL（可选，用于国内镜像）
            default_model: 默认模型
            **kwargs: 其他配置
        """
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.default_model = default_model
        self.config = kwargs
    
    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: Optional[List[Dict]] = None,
        config: Optional[Dict] = None
    ) -> DriverResult:
        """
        执行 LLM 调用
        
        Args:
            system_prompt: 系统提示词
            user_message: 用户消息
            tools: 工具定义列表（可选）
            config: 运行时配置（可选）
            
        Returns:
            DriverResult: 执行结果
        """
        cfg = config or {}
        
        # 构建消息
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        # 构建 kwargs
        kwargs = {
            "model": cfg.get("model", self.default_model),
            "messages": messages,
            "temperature": cfg.get("temperature", 0.7),
            "max_tokens": cfg.get("max_tokens", 4096),
        }
        
        # 如果有工具定义，转换为 OpenAI function schema
        if tools:
            kwargs["tools"] = self._to_openai_tools(tools)
            kwargs["tool_choice"] = cfg.get("tool_choice", "auto")
        
        # 如果需要 JSON 格式
        if cfg.get("response_format"):
            kwargs["response_format"] = cfg["response_format"]
        
        try:
            # 调用 LLM
            resp = await self.client.chat.completions.create(**kwargs)
            msg = resp.choices[0].message
            
            # 提取工具调用
            tool_calls = []
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                tool_calls = [
                    {
                        "name": tc.function.name,
                        "args": tc.function.arguments
                    }
                    for tc in msg.tool_calls
                ]
            
            return DriverResult(
                content=msg.content or "",
                tool_calls=tool_calls,
                raw=resp,
                tokens_used=resp.usage.total_tokens if resp.usage else 0,
                success=True
            )
            
        except Exception as e:
            return DriverResult(
                content="",
                tool_calls=[],
                raw=None,
                tokens_used=0,
                success=False,
                error=str(e)
            )
    
    async def health_check(self) -> bool:
        """
        检查 Driver 是否可用
        
        Returns:
            bool: 是否健康（依赖 API Key 有效性）
        """
        # 简单检查：尝试获取模型列表
        try:
            models = await self.client.models.list()
            return len(models.data) > 0
        except Exception:
            return True  # 如果失败，假设可用（可能是网络问题）
