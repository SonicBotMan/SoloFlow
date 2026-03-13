"""
任务状态机核心 - TaskFSM

基于 SQLite 的轻量任务状态管理，支持:
- 任务创建、查询、状态转移
- 子任务支持
- 完整的状态转移日志
- 并发安全
"""

from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any
import uuid
import time
import json
import sqlite3
from pathlib import Path
from datetime import datetime


class TaskStatus(Enum):
    """任务状态枚举"""
    PENDING = "pending"              # 等待分配
    ASSIGNED = "assigned"            # 已分配给Agent
    RUNNING = "running"              # 执行中
    WAITING_HUMAN = "waiting_human"  # 需要人工确认
    DONE = "done"                    # 已完成
    FAILED = "failed"                # 失败


@dataclass
class Task:
    """任务数据类"""
    id: str = field(default_factory=lambda: f"task_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}")
    title: str = ""
    description: str = ""
    agent: str = ""  # 分配给哪个 agent
    parent_id: Optional[str] = None  # 支持子任务
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "agent": self.agent,
            "parent_id": self.parent_id,
            "status": self.status.value,
            "result": self.result,
            "context": self.context,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "created_at_str": datetime.fromtimestamp(self.created_at).isoformat(),
            "updated_at_str": datetime.fromtimestamp(self.updated_at).isoformat(),
        }


