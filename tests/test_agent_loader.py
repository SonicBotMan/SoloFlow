"""
Unit Tests for AgentLoader

测试覆盖：
- YAML 加载
- 配置继承
- Agent 配置解析
- 热重载
- 错误处理
"""

import pytest
import yaml
from pathlib import Path
from soloflow.agent_loader import AgentLoader, AgentConfig, AgentSkill


class TestAgentLoader:
    """AgentLoader 测试套件"""
    
    def test_load_agents(self, temp_agents_dir):
        """测试加载 Agent"""
        loader = AgentLoader(temp_agents_dir)
        
        agents = loader.all()
        
        assert len(agents) > 0
        assert "test_agent" in agents
    
    def test_get_agent(self, temp_agents_dir):
        """测试获取 Agent"""
        loader = AgentLoader(temp_agents_dir)
        
        agent = loader.get("test_agent")
        
        assert agent.name == "test_agent"
        assert agent.alias == "测试Agent"
        assert agent.role == "测试用"
    
    def test_get_nonexistent_agent(self, temp_agents_dir):
        """测试获取不存在的 Agent"""
        loader = AgentLoader(temp_agents_dir)
        
        with pytest.raises(KeyError, match="not found"):
            loader.get("nonexistent_agent")
    
    def test_agent_config_attributes(self, temp_agents_dir):
        """测试 AgentConfig 属性"""
        loader = AgentLoader(temp_agents_dir)
        
        agent = loader.get("test_agent")
        
        assert hasattr(agent, "name")
        assert hasattr(agent, "alias")
        assert hasattr(agent, "role")
        assert hasattr(agent, "system_prompt")
        assert hasattr(agent, "skills")
        assert hasattr(agent, "can_delegate")
        assert hasattr(agent, "model")
        assert hasattr(agent, "temperature")
    
    def test_agent_config_defaults(self, temp_agents_dir):
        """测试默认值"""
        loader = AgentLoader(temp_agents_dir)
        
        agent = loader.get("test_agent")
        
        # 默认温度应该是 0.7（来自 base.yaml）
        assert agent.temperature == 0.5  # test_agent.yaml 覆盖了
        assert agent.model == "gpt-4o"
    
    def test_reload(self, temp_agents_dir):
        """测试热重载"""
        loader = AgentLoader(temp_agents_dir)
        
        # 初始加载
        agents_before = len(loader.all())
        
        # 重载
        loader.reload()
        
        agents_after = len(loader.all())
        
        assert agents_before == agents_after
    
    def test_list_agents(self, temp_agents_dir):
        """测试列出 Agent"""
        loader = AgentLoader(temp_agents_dir)
        
        agent_list = loader.list_agents()
        
        assert isinstance(agent_list, list)
        assert len(agent_list) > 0
        
        # 验证字段
        agent = agent_list[0]
        assert "name" in agent
        assert "alias" in agent
        assert "role" in agent


class TestAgentConfig:
    """AgentConfig 测试套件"""
    
    def test_to_dict(self, temp_agents_dir):
        """测试 AgentConfig.to_dict()"""
        loader = AgentLoader(temp_agents_dir)
        
        agent = loader.get("test_agent")
        agent_dict = agent.to_dict()
        
        assert agent_dict["name"] == "test_agent"
        assert agent_dict["alias"] == "测试Agent"
        assert agent_dict["role"] == "测试用"
        assert "skills" in agent_dict
    
    def test_skills_parsing(self, temp_agents_dir):
        """测试技能解析"""
        loader = AgentLoader(temp_agents_dir)
        
        agent = loader.get("test_agent")
        
        # test_agent 有技能
        if agent.skills:
            skill = agent.skills[0]
            assert isinstance(skill, AgentSkill)
            assert hasattr(skill, "name")


class TestAgentSkill:
    """AgentSkill 测试套件"""
    
    def test_skill_creation(self):
        """测试技能创建"""
        skill = AgentSkill(name="test_skill", description="Test description")
        
        assert skill.name == "test_skill"
        assert skill.description == "Test description"
    
    def test_skill_defaults(self):
        """测试技能默认值"""
        skill = AgentSkill(name="test_skill")
        
        assert skill.description == ""


class TestAgentLoaderEdgeCases:
    """边界情况测试"""
    
    def test_empty_agents_dir(self, tmp_path):
        """测试空目录"""
        empty_dir = tmp_path / "agents"
        empty_dir.mkdir()
        
        loader = AgentLoader(str(empty_dir))
        
        agents = loader.all()
        assert len(agents) == 0
    
    def test_malformed_yaml(self, tmp_path):
        """测试错误的 YAML"""
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()
        
        # 创建 base.yaml
        base_yaml = "model: gpt-4o\ntemperature: 0.7"
        (agents_dir / "base.yaml").write_text(base_yaml)
        
        # 创建错误的 YAML
        bad_yaml = "name: [unclosed"
        (agents_dir / "bad_agent.yaml").write_text(bad_yaml)
        
        # 应该不会崩溃，只是跳过错误的文件
        loader = AgentLoader(str(agents_dir))
        
        # 空的，因为 bad_agent.yaml 解析失败
        assert len(loader.all()) == 0
    
    def test_missing_required_fields(self, tmp_path):
        """测试缺少必需字段"""
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()
        
        # 创建 base.yaml
        base_yaml = "model: gpt-4o"
        (agents_dir / "base.yaml").write_text(base_yaml)
        
        # 创建缺少字段的 Agent
        incomplete_yaml = """
name: incomplete_agent
# 缺少 alias, role, system_prompt
"""
        (agents_dir / "incomplete_agent.yaml").write_text(incomplete_yaml)
        
        loader = AgentLoader(str(agents_dir))
        
        # 应该能加载，但字段为空
        agent = loader.get("incomplete_agent")
        assert agent.name == "incomplete_agent"
        assert agent.alias == ""
        assert agent.role == ""
