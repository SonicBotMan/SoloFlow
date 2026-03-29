"""
FlowEngine - 通用 Flow 执行引擎（v2.0 重构版）

核心改动：
1. 不再硬编码任何领域知识
2. 通过 ContextBus 实现任务间数据传递
3. 通过 Driver 层支持任意 Agent 运行时
4. 支持 flow_id 追踪一次完整对话的所有任务

与 SoloFlowRunner 的关系：
- FlowEngine 是 v2.0 新架构
- SoloFlowRunner 是 v1.0 版本（保持兼容）
"""

import asyncio
import json
import logging
import os
from typing import Dict, List, Optional
from openai import AsyncOpenAI

from .fsm import TaskFSM, TaskStatus
from .agent_loader import AgentLoader, AgentConfig
from .memory import PreferenceMemory
from .context_bus import ContextBus
from .drivers import create_driver, BaseDriver

logger = logging.getLogger("soloflow.flow_engine")


class SoloFlowEngine:
    """SoloFlow 核心引擎
    
    特性：
    - DAG 依赖调度：按 depends_on 字段拓扑排序，同层并行
    - 自动重试：任务失败自动重试（默认2次）
    - 偏好记忆：贝叶斯置信度 + 时间衰减
    - 多 Driver：LLM / MCP / OpenClaw / Skill
    """


