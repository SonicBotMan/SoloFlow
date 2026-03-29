"""FSM 测试"""
import os, tempfile, pytest
from soloflow.fsm import TaskFSM, TaskStatus

@pytest.fixture
def fsm():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    db = f.name; f.close()
    engine = TaskFSM(db)
    yield engine
    engine.conn.close(); os.unlink(db)

class TestFSM:
    def test_create(self, fsm):
        t = fsm.create(title="测试", description="d", agent="a")
        assert t.id and t.status == TaskStatus.PENDING

    def test_lifecycle(self, fsm):
        t = fsm.create(title="t", description="d", agent="a")
        fsm.transition(t.id, TaskStatus.ASSIGNED)
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.DONE, "ok")
        assert fsm.get(t.id).status == TaskStatus.DONE
        assert fsm.get(t.id).result == "ok"

    def test_invalid(self, fsm):
        t = fsm.create(title="t", description="d", agent="a")
        with pytest.raises(ValueError): fsm.transition(t.id, TaskStatus.RUNNING)

    def test_history(self, fsm):
        t = fsm.create(title="t", description="d", agent="a")
        fsm.transition(t.id, TaskStatus.ASSIGNED)
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.DONE, "ok")
        assert len(fsm.get_history(t.id)) >= 3

    def test_retry(self, fsm):
        t = fsm.create(title="t", description="d", agent="a")
        fsm.transition(t.id, TaskStatus.ASSIGNED)
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.FAILED, "err")
        fsm.transition(t.id, TaskStatus.PENDING)
        assert fsm.get(t.id).status == TaskStatus.PENDING

    def test_stats(self, fsm):
        fsm.create(title="t1", description="d", agent="a")
        fsm.create(title="t2", description="d", agent="a")
        assert fsm.stats().get("pending", 0) == 2
