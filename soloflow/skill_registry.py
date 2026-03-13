"""
Skill Registry - 统一 Skill 注册与执行系统

核心能力：
1. 注册内置 Skill（Python 函数）
2. 注册 MCP Server Skill（通过 MCP 协议）
3. 注册 HTTP Skill（通过 HTTP API）
4. Agent YAML 中可声明所需 Skills
5. FlowEngine 执行时自动路由工具调用到对应 Skill

使用方式：
```python
from soloflow.skill_registry import SkillRegistry, skill

# 装饰器注册
@skill(name="web_search", description="搜索互联网")
async def web_search(query: str) -> str:
    ...

# 手动注册
registry = SkillRegistry.get_instance()
registry.register_function("my_tool", my_func, description="我的工具")
```
"""

import asyncio
import inspect
import json
import logging
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class SkillDef:
    """Skill 定义"""
    name: str
    description: str
    parameters: Dict  # JSON Schema
    handler: Callable  # 实际执行函数
    source: str = "builtin"  # builtin | mcp | http
    server: Optional[str] = None  # MCP server 名称（如果是 MCP skill）
    tags: List[str] = field(default_factory=list)


class SkillRegistry:
    """
    全局 Skill 注册表（单例）。
    
    管理所有可用的 Skills，并提供统一的执行接口。
    FlowEngine 执行任务时，工具调用会通过此注册表路由到具体实现。
    """

    _instance: Optional["SkillRegistry"] = None

    def __init__(self):
        self._skills: Dict[str, SkillDef] = {}
        self._builtin_registered = False

    @classmethod
    def get_instance(cls) -> "SkillRegistry":
        """获取全局单例"""
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._register_builtins()
        return cls._instance

    def register_function(
        self,
        name: str,
        handler: Callable,
        description: str = "",
        parameters: Dict = None,
        tags: List[str] = None
    ):
        """
        注册 Python 函数为 Skill。

        自动从函数签名推断参数 schema（如果未提供）。

        Args:
            name: Skill 名称
            handler: 执行函数（支持 async）
            description: 功能描述
            parameters: JSON Schema（可选，自动推断）
            tags: 标签列表
        """
        if parameters is None:
            parameters = self._infer_schema(handler)

        self._skills[name] = SkillDef(
            name=name,
            description=description or handler.__doc__ or "",
            parameters=parameters,
            handler=handler,
            source="builtin",
            tags=tags or []
        )
        logger.debug(f"注册 Skill: {name}")

    def register_http(
        self,
        name: str,
        url: str,
        method: str = "POST",
        description: str = "",
        parameters: Dict = None,
        headers: Dict = None,
        tags: List[str] = None
    ):
        """
        注册 HTTP API 为 Skill。

        Args:
            name: Skill 名称
            url: HTTP 端点
            method: HTTP 方法
            description: 功能描述
            parameters: 参数 schema
            headers: 请求头
            tags: 标签列表
        """
        import httpx

        async def http_handler(**kwargs):
            async with httpx.AsyncClient() as client:
                if method.upper() == "GET":
                    resp = await client.get(url, params=kwargs, headers=headers or {})
                else:
                    resp = await client.post(url, json=kwargs, headers=headers or {})
                resp.raise_for_status()
                result = resp.json()
                if isinstance(result, dict):
                    return result.get("result") or result.get("output") or str(result)
                return str(result)

        self._skills[name] = SkillDef(
            name=name,
            description=description,
            parameters=parameters or {"type": "object", "properties": {}},
            handler=http_handler,
            source="http",
            tags=tags or []
        )

    def register_mcp_tool(
        self,
        tool_name: str,
        mcp_session,
        description: str = "",
        input_schema: Dict = None,
        server_name: str = ""
    ):
        """
        将 MCP 工具注册到 SkillRegistry。
        由 MCPDriver 初始化后调用。

        Args:
            tool_name: 工具名称（含 server 前缀）
            mcp_session: MCP session 对象
            description: 工具描述
            input_schema: 参数 schema
            server_name: MCP server 名称
        """
        async def mcp_handler(**kwargs):
            return await mcp_session.call_tool(tool_name, kwargs)

        self._skills[tool_name] = SkillDef(
            name=tool_name,
            description=description,
            parameters=input_schema or {"type": "object", "properties": {}},
            handler=mcp_handler,
            source="mcp",
            server=server_name
        )

    async def execute(
        self,
        skill_name: str,
        arguments: Dict = None
    ) -> str:
        """
        执行 Skill。

        Args:
            skill_name: Skill 名称
            arguments: 参数字典

        Returns:
            str: 执行结果
        """
        skill = self._skills.get(skill_name)
        if not skill:
            return f"❌ 未找到 Skill: {skill_name}。可用: {list(self._skills.keys())}"

        args = arguments or {}
        try:
            if asyncio.iscoroutinefunction(skill.handler):
                result = await skill.handler(**args)
            else:
                result = skill.handler(**args)

            if isinstance(result, (dict, list)):
                return json.dumps(result, ensure_ascii=False, indent=2)
            return str(result)

        except Exception as e:
            logger.error(f"Skill '{skill_name}' 执行异常: {e}")
            return f"❌ Skill 执行失败: {e}"

    def get_skill(self, name: str) -> Optional[SkillDef]:
        """获取 Skill 定义"""
        return self._skills.get(name)

    def list_skills(
        self,
        source: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        列出 Skills

        Args:
            source: 过滤来源（builtin/mcp/http）
            tags: 过滤标签

        Returns:
            List[Dict]: Skill 信息列表
        """
        result = []
        for s in self._skills.values():
            if source and s.source != source:
                continue
            if tags and not any(t in s.tags for t in tags):
                continue
            result.append({
                "name": s.name,
                "description": s.description,
                "source": s.source,
                "server": s.server,
                "tags": s.tags
            })
        return result

    def to_openai_tools(self, skill_names: Optional[List[str]] = None) -> List[Dict]:
        """
        将 Skills 转换为 OpenAI function calling 格式。

        Args:
            skill_names: 指定 skill 名称列表（None 表示全部）

        Returns:
            List[Dict]: OpenAI tools 格式
        """
        skills = self._skills.values()
        if skill_names:
            skills = [s for s in skills if s.name in skill_names]

        return [
            {
                "type": "function",
                "function": {
                    "name": s.name,
                    "description": s.description,
                    "parameters": s.parameters
                }
            }
            for s in skills
        ]

    def _infer_schema(self, func: Callable) -> Dict:
        """从函数签名推断 JSON Schema"""
        sig = inspect.signature(func)
        properties = {}
        required = []

        type_map = {
            str: "string",
            int: "integer",
            float: "number",
            bool: "boolean",
            list: "array",
            dict: "object"
        }

        for param_name, param in sig.parameters.items():
            if param_name in ("self", "cls"):
                continue

            prop = {}
            # 推断类型
            if param.annotation != inspect.Parameter.empty:
                json_type = type_map.get(param.annotation, "string")
                prop["type"] = json_type
            else:
                prop["type"] = "string"

            # 默认值
            if param.default == inspect.Parameter.empty:
                required.append(param_name)
            elif param.default is not None:
                prop["default"] = param.default

            properties[param_name] = prop

        return {
            "type": "object",
            "properties": properties,
            "required": required
        }

    def _register_builtins(self):
        """注册内置 Skills"""
        if self._builtin_registered:
            return

        # 内置 Skill: 获取当前时间
        async def get_current_time(timezone: str = "Asia/Shanghai") -> str:
            """获取当前时间"""
            from datetime import datetime
            import zoneinfo
            try:
                tz = zoneinfo.ZoneInfo(timezone)
                now = datetime.now(tz)
                return now.strftime("%Y-%m-%d %H:%M:%S %Z")
            except Exception:
                from datetime import datetime
                return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        self.register_function(
            "get_current_time",
            get_current_time,
            description="获取当前时间",
            parameters={
                "type": "object",
                "properties": {
                    "timezone": {"type": "string", "default": "Asia/Shanghai", "description": "时区"}
                }
            },
            tags=["builtin", "time"]
        )

        # 内置 Skill: 文本长度统计
        async def count_words(text: str) -> str:
            """统计文本字数"""
            chars = len(text)
            words = len(text.split())
            chinese = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
            return f"字符数: {chars}，英文单词数: {words}，中文字数: {chinese}"

        self.register_function(
            "count_words",
            count_words,
            description="统计文本字数（字符、英文单词、中文字数）",
            tags=["builtin", "text"]
        )

        # 内置 Skill: 网页抓取（简化版，依赖 httpx）
        async def fetch_webpage(url: str, timeout: int = 10) -> str:
            """抓取网页内容"""
            try:
                import httpx
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                    resp = await client.get(url, headers={"User-Agent": "SoloFlow/2.0"})
                    resp.raise_for_status()
                    # 返回前 3000 字符避免 token 爆炸
                    text = resp.text
                    if len(text) > 3000:
                        return text[:3000] + "\n...[内容已截断]"
                    return text
            except ImportError:
                return "❌ 需要安装 httpx: pip install httpx"
            except Exception as e:
                return f"❌ 抓取失败: {e}"

        self.register_function(
            "fetch_webpage",
            fetch_webpage,
            description="抓取网页内容（返回 HTML 文本）",
            parameters={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "网页 URL"},
                    "timeout": {"type": "integer", "default": 10, "description": "超时秒数"}
                },
                "required": ["url"]
            },
            tags=["builtin", "web"]
        )

        # 内置 Skill: JSON 格式化
        async def format_json(data: str) -> str:
            """格式化 JSON 字符串"""
            try:
                obj = json.loads(data)
                return json.dumps(obj, ensure_ascii=False, indent=2)
            except Exception as e:
                return f"❌ JSON 解析失败: {e}"

        self.register_function(
            "format_json",
            format_json,
            description="格式化 JSON 字符串，使其更易读",
            tags=["builtin", "text"]
        )

        self._builtin_registered = True
        logger.info(f"内置 Skills 注册完成: {list(self._skills.keys())}")


# 全局装饰器
def skill(
    name: str = None,
    description: str = "",
    parameters: Dict = None,
    tags: List[str] = None
):
    """
    装饰器：将函数注册为全局 Skill。

    用法：
    ```python
    @skill(name="my_tool", description="我的工具")
    async def my_tool(query: str) -> str:
        return f"处理: {query}"
    ```
    """
    def decorator(func: Callable) -> Callable:
        skill_name = name or func.__name__
        registry = SkillRegistry.get_instance()
        registry.register_function(
            skill_name,
            func,
            description=description or func.__doc__ or "",
            parameters=parameters,
            tags=tags or []
        )
        return func
    return decorator
