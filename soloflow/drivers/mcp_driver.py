"""
MCP Driver - Model Context Protocol 驱动

支持通过 MCP (Model Context Protocol) 协议接入外部工具服务器。

MCP 是 Anthropic 提出的标准化工具协议，允许 LLM 应用动态发现并调用外部工具。

支持的 MCP 传输层：
- stdio: 本地进程（命令行工具）
- sse: HTTP SSE 远程服务器
- http: HTTP streamable（新版协议）

使用示例（agent YAML）：
```yaml
driver: mcp
driver_config:
  servers:
    - name: filesystem
      transport: stdio
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    - name: github
      transport: sse
      url: http://localhost:3100/sse
      headers:
        Authorization: "Bearer ${GITHUB_TOKEN}"
```
"""

import asyncio
import json
import logging
import os
import subprocess
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

from .base import BaseDriver, DriverResult

logger = logging.getLogger(__name__)


@dataclass
class MCPServerConfig:
    """MCP Server 配置"""
    name: str
    transport: str = "stdio"          # stdio | sse | http
    # stdio 专用
    command: Optional[str] = None
    args: List[str] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)
    # sse/http 专用
    url: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)
    # 公共
    timeout: int = 30


@dataclass
class MCPTool:
    """MCP 工具描述"""
    name: str
    description: str
    input_schema: Dict
    server_name: str


class MCPSession:
    """
    单个 MCP Server 的连接会话（stdio 传输层）。
    使用 JSON-RPC 2.0 over stdin/stdout 与 MCP server 通信。
    """

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self._proc: Optional[subprocess.Popen] = None
        self._request_id = 0
        self._tools: List[MCPTool] = []
        self._initialized = False

    async def start(self):
        """启动 MCP 进程并完成握手"""
        if self.config.transport == "stdio":
            await self._start_stdio()
        else:
            logger.warning(f"MCP transport '{self.config.transport}' 的完整实现依赖 mcp SDK，当前使用 HTTP fallback")
            self._initialized = True

    async def _start_stdio(self):
        """启动 stdio MCP 进程"""
        env = {**os.environ, **self.config.env}
        cmd = [self.config.command] + self.config.args

        logger.info(f"启动 MCP server: {' '.join(cmd)}")

        self._proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )

        # 发送 initialize 请求
        resp = await self._rpc("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": {"listChanged": True},
                "sampling": {}
            },
            "clientInfo": {
                "name": "soloflow",
                "version": "2.0.0"
            }
        })

        if resp.get("error"):
            raise RuntimeError(f"MCP initialize 失败: {resp['error']}")

        # 发送 initialized 通知
        await self._notify("notifications/initialized", {})
        self._initialized = True
        logger.info(f"MCP server '{self.config.name}' 初始化完成")

    async def list_tools(self) -> List[MCPTool]:
        """获取 MCP server 提供的工具列表"""
        if not self._initialized:
            await self.start()

        resp = await self._rpc("tools/list", {})

        if resp.get("error"):
            logger.error(f"tools/list 失败: {resp['error']}")
            return []

        tools = []
        for t in resp.get("result", {}).get("tools", []):
            tools.append(MCPTool(
                name=f"{self.config.name}__{t['name']}",  # 加前缀避免冲突
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", {"type": "object", "properties": {}}),
                server_name=self.config.name
            ))

        self._tools = tools
        return tools

    async def call_tool(self, tool_name: str, arguments: Dict) -> str:
        """调用工具"""
        # 去掉服务器前缀
        actual_name = tool_name.replace(f"{self.config.name}__", "", 1)

        resp = await self._rpc("tools/call", {
            "name": actual_name,
            "arguments": arguments
        })

        if resp.get("error"):
            return f"工具调用失败: {resp['error']}"

        result = resp.get("result", {})
        content = result.get("content", [])

        # 提取文本内容
        texts = []
        for item in content:
            if item.get("type") == "text":
                texts.append(item["text"])
            elif item.get("type") == "image":
                texts.append(f"[图片: {item.get('mimeType', 'image')}]")

        return "\n".join(texts) if texts else str(result)

    async def _rpc(self, method: str, params: Dict) -> Dict:
        """发送 JSON-RPC 请求并等待响应"""
        if not self._proc:
            return {"error": "MCP 进程未启动"}

        self._request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params
        }

        try:
            line = json.dumps(request) + "\n"
            self._proc.stdin.write(line.encode())
            await self._proc.stdin.drain()

            # 读取响应（带超时）
            response_line = await asyncio.wait_for(
                self._proc.stdout.readline(),
                timeout=self.config.timeout
            )

            if not response_line:
                return {"error": "MCP 进程已关闭"}

            return json.loads(response_line.decode().strip())

        except asyncio.TimeoutError:
            return {"error": f"MCP 调用超时 ({self.config.timeout}s)"}
        except Exception as e:
            return {"error": str(e)}

    async def _notify(self, method: str, params: Dict):
        """发送 JSON-RPC 通知（无需响应）"""
        if not self._proc:
            return

        notification = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }
        line = json.dumps(notification) + "\n"
        self._proc.stdin.write(line.encode())
        await self._proc.stdin.drain()

    async def close(self):
        """关闭 MCP 进程"""
        if self._proc:
            try:
                self._proc.stdin.close()
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except Exception:
                self._proc.kill()
            self._proc = None


