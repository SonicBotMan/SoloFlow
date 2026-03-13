"""
LLM Driver - 直接调用 LLM（v2.1 增强版）

改进：
- 真正的工具调用执行循环（Tool Use Loop）
- 集成 SkillRegistry，工具调用自动路由到已注册的 Skill
- 支持最大轮数限制，防止无限循环
- 详细的 token 统计

支持：
- OpenAI GPT 系列
- 国内部署的 OpenAI 兼容接口（如 MiniMax、智谱、DeepSeek）
- 任何支持 function calling 的模型
"""

import json
import logging
from typing import Any, Dict, List, Optional
from openai import AsyncOpenAI
from .base import BaseDriver, DriverResult

logger = logging.getLogger(__name__)


class LLMDriver(BaseDriver):
    """
    LLM Driver（增强版）。
    
    直接调用 LLM，支持完整的工具调用执行循环。
    当 LLM 请求调用工具时，自动通过 SkillRegistry 执行工具，
    并将结果反馈给 LLM，直到 LLM 完成推理。
    """

    def __init__(
        self,
        api_key: str = None,
        base_url: str = None,
        default_model: str = "gpt-4o",
        max_tool_rounds: int = 8,
        **kwargs
    ):
        """
        初始化 LLM Driver

        Args:
            api_key: API Key（可选，从环境变量读取）
            base_url: Base URL（可选，用于国内镜像）
            default_model: 默认模型
            max_tool_rounds: 最大工具调用轮数
            **kwargs: 其他配置
        """
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.default_model = default_model
        self.max_tool_rounds = max_tool_rounds
        self.config = kwargs

    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: Optional[List[Dict]] = None,
        config: Optional[Dict] = None
    ) -> DriverResult:
        """
        执行 LLM 调用（含工具调用循环）

        工具调用流程：
        1. 调用 LLM
        2. 如果 LLM 请求工具 → 通过 SkillRegistry 执行 → 返回结果 → 继续
        3. 如果 LLM 直接返回文本 → 结束
        4. 超过最大轮数 → 强制结束

        Args:
            system_prompt: 系统提示词
            user_message: 用户消息
            tools: 工具定义列表（JSON Schema，会注入 SkillRegistry）
            config: 运行时配置

        Returns:
            DriverResult: 执行结果
        """
        cfg = config or {}

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]

        # 获取 SkillRegistry（懒加载）
        try:
            from soloflow.skill_registry import SkillRegistry
            registry = SkillRegistry.get_instance()
        except Exception:
            registry = None

        # 合并工具：传入的 tools + SkillRegistry 中已注册的 skills
        openai_tools = self._to_openai_tools(tools or [])

        # 如果 tools 列表中有 skill 名称，从 registry 补充工具定义
        if registry and tools:
            skill_names = [t.get("name") for t in tools if isinstance(t, dict)]
            registry_tools = registry.to_openai_tools(skill_names)
            # 去重：以传入的 tools 为准
            existing_names = {t["function"]["name"] for t in openai_tools}
            for rt in registry_tools:
                if rt["function"]["name"] not in existing_names:
                    openai_tools.append(rt)

        total_tokens = 0
        all_tool_calls = []

        for round_num in range(self.max_tool_rounds + 1):  # +1 保证至少一次无工具调用
            try:
                kwargs = {
                    "model": cfg.get("model", self.default_model),
                    "messages": messages,
                    "temperature": cfg.get("temperature", 0.7),
                    "max_tokens": cfg.get("max_tokens", 4096),
                }

                # 只在有工具且非最后一轮时注入工具
                if openai_tools and round_num < self.max_tool_rounds:
                    kwargs["tools"] = openai_tools
                    kwargs["tool_choice"] = cfg.get("tool_choice", "auto")

                # JSON 格式化
                if cfg.get("response_format"):
                    kwargs["response_format"] = cfg["response_format"]

                resp = await self.client.chat.completions.create(**kwargs)
                msg = resp.choices[0].message

                if resp.usage:
                    total_tokens += resp.usage.total_tokens

                # 没有工具调用 → 直接返回
                if not msg.tool_calls:
                    return DriverResult(
                        content=msg.content or "",
                        tool_calls=all_tool_calls,
                        raw=resp,
                        tokens_used=total_tokens,
                        success=True
                    )

                # 有工具调用 → 执行并反馈
                messages.append(msg)  # 保留 assistant 消息（含 tool_calls）

                for tc in msg.tool_calls:
                    tool_name = tc.function.name
                    try:
                        arguments = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        arguments = {}

                    logger.info(f"LLM 调用工具 [{round_num+1}]: {tool_name}({arguments})")

                    # 通过 SkillRegistry 执行工具
                    if registry and registry.get_skill(tool_name):
                        tool_result = await registry.execute(tool_name, arguments)
                    else:
                        tool_result = f"⚠️ 工具 '{tool_name}' 未注册，请先在 SkillRegistry 中注册"

                    all_tool_calls.append({
                        "name": tool_name,
                        "args": arguments,
                        "result": tool_result[:200]
                    })

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result
                    })

            except Exception as e:
                logger.error(f"LLM Driver 执行异常 (round {round_num}): {e}")
                return DriverResult(
                    content="",
                    tool_calls=all_tool_calls,
                    raw=None,
                    tokens_used=total_tokens,
                    success=False,
                    error=str(e)
                )

        # 超过最大轮数
        return DriverResult(
            content=f"⚠️ 已达最大工具调用轮数 ({self.max_tool_rounds})",
            tool_calls=all_tool_calls,
            raw=None,
            tokens_used=total_tokens,
            success=True
        )

    async def health_check(self) -> bool:
        """
        检查 Driver 是否可用

        Returns:
            bool: 是否健康
        """
        try:
            models = await self.client.models.list()
            return len(models.data) > 0
        except Exception:
            return True
