"""Tests for session management."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from session import SessionManager, Session, SessionEvent


@pytest.fixture
def manager():
    return SessionManager(max_context_tokens=1000)


class TestSession:
    def test_creation(self):
        session = Session(app_name="test", user_id="user1")
        assert session.app_name == "test"
        assert session.user_id == "user1"
        assert session.is_active is True
    
    def test_add_event(self):
        session = Session()
        event = SessionEvent(
            event_type="user_input",
            content={"text": "hello"},
            token_count=10,
        )
        session.add_event(event)
        assert len(session.events) == 1
        assert session.current_token_count == 10
    
    def test_context_budget(self):
        session = Session(max_context_tokens=100)
        event = SessionEvent(token_count=50)
        session.add_event(event)
        assert session.context_budget_remaining == 50
    
    def test_budget_enforcement(self):
        session = Session(max_context_tokens=100)
        for i in range(20):
            session.add_event(SessionEvent(token_count=10))
        
        # Should have enforced budget
        assert session.current_token_count <= 100


class TestSessionManager:
    def test_create_session(self, manager):
        session = manager.create_session("app1", "user1")
        assert session.app_name == "app1"
        assert session.user_id == "user1"
    
    def test_get_session(self, manager):
        session = manager.create_session()
        retrieved = manager.get_session(session.session_id)
        assert retrieved is not None
        assert retrieved.session_id == session.session_id
    
    def test_get_nonexistent(self, manager):
        result = manager.get_session("nonexistent")
        assert result is None
    
    def test_list_sessions(self, manager):
        manager.create_session("app1", "user1")
        manager.create_session("app2", "user2")
        
        sessions = manager.list_sessions()
        assert len(sessions) == 2
    
    def test_list_sessions_filter(self, manager):
        manager.create_session("app1", "user1")
        manager.create_session("app2", "user2")
        
        sessions = manager.list_sessions(app_name="app1")
        assert len(sessions) == 1
    
    def test_cleanup_expired(self, manager):
        session = manager.create_session()
        # Manually expire session
        session.last_active_at = 0
        
        cleaned = manager.cleanup_expired()
        assert cleaned == 1
    
    def test_get_stats(self, manager):
        manager.create_session()
        manager.create_session()
        
        stats = manager.get_stats()
        assert stats["total_sessions"] == 2
        assert stats["active_sessions"] == 2
