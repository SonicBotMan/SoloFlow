"""
Skill Driver - 本地 Python Skill 执行引擎

Skill 是轻量级的本地工具函数，区别于 MCP（外部服务），
Skill 直接在 SoloFlow 进程内执行 Python 代码。

特性：
- 从 YAML 动态加载 skill 定义
- 支持 Python 函数 skill 和 Shell 命令 skill
- 完整的错误捕获和超时控制
- 与 LLM function calling 无缝对接
"""

import asyncio
import importlib
import json
import logging
import os
import subprocess
from typing import Any, Callable, Dict, List, Optional

from .base import BaseDriver, DriverResult

logger = logging.getLogger(__name__)


class SkillDriver(BaseDriver):
    """
    Skill Driver：管理本地 Python/Shell Skill 并结合 LLM 执行任务。

    YAML 配置示例：

    driver: skill
    driver_config:
      skills_dir: soloflow/skills      # skill 定义目录
      timeout: 15                       # 单次 skill 执行超时（秒）
      max_tool_rounds: 8                # 最大工具调用轮数
    """

    def __init__(
        self,
        skills_dir: str = "soloflow/skills",
        timeout: int = 15,
        max_tool_rounds: int = 8,
        api_key: str = None,
        base_url: str = None,
        model: str = None,
        **kwargs,
    ):
        self.skills_dir = skills_dir
        self.timeout = timeout
        self.max_tool_rounds = max_tool_rounds
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self._model = model

        # skill 注册表: name -> callable
        self._registry: Dict[str, Callable] = {}
        # skill 元数据（OpenAI function calling 格式）
        self._tool_schemas: List[Dict] = []

        self._load_builtin_skills()
        self._load_skills_from_dir()

    # ------------------------------------------------------------------ #
    #  Skill 注册 API                                                      #
    # ------------------------------------------------------------------ #

    def register(
        self,
        name: str,
        func: Callable,
        description: str = "",
        parameters: Dict = None,
    ):
        """手动注册一个 skill 函数"""
        self._registry[name] = func
        schema = {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters or {"type": "object", "properties": {}},
            },
        }
        # 去重更新
        self._tool_schemas = [s for s in self._tool_schemas if s["function"]["name"] != name]
        self._tool_schemas.append(schema)
        logger.info("[SkillDriver] registered skill: %s", name)

    # ------------------------------------------------------------------ #
    #  BaseDriver 实现                                                     #
    # ------------------------------------------------------------------ #

    async def execute(
        self,
        system_prompt: str,
        user_message: str,
        tools: Optional[List[Dict]] = None,
        config: Optional[Dict] = None,
    ) -> DriverResult:
        """执行任务，支持多轮 Skill 工具调用"""
        from openai import AsyncOpenAI

        cfg = config or {}
        model = cfg.get("model") or self._model or "gpt-4o"
        temperature = cfg.get("temperature", 0.7)
        max_tokens = cfg.get("max_tokens", 4096)

        client = AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url or None,
        )

        # 合并 skill tools + 外部传入 tools
        merged_tools = list(self._tool_schemas)
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

        for _ in range(self.max_tool_rounds):
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
                    timeout=60,
                )
            except asyncio.TimeoutError:
                return DriverResult(content="", success=False, error="LLM 调用超时")
            except Exception as e:
                return DriverResult(content="", success=False, error=str(e))

            total_tokens += resp.usage.total_tokens if resp.usage else 0
            choice = resp.choices[0]
            msg = choice.message

            if not msg.tool_calls:
                return DriverResult(
                    content=msg.content or "",
                    tool_calls=all_tool_calls,
                    tokens_used=total_tokens,
                    success=True,
                )

            messages.append(msg.model_dump(exclude_unset=True))

            for tc in msg.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                logger.info("[SkillDriver] executing skill: %s", tool_name)
                result_content = await self._run_skill(tool_name, tool_args)
                all_tool_calls.append({"name": tool_name, "args": tool_args, "result": result_content})
                messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result_content}
                )

        return DriverResult(
            content=f"[超出最大 Skill 调用轮数 {self.max_tool_rounds}]",
            tool_calls=all_tool_calls,
            tokens_used=total_tokens,
            success=False,
            error="max_tool_rounds exceeded",
        )

    async def health_check(self) -> bool:
        return len(self._registry) >= 0  # skill 为空也算健康

    # ------------------------------------------------------------------ #
    #  Skill 执行                                                          #
    # ------------------------------------------------------------------ #

    async def _run_skill(self, name: str, args: Dict) -> str:
        """执行 skill，统一错误处理"""
        if name not in self._registry:
            return f"[SKILL NOT FOUND] {name}"

        func = self._registry[name]
        try:
            if asyncio.iscoroutinefunction(func):
                result = await asyncio.wait_for(func(**args), timeout=self.timeout)
            else:
                loop = asyncio.get_event_loop()
                result = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: func(**args)),
                    timeout=self.timeout,
                )
            if isinstance(result, (dict, list)):
                return json.dumps(result, ensure_ascii=False)
            return str(result)
        except asyncio.TimeoutError:
            return f"[SKILL TIMEOUT] {name} exceeded {self.timeout}s"
        except Exception as e:
            logger.exception("[SkillDriver] skill %s error", name)
            return f"[SKILL ERROR] {name}: {e}"

    # ------------------------------------------------------------------ #
    #  内置 Skill                                                          #
    # ------------------------------------------------------------------ #

    def _load_builtin_skills(self):
        """加载内置 skill（作为示范）"""

        def get_current_time() -> str:
            from datetime import datetime
            return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        def run_shell(command: str) -> str:
            """执行 shell 命令（仅限安全白名单）"""
            ALLOWED_PREFIXES = ("ls", "pwd", "echo", "cat", "date", "which")
            cmd_head = command.strip().split()[0] if command.strip() else ""
            if cmd_head not in ALLOWED_PREFIXES:
                return f"[BLOCKED] 命令 '{cmd_head}' 不在白名单内"
            try:
                out = subprocess.check_output(
                    command, shell=True, text=True, timeout=10, stderr=subprocess.STDOUT
                )
                return out.strip()
            except subprocess.CalledProcessError as e:
                return f"[ERROR] {e.output}"
            except subprocess.TimeoutExpired:
                return "[TIMEOUT] 命令执行超时"

        def read_file(path: str) -> str:
            """读取本地文件内容（仅限项目目录）"""
            safe_path = os.path.abspath(path)
            project_root = os.path.abspath(".")
            if not safe_path.startswith(project_root):
                return "[BLOCKED] 路径超出项目目录"
            try:
                with open(safe_path, "r", encoding="utf-8") as f:
                    content = f.read()
                return content[:8000]  # 截断防止 token 爆炸
            except FileNotFoundError:
                return f"[NOT FOUND] {path}"
            except Exception as e:
                return f"[ERROR] {e}"

        def http_get(url: str) -> str:
            """发起简单 HTTP GET 请求"""
            try:
                import urllib.request
                req = urllib.request.Request(url, headers={"User-Agent": "SoloFlow/2.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return resp.read().decode("utf-8")[:4000]
            except Exception as e:
                return f"[HTTP ERROR] {e}"

        self.register(
            "get_current_time",
            get_current_time,
            description="获取当前日期和时间",
            parameters={"type": "object", "properties": {}},
        )
        self.register(
            "run_shell",
            run_shell,
            description="在白名单内执行 shell 命令（ls/pwd/echo/cat/date/which）",
            parameters={
                "type": "object",
                "properties": {"command": {"type": "string", "description": "要执行的命令"}},
                "required": ["command"],
            },
        )
        self.register(
            "read_file",
            read_file,
            description="读取项目目录内的文件内容",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string", "description": "文件相对路径"}},
                "required": ["path"],
            },
        )
        self.register(
            "http_get",
            http_get,
            description="发起 HTTP GET 请求获取网页内容",
            parameters={
                "type": "object",
                "properties": {"url": {"type": "string", "description": "目标 URL"}},
                "required": ["url"],
            },
        )

    def _load_skills_from_dir(self):
        """从 skills/ 目录动态加载 Python skill 模块"""
        skills_path = os.path.abspath(self.skills_dir)
        if not os.path.isdir(skills_path):
            return

        import sys
        if skills_path not in sys.path:
            sys.path.insert(0, skills_path)

        for fname in os.listdir(skills_path):
            if not fname.endswith(".py") or fname.startswith("_"):
                continue
            module_name = fname[:-3]
            try:
                mod = importlib.import_module(module_name)
                # 约定：每个 skill 模块暴露 SKILL_MANIFEST list
                manifest = getattr(mod, "SKILL_MANIFEST", [])
                for item in manifest:
                    self.register(
                        name=item["name"],
                        func=item["func"],
                        description=item.get("description", ""),
                        parameters=item.get("parameters", {}),
                    )
            except Exception as e:
                logger.warning("[SkillDriver] failed to load skill module %s: %s", fname, e)