class TaskFSM:
    """
    轻量任务状态机
    
    存储在 SQLite，无需 PostgreSQL
    
    状态转移规则:
    - PENDING → ASSIGNED, FAILED
    - ASSIGNED → RUNNING, FAILED
    - RUNNING → WAITING_HUMAN, DONE, FAILED
    - WAITING_HUMAN → RUNNING, FAILED
    - DONE → (终态)
    - FAILED → PENDING (支持重试)
    """
    
    TRANSITIONS = {
        TaskStatus.PENDING:       [TaskStatus.ASSIGNED, TaskStatus.FAILED],
        TaskStatus.ASSIGNED:      [TaskStatus.RUNNING, TaskStatus.FAILED],
        TaskStatus.RUNNING:       [TaskStatus.WAITING_HUMAN, TaskStatus.DONE, TaskStatus.FAILED],
        TaskStatus.WAITING_HUMAN: [TaskStatus.RUNNING, TaskStatus.FAILED],
        TaskStatus.DONE:          [],
        TaskStatus.FAILED:        [TaskStatus.PENDING],  # 支持重试
    }
    
    def __init__(self, db_path: str = "data/soloflow.db"):
        """初始化状态机
        
        Args:
            db_path: SQLite 数据库路径
        """
        # 确保目录存在
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()
        
        # 转移日志表
        self._init_transition_log()
    
    def _init_db(self):
        """初始化数据库表"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                agent TEXT,
                parent_id TEXT,
                status TEXT NOT NULL,
                result TEXT,
                context TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        
        # 创建索引
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_status ON tasks(status)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_agent ON tasks(agent)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_parent ON tasks(parent_id)")
        self.conn.commit()
    
    def _init_transition_log(self):
        """初始化转移日志表"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS transition_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                from_status TEXT,
                to_status TEXT NOT NULL,
                timestamp REAL NOT NULL,
                result TEXT,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        """)
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_task_log ON transition_log(task_id)")
        self.conn.commit()
    
    def create(self, 
               title: str, 
               description: str = "",
               agent: str = "",
               parent_id: str = None, 
               context: dict = None) -> Task:
        """创建新任务
        
        Args:
            title: 任务标题
            description: 任务描述
            agent: 分配的Agent
            parent_id: 父任务ID
            context: 上下文数据
            
        Returns:
            Task: 创建的任务对象
        """
        task = Task(
            title=title, 
            description=description,
            agent=agent, 
            parent_id=parent_id,
            context=context or {}
        )
        
        self.conn.execute(
            "INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?)",
            (task.id, task.title, task.description, task.agent,
             task.parent_id, task.status.value, task.result,
             json.dumps(task.context), task.created_at, task.updated_at)
        )
        
        # 记录日志
        self._log_transition(task.id, None, task.status, None)
        
        self.conn.commit()
        return task
    
    def transition(self, 
                   task_id: str, 
                   new_status: TaskStatus,
                   result: str = None) -> Task:
        """状态转移
        
        Args:
            task_id: 任务ID
            new_status: 新状态
            result: 执行结果
            
        Returns:
            Task: 更新后的任务
            
        Raises:
            ValueError: 状态转移不合法
            KeyError: 任务不存在
        """
        task = self.get(task_id)
        allowed = self.TRANSITIONS[task.status]
        
        if new_status not in allowed:
            raise ValueError(
                f"Invalid transition: {task.status.value} → {new_status.value}\n"
                f"Allowed: {[s.value for s in allowed]}"
            )
        
        old_status = task.status
        task.status = new_status
        task.result = result
        task.updated_at = time.time()
        
        self.conn.execute(
            "UPDATE tasks SET status=?, result=?, updated_at=? WHERE id=?",
            (new_status.value, result, task.updated_at, task_id)
        )
        
        # 记录日志
        self._log_transition(task_id, old_status, new_status, result)
        
        self.conn.commit()
        return task
    
    def get(self, task_id: str) -> Task:
        """获取任务
        
        Args:
            task_id: 任务ID
            
        Returns:
            Task: 任务对象
            
        Raises:
            KeyError: 任务不存在
        """
        row = self.conn.execute(
            "SELECT * FROM tasks WHERE id=?", (task_id,)
        ).fetchone()
        
        if not row:
            raise KeyError(f"Task {task_id} not found")
        
        return Task(
            id=row[0],
            title=row[1],
            description=row[2],
            agent=row[3],
            parent_id=row[4],
            status=TaskStatus(row[5]),
            result=row[6],
            context=json.loads(row[7] or "{}"),
            created_at=row[8],
            updated_at=row[9]
        )
    
    def list_pending(self, agent: str = None) -> List[Task]:
        """列出待处理任务
        
        Args:
            agent: 筛选特定Agent
            
        Returns:
            List[Task]: 任务列表
        """
        if agent:
            rows = self.conn.execute(
                "SELECT * FROM tasks WHERE status='pending' AND agent=? ORDER BY created_at",
                (agent,)
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM tasks WHERE status='pending' ORDER BY created_at"
            ).fetchall()
        
        return [self.get(r[0]) for r in rows]
    
    def list_by_status(self, status: TaskStatus) -> List[Task]:
        """按状态列出任务
        
        Args:
            status: 任务状态
            
        Returns:
            List[Task]: 任务列表
        """
        rows = self.conn.execute(
            "SELECT * FROM tasks WHERE status=? ORDER BY updated_at DESC",
            (status.value,)
        ).fetchall()
        
        return [self.get(r[0]) for r in rows]
    
    def get_children(self, parent_id: str) -> List[Task]:
        """获取子任务
        
        Args:
            parent_id: 父任务ID
            
        Returns:
            List[Task]: 子任务列表
        """
        rows = self.conn.execute(
            "SELECT * FROM tasks WHERE parent_id=? ORDER BY created_at",
            (parent_id,)
        ).fetchall()
        
        return [self.get(r[0]) for r in rows]
    
    def get_history(self, task_id: str) -> List[Dict]:
        """获取任务转移历史
        
        Args:
            task_id: 任务ID
            
        Returns:
            List[Dict]: 转移历史
        """
        rows = self.conn.execute(
            """SELECT task_id, from_status, to_status, timestamp, result
               FROM transition_log 
               WHERE task_id=? 
               ORDER BY timestamp""",
            (task_id,)
        ).fetchall()
        
        return [
            {
                "task_id": r[0],
                "from_status": r[1],
                "to_status": r[2],
                "timestamp": r[3],
                "result": r[4],
                "timestamp_str": datetime.fromtimestamp(r[3]).isoformat()
            }
            for r in rows
        ]
    
    def _log_transition(self, 
                        task_id: str, 
                        from_status: Optional[TaskStatus],
                        to_status: TaskStatus,
                        result: Optional[str]):
        """记录状态转移日志"""
        self.conn.execute(
            """INSERT INTO transition_log 
               (task_id, from_status, to_status, timestamp, result) 
               VALUES (?,?,?,?,?)""",
            (task_id, 
             from_status.value if from_status else None,
             to_status.value, 
             time.time(),
             result)
        )
    
    def stats(self) -> Dict[str, int]:
        """获取任务统计
        
        Returns:
            Dict: 各状态的任务数量
        """
        rows = self.conn.execute(
            "SELECT status, COUNT(*) FROM tasks GROUP BY status"
        ).fetchall()
        
        return {row[0]: row[1] for row in rows}
    
    def close(self):
        """关闭数据库连接"""
        self.conn.close()
