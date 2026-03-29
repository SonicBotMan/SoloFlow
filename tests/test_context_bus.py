"""ContextBus 测试"""
import os, tempfile, pytest
from soloflow.context_bus import ContextBus

def _bus():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    db = f.name; f.close()
    return ContextBus(db), db

class TestBus:
    def test_publish_get(self):
        b, db = _bus()
        b.publish("f1", "k", "v1", "t1")
        assert b.get("f1", "k") == "v1"
        b.conn.close(); os.unlink(db)

    def test_prompt(self):
        b, db = _bus()
        b.publish("f1", "a", "v1", "t1")
        b.publish("f1", "b", "v2", "t2")
        assert "a" in b.build_context_prompt("f1")
        b.conn.close(); os.unlink(db)

    def test_empty(self):
        b, db = _bus()
        assert b.get("f1", "x") is None
        b.conn.close(); os.unlink(db)

    def test_overwrite(self):
        b, db = _bus()
        b.publish("f1", "k", "v1", "t1")
        b.publish("f1", "k", "v2", "t2")
        assert b.get("f1", "k") == "v2"
        b.conn.close(); os.unlink(db)

    def test_isolation(self):
        b, db = _bus()
        b.publish("f1", "k", "v1", "t1")
        b.publish("f2", "k", "v2", "t2")
        assert b.get("f1", "k") == "v1"
        b.conn.close(); os.unlink(db)
