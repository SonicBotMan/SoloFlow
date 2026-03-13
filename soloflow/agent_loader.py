"""
YAML 驱动的 Agent 加载器

支持:
- 从 YAML 文件加载 Agent 配置
- 继承 base.yaml 公共配置
- 热重载
- Agent 配置验证
"""

import yaml
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass
import time


@dataclass
class AgentSkill:
    """Agent 技能"""
    name: str
    description: str = ""
    parameters: Dict = None  # v2.0: 工具参数定义（用于 OpenAI function calling）


@dataclass
class AgentConfig:
    """Agent 配置"""
    name: str
    alias: str                    # 花名，如「小助」
    role: str                     # 角色描述
    system_prompt: str            # 系统 Prompt
    skills: List[AgentSkill]      # 可调用的外部工具
    can_delegate: bool = False    # 是否可以分配任务
    model: str = "gpt-4o"         # 支持不同Agent用不同模型
    temperature: float = 0.7
    max_tokens: int = 4096
    # v2.0: Driver 支持
    driver: str = "llm"           # Agent 运行时（llm/openclaw/http）
    driver_config: Dict = None    # Driver 配置
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "name": self.name,
            "alias": self.alias,
            "role": self.role,
            "system_prompt": self.system_prompt[:100] + "...",  # 截断
            "skills": [{"name": s.name, "description": s.description} for s in self.skills],
            "can_delegate": self.can_delegate,
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }


class AgentLoader:
    """从 agents/ 目录加载所有 YAML 配置，支持热重载"""
    
    def __init__(self, agents_dir: str = "soloflow/agents"):
        """初始化加载器
        
        Args:
            agents_dir: Agent 配置目录
        """
        self.agents_dir = Path(agents_dir)
        self._cache: Dict[str, AgentConfig] = {}
        self._last_reload: float = 0
        self.reload_interval: int = 60  # 热重载间隔（秒）
        
        # 首次加载
        self.reload()
    
    def reload(self):
        """重新加载所有 Agent 配置"""
        self._cache.clear()
        
        if not self.agents_dir.exists():
            print(f"⚠️  Agents 目录不存在: {self.agents_dir}")
            return
        
        # 加载 base.yaml
        base_config = self._load_base()
        
        # 加载所有 Agent
        for yaml_file in self.agents_dir.glob("*.yaml"):
            if yaml_file.name == "base.yaml":
                continue
            
            try:
                data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
                
                # 合并 base 配置
                if base_config:
                    merged = {**base_config, **data}
                else:
                    merged = data
                
                # 转换为 AgentConfig
                cfg = self._parse_config(merged)
                self._cache[cfg.name] = cfg
                
            except Exception as e:
                print(f"❌ 加载 Agent 失败 {yaml_file}: {e}")
        
        self._last_reload = time.time()
        print(f"✅ 已加载 {len(self._cache)} 个 Agent")
    
    def _load_base(self) -> Optional[Dict]:
        """加载基础配置"""
        base_path = self.agents_dir / "base.yaml"
        
        if not base_path.exists():
            return None
        
        try:
            return yaml.safe_load(base_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠️  加载 base.yaml 失败: {e}")
            return None
    
    def _parse_config(self, data: Dict) -> AgentConfig:
        """解析配置"""
        # 解析技能列表
        skills = []
        for skill_data in data.get("skills", []):
            if isinstance(skill_data, str):
                skills.append(AgentSkill(name=skill_data))
            elif isinstance(skill_data, dict):
                skills.append(AgentSkill(
                    name=skill_data.get("name", ""),
                    description=skill_data.get("description", ""),
                    parameters=skill_data.get("parameters", {})
                ))
        
        return AgentConfig(
            name=data.get("name", ""),
            alias=data.get("alias", ""),
            role=data.get("role", ""),
            system_prompt=data.get("system_prompt", ""),
            skills=skills,
            can_delegate=data.get("can_delegate", False),
            model=data.get("model", "gpt-4o"),
            temperature=data.get("temperature", 0.7),
            max_tokens=data.get("max_tokens", 4096),
            # v2.0: Driver 支持
            driver=data.get("driver", "llm"),
            driver_config=data.get("driver_config", None),
        )
    
    def get(self, name: str) -> AgentConfig:
        """获取 Agent 配置
        
        Args:
            name: Agent 名称
            
        Returns:
            AgentConfig: Agent 配置
            
        Raises:
            KeyError: Agent 不存在
        """
        # 检查是否需要热重载
        if time.time() - self._last_reload > self.reload_interval:
            self.reload()
        
        if name not in self._cache:
            raise KeyError(f"Agent '{name}' not found. Available: {list(self._cache.keys())}")
        
        return self._cache[name]
    
    def all(self) -> Dict[str, AgentConfig]:
        """获取所有 Agent 配置
        
        Returns:
            Dict[str, AgentConfig]: 所有 Agent 配置
        """
        # 检查是否需要热重载
        if time.time() - self._last_reload > self.reload_interval:
            self.reload()
        
        return self._cache
    
    def list_agents(self) -> List[Dict]:
        """列出所有 Agent（简要信息）
        
        Returns:
            List[Dict]: Agent 简要信息列表
        """
        return [
            {
                "name": cfg.name,
                "alias": cfg.alias,
                "role": cfg.role,
                "can_delegate": cfg.can_delegate,
                "model": cfg.model,
            }
            for cfg in self._cache.values()
        ]
