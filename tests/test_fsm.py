"""FSM 状态机测试"""
import os
import tempfile
import pytest
from soloflow.fsm import TaskFSM, TaskStatus, Task


@pytest.fixture
def fsm():
    """创建临时数据库的 FSM"""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    engine = TaskFSM(db_path)
    yield engine
    engine.close()
    os.unlink(db_path)


class TestTaskFSM:
    def test_create_task(self, fsm):
        """测试创建任务"""
        task = fsm.create(
            title="测试任务",
            description="这是一个测试",
            agent="assistant"
        )
        assert task.id is not None
        assert task.title == "测试任务"
        assert task.status == TaskStatus.PENDING

    def test_transition(self, fsm):
        """测试状态转移"""
        task = fsm.create(title="t", description="d", agent="assistant")
        
        # PENDING -> RUNNING
        fsm.transition(task.id, TaskStatus.RUNNING)
        t = fsm.get(task.id)
        assert t.status == TaskStatus.RUNNING
        
        # RUNNING -> DONE
        fsm.transition(task.id, TaskStatus.DONE, "完成结果")
        t = fsm.get(task.id)
        assert t.status == TaskStatus.DONE
        assert t.result == "完成结果"

    def test_invalid_transition(self, fsm):
        """测试无效状态转移"""
        task = fsm.create(title="t", description="d", agent="assistant")
        # DONE -> RUNNING（不允许）
        fsm.transition(task.id, TaskStatus.DONE, "done")
        with pytest.raises(Exception):
            fsm.transition(task.id, TaskStatus.RUNNING)

    def test_list_tasks(self, fsm):
        """测试列出任务"""
        fsm.create(title="t1", description="d1", agent="a1")
        fsm.create(title="t2", description="d2", agent="a2")
        tasks = fsm.list_tasks()
        assert len(tasks) == 2

    def test_get_nonexistent(self, fsm):
        """测试获取不存在的任务"""
        with pytest.raises(Exception):
            fsm.get("nonexistent-id")

    def test_transition_log(self, fsm):
        """测试状态转移日志"""
        task = fsm.create(title="t", description="d", agent="assistant")
        fsm.transition(task.id, TaskStatus.RUNNING)
        fsm.transition(task.id, TaskStatus.DONE, "ok")
        
        logs = fsm.get_transition_log(task.id)
        assert len(logs) >= 2
