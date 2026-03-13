"""
Unit Tests for TaskFSM (Task State Machine)

测试覆盖：
- 任务创建
- 状态转移（合法/非法）
- 任务查询
- 子任务支持
- 转移历史
"""

import pytest
from soloflow.fsm import TaskFSM, TaskStatus, Task


class TestTaskFSM:
    """TaskFSM 测试套件"""
    
    def test_create_task(self, temp_db):
        """测试任务创建"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create(
            title="测试任务",
            description="这是一个测试",
            agent="test_agent"
        )
        
        assert task.id is not None
        assert task.title == "测试任务"
        assert task.description == "这是一个测试"
        assert task.agent == "test_agent"
        assert task.status == TaskStatus.PENDING
        assert task.created_at > 0
        assert task.updated_at > 0
    
    def test_get_task(self, temp_db):
        """测试获取任务"""
        fsm = TaskFSM(temp_db)
        
        created = fsm.create("获取测试", "desc")
        fetched = fsm.get(created.id)
        
        assert fetched.id == created.id
        assert fetched.title == created.title
    
    def test_get_nonexistent_task(self, temp_db):
        """测试获取不存在的任务"""
        fsm = TaskFSM(temp_db)
        
        with pytest.raises(KeyError, match="not found"):
            fsm.get("nonexistent_id")
    
    def test_transition_pending_to_assigned(self, temp_db):
        """测试 PENDING → ASSIGNED 转移"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("转移测试", "desc")
        updated = fsm.transition(task.id, TaskStatus.ASSIGNED)
        
        assert updated.status == TaskStatus.ASSIGNED
        assert updated.updated_at >= task.updated_at
    
    def test_transition_assigned_to_running(self, temp_db):
        """测试 ASSIGNED → RUNNING 转移"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("转移测试", "desc")
        fsm.transition(task.id, TaskStatus.ASSIGNED)
        updated = fsm.transition(task.id, TaskStatus.RUNNING)
        
        assert updated.status == TaskStatus.RUNNING
    
    def test_transition_running_to_done(self, temp_db):
        """测试 RUNNING → DONE 转移"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("转移测试", "desc")
        fsm.transition(task.id, TaskStatus.ASSIGNED)
        fsm.transition(task.id, TaskStatus.RUNNING)
        updated = fsm.transition(task.id, TaskStatus.DONE, result="任务完成")
        
        assert updated.status == TaskStatus.DONE
        assert updated.result == "任务完成"
    
    def test_transition_running_to_waiting_human(self, temp_db):
        """测试 RUNNING → WAITING_HUMAN 转移"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("转移测试", "desc")
        fsm.transition(task.id, TaskStatus.ASSIGNED)
        fsm.transition(task.id, TaskStatus.RUNNING)
        updated = fsm.transition(task.id, TaskStatus.WAITING_HUMAN)
        
        assert updated.status == TaskStatus.WAITING_HUMAN
    
    def test_transition_invalid(self, temp_db):
        """测试非法状态转移"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("转移测试", "desc")
        
        # PENDING 不能直接跳到 DONE
        with pytest.raises(ValueError, match="Invalid transition"):
            fsm.transition(task.id, TaskStatus.DONE)
    
    def test_transition_done_to_any(self, temp_db):
        """测试 DONE 是终态"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("转移测试", "desc")
        fsm.transition(task.id, TaskStatus.ASSIGNED)
        fsm.transition(task.id, TaskStatus.RUNNING)
        fsm.transition(task.id, TaskStatus.DONE)
        
        # DONE 不能转移到任何状态
        with pytest.raises(ValueError, match="Invalid transition"):
            fsm.transition(task.id, TaskStatus.RUNNING)
    
    def test_transition_failed_retry(self, temp_db):
        """测试失败重试"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("失败测试", "desc")
        fsm.transition(task.id, TaskStatus.FAILED, result="任务失败")
        updated = fsm.transition(task.id, TaskStatus.PENDING)
        
        assert updated.status == TaskStatus.PENDING
    
    def test_list_pending(self, temp_db):
        """测试列出待处理任务"""
        fsm = TaskFSM(temp_db)
        
        fsm.create("任务1", "desc", agent="agent1")
        fsm.create("任务2", "desc", agent="agent2")
        
        pending = fsm.list_pending()
        
        assert len(pending) == 2
        assert all(t.status == TaskStatus.PENDING for t in pending)
    
    def test_list_pending_by_agent(self, temp_db):
        """测试按 Agent 列出待处理任务"""
        fsm = TaskFSM(temp_db)
        
        fsm.create("任务1", "desc", agent="agent1")
        fsm.create("任务2", "desc", agent="agent2")
        fsm.create("任务3", "desc", agent="agent1")
        
        pending_agent1 = fsm.list_pending(agent="agent1")
        
        assert len(pending_agent1) == 2
        assert all(t.agent == "agent1" for t in pending_agent1)
    
    def test_create_subtask(self, temp_db):
        """测试创建子任务"""
        fsm = TaskFSM(temp_db)
        
        parent = fsm.create("父任务", "desc")
        child = fsm.create("子任务", "desc", parent_id=parent.id)
        
        assert child.parent_id == parent.id
        
        children = fsm.get_children(parent.id)
        assert len(children) == 1
        assert children[0].id == child.id
    
    def test_task_with_context(self, temp_db):
        """测试任务上下文"""
        fsm = TaskFSM(temp_db)
        
        context = {"key1": "value1", "key2": 123}
        task = fsm.create("上下文测试", "desc", context=context)
        
        fetched = fsm.get(task.id)
        assert fetched.context == context
    
    def test_get_history(self, temp_db):
        """测试获取转移历史"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("历史测试", "desc")
        fsm.transition(task.id, TaskStatus.ASSIGNED)
        fsm.transition(task.id, TaskStatus.RUNNING)
        fsm.transition(task.id, TaskStatus.DONE)
        
        history = fsm.get_history(task.id)
        
        # 应该有 4 条记录：创建 + 3 次转移
        assert len(history) == 4
        
        # 验证顺序
        assert history[0]["from_status"] is None  # 创建
        assert history[0]["to_status"] == "pending"
        assert history[-1]["to_status"] == "done"
    
    def test_stats(self, temp_db):
        """测试任务统计"""
        fsm = TaskFSM(temp_db)
        
        fsm.create("任务1", "desc")
        fsm.create("任务2", "desc")
        
        task3 = fsm.create("任务3", "desc")
        fsm.transition(task3.id, TaskStatus.ASSIGNED)
        fsm.transition(task3.id, TaskStatus.RUNNING)
        fsm.transition(task3.id, TaskStatus.DONE)
        
        stats = fsm.stats()
        
        assert stats.get("pending", 0) == 2
        assert stats.get("done", 0) == 1
    
    def test_task_to_dict(self, temp_db):
        """测试 Task.to_dict()"""
        fsm = TaskFSM(temp_db)
        
        task = fsm.create("字典测试", "desc", context={"key": "value"})
        task_dict = task.to_dict()
        
        assert task_dict["id"] == task.id
        assert task_dict["title"] == task.title
        assert task_dict["status"] == "pending"
        assert task_dict["context"] == {"key": "value"}
        assert "created_at_str" in task_dict
        assert "updated_at_str" in task_dict


class TestTaskStatus:
    """TaskStatus 测试套件"""
    
    def test_status_values(self):
        """测试状态枚举值"""
        assert TaskStatus.PENDING.value == "pending"
        assert TaskStatus.ASSIGNED.value == "assigned"
        assert TaskStatus.RUNNING.value == "running"
        assert TaskStatus.WAITING_HUMAN.value == "waiting_human"
        assert TaskStatus.DONE.value == "done"
        assert TaskStatus.FAILED.value == "failed"
