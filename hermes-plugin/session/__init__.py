"""Session management for SoloFlow.

Implements Google ADK-style session management:
- Session = conversation state + event flow
- Context budget management
- Memory integration via lifecycle
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("soloflow.session")


@dataclass
class SessionEvent:
    """An event in a session."""
    
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = ""  # user_input, tool_call, tool_result, agent_response
    content: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    token_count: int = 0
    
    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "content": self.content,
            "timestamp": self.timestamp,
            "token_count": self.token_count,
        }


@dataclass
class Session:
    """A session with context budget management.
    
    Key insight from Google ADK:
    - Session = conversation state + event flow
    - Context budget = max tokens for context
    - Memory integration via lifecycle (not as tool)
    """
    
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    app_name: str = "default"
    user_id: str = "default"
    
    # State
    events: list[SessionEvent] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    
    # Context budget
    max_context_tokens: int = 8000
    current_token_count: int = 0
    
    # Timestamps
    created_at: float = field(default_factory=time.time)
    last_active_at: float = field(default_factory=time.time)
    
    @property
    def is_active(self) -> bool:
        """Check if session is still active."""
        # Session expires after 30 minutes of inactivity
        return (time.time() - self.last_active_at) < 1800
    
    @property
    def context_budget_remaining(self) -> int:
        """Remaining context budget in tokens."""
        return max(0, self.max_context_tokens - self.current_token_count)
    
    def add_event(self, event: SessionEvent) -> None:
        """Add an event to the session."""
        self.events.append(event)
        self.current_token_count += event.token_count
        self.last_active_at = time.time()
        
        # Enforce context budget
        self._enforce_budget()
    
    def _enforce_budget(self) -> None:
        """Enforce context budget by summarizing old events."""
        while self.current_token_count > self.max_context_tokens and len(self.events) > 1:
            # Remove oldest event (in production, would summarize)
            removed = self.events.pop(0)
            self.current_token_count -= removed.token_count
    
    def get_recent_events(self, limit: int = 10) -> list[SessionEvent]:
        """Get recent events."""
        return self.events[-limit:]
    
    def get_context_summary(self) -> dict:
        """Get context summary for memory integration."""
        return {
            "session_id": self.session_id,
            "app_name": self.app_name,
            "user_id": self.user_id,
            "event_count": len(self.events),
            "token_count": self.current_token_count,
            "budget_remaining": self.context_budget_remaining,
            "is_active": self.is_active,
        }
    
    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "app_name": self.app_name,
            "user_id": self.user_id,
            "event_count": len(self.events),
            "current_token_count": self.current_token_count,
            "max_context_tokens": self.max_context_tokens,
            "created_at": self.created_at,
            "last_active_at": self.last_active_at,
        }


class SessionManager:
    """Manages sessions with context budget.
    
    Key patterns from Google ADK:
    1. Session = conversation state + event flow
    2. Context budget = max tokens for context
    3. Memory integration via lifecycle (not as tool)
    4. Single responsibility: session manages state, memory manages long-term
    """
    
    def __init__(self, max_context_tokens: int = 8000) -> None:
        self._sessions: dict[str, Session] = {}
        self._max_context_tokens = max_context_tokens
    
    def create_session(
        self,
        app_name: str = "default",
        user_id: str = "default",
    ) -> Session:
        """Create a new session."""
        session = Session(
            app_name=app_name,
            user_id=user_id,
            max_context_tokens=self._max_context_tokens,
        )
        self._sessions[session.session_id] = session
        return session
    
    def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID."""
        return self._sessions.get(session_id)
    
    def get_or_create_session(
        self,
        session_id: str,
        app_name: str = "default",
        user_id: str = "default",
    ) -> Session:
        """Get existing session or create new one."""
        session = self._sessions.get(session_id)
        if session and session.is_active:
            return session
        
        # Create new session
        session = Session(
            session_id=session_id,
            app_name=app_name,
            user_id=user_id,
            max_context_tokens=self._max_context_tokens,
        )
        self._sessions[session_id] = session
        return session
    
    def list_sessions(
        self,
        app_name: str | None = None,
        user_id: str | None = None,
        active_only: bool = True,
    ) -> list[Session]:
        """List sessions with optional filters."""
        sessions = list(self._sessions.values())
        
        if app_name:
            sessions = [s for s in sessions if s.app_name == app_name]
        
        if user_id:
            sessions = [s for s in sessions if s.user_id == user_id]
        
        if active_only:
            sessions = [s for s in sessions if s.is_active]
        
        return sessions
    
    def cleanup_expired(self) -> int:
        """Clean up expired sessions."""
        expired = [
            sid for sid, session in self._sessions.items()
            if not session.is_active
        ]
        
        for sid in expired:
            del self._sessions[sid]
        
        return len(expired)
    
    def get_stats(self) -> dict:
        """Get session statistics."""
        active = sum(1 for s in self._sessions.values() if s.is_active)
        total_tokens = sum(s.current_token_count for s in self._sessions.values())
        
        return {
            "total_sessions": len(self._sessions),
            "active_sessions": active,
            "total_tokens": total_tokens,
        }
