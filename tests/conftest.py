"""
Pytest Configuration for SoloFlow

提供常用的 fixtures 和测试工具
"""

import pytest
import tempfile
import os
from pathlib import Path


@pytest.fixture
def temp_db():
    """创建临时数据库"""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    
    yield db_path
    
    # 清理
    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture
def temp_agents_dir():
    """创建临时 Agent 配置目录"""
    with tempfile.TemporaryDirectory() as tmpdir:
        agents_dir = Path(tmpdir) / "agents"
        agents_dir.mkdir()
        
        # 创建 base.yaml
        base_yaml = """
model: gpt-4o
temperature: 0.7
max_tokens: 4096
skills:
  - name: test_skill
    description: Test skill
"""
        (agents_dir / "base.yaml").write_text(base_yaml)
        
        # 创建测试 Agent
        test_agent = """
name: test_agent
alias: 测试Agent
role: 测试用
model: gpt-4o
temperature: 0.5
can_delegate: false

system_prompt: |
  你是测试Agent

skills:
  - name: test_skill
    description: Test skill
"""
        (agents_dir / "test_agent.yaml").write_text(test_agent)
        
        yield str(agents_dir)


@pytest.fixture
def sample_task_data():
    """示例任务数据"""
    return {
        "title": "测试任务",
        "description": "这是一个测试任务",
        "agent": "test_agent",
        "context": {"key": "value"}
    }


@pytest.fixture
def sample_preference_data():
    """示例偏好数据"""
    return {
        "agent": "test_agent",
        "category": "视频节奏",
        "value": "快节奏",
        "evidence": "老板说节奏太慢了",
        "delta": 0.1
    }
