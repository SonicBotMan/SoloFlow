"""SoloFlow 端到端测试"""
import os, tempfile, pytest
from soloflow.fsm import TaskFSM, TaskStatus
from soloflow.context_bus import ContextBus
from soloflow.drivers.base import BaseDriver, DriverResult
from soloflow.logger import get_logger

logger = get_logger("test_e2e")


class MockDriver(BaseDriver):
    def __init__(self, responses=None, fail_count=0):
        self.responses = responses or ["默认结果"]
        self.call_count = 0
        self.fail_count = fail_count
    
    async def execute(self, system_prompt, user_message, tools=None, config=None):
        self.call_count += 1
        if self.call_count <= self.fail_count:
            return DriverResult(content="", success=False, error=f"失败(第{self.call_count}次)")
        resp = self.responses[min(self.call_count - 1, len(self.responses) - 1)]
        return DriverResult(content=resp, success=True)
    
    async def health_check(self): return True


def _db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    p = f.name; f.close(); return p

def _run(fsm, tid, result="ok"):
    fsm.transition(tid, TaskStatus.ASSIGNED)
    fsm.transition(tid, TaskStatus.RUNNING)
    fsm.transition(tid, TaskStatus.DONE, result)


# ===== DAG =====
class TestDAG:
    @pytest.mark.asyncio
    async def test_parallel(self):
        db = _db(); fsm = TaskFSM(db)
        ts = [fsm.create(title=f"t{i}", description="d", agent="w") for i in range(3)]
        for t in ts: fsm.transition(t.id, TaskStatus.ASSIGNED)
        for t in ts: fsm.transition(t.id, TaskStatus.RUNNING)
        for t in reversed(ts): fsm.transition(t.id, TaskStatus.DONE, f"r{t.id}")
        for t in ts: assert fsm.get(t.id).status == TaskStatus.DONE
        fsm.conn.close(); os.unlink(db)

    @pytest.mark.asyncio
    async def test_sequential_with_bus(self):
        db1, db2 = _db(), _db()
        fsm = TaskFSM(db1); bus = ContextBus(db2)
        fid = "flow-test"
        t1 = fsm.create(title="s1", description="d", agent="a1")
        t2 = fsm.create(title="s2", description="d", agent="a2")
        _run(fsm, t1.id, "结果1")
        bus.publish(fid, "a1", "结果1", t1.id)
        assert bus.get(fid, "a1") == "结果1"
        _run(fsm, t2.id, "结果2")
        bus.publish(fid, "a2", "结果2", t2.id)
        prompt = bus.build_context_prompt(fid)
        assert "a1" in prompt and "a2" in prompt
        fsm.conn.close(); os.unlink(db1); os.unlink(db2)


# ===== 重试 =====
class TestRetry:
    @pytest.mark.asyncio
    async def test_succeeds_eventually(self):
        d = MockDriver(fail_count=2)
        assert not (await d.execute("s","u")).success
        assert not (await d.execute("s","u")).success
        assert (await d.execute("s","u")).success
        assert d.call_count == 3

    @pytest.mark.asyncio
    async def test_all_fail(self):
        d = MockDriver(fail_count=999)
        r = None
        for _ in range(3): r = await d.execute("s","u")
        assert not r.success


# ===== ContextBus =====
class TestBus:
    def _bus(self):
        db = _db(); return ContextBus(db), db

    def test_publish_get(self):
        b, db = self._bus()
        b.publish("f1", "k", "v1", "t1")
        assert b.get("f1", "k") == "v1"
        b.conn.close(); os.unlink(db)

    def test_prompt(self):
        b, db = self._bus()
        b.publish("f1", "a", "v1", "t1")
        b.publish("f1", "b", "v2", "t2")
        p = b.build_context_prompt("f1")
        assert "a" in p and "b" in p
        b.conn.close(); os.unlink(db)

    def test_empty(self):
        b, db = self._bus()
        assert b.get("f1", "x") is None
        b.conn.close(); os.unlink(db)

    def test_overwrite(self):
        b, db = self._bus()
        b.publish("f1", "k", "v1", "t1")
        b.publish("f1", "k", "v2", "t2")
        assert b.get("f1", "k") == "v2"
        b.conn.close(); os.unlink(db)

    def test_isolation(self):
        b, db = self._bus()
        b.publish("f1", "k", "v1", "t1")
        b.publish("f2", "k", "v2", "t2")
        assert b.get("f1", "k") == "v1"
        assert b.get("f2", "k") == "v2"
        b.conn.close(); os.unlink(db)


