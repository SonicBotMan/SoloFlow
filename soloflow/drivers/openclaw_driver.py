"""
OpenClaw Driver - 接入 OpenClaw 实例完整对接

工作模式：
1. 向 OpenClaw 实例发送任务
2. OpenClaw 执行（可能调用 MCP tools、 写代码等）
3. 通过轮询或 webhook 回调获取结果
"""

import asyncio
import logging
import httpx
import uuid
from typing import Any, Dict, Optional
from .base import BaseDriver, DriverResult

logger = logging.getLogger("soloflow.openclaw_driver")


class OpenClawDriver(BaseDriver):
    """
    OpenClaw Driver - 完整实现

    让 Agent 可以通过 OpenClaw 执行任务：
    - 调用 MCP tools
    - 执行代码
    - 访问文件系统
    """

    def __init__(self, config: Dict):
        super().__init__()
        self.endpoint = config.get("endpoint", "http://localhost:18210")
        self.api_key = config.get("api_key", "")
        self.timeout = config.get("timeout", 120)

    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: list[dict] = None,
        config: dict = None,
    ) -> DriverResult:
        """通过 OpenClaw 执行任务"""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        # 构建消息
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_message})

        # 创建会话
        session_id = str(uuid.uuid4())[:8]
        payload = {
            "session_id": session_id,
            "messages": messages,
            "model": config.get("model", "glm-4-flash"),
            "temperature": config.get("temperature", 0.7),
            "max_tokens": config.get("max_tokens", 4096),
            "stream": False,
        }

        if tools:
            payload["tools"] = tools

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 发送任务
                resp = await client.post(
                    f"{self.endpoint}/api/sessions", json=payload, headers=headers
                )

                if resp.status_code not in (200, 201):
                    error_text = (
                        resp.text[:500] if resp.status_code == 401 else "Auth failed"
                    )
                    return DriverResult(content="", success=False, error=error_text)

                data = resp.json()
                session_id = data.get("id", session_id)

                # 轮询结果（最多 60 秒）
                for i in range(30):
                    await asyncio.sleep(2)

                    poll_resp = await client.get(
                        f"{self.endpoint}/api/sessions/{session_id}", headers=headers
                    )

                    if poll_resp.status_code == 404:
                        break

                    poll_data = poll_resp.json()
                    status = poll_data.get("status", "")

                    if status == "completed":
                        content = poll_data.get("result", "")
                        tokens = poll_data.get("tokens_used", 0)
                        return DriverResult(
                            content=content, tokens_used=tokens, success=True
                        )
                    elif status == "failed":
                        error = poll_data.get("error", "Unknown error")
                        return DriverResult(content="", success=False, error=error)

                # 超时
                return DriverResult(
                    content="",
                    success=False,
                    error="Timeout waiting for OpenClaw result",
                )

        except Exception as e:
            logger.error(f"OpenClaw driver error: {e}")
            return DriverResult(content="", success=False, error=str(e))

    async def health_check(self) -> Dict:
        """健康检查"""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.endpoint}/api/status")
                return {"status": "ok", "code": resp.status_code}
        except Exception as e:
            return {"status": "error", "error": str(e)}
