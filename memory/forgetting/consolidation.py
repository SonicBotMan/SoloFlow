"""Memory consolidation system for SoloFlow.

Periodically consolidates memories based on the forgetting curve,
promoting frequently accessed memories and expiring forgotten ones.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

from .curve import ForgettingCurve, MemoryEntry

logger = logging.getLogger("soloflow.consolidation")


class MemoryConsolidator:
    """Consolidates memories based on the Ebbinghaus forgetting curve.
    
    The consolidator runs periodically to:
    1. Identify memories that need consolidation (low retention)
    2. Promote frequently accessed memories (increase stability)
    3. Expire forgotten memories (below threshold)
    4. Move memories between tiers (working -> episodic -> semantic)
    
    Usage:
        consolidator = MemoryConsolidator(db_path=Path("memory.db"))
        await consolidator.start()
        
        # Add memories
        await consolidator.add_memory("key1", {"data": "value"})
        
        # Access memories (increases stability)
        entry = await consolidator.get_memory("key1")
        
        # Stop consolidation
        await consolidator.stop()
    """
    
    def __init__(
        self,
        db_path: Path = Path("memory.db"),
        curve: ForgettingCurve | None = None,
        consolidation_interval: float = 300.0,  # 5 minutes
        auto_start: bool = False,
    ) -> None:
        self._db_path = db_path
        self._curve = curve or ForgettingCurve()
        self._consolidation_interval = consolidation_interval
        self._conn: Optional[sqlite3.Connection] = None
        self._running = False
        self._task: Optional[asyncio.Task] = None
        
        self._initialize_db()
        
        if auto_start:
            # Can't start here because no event loop; user must call start()
            pass
    
    def _initialize_db(self) -> None:
        """Initialize the SQLite database."""
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                key TEXT PRIMARY KEY,
                content_json TEXT NOT NULL,
                created_at REAL NOT NULL,
                last_access_at REAL NOT NULL,
                access_count INTEGER DEFAULT 0,
                stability REAL DEFAULT 1.0,
                base_retention REAL DEFAULT 1.0,
                tier TEXT DEFAULT 'episodic',
                consolidated_at REAL,
                expired_at REAL
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier)
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_last_access ON memories(last_access_at)
        """)
        self._conn.commit()
    
    async def start(self) -> None:
        """Start the consolidation loop."""
        if self._running:
            return
        
        self._running = True
        self._task = asyncio.create_task(self._consolidation_loop())
        logger.info("Memory consolidator started")
    
    async def stop(self) -> None:
        """Stop the consolidation loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Memory consolidator stopped")
    
    async def _consolidation_loop(self) -> None:
        """Main consolidation loop."""
        while self._running:
            try:
                await self.consolidate_all()
            except Exception as e:
                logger.error(f"Consolidation error: {e}")
            
            await asyncio.sleep(self._consolidation_interval)
    
    async def add_memory(
        self,
        key: str,
        content: dict,
        tier: str = "episodic",
        stability: float = 1.0,
    ) -> MemoryEntry:
        """Add a new memory.
        
        Args:
            key: Unique key for the memory
            content: Memory content
            tier: Memory tier (working/episodic/semantic)
            stability: Initial stability
            
        Returns:
            Created memory entry
        """
        now = time.time()
        
        self._conn.execute(
            """
            INSERT OR REPLACE INTO memories (
                key, content_json, created_at, last_access_at,
                access_count, stability, base_retention, tier
            ) VALUES (?, ?, ?, ?, 0, ?, 1.0, ?)
            """,
            (key, json.dumps(content), now, now, stability, tier),
        )
        self._conn.commit()
        
        return MemoryEntry(
            key=key,
            content=content,
            created_at=now,
            last_access_at=now,
            stability=stability,
        )
    
    async def get_memory(self, key: str) -> Optional[MemoryEntry]:
        """Get a memory by key and record access.
        
        Args:
            key: Memory key
            
        Returns:
            Memory entry, or None if not found
        """
        cursor = self._conn.execute(
            """
            SELECT key, content_json, created_at, last_access_at,
                   access_count, stability, base_retention
            FROM memories
            WHERE key = ? AND expired_at IS NULL
            """,
            (key,),
        )
        
        row = cursor.fetchone()
        if row is None:
            return None
        
        entry = MemoryEntry(
            key=row[0],
            content=json.loads(row[1]),
            created_at=row[2],
            last_access_at=row[3],
            access_count=row[4],
            stability=row[5],
            base_retention=row[6],
        )
        
        # Record access (increases stability)
        entry = self._curve.consolidate(entry)
        
        # Update in database
        self._conn.execute(
            """
            UPDATE memories
            SET last_access_at = ?, access_count = ?, stability = ?, base_retention = ?
            WHERE key = ?
            """,
            (entry.last_access_at, entry.access_count, entry.stability, entry.base_retention, key),
        )
        self._conn.commit()
        
        return entry
    
    async def search_memories(
        self,
        query: str,
        tier: str | None = None,
        limit: int = 10,
    ) -> list[MemoryEntry]:
        """Search memories by content.
        
        Args:
            query: Search query
            tier: Filter by tier
            limit: Max results
            
        Returns:
            List of matching memory entries
        """
        if tier:
            cursor = self._conn.execute(
                """
                SELECT key, content_json, created_at, last_access_at,
                       access_count, stability, base_retention
                FROM memories
                WHERE tier = ? AND expired_at IS NULL AND content_json LIKE ?
                ORDER BY last_access_at DESC
                LIMIT ?
                """,
                (tier, f"%{query}%", limit),
            )
        else:
            cursor = self._conn.execute(
                """
                SELECT key, content_json, created_at, last_access_at,
                       access_count, stability, base_retention
                FROM memories
                WHERE expired_at IS NULL AND content_json LIKE ?
                ORDER BY last_access_at DESC
                LIMIT ?
                """,
                (f"%{query}%", limit),
            )
        
        entries = []
        for row in cursor.fetchall():
            entries.append(MemoryEntry(
                key=row[0],
                content=json.loads(row[1]),
                created_at=row[2],
                last_access_at=row[3],
                access_count=row[4],
                stability=row[5],
                base_retention=row[6],
            ))
        
        return entries
    
    async def consolidate_all(self) -> dict[str, int]:
        """Consolidate all memories.
        
        Returns:
            Statistics about consolidation
        """
        stats = {"consolidated": 0, "expired": 0, "promoted": 0}
        
        cursor = self._conn.execute(
            """
            SELECT key, content_json, created_at, last_access_at,
                   access_count, stability, base_retention, tier
            FROM memories
            WHERE expired_at IS NULL
            """,
        )
        
        for row in cursor.fetchall():
            entry = MemoryEntry(
                key=row[0],
                content=json.loads(row[1]),
                created_at=row[2],
                last_access_at=row[3],
                access_count=row[4],
                stability=row[5],
                base_retention=row[6],
            )
            tier = row[7]
            
            current_retention = entry.current_retention(self._curve)
            
            # Check if memory should be expired
            if current_retention < self._curve.min_retention_threshold:
                self._conn.execute(
                    "UPDATE memories SET expired_at = ? WHERE key = ?",
                    (time.time(), entry.key),
                )
                stats["expired"] += 1
            
            # Check if memory should be consolidated
            elif self._curve.should_consolidate(entry):
                # Increase stability
                entry.stability *= self._curve.stability_growth_factor
                self._conn.execute(
                    """
                    UPDATE memories
                    SET stability = ?, consolidated_at = ?
                    WHERE key = ?
                    """,
                    (entry.stability, time.time(), entry.key),
                )
                stats["consolidated"] += 1
            
            # Check if memory should be promoted
            if entry.access_count >= 10 and tier == "episodic":
                self._conn.execute(
                    "UPDATE memories SET tier = 'semantic' WHERE key = ?",
                    (entry.key,),
                )
                stats["promoted"] += 1
        
        self._conn.commit()
        return stats
    
    async def get_memory_stats(self) -> dict[str, Any]:
        """Get memory statistics.
        
        Returns:
            Statistics dictionary
        """
        cursor = self._conn.execute(
            """
            SELECT 
                tier,
                COUNT(*) as count,
                AVG(stability) as avg_stability,
                AVG(access_count) as avg_access_count
            FROM memories
            WHERE expired_at IS NULL
            GROUP BY tier
            """,
        )
        
        stats = {}
        for row in cursor.fetchall():
            stats[row[0]] = {
                "count": row[1],
                "avg_stability": row[2],
                "avg_access_count": row[3],
            }
        
        # Get total counts
        cursor = self._conn.execute(
            "SELECT COUNT(*) FROM memories WHERE expired_at IS NULL"
        )
        stats["total_active"] = cursor.fetchone()[0]
        
        cursor = self._conn.execute(
            "SELECT COUNT(*) FROM memories WHERE expired_at IS NOT NULL"
        )
        stats["total_expired"] = cursor.fetchone()[0]
        
        return stats
    
    async def cleanup_expired(self, older_than_hours: float = 24) -> int:
        """Remove expired memories older than specified time.
        
        Args:
            older_than_hours: Remove expired memories older than this
            
        Returns:
            Number of memories removed
        """
        cutoff = time.time() - (older_than_hours * 3600)
        
        cursor = self._conn.execute(
            "DELETE FROM memories WHERE expired_at IS NOT NULL AND expired_at < ?",
            (cutoff,),
        )
        self._conn.commit()
        
        return cursor.rowcount
    
    def close(self) -> None:
        """Close the consolidator."""
        if self._conn:
            self._conn.close()