class MCPSSESession:
    """
    MCP SSE 传输层会话。
    通过 HTTP SSE 连接远程 MCP Server。
    依赖 httpx + httpx-sse。
    """

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self._tools: List[MCPTool] = []
        self._initialized = False
        self._endpoint: Optional[str] = None  # POST endpoint from SSE
        self._request_id = 0
        self._session_id: Optional[str] = None

    async def start(self):
        """建立 SSE 连接并完成握手"""
        try:
            import httpx
        except ImportError:
            raise ImportError("MCP SSE 需要 httpx: pip install httpx")

        # 对于简化的 SSE MCP，直接使用 HTTP POST endpoint
        # 假设服务器支持 POST /messages 端点
        base_url = self.config.url.rstrip("/")
        if base_url.endswith("/sse"):
            base_url = base_url[:-4]

        self._endpoint = f"{base_url}/messages"
        self._initialized = True
        logger.info(f"MCP SSE server '{self.config.name}' 连接就绪: {self._endpoint}")

    async def list_tools(self) -> List[MCPTool]:
        """获取工具列表"""
        if not self._initialized:
            await self.start()

        resp = await self._http_rpc("tools/list", {})

        tools = []
        for t in resp.get("result", {}).get("tools", []):
            tools.append(MCPTool(
                name=f"{self.config.name}__{t['name']}",
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", {"type": "object", "properties": {}}),
                server_name=self.config.name
            ))

        self._tools = tools
        return tools

    async def call_tool(self, tool_name: str, arguments: Dict) -> str:
        """调用工具"""
        actual_name = tool_name.replace(f"{self.config.name}__", "", 1)
        resp = await self._http_rpc("tools/call", {
            "name": actual_name,
            "arguments": arguments
        })

        if resp.get("error"):
            return f"工具调用失败: {resp['error']}"

        content = resp.get("result", {}).get("content", [])
        texts = [item["text"] for item in content if item.get("type") == "text"]
        return "\n".join(texts) if texts else str(resp.get("result", ""))

    async def _http_rpc(self, method: str, params: Dict) -> Dict:
        """发送 HTTP JSON-RPC 请求"""
        try:
            import httpx
        except ImportError:
            return {"error": "需要 httpx"}

        self._request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params
        }

        headers = {"Content-Type": "application/json", **self.config.headers}
        # 解析 headers 中的环境变量
        resolved_headers = {}
        for k, v in headers.items():
            if isinstance(v, str) and v.startswith("${") and v.endswith("}"):
                var_name = v[2:-1]
                resolved_headers[k] = os.environ.get(var_name, v)
            else:
                resolved_headers[k] = v

        try:
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                resp = await client.post(
                    self._endpoint,
                    json=payload,
                    headers=resolved_headers
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            return {"error": str(e)}

    async def close(self):
        pass


class MCPDriver(BaseDriver):
    """
    MCP Driver。
    
    通过 MCP 协议接入多个工具服务器，并在 LLM 推理循环中自动执行工具调用。
    
    工作流程：
    1. 初始化所有配置的 MCP servers
    2. 发现所有可用工具
    3. 将工具注入 LLM 的 function calling
    4. LLM 调用工具时自动路由到对应 MCP server 执行
    5. 将工具结果反馈给 LLM，继续推理直到完成
    """

    def __init__(
        self,
        servers: List[Dict] = None,
        api_key: str = None,
        base_url: str = None,
        default_model: str = "gpt-4o",
        max_tool_rounds: int = 10,
        **kwargs
    ):
        """
        初始化 MCP Driver

        Args:
            servers: MCP server 配置列表
            api_key: OpenAI API Key
            base_url: OpenAI Base URL
            default_model: 默认模型
            max_tool_rounds: 最大工具调用轮数（防止无限循环）
        """
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.default_model = default_model
        self.max_tool_rounds = max_tool_rounds
        self._sessions: Dict[str, Any] = {}  # name -> MCPSession | MCPSSESession
        self._all_tools: List[MCPTool] = []
        self._initialized = False

        # 解析 server 配置
        self._server_configs: List[MCPServerConfig] = []
        for s in (servers or []):
            cfg = MCPServerConfig(
                name=s["name"],
                transport=s.get("transport", "stdio"),
                command=s.get("command"),
                args=s.get("args", []),
                env=s.get("env", {}),
                url=s.get("url"),
                headers=s.get("headers", {}),
                timeout=s.get("timeout", 30)
            )
            self._server_configs.append(cfg)

    async def _ensure_initialized(self):
        """懒加载：首次使用时初始化所有 MCP servers"""
        if self._initialized:
            return

        for cfg in self._server_configs:
            try:
                if cfg.transport == "stdio":
                    session = MCPSession(cfg)
                elif cfg.transport in ("sse", "http"):
                    session = MCPSSESession(cfg)
                else:
                    logger.warning(f"未知 MCP transport: {cfg.transport}，跳过")
                    continue

                await session.start()
                tools = await session.list_tools()
                self._sessions[cfg.name] = session
                self._all_tools.extend(tools)
                logger.info(f"MCP server '{cfg.name}' 加载完成，工具: {[t.name for t in tools]}")

            except Exception as e:
                logger.error(f"MCP server '{cfg.name}' 初始化失败: {e}")

        self._initialized = True

    def _tools_to_openai_format(self) -> List[Dict]:
        """将 MCP 工具转换为 OpenAI function calling 格式"""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema
                }
            }
            for tool in self._all_tools
        ]

    async def _call_mcp_tool(self, tool_name: str, arguments: Dict) -> str:
        """根据工具名路由到对应 MCP server 执行"""
        # 从工具名提取 server 名称（格式: server_name__tool_name）
        parts = tool_name.split("__", 1)
        if len(parts) == 2:
            server_name = parts[0]
            session = self._sessions.get(server_name)
            if session:
                return await session.call_tool(tool_name, arguments)

        # fallback: 遍历所有 session 查找
        for name, session in self._sessions.items():
            tool = next((t for t in self._all_tools if t.name == tool_name), None)
            if tool and tool.server_name == name:
                return await session.call_tool(tool_name, arguments)

        return f"未找到工具: {tool_name}"

    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: Optional[List[Dict]] = None,
        config: Optional[Dict] = None
    ) -> DriverResult:
        """
        执行 MCP Agent 任务（带工具调用循环）

        流程：
        1. 初始化 MCP servers（懒加载）
        2. 合并 MCP 工具 + 额外传入的工具
        3. 进入 LLM 推理-工具执行循环
        4. 直到 LLM 不再调用工具或达到最大轮数
        """
        await self._ensure_initialized()

        cfg = config or {}
        model = cfg.get("model", self.default_model)

        # 合并工具：MCP 工具 + 额外 skill 工具
        mcp_tools = self._tools_to_openai_format()
        extra_tools = self._to_openai_tools(tools or [])
        all_tools = mcp_tools + extra_tools

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]

        total_tokens = 0
        all_tool_calls = []

        for round_num in range(self.max_tool_rounds):
            try:
                kwargs = {
                    "model": model,
                    "messages": messages,
                    "temperature": cfg.get("temperature", 0.7),
                    "max_tokens": cfg.get("max_tokens", 4096),
                }

                if all_tools:
                    kwargs["tools"] = all_tools
                    kwargs["tool_choice"] = "auto"

                resp = await self.client.chat.completions.create(**kwargs)
                msg = resp.choices[0].message

                if resp.usage:
                    total_tokens += resp.usage.total_tokens

                # 如果没有工具调用，直接返回
                if not msg.tool_calls:
                    return DriverResult(
                        content=msg.content or "",
                        tool_calls=all_tool_calls,
                        raw=resp,
                        tokens_used=total_tokens,
                        success=True
                    )

                # 有工具调用：执行并反馈
                messages.append(msg)  # 添加 assistant 消息（含 tool_calls）

                for tc in msg.tool_calls:
                    tool_name = tc.function.name
                    try:
                        arguments = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        arguments = {}

                    logger.info(f"执行工具 [{round_num+1}/{self.max_tool_rounds}]: {tool_name}")

                    # 执行工具
                    tool_result = await self._call_mcp_tool(tool_name, arguments)

                    all_tool_calls.append({
                        "name": tool_name,
                        "args": arguments,
                        "result": tool_result[:500]  # 截断日志
                    })

                    # 添加工具结果到消息
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result
                    })

            except Exception as e:
                return DriverResult(
                    content="",
                    tool_calls=all_tool_calls,
                    raw=None,
                    tokens_used=total_tokens,
                    success=False,
                    error=f"MCP Driver 执行异常: {e}"
                )

        # 达到最大轮数，强制结束
        return DriverResult(
            content=f"⚠️ 已达最大工具调用轮数 ({self.max_tool_rounds})，任务可能未完成",
            tool_calls=all_tool_calls,
            raw=None,
            tokens_used=total_tokens,
            success=True
        )

    async def health_check(self) -> bool:
        """检查所有 MCP servers 是否健康"""
        if not self._initialized:
            return True  # 未初始化视为健康（懒加载）

        return len(self._sessions) > 0

    async def close(self):
        """关闭所有 MCP sessions"""
        for session in self._sessions.values():
            await session.close()
        self._sessions.clear()
        self._initialized = False

    def get_available_tools(self) -> List[Dict]:
        """获取所有可用工具的信息（用于 API 展示）"""
        return [
            {
                "name": t.name,
                "description": t.description,
                "server": t.server_name
            }
            for t in self._all_tools
        ]
