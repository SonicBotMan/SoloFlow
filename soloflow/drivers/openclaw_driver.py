"""
OpenClaw Driver - 接入 OpenClaw

这是关键新增，让 SoloFlow 可以通过 OpenClaw 执行任务。
工作模式：
1. 向 OpenClaw 实例发送任务
2. OpenClaw 执行（可能调用 MCP tools、写代码等）
3. 通过轮询或 webhook 回调获取结果
"""

import asyncio
import httpx
import uuid
from typing import Any, Dict, List, Optional
from .base import BaseDriver, DriverResult


class OpenClawDriver(BaseDriver):
    """
    OpenClaw Driver。
    
    接入 OpenClaw 实例，让 Agent 可以：
    - 调用 MCP tools
    - 执行代码
    - 访问文件系统
    
    配置示例（YAML）：
    ```yaml
    driver: openclaw
    driver_config:
      endpoint: ${OPENCLAW_ENDPOINT}
      api_key: ${OPENCLAW_API_KEY}
      timeout: 600
      poll_interval: 5
    ```
    """
    
    def __init__(
        self,
        endpoint: str,
        api_key: str = None,
        timeout: int = 300,
        poll_interval: int = 5,
        **kwargs
    ):
        """
        初始化 OpenClaw Driver
        
        Args:
            endpoint: OpenClaw 实例地址（如 http://localhost:3100）
            api_key: API Key（可选）
            timeout: 超时时间（秒）
            poll_interval: 轮询间隔（秒）
            **kwargs: 其他配置
        """
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.poll_interval = poll_interval
        self.config = kwargs
    
    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: Optional[List[Dict]] = None,
        config: Optional[Dict] = None
    ) -> DriverResult:
        """
        执行 OpenClaw 任务
        
        工作流程：
        1. 向 OpenClaw 提交任务
        2. 轮询等待完成
        3. 返回结果
        
        Args:
            system_prompt: 系统提示词
            user_message: 用户消息
            tools: 工具定义列表（可选）
            config: 运行时配置（可选）
            
        Returns:
            DriverResult: 执行结果
        """
        task_id = str(uuid.uuid4())
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        payload = {
            "task_id": task_id,
            "system_prompt": system_prompt,
            "message": user_message,
            "tools": tools or [],
            "config": config or {}
        }
        
        timeout = max(10, self.timeout)
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                # 1. 提交任务
                resp = await client.post(
                    f"{self.endpoint}/api/tasks",
                    json=payload,
                    headers=headers
                )
                resp.raise_for_status()
                job = resp.json()
                remote_task_id = job.get("id", task_id)
                
                # 2. 轮询等待完成
                elapsed = 0
                while elapsed < self.timeout:
                    await asyncio.sleep(self.poll_interval)
                    elapsed += self.poll_interval
                    
                    status_resp = await client.get(
                        f"{self.endpoint}/api/tasks/{remote_task_id}",
                        headers=headers
                    )
                    status = status_resp.json()
                    
                    task_status = status.get("status")
                    
                    if task_status in ("done", "completed", "success"):
                        return DriverResult(
                            content=status.get("result", ""),
                            tool_calls=status.get("tool_calls", []),
                            raw=status,
                            tokens_used=status.get("tokens_used", 0),
                            success=True
                        )
                    elif task_status in ("failed", "error"):
                        return DriverResult(
                            content="",
                            tool_calls=[],
                            raw=status,
                            tokens_used=0,
                            success=False,
                            error=status.get("error", "Unknown error")
                        )
                
                # 超时
                return DriverResult(
                    content="",
                    tool_calls=[],
                    raw=None,
                    tokens_used=0,
                    success=False,
                    error=f"Task timed out after {self.timeout}s"
                )
                
            except httpx.HTTPStatusError as e:
                return DriverResult(
                    content="",
                    tool_calls=[],
                    raw=None,
                    tokens_used=0,
                    success=False,
                    error=f"HTTP error: {e.response.status_code} - {e.response.text}"
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
        检查 OpenClaw 是否可用
        
        Returns:
            bool: 是否健康
        """
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.endpoint}/health")
                return r.status_code == 200
        except Exception:
            return False
    
    async def list_tools(self) -> List[Dict]:
        """
        列出 OpenClaw 中可用的工具
        
        Returns:
            List[Dict]: 工具列表
        """
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{self.endpoint}/api/tools",
                    headers=headers
                )
                r.raise_for_status()
                return r.json().get("tools", [])
        except Exception:
            return []
