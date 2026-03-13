"""
MCP Driver - 接入任意 MCP Server

支持两种传输协议：
- stdio: 本地进程（最常用）
- sse:   远程 HTTP SSE 端点

工作流程：
1. 启动 MCP Server 进程（stdio）或连接远端（sse）
2. 通过 MCP 协议获取工具列表
3. 将 MCP 工具注册为 OpenAI function calling 格式
4. LLM 调用工具 → MCPDriver 透传给 MCP Server → 返回结果
"""

import asyncio
import json
import logging
import os
import shutil
from typing import Any, Dict, List, Optional

from .base import BaseDriver, DriverResult

logger = logging.getLogger(__name__)


class MCPDriver(BaseDriver):
    """
    MCP (Model Context Protocol) Driver.
    
    YAML 配置示例：
    
    driver: mcp
    driver_config:
      transport: stdio          # stdio | sse
      command: uvx             # stdio 模式下的启动命令
      args: ["mcp-server-fetch"]  # 命令参数
      env:                      # 额外环境变量
        SOME_KEY: some_value
      url: http://localhost:8080/sse  # sse 模式下的端点
      timeout: 30               # 单次工具调用超时（秒）
      max_tool_rounds: 10       # 最大工具调用轮数
    """

    def __init__(
        self,
        transport: str = "stdio",
        command: str = None,
        args: List[str] = None,
        env: Dict[str, str] = None,
        url: str = None,
        api_key: str = None,
        base_url: str = None,
        model: str = None,
        timeout: int = 30,
        max_tool_rounds: int = 10,
        **kwargs,
    ):
        self.transport = transport
        self.command = command
        self.args = args or []
        self.env = env or {}
        self.url = url
        self.timeout = timeout
        self.max_tool_rounds = max_tool_rounds

        # OpenAI client config (可被 driver_config 覆盖)
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self._model = model

        # 运行时状态
        self._tools: List[Dict] = []          # MCP 工具列表（OpenAI 格式）
        self._raw_tools: List[Dict] = []      # 原始 MCP 工具定义
        self._initialized = False
        self._process: Optional[asyncio.subprocess.Process] = None
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._req_id = 0

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: Optional[List[Dict]] = None,
        config: Optional[Dict] = None,
    ) -> DriverResult:
        """执行 Agent 任务，支持多轮 MCP 工具调用"""
        from openai import AsyncOpenAI

        cfg = config or {}
        model = cfg.get("model") or self._model or "gpt-4o"
        temperature = cfg.get("temperature", 0.7)
        max_tokens = cfg.get("max_tokens", 4096)

        client = AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url or None,
        )

        # 确保 MCP Server 已初始化并获取工具列表
        await self._ensure_initialized()

        # 合并 MCP 工具 + 外部传入工具
        merged_tools = list(self._tools)
        if tools:
            extra = self._to_openai_tools(tools)
            existing_names = {t["function"]["name"] for t in merged_tools}
            for t in extra:
                if t["function"]["name"] not in existing_names:
                    merged_tools.append(t)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        total_tokens = 0
        all_tool_calls = []

        for round_idx in range(self.max_tool_rounds):
            try:
                resp = await asyncio.wait_for(
                    client.chat.completions.create(
                        model=model,
                        messages=messages,
                        tools=merged_tools if merged_tools else None,
                        tool_choice="auto" if merged_tools else None,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    ),
                    timeout=self.timeout,
                )
            except asyncio.TimeoutError:
                return DriverResult(
                    content="",
                    success=False,
                    error=f"LLM 调用超时（{self.timeout}s）",
                )
            except Exception as e:
                return DriverResult(content="", success=False, error=str(e))

            total_tokens += resp.usage.total_tokens if resp.usage else 0
            choice = resp.choices[0]
            msg = choice.message

            # 没有工具调用 → 最终回答
            if not msg.tool_calls:
                return DriverResult(
                    content=msg.content or "",
                    tool_calls=all_tool_calls,
                    tokens_used=total_tokens,
                    success=True,
                )

            # 有工具调用 → 执行并追加结果
            messages.append(msg.model_dump(exclude_unset=True))

            for tc in msg.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                logger.info("[MCPDriver] calling tool: %s args=%s", tool_name, tool_args)

                try:
                    tool_result = await asyncio.wait_for(
                        self._call_mcp_tool(tool_name, tool_args),
                        timeout=self.timeout,
                    )
                    result_content = json.dumps(tool_result, ensure_ascii=False)
                except asyncio.TimeoutError:
                    result_content = f"[TOOL TIMEOUT] {tool_name} exceeded {self.timeout}s"
                except Exception as exc:
                    result_content = f"[TOOL ERROR] {tool_name}: {exc}"

                all_tool_calls.append({"name": tool_name, "args": tool_args, "result": result_content})
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result_content,
                    }
                )

        # 超过最大轮数
        return DriverResult(
            content=f"[超出最大工具调用轮数 {self.max_tool_rounds}]",
            tool_calls=all_tool_calls,
            tokens_used=total_tokens,
            success=False,
            error="max_tool_rounds exceeded",
        )

    async def health_check(self) -> bool:
        """检查 MCP Server 是否可用"""
        try:
            await self._ensure_initialized()
            return self._initialized
        except Exception as e:
            logger.warning("[MCPDriver] health_check failed: %s", e)
            return False

    async def close(self):
        """关闭 MCP Server 进程"""
        if self._process and self._process.returncode is None:
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except Exception:
                self._process.kill()
        self._initialized = False

    # ------------------------------------------------------------------ #
    #  Internal: MCP stdio protocol                                        #
    # ------------------------------------------------------------------ #

    async def _ensure_initialized(self):
        """懒加载初始化 MCP Server"""
        if self._initialized:
            return

        if self.transport == "stdio":
            await self._init_stdio()
        elif self.transport == "sse":
            await self._init_sse()
        else:
            raise ValueError(f"Unsupported MCP transport: {self.transport}")

        # 获取工具列表
        tools_resp = await self._jsonrpc("tools/list", {})
        self._raw_tools = tools_resp.get("tools", [])
        self._tools = self._convert_tools(self._raw_tools)
        logger.info("[MCPDriver] loaded %d tools from MCP server", len(self._tools))
        self._initialized = True

    async def _init_stdio(self):
        """启动 stdio 模式的 MCP Server 进程"""
        if not self.command:
            raise ValueError("MCPDriver stdio 模式需要 command 参数")

        # 检查命令是否存在
        cmd_path = shutil.which(self.command)
        if not cmd_path:
            raise FileNotFoundError(f"MCP command not found: {self.command}")

        env = {**os.environ, **self.env}
        self._process = await asyncio.create_subprocess_exec(
            cmd_path,
            *self.args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        # MCP 初始化握手
        await self._jsonrpc(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "clientInfo": {"name": "soloflow", "version": "2.0"},
            },
        )
        await self._notify("notifications/initialized", {})
        logger.info("[MCPDriver] stdio MCP server initialized: %s %s", self.command, self.args)

    async def _init_sse(self):
        """连接 SSE 模式的 MCP Server（简单 HTTP 实现）"""
        if not self.url:
            raise ValueError("MCPDriver sse 模式需要 url 参数")
        # SSE 模式下通过 HTTP POST 发送 JSON-RPC
        # 此处留作扩展点，完整实现依赖 httpx 或 aiohttp
        logger.info("[MCPDriver] SSE transport connected: %s", self.url)
        self._initialized = True

    async def _jsonrpc(self, method: str, params: Dict) -> Dict:
        """发送 JSON-RPC 请求并等待响应"""
        self._req_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._req_id,
            "method": method,
            "params": params,
        }
        line = json.dumps(payload) + "\n"
        self._process.stdin.write(line.encode())
        await self._process.stdin.drain()

        while True:
            raw = await asyncio.wait_for(self._process.stdout.readline(), timeout=self.timeout)
            if not raw:
                raise ConnectionError("MCP server closed connection")
            try:
                msg = json.loads(raw.decode())
            except json.JSONDecodeError:
                continue
            if msg.get("id") == self._req_id:
                if "error" in msg:
                    raise RuntimeError(f"MCP error: {msg['error']}")
                return msg.get("result", {})

    async def _notify(self, method: str, params: Dict):
        """发送 JSON-RPC 通知（无需响应）"""
        payload = {"jsonrpc": "2.0", "method": method, "params": params}
        line = json.dumps(payload) + "\n"
        self._process.stdin.write(line.encode())
        await self._process.stdin.drain()

    async def _call_mcp_tool(self, name: str, arguments: Dict) -> Any:
        """调用 MCP 工具"""
        if self.transport == "sse":
            return await self._call_mcp_tool_sse(name, arguments)
        result = await self._jsonrpc("tools/call", {"name": name, "arguments": arguments})
        # MCP 返回 {content: [{type: text, text: ...}]}
        content = result.get("content", [])
        if content and content[0].get("type") == "text":
            return content[0]["text"]
        return result

    async def _call_mcp_tool_sse(self, name: str, arguments: Dict) -> Any:
        """SSE 模式下调用工具（通过 HTTP POST）"""
        try:
            import aiohttp  # type: ignore
        except ImportError:
            raise ImportError("SSE transport requires: pip install aiohttp")

        payload = {
            "jsonrpc": "2.0",
            "id": self._req_id + 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.url.replace("/sse", "/rpc"),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as resp:
                data = await resp.json()
                content = data.get("result", {}).get("content", [])
                if content and content[0].get("type") == "text":
                    return content[0]["text"]
                return data.get("result", {})

    def _convert_tools(self, raw_tools: List[Dict]) -> List[Dict]:
        """将 MCP 工具定义转换为 OpenAI function calling 格式"""
        result = []
        for t in raw_tools:
            result.append(
                {
                    "type": "function",
                    "function": {
                        "name": t.get("name", ""),
                        "description": t.get("description", ""),
                        "parameters": t.get("inputSchema")
                        or t.get("parameters")
                        or {"type": "object", "properties": {}},
                    },
                }
            )
        return result
