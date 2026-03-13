"""
偏好记忆系统

基于「标签+置信度+衰减」的偏好学习系统

特性:
- 纯 SQLite 实现，零额外依赖
- 贝叶斯式置信度更新
- 时间衰减机制
- 支持多员工独立学习
"""

import sqlite3
import json
import time
import math
from typing import List, Dict, Optional
from datetime import datetime


class PreferenceMemory:
    """
    偏好记忆系统
    
    核心创新点：基于「标签+置信度+衰减」的偏好学习系统
    
    存储结构:
    - agent: 哪个员工学到的偏好
    - category: 偏好类别（如「视频节奏」）
    - value: 偏好值（如「快节奏」）
    - confidence: 置信度 0-1
    - evidence: 来源证据（原始评语）
    - decay_rate: 衰减率
    - updated_at: 更新时间
    """
    
    def __init__(self, db_path: str = "data/soloflow.db"):
        """初始化偏好记忆系统
        
        Args:
            db_path: SQLite 数据库路径
        """
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()
    
    def _init_db(self):
        """初始化数据库"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent TEXT NOT NULL,
                category TEXT NOT NULL,
                value TEXT NOT NULL,
                confidence REAL DEFAULT 0.5,
                evidence TEXT,
                decay_rate REAL DEFAULT 0.01,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                UNIQUE(agent, category, value)
            )
        """)
        
        # 创建索引
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_pref_agent ON preferences(agent)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_pref_category ON preferences(category)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_pref_confidence ON preferences(confidence)")
        self.conn.commit()
    
    def update(self, 
               agent: str, 
               category: str, 
               value: str,
               evidence: str, 
               delta: float = 0.1,
               decay_rate: float = 0.01):
        """更新偏好（贝叶斯式置信度更新）
        
        Args:
            agent: 员工名称
            category: 偏好类别
            value: 偏好值
            evidence: 来源证据（老板的评语）
            delta: 置信度增量（正向+delta，负向-delta）
            decay_rate: 衰减率
        """
        now = time.time()
        
        row = self.conn.execute(
            "SELECT id, confidence FROM preferences WHERE agent=? AND category=? AND value=?",
            (agent, category, value)
        ).fetchone()
        
        if row:
            # 已存在，更新置信度
            pref_id, old_conf = row
            new_conf = min(1.0, max(0.0, old_conf + delta))
            
            self.conn.execute(
                """UPDATE preferences 
                   SET confidence=?, evidence=?, decay_rate=?, updated_at=? 
                   WHERE id=?""",
                (new_conf, evidence, decay_rate, now, pref_id)
            )
        else:
            # 新偏好，插入
            initial_conf = 0.5 + delta
            self.conn.execute(
                """INSERT INTO preferences 
                   (agent, category, value, confidence, evidence, decay_rate, created_at, updated_at) 
                   VALUES (?,?,?,?,?,?,?,?)""",
                (agent, category, value, initial_conf, evidence, decay_rate, now, now)
            )
        
        self.conn.commit()
    
    def recall(self, agent: str, top_k: int = 5, min_confidence: float = 0.3) -> List[Dict]:
        """回忆偏好（应用时间衰减）
        
        Args:
            agent: 员工名称
            top_k: 返回前 K 个
            min_confidence: 最小置信度阈值
            
        Returns:
            List[Dict]: 偏好列表
        """
        now = time.time()
        
        rows = self.conn.execute(
            """SELECT category, value, confidence, evidence, decay_rate, updated_at
               FROM preferences 
               WHERE agent=? 
               ORDER BY confidence DESC 
               LIMIT ?""",
            (agent, top_k * 2)  # 多取一些，因为会过滤
        ).fetchall()
        
        preferences = []
        for r in rows:
            category, value, confidence, evidence, decay_rate, updated_at = r
            
            # 应用时间衰减
            age_hours = (now - updated_at) / 3600
            decayed_conf = confidence * math.exp(-decay_rate * age_hours)
            
            # 过滤低置信度
            if decayed_conf >= min_confidence:
                preferences.append({
                    "category": category,
                    "value": value,
                    "confidence": round(decayed_conf, 2),
                    "original_confidence": confidence,
                    "evidence": evidence,
                    "age_hours": round(age_hours, 1),
                })
        
        # 按衰减后的置信度排序
        preferences.sort(key=lambda x: x["confidence"], reverse=True)
        
        return preferences[:top_k]
    
    def format_for_prompt(self, agent: str) -> str:
        """格式化偏好为可注入 prompt 的文本
        
        Args:
            agent: 员工名称
            
        Returns:
            str: 格式化的偏好文本
        """
        prefs = self.recall(agent)
        
        if not prefs:
            return "暂无偏好记录"
        
        lines = ["【老板偏好记忆 - 请在工作中自动应用】"]
        for p in prefs:
            lines.append(
                f"- {p['category']}：{p['value']} "
                f"(置信度 {p['confidence']*100:.0f}%)"
            )
        
        return "\n".join(lines)
    
    def get_all_preferences(self, agent: str = None) -> List[Dict]:
        """获取所有偏好（管理用）
        
        Args:
            agent: 员工名称（None = 所有员工）
            
        Returns:
            List[Dict]: 偏好列表
        """
        if agent:
            rows = self.conn.execute(
                """SELECT agent, category, value, confidence, evidence, updated_at
                   FROM preferences WHERE agent=? ORDER BY confidence DESC""",
                (agent,)
            ).fetchall()
        else:
            rows = self.conn.execute(
                """SELECT agent, category, value, confidence, evidence, updated_at
                   FROM preferences ORDER BY agent, confidence DESC"""
            ).fetchall()
        
        return [
            {
                "agent": r[0],
                "category": r[1],
                "value": r[2],
                "confidence": r[3],
                "evidence": r[4],
                "updated_at": datetime.fromtimestamp(r[5]).isoformat(),
            }
            for r in rows
        ]
    
    def delete_preference(self, agent: str, category: str, value: str):
        """删除偏好
        
        Args:
            agent: 员工名称
            category: 偏好类别
            value: 偏好值
        """
        self.conn.execute(
            "DELETE FROM preferences WHERE agent=? AND category=? AND value=?",
            (agent, category, value)
        )
        self.conn.commit()
    
    def manual_update(self, 
                      agent: str, 
                      category: str, 
                      value: str,
                      confidence: float,
                      evidence: str = "手动设置"):
        """手动设置偏好（管理用）
        
        Args:
            agent: 员工名称
            category: 偏好类别
            value: 偏好值
            confidence: 置信度
            evidence: 来源证据
        """
        now = time.time()
        
        # 检查是否已存在
        row = self.conn.execute(
            "SELECT id FROM preferences WHERE agent=? AND category=? AND value=?",
            (agent, category, value)
        ).fetchone()
        
        if row:
            # 更新
            self.conn.execute(
                """UPDATE preferences 
                   SET confidence=?, evidence=?, updated_at=? 
                   WHERE id=?""",
                (confidence, evidence, now, row[0])
            )
        else:
            # 插入
            self.conn.execute(
                """INSERT INTO preferences 
                   (agent, category, value, confidence, evidence, decay_rate, created_at, updated_at) 
                   VALUES (?,?,?,?,?,?,?,?)""",
                (agent, category, value, confidence, evidence, 0.01, now, now)
            )
        
        self.conn.commit()
    
    def stats(self) -> Dict:
        """获取偏好统计
        
        Returns:
            Dict: 统计信息
        """
        # 总数
        total = self.conn.execute("SELECT COUNT(*) FROM preferences").fetchone()[0]
        
        # 按员工统计
        by_agent = self.conn.execute(
            "SELECT agent, COUNT(*) FROM preferences GROUP BY agent"
        ).fetchall()
        
        # 平均置信度
        avg_conf = self.conn.execute(
            "SELECT AVG(confidence) FROM preferences"
        ).fetchone()[0] or 0.0
        
        return {
            "total": total,
            "by_agent": dict(by_agent),
            "avg_confidence": round(avg_conf, 2),
        }
