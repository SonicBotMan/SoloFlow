"""
任务间上下文总线

解决多 Agent 顺序执行时，后一个 Agent 拿不到前一个输出的问题。

工作模式：
1. 上游任务完成后，publish 结果到 ContextBus
2. 下游任务启动时，从 ContextBus 获取上游结果
3. 将上下文注入到 system prompt

全部存 SQLite，支持跨进程。
"""

from typing import Any, Dict, Optional
import json
import sqlite3
import time


class ContextBus:
    """
    任务间上下文总线。
    
    每个任务完成后，可以 publish 键值对；
    下游任务可以 subscribe 特定 key 获取数据。
    
    全部存 SQLite，支持跨进程。
    
    使用示例：
    ```python
    bus = ContextBus("data/soloflow.db")
    
    # 上游任务发布
    bus.publish(flow_id, "script_result", script_content)
    
    # 下游任务获取
    ctx = bus.get_all(flow_id)
    
    # 格式化为 prompt
    prompt = bus.build_context_prompt(flow_id)
    ```
    """
    
    def __init__(self, db_path: str = "data/soloflow.db"):
        """
        初始化 ContextBus
        
        Args:
            db_path: SQLite 数据库路径
        """
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()
    
    def _init_db(self):
        """初始化数据库表"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS context_bus (
                flow_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                task_id TEXT,
                created_at REAL,
                PRIMARY KEY (flow_id, key)
            )
        """)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_context_flow
            ON context_bus(flow_id)
        """)
        self.conn.commit()
    
    def publish(
        self,
        flow_id: str,
        key: str,
        value: Any,
        task_id: str = None
    ):
        """
        任务完成后发布结果到上下文
        
        Args:
            flow_id: Flow ID（一次完整对话的唯一标识）
            key: 数据键名（如 "script_result"）
            value: 数据值（任意 JSON 可序列化对象）
            task_id: 关联的任务 ID（可选）
        """
        self.conn.execute(
            """
            INSERT OR REPLACE INTO context_bus 
            VALUES (?,?,?,?,?)
            """,
            (flow_id, key, json.dumps(value, ensure_ascii=False), task_id, time.time())
        )
        self.conn.commit()
    
    def get(
        self,
        flow_id: str,
        key: str,
        default: Any = None
    ) -> Any:
        """
        获取上下文数据
        
        Args:
            flow_id: Flow ID
            key: 数据键名
            default: 默认值
            
        Returns:
            Any: 数据值
        """
        row = self.conn.execute(
            "SELECT value FROM context_bus WHERE flow_id=? AND key=?",
            (flow_id, key)
        ).fetchone()
        
        if row:
            try:
                return json.loads(row[0])
            except json.JSONDecodeError:
                return row[0]
        return default
    
    def get_all(self, flow_id: str) -> Dict[str, Any]:
        """
        获取 flow 的全部上下文
        
        Args:
            flow_id: Flow ID
            
        Returns:
            Dict[str, Any]: 全部上下文数据
        """
        rows = self.conn.execute(
            "SELECT key, value FROM context_bus WHERE flow_id=?",
            (flow_id,)
        ).fetchall()
        
        result = {}
        for r in rows:
            try:
                result[r[0]] = json.loads(r[1])
            except json.JSONDecodeError:
                result[r[0]] = r[1]
        
        return result
    
    def build_context_prompt(self, flow_id: str, max_length: int = 300) -> str:
        """
        格式化为可注入 prompt 的文本
        
        Args:
            flow_id: Flow ID
            max_length: 单个值最大显示长度
            
        Returns:
            str: 格式化的上下文文本
        """
        ctx = self.get_all(flow_id)
        
        if not ctx:
            return ""
        
        lines = ["\n【上游任务结果 - 请参考使用】"]
        
        for k, v in ctx.items():
            v_str = str(v)
            if len(v_str) > max_length:
                preview = v_str[:max_length] + "..."
            else:
                preview = v_str
            
            lines.append(f"- {k}: {preview}")
        
        return "\n".join(lines)
    
    def clear(self, flow_id: str):
        """
        清除 flow 的上下文
        
        Args:
            flow_id: Flow ID
        """
        self.conn.execute(
            "DELETE FROM context_bus WHERE flow_id=?",
            (flow_id,)
        )
        self.conn.commit()
    
    def list_flows(self, limit: int = 100) -> list:
        """
        列出所有 flow_id
        
        Args:
            limit: 最大返回数量
            
        Returns:
            list: flow_id 列表
        """
        rows = self.conn.execute(
            """
            SELECT DISTINCT flow_id, MAX(created_at) as latest
            FROM context_bus
            GROUP BY flow_id
            ORDER BY latest DESC
            LIMIT ?
            """,
            (limit,)
        ).fetchall()
        
        return [r[0] for r in rows]
    
    def stats(self) -> Dict[str, int]:
        """
        统计信息
        
        Returns:
            Dict[str, int]: 统计数据
        """
        total = self.conn.execute(
            "SELECT COUNT(*) FROM context_bus"
        ).fetchone()[0]
        
        flows = self.conn.execute(
            "SELECT COUNT(DISTINCT flow_id) FROM context_bus"
        ).fetchone()[0]
        
        return {
            "total_entries": total,
            "total_flows": flows
        }