# ===== FSM =====
class TestFSM:
    def _fsm(self):
        db = _db(); return TaskFSM(db), db

    def test_happy(self):
        fsm, db = self._fsm()
        t = fsm.create(title="t", description="d", agent="a")
        _run(fsm, t.id, "完成")
        assert fsm.get(t.id).status == TaskStatus.DONE
        assert fsm.get(t.id).result == "完成"
        fsm.conn.close(); os.unlink(db)

    def test_failure(self):
        fsm, db = self._fsm()
        t = fsm.create(title="t", description="d", agent="a")
        fsm.transition(t.id, TaskStatus.ASSIGNED)
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.FAILED, "出错")
        assert fsm.get(t.id).status == TaskStatus.FAILED
        fsm.conn.close(); os.unlink(db)

    def test_human(self):
        fsm, db = self._fsm()
        t = fsm.create(title="t", description="d", agent="a")
        fsm.transition(t.id, TaskStatus.ASSIGNED)
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.WAITING_HUMAN, "[需要确认]")
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.DONE, "确认完成")
        assert fsm.get(t.id).status == TaskStatus.DONE
        fsm.conn.close(); os.unlink(db)

    def test_retry(self):
        fsm, db = self._fsm()
        t = fsm.create(title="t", description="d", agent="a")
        fsm.transition(t.id, TaskStatus.ASSIGNED)
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.FAILED, "失败")
        fsm.transition(t.id, TaskStatus.PENDING)
        _run(fsm, t.id, "重试成功")
        assert fsm.get(t.id).status == TaskStatus.DONE
        fsm.conn.close(); os.unlink(db)

    def test_history(self):
        fsm, db = self._fsm()
        t = fsm.create(title="t", description="d", agent="a")
        fsm.transition(t.id, TaskStatus.ASSIGNED)
        fsm.transition(t.id, TaskStatus.RUNNING)
        fsm.transition(t.id, TaskStatus.DONE, "ok")
        hist = fsm.get_history(t.id)
        assert len(hist) >= 3
        fsm.conn.close(); os.unlink(db)

    def test_multi(self):
        fsm, db = self._fsm()
        ts = [fsm.create(title=f"t{i}", description="d", agent=f"a{i%2}") for i in range(5)]
        _run(fsm, ts[0].id, "ok")
        fsm.transition(ts[1].id, TaskStatus.ASSIGNED)
        fsm.transition(ts[1].id, TaskStatus.RUNNING)
        fsm.transition(ts[1].id, TaskStatus.FAILED, "err")
        fsm.transition(ts[2].id, TaskStatus.ASSIGNED)
        fsm.transition(ts[2].id, TaskStatus.RUNNING)
        fsm.transition(ts[2].id, TaskStatus.WAITING_HUMAN, "confirm")
        assert fsm.get(ts[0].id).status == TaskStatus.DONE
        assert fsm.get(ts[1].id).status == TaskStatus.FAILED
        assert fsm.get(ts[2].id).status == TaskStatus.WAITING_HUMAN
        assert fsm.get(ts[3].id).status == TaskStatus.PENDING
        assert fsm.get(ts[4].id).status == TaskStatus.PENDING
        s = fsm.stats()
        assert s.get("pending", 0) == 2
        assert s.get("done", 0) == 1
        fsm.conn.close(); os.unlink(db)
