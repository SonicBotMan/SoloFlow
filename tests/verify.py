#!/usr/bin/env python3
"""
SoloFlow 简单验证脚本（不依赖 pytest）

用于快速验证核心功能
"""

import sys
import os
import tempfile
import time

# 添加项目根目录到路径
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from soloflow.fsm import TaskFSM, TaskStatus
from soloflow.agent_loader import AgentLoader
from soloflow.memory import PreferenceMemory


def test_fsm():
    """测试 TaskFSM"""
    print("\n📋 测试 TaskFSM...")
    
    # 使用内存数据库
    fsm = TaskFSM(":memory:")
    
    # 测试1: 创建任务
    task = fsm.create("测试任务", "这是一个测试", agent="test_agent")
    assert task.status == TaskStatus.PENDING
    print("  ✅ 任务创建成功")
    
    # 测试2: 状态转移
    fsm.transition(task.id, TaskStatus.ASSIGNED)
    fsm.transition(task.id, TaskStatus.RUNNING)
    fsm.transition(task.id, TaskStatus.DONE, result="完成")
    task = fsm.get(task.id)
    assert task.status == TaskStatus.DONE
    assert task.result == "完成"
    print("  ✅ 状态转移成功")
    
    # 测试3: 子任务
    child = fsm.create("子任务", "子任务描述", parent_id=task.id)
    children = fsm.get_children(task.id)
    assert len(children) == 1
    print("  ✅ 子任务成功")
    
    # 测试4: 历史记录
    history = fsm.get_history(task.id)
    assert len(history) > 0
    print(f"  ✅ 历史记录 ({len(history)} 条)")


def test_agent_loader():
    """测试 AgentLoader"""
    print("\n🤖 测试 AgentLoader...")
    
    loader = AgentLoader("soloflow/agents")
    
    # 测试1: 加载所有 Agent
    agents = loader.all()
    assert len(agents) > 0
    print(f"  ✅ 加载了 {len(agents)} 个 Agent")
    
    # 测试2: 获取 Agent
    agent = loader.get("assistant")
    assert agent.name == "assistant"
    assert agent.alias == "小助"
    print(f"  ✅ 小助配置: {agent.role}")
    
    # 测试3: Agent 列表
    agent_list = loader.list_agents()
    assert len(agent_list) > 0
    print(f"  ✅ Agent 列表: {[a['alias'] for a in agent_list]}")


def test_memory():
    """测试 PreferenceMemory"""
    print("\n🧠 测试 PreferenceMemory...")
    
    memory = PreferenceMemory(":memory:")
    
    # 测试1: 添加偏好
    memory.update(
        agent="editor",
        category="视频节奏",
        value="快节奏",
        evidence="老板说节奏太慢",
        delta=0.1
    )
    print("  ✅ 添加偏好成功")
    
    # 测试2: 回忆偏好
    prefs = memory.recall("editor")
    assert len(prefs) > 0
    assert prefs[0]["category"] == "视频节奏"
    print(f"  ✅ 回忆偏好: {prefs[0]['category']} = {prefs[0]['value']}")
    
    # 测试3: 更新偏好（增加置信度）
    memory.update("editor", "视频节奏", "快节奏", "再次确认", delta=0.1)
    prefs2 = memory.recall("editor")
    assert prefs2[0]["confidence"] > prefs[0]["confidence"]
    print(f"  ✅ 置信度更新: {prefs[0]['confidence']:.2f} → {prefs2[0]['confidence']:.2f}")
    
    # 测试4: 格式化输出
    formatted = memory.format_for_prompt("editor")
    assert "视频节奏" in formatted
    print(f"  ✅ 格式化输出:\n{formatted}")
    
    # 测试5: 统计
    stats = memory.stats()
    assert stats["total"] > 0
    print(f"  ✅ 统计: {stats}")


def main():
    print("="*60)
    print("SoloFlow 核心功能验证")
    print("="*60)
    
    try:
        test_fsm()
        test_agent_loader()
        test_memory()
        
        print("\n" + "="*60)
        print("✅ 所有测试通过！")
        print("="*60)
        return 0
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
