"""
SoloFlow 主运行器

核心流程:
1. 用户输入 → 小助理解意图
2. 小助拆解任务并分配
3. 各 Agent 执行任务
4. 小助汇总结果并向老板汇报
"""

import asyncio
import json
from typing import Dict, List, Optional
from openai import AsyncOpenAI
from pathlib import Path

from .fsm import TaskFSM, TaskStatus, Task
from .agent_loader import AgentLoader, AgentConfig
from .memory import PreferenceMemory


class SoloFlowRunner:
    """SoloFlow 主运行器"""
    
    def __init__(self, 
                 db_path: str = "data/soloflow.db",
                 agents_dir: str = "soloflow/agents",
                 api_key: str = None,
                 base_url: str = None):
        """初始化运行器
        
        Args:
            db_path: 数据库路径
            agents_dir: Agent 配置目录
            api_key: OpenAI API Key（可选，从环境变量读取）
            base_url: API Base URL（可选）
        """
        self.fsm = TaskFSM(db_path)
        self.loader = AgentLoader(agents_dir)
        self.memory = PreferenceMemory(db_path)
        
        # OpenAI 客户端
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
    
    async def dispatch(self, user_input: str, user_id: str = "boss") -> str:
        """主入口：用户输入 → 小助拆解 → 分配任务 → 汇报结果
        
        Args:
            user_input: 用户输入
            user_id: 用户ID
            
        Returns:
            str: 执行结果
        """
        # 1. 获取小助配置
        assistant_cfg = self.loader.get("assistant")
        
        # 2. 注入偏好记忆
        preference_context = self.memory.format_for_prompt("assistant")
        
        # 3. 构建消息
        messages = [
            {"role": "system", "content": assistant_cfg.system_prompt},
            {"role": "system", "content": f"\n【老板偏好记忆】\n{preference_context}"},
            {"role": "user", "content": user_input},
        ]
        
        # 4. 让小助理解意图并生成任务计划
        plan_messages = messages + [
            {"role": "system", "content": """请以 JSON 格式返回任务计划：
{
  "understanding": "对老板需求的理解",
  "tasks": [
    {
      "agent": "idea/writer/editor/publisher",
      "title": "任务标题",
      "description": "详细描述"
    }
  ],
  "need_confirm": false
}

如果需要老板确认，设置 need_confirm: true"""}
        ]
        
        try:
            plan_resp = await self.client.chat.completions.create(
                model=assistant_cfg.model,
                messages=plan_messages,
                response_format={"type": "json_object"},
                temperature=assistant_cfg.temperature
            )
            
            plan_text = plan_resp.choices[0].message.content
            plan = json.loads(plan_text)
            
        except Exception as e:
            return f"❌ 小助理解失败: {e}"
        
        # 5. 检查是否需要确认
        if plan.get("need_confirm", False):
            return f"【小助】{plan.get('understanding', '')}\n\n⚠️ 需要老板确认，请回复「确认」继续"
        
        # 6. 创建并执行任务
        tasks_data = plan.get("tasks", [])
        if not tasks_data:
            return f"【小助】{plan.get('understanding', '')}\n\n暂无需要执行的任务"
        
        results = []
        for t in tasks_data:
            try:
                # 创建任务
                task = self.fsm.create(
                    title=t.get("title", ""),
                    description=t.get("description", ""),
                    agent=t.get("agent", "assistant")
                )
                
                # 执行任务
                result = await self.run_task(task.id)
                
                agent_cfg = self.loader.get(t.get("agent", "assistant"))
                results.append(f"【{agent_cfg.alias}】\n{result}")
                
            except Exception as e:
                results.append(f"❌ 任务执行失败: {e}")
        
        # 7. 汇总结果
        summary = "\n\n".join(results)
        
        return f"【小助】{plan.get('understanding', '')}\n\n{summary}"
    
    async def run_task(self, task_id: str) -> str:
        """执行单个任务
        
        Args:
            task_id: 任务ID
            
        Returns:
            str: 执行结果
        """
        task = self.fsm.get(task_id)
        agent_cfg = self.loader.get(task.agent)
        
        # 动态注入偏好记忆到 system prompt
        preference_context = self.memory.format_for_prompt(task.agent)
        
        system_prompt = agent_cfg.system_prompt
        if preference_context != "暂无偏好记录":
            system_prompt += f"\n\n【老板偏好记忆 - 请在工作中自动应用】\n{preference_context}"
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"任务: {task.title}\n\n{task.description}"}
        ]
        
        # 更新状态为 RUNNING
        self.fsm.transition(task_id, TaskStatus.RUNNING)
        
        try:
            response = await self.client.chat.completions.create(
                model=agent_cfg.model,
                messages=messages,
                temperature=agent_cfg.temperature,
                max_tokens=agent_cfg.max_tokens
            )
            
            result = response.choices[0].message.content
            
            # 检查是否需要人工确认
            if "[需要确认]" in result or "[WAIT_HUMAN]" in result:
                self.fsm.transition(task_id, TaskStatus.WAITING_HUMAN, result)
            else:
                self.fsm.transition(task_id, TaskStatus.DONE, result)
            
            return result
            
        except Exception as e:
            error_msg = f"执行失败: {e}"
            self.fsm.transition(task_id, TaskStatus.FAILED, error_msg)
            return error_msg
    
    async def provide_feedback(self, 
                               task_id: str, 
                               feedback: str,
                               extract_preferences: bool = True):
        """提供反馈（提取偏好）
        
        Args:
            task_id: 任务ID
            feedback: 反馈内容
            extract_preferences: 是否提取偏好
        """
        task = self.fsm.get(task_id)
        
        if extract_preferences:
            # 让小助提取偏好
            assistant_cfg = self.loader.get("assistant")
            
            messages = [
                {"role": "system", "content": "你是一个偏好提取助手。从老板的反馈中提取偏好标签。"},
                {"role": "user", "content": f"""老板的反馈：{feedback}

请提取偏好，以 JSON 格式返回：
{{
  "preferences": [
    {{
      "category": "偏好类别",
      "value": "偏好值",
      "delta": 0.1
    }}
  ]
}}

如果反馈是正向的，delta 为正数；如果是负向的，delta 为负数。"""},
            ]
            
            try:
                response = await self.client.chat.completions.create(
                    model=assistant_cfg.model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.3
                )
                
                pref_data = json.loads(response.choices[0].message.content)
                
                for pref in pref_data.get("preferences", []):
                    self.memory.update(
                        agent=task.agent,
                        category=pref.get("category", ""),
                        value=pref.get("value", ""),
                        evidence=feedback,
                        delta=pref.get("delta", 0.1)
                    )
                
            except Exception as e:
                print(f"⚠️ 偏好提取失败: {e}")
        
        # 如果任务在等待人工确认，继续执行
        if task.status == TaskStatus.WAITING_HUMAN:
            self.fsm.transition(task_id, TaskStatus.DONE, f"老板确认: {feedback}")
    
    def get_status(self) -> Dict:
        """获取系统状态
        
        Returns:
            Dict: 系统状态
        """
        return {
            "tasks": self.fsm.stats(),
            "agents": len(self.loader.all()),
            "preferences": self.memory.stats(),
        }
    
    def close(self):
        """关闭运行器"""
        self.fsm.close()
