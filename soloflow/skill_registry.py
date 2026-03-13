"""
Skill Registry - 全局 Skill 注册中心

统一管理所有 Skill 的注册、发现和元数据。
Skill 可以来自：
  1. 内置 Skill（代码内定义）
  2. YAML 配置文件（soloflow/skills/*.yaml）
  3. Python 模块（soloflow/skills/*.py），暴露 SKILL_MANIFEST
  4. MCP Server（由 MCPDriver 动态发现）
  5. 代码注册（register_skill() API）
"""

import importlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)


class SkillMeta:
    """Skill 元数据"""

    def __init__(
        self,
        name: str,
        description: str = "",
        parameters: Dict = None,
        source: str = "builtin",  # builtin | yaml | python | mcp
        tags: List[str] = None,
        version: str = "1.0",
        func: Callable = None,
    ):
        self.name = name
        self.description = description
        self.parameters = parameters or {"type": "object", "properties": {}}
        self.source = source
        self.tags = tags or []
        self.version = version
        self.func = func

    def to_openai_tool(self) -> Dict:
        """转换为 OpenAI function calling 格式"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "description": self.description,
            "source": self.source,
            "tags": self.tags,
            "version": self.version,
            "has_func": self.func is not None,
        }


class SkillRegistry:
    """全局 Skill 注册中心（单例友好）"""

    def __init__(self, skills_dir: str = "soloflow/skills"):
        self.skills_dir = Path(skills_dir)
        self._skills: Dict[str, SkillMeta] = {}
        self._reload_skills()

    # ------------------------------------------------------------------ #
    #  公开 API                                                            #
    # ------------------------------------------------------------------ #

    def register(
        self,
        name: str,
        func: Callable = None,
        description: str = "",
        parameters: Dict = None,
        source: str = "builtin",
        tags: List[str] = None,
        version: str = "1.0",
    ) -> "SkillRegistry":
        """注册一个 Skill，支持链式调用"""
        meta = SkillMeta(
            name=name,
            description=description,
            parameters=parameters,
            source=source,
            tags=tags,
            version=version,
            func=func,
        )
        self._skills[name] = meta
        logger.debug("[SkillRegistry] registered: %s (source=%s)", name, source)
        return self

    def get(self, name: str) -> Optional[SkillMeta]:
        """按名称获取 Skill"""
        return self._skills.get(name)

    def list_all(self) -> List[SkillMeta]:
        """列出所有已注册 Skill"""
        return list(self._skills.values())

    def list_by_tag(self, tag: str) -> List[SkillMeta]:
        """按标签筛选 Skill"""
        return [s for s in self._skills.values() if tag in s.tags]

    def to_openai_tools(self, names: List[str] = None) -> List[Dict]:
        """导出为 OpenAI tools 格式，可按名称过滤"""
        skills = self._skills.values()
        if names:
            skills = [s for s in skills if s.name in names]
        return [s.to_openai_tool() for s in skills]

    def summary(self) -> Dict:
        """注册表摘要"""
        return {
            "total": len(self._skills),
            "by_source": self._count_by_source(),
            "skills": [s.to_dict() for s in self._skills.values()],
        }

    # ------------------------------------------------------------------ #
    #  加载逻辑                                                            #
    # ------------------------------------------------------------------ #

    def _reload_skills(self):
        """重新加载 YAML + Python skill"""
        if not self.skills_dir.exists():
            return
        self._load_yaml_skills()
        self._load_python_skills()

    def _load_yaml_skills(self):
        """从 *.yaml 文件加载 Skill 元数据（无执行函数，供文档/规划使用）"""
        for f in self.skills_dir.glob("*.yaml"):
            try:
                data = yaml.safe_load(f.read_text(encoding="utf-8"))
                skills_data = data.get("skills", [data]) if isinstance(data, dict) else data
                for item in skills_data:
                    self.register(
                        name=item["name"],
                        description=item.get("description", ""),
                        parameters=item.get("parameters", {}),
                        source="yaml",
                        tags=item.get("tags", []),
                        version=item.get("version", "1.0"),
                    )
            except Exception as e:
                logger.warning("[SkillRegistry] load yaml failed %s: %s", f, e)

    def _load_python_skills(self):
        """从 *.py 模块加载 Skill（通过 SKILL_MANIFEST）"""
        import sys
        dir_str = str(self.skills_dir.resolve())
        if dir_str not in sys.path:
            sys.path.insert(0, dir_str)

        for f in self.skills_dir.glob("*.py"):
            if f.name.startswith("_"):
                continue
            module_name = f.stem
            try:
                mod = importlib.import_module(module_name)
                for item in getattr(mod, "SKILL_MANIFEST", []):
                    self.register(
                        name=item["name"],
                        func=item.get("func"),
                        description=item.get("description", ""),
                        parameters=item.get("parameters", {}),
                        source="python",
                        tags=item.get("tags", []),
                        version=item.get("version", "1.0"),
                    )
            except Exception as e:
                logger.warning("[SkillRegistry] load python skill %s failed: %s", f.name, e)

    def _count_by_source(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for s in self._skills.values():
            counts[s.source] = counts.get(s.source, 0) + 1
        return counts


# 全局单例
_global_registry: Optional[SkillRegistry] = None


def get_registry(skills_dir: str = "soloflow/skills") -> SkillRegistry:
    """获取全局 Skill 注册中心（懒加载单例）"""
    global _global_registry
    if _global_registry is None:
        _global_registry = SkillRegistry(skills_dir)
    return _global_registry