class FlowEngine:
    """
    通用 Flow 执行引擎。
    
    核心改动：
    1. 不再硬编码任何领域知识
    2. 通过 ContextBus 实现任务间数据传递
    3. 通过 Driver 层支持任意 Agent 运行时
    4. 支持 flow_id 追踪一次完整对话的所有任务
    """
    
    def __init__(self, 
                 db_path: str = "data/soloflow.db",
                 agents_dir: str = "soloflow/agents",
                 env: dict = None):
        """初始化 FlowEngine
        
        Args:
            db_path: 数据库路径
            agents_dir: Agent 配置目录
            env: 环境变量（用于替换 YAML 中的 ${VAR}）
        """
        self.fsm = TaskFSM(db_path)
        self.loader = AgentLoader(agents_dir)
        self.memory = PreferenceMemory(db_path)
        self.context_bus = ContextBus(db_path)
        self.env = env or dict(os.environ)
        
        # Driver 实例缓存
        self._drivers: Dict[str, BaseDriver] = {}
        
        # OpenAI 客户端（用于 assistant 的规划）
        self.client = AsyncOpenAI()
    
    def _get_driver(self, agent_name: str) -> BaseDriver:
        """获取或创建 Agent 对应的 Driver（懒加载 + 缓存）"""
        if agent_name in self._drivers:
            return self._drivers[agent_name]
        
        cfg = self.loader.get(agent_name)
        driver_type = cfg.driver  # 从 YAML 读取（默认 "llm"）
        driver_cfg = cfg.driver_config or {}
        
        # 替换环境变量占位符
        resolved = {}
        for k, v in driver_cfg.items():
            if isinstance(v, str) and v.startswith("${") and v.endswith("}"):
                var_name = v[2:-1]
                resolved[k] = self.env.get(var_name, v)
            else:
                resolved[k] = v
        
        # 创建 Driver
        driver = create_driver(driver_type, **resolved)
        self._drivers[agent_name] = driver
        
        return driver
    
    async def dispatch(self, user_input: str, flow_id: str = None) -> dict:
        """
        主入口：纯通用逻辑，不含视频/创作领域知识。
        
        Args:
            user_input: 用户输入
            flow_id: Flow ID（可选）
            
        Returns:
            dict: {
                flow_id,
                understanding,
                tasks: [{id, agent, alias, result}],
                summary
            }
        """
        import uuid
        flow_id = flow_id or str(uuid.uuid4())[:8]
        
        # Step 1: 让 assistant 做通用的任务拆解
        assistant_cfg = self.loader.get("assistant")
        # 优先使用环境变量 MODEL，其次用 assistant 配置，最后默认 glm-4-flash
        assistant_model = self.env.get("MODEL") or assistant_cfg.model or "glm-4-flash"
        pref_ctx = self.memory.format_for_prompt("assistant")
        
        # 动态构建 agent 列表，不硬编码
        available_agents = [
            {"name": cfg.name, "alias": cfg.alias, "role": cfg.role}
            for cfg in self.loader.all().values()
            if cfg.name != "assistant"
        ]
        
        agent_list_str = "\n".join(
            f"- {a['name']}（{a['alias']}）: {a['role']}"
            for a in available_agents
        )
        
        plan_prompt = f"""你是{assistant_cfg.alias}，老板的专属助理。

当前可用的AI员工：
{agent_list_str}

老板偏好记忆：
{pref_ctx}

请分析老板需求，拆解为子任务并分配给合适的员工。

以 JSON 返回：
{{
  "understanding": "理解老板的需求",
  "need_confirm": false,
  "tasks": [
    {{
      "agent": "员工name",
      "title": "任务标题",
      "description": "详细说明",
      "publish_as": "result_key"
    }}
  ]
}}

如果需要老板确认，设置 need_confirm: true"""
        
        # 调用 assistant
        messages = [
            {"role": "system", "content": plan_prompt},
            {"role": "user", "content": user_input}
        ]
        
        try:
            plan_resp = await self.client.chat.completions.create(
                model=assistant_model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=assistant_cfg.temperature
            )
            
            plan = json.loads(plan_resp.choices[0].message.content)
            
        except Exception as e:
            return {
                "flow_id": flow_id,
                "error": f"规划失败: {e}",
                "raw": None
            }
        
        # 检查是否需要确认
        if plan.get("need_confirm"):
            return {
                "flow_id": flow_id,
                "need_confirm": True,
                "understanding": plan.get("understanding")
            }
        
        # Step 2: 按依赖关系分层并行执行（DAG 调度）
        task_plan = plan.get("tasks", [])
        
        # 收集所有任务 ID
        task_map = {}  # task_id -> plan info
        for t in task_plan:
            task = self.fsm.create(
                title=t["title"],
                description=t["description"],
                agent=t["agent"],
                context={"flow_id": flow_id}
            )
            task_map[task.id] = {
                "task_obj": task,
                "plan_info": t,
                "depends_on": t.get("depends_on", [])
            }
        
        # DAG 拓扑排序 + 分层并行
        completed = set()
        remaining = dict(task_map)
        
        async def _run_task(task_id, info):
            """执行单个任务并收集结果"""
            t = info["plan_info"]
            result = await self.run_task(task_id, flow_id)
            publish_key = t.get("publish_as") or t["agent"]
            self.context_bus.publish(flow_id, publish_key, result, task_id)
            alias = self.loader.get(t["agent"]).alias
            return {
                "id": task_id,
                "agent": t["agent"],
                "alias": alias,
                "result": result
            }
        
        task_results = []
        while remaining:
            # 找出所有依赖已完成的任务
            ready = [
                tid for tid, info in remaining.items()
                if all(d in completed for d in info["depends_on"])
            ]
            
            if not ready:
                # 死锁检测
                logger.warning(f"Deadlock detected! Remaining tasks: {list(remaining.keys())}")
                break
            
            # 并行执行本批次
            logger.info(f"Executing batch of {len(ready)} tasks: {ready}")
            results = await asyncio.gather(*[_run_task(tid, remaining[tid]) for tid in ready])
            task_results.extend(results)
            
            for r in results:
                completed.add(r["id"])
                remaining.pop(r["id"])
        
        return {
            "flow_id": flow_id,
            "understanding": plan.get("understanding"),
            "tasks": task_results
        }
    
    async def run_task(self, task_id: str, flow_id: str = None, max_retries: int = 2) -> str:
        """执行单个任务，自动注入 ContextBus 上下文，带自动重试
        
        Args:
            task_id: 任务ID
            flow_id: Flow ID（可选）
            max_retries: 最大重试次数（默认2次）
            
        Returns:
            str: 执行结果
        """
        task = self.fsm.get(task_id)
        agent_cfg = self.loader.get(task.agent)
        flow_id = flow_id or task.context.get("flow_id", "")
        
        # 构建 system prompt = 角色 prompt + 偏好记忆 + 上游结果
        pref_ctx = self.memory.format_for_prompt(task.agent)
        upstream_ctx = self.context_bus.build_context_prompt(flow_id) if flow_id else ""
        
        system_prompt = agent_cfg.system_prompt
        if pref_ctx and pref_ctx != "暂无偏好记录":
            system_prompt += f"\n\n【老板偏好】\n{pref_ctx}"
        if upstream_ctx:
            system_prompt += upstream_ctx
        
        # 转换 skills 为 tools
        tools = None
        if agent_cfg.skills:
            tools = [
                {
                    "name": s.name,
                    "description": s.description,
                    "parameters": getattr(s, "parameters", {})
                }
                for s in agent_cfg.skills
            ]
        
        # 状态转移：RUNNING
        self.fsm.transition(task_id, TaskStatus.RUNNING)
        
        # 获取 Driver
        driver = self._get_driver(task.agent)
        
        # 带重试执行
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                result = await driver.execute(
                    system_prompt=system_prompt,
                    user_message=f"{task.title}\n\n{task.description}",
                    tools=tools,
                    config={
                        "model": agent_cfg.model,
                        "temperature": agent_cfg.temperature,
                        "max_tokens": agent_cfg.max_tokens
                    }
                )
                
                if result.success:
                    content = result.content
                    if "[需要确认]" in content or "[WAIT_HUMAN]" in content:
                        self.fsm.transition(task_id, TaskStatus.WAITING_HUMAN, content)
                    else:
                        self.fsm.transition(task_id, TaskStatus.DONE, content)
                    return content
                else:
                    last_error = result.error
                    if attempt < max_retries:
                        await asyncio.sleep(1)
                        continue
                    error_msg = f"❌ Driver 执行失败 (重试{max_retries}次后): {last_error}"
                    self.fsm.transition(task_id, TaskStatus.FAILED, error_msg)
                    return error_msg
                    
            except Exception as e:
                last_error = str(e)
                if attempt < max_retries:
                    await asyncio.sleep(1)
                    continue
                error_msg = f"❌ 任务执行异常 (重试{max_retries}次后): {last_error}"
                self.fsm.transition(task_id, TaskStatus.FAILED, error_msg)
                return error_msg
    
    async def health_check(self) -> dict:
        """健康检查
        
        Returns:
            dict: 健康状态
        """
        drivers_health = {}
        
        # 检查所有已加载的 Driver
        for name, driver in self._drivers.items():
            drivers_health[name] = await driver.health_check()
        
        return {
            "fsm": self.fsm is not None,
            "loader": len(self.loader.all()) > 0,
            "memory": self.memory is not None,
            "context_bus": self.context_bus.stats(),
            "drivers": drivers_health
        }
