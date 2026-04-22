# SoloFlow ⚡

### Cognitive Workflow Engine for AI Agents

**DAG 任务编排 + 三层记忆 + 持久化状态，让 Agent 做复杂任务不再翻车。**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## 它解决什么问题

Agent 执行复杂任务时，常见翻车：

- 10 步任务跑到第 7 步失败，从头再来
- 可以并行的步骤串行跑，浪费时间
- 上下文太长 Token 爆了，或者压缩后丢了中间结果
- 同类任务每次重新规划，不积累经验

SoloFlow 给 Agent 加了一层**任务编排引擎**：自动拆解 → 并行调度 → 失败重试 → 经验积累。

---

## 核心能力

### 🔄 DAG 并行调度

Kahn 算法拓扑排序，自动识别哪些步骤可以并行：

```
选题 → [学术搜索 ∥ 行业搜索 ∥ 竞品分析] → 大纲 → 撰写 → 审校
                  ↑ 3 步同时跑
```

- 可配置 `max_parallelism` 控制并发度
- 单步超时 + 指数退避重试
- 注入式 executor：测试用 mock，生产接 LLM

### 🧠 三层记忆

```
Working Memory (LRU, 毫秒级)
  → 当前任务上下文，超 size 自动淘汰
       ↓
Episodic Memory (SQLite + FTS5)
  → 事件流持久化，事后全文搜索回溯
       ↓
Semantic Memory (模式提取)
  → 从完成的 workflow 自动提取结构模板
  → 同类任务可直接复用
```

### 💾 持久化 + 断点续跑

SQLite WAL 模式，进程崩溃重启后 workflow 状态完整保留。失败步骤可独立重试，不用从头来。

### 🔒 严格状态机

```
Workflow: draft → active → running → completed / failed / cancelled
Step:     pending → ready → running → completed / failed (→ ready retry)
```

每个转换都有合法性校验，非法操作直接拒绝。

---

## 架构

```
┌──────────────────────────────────┐
│      WorkflowService (API)       │  创建/启动/推进/取消
├──────────────────────────────────┤
│      Scheduler (调度)            │  DAG 并行、超时重试、指数退避
├────────────┬─────────────────────┤
│  DAG Engine│    FSM 状态机       │  拓扑排序 + 状态约束
├────────────┴─────────────────────┤
│      SQLiteStore (持久化)        │  WAL、组合主键、8 版迁移
└──────────────────────────────────┘
         ↕
┌──────────────────────────────────┐
│      三层记忆系统                 │
│  Working → Episodic → Semantic   │
└──────────────────────────────────┘
```

---

## 快速开始

### 安装

```bash
git clone https://github.com/SonicBotMan/SoloFlow.git
cd SoloFlow
# 纯 Python，无第三方依赖（只用标准库 sqlite3 + asyncio）
```

### 基本用法

```python
import asyncio
from pathlib import Path
from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler

async def main():
    # 1. 初始化
    store = SQLiteStore(Path("soloflow.db"))
    store.initialize()
    ws = WorkflowService(store)
    ws.set_scheduler(Scheduler(store, ws))

    # 2. 创建 workflow
    wf = await ws.create_workflow(
        name="research-report",
        description="行业调研报告",
        steps=[
            {"id": "topic",    "name": "选题",     "discipline": "deep",  "prompt": "确定研究方向"},
            {"id": "search_a", "name": "学术搜索",  "discipline": "quick", "prompt": "搜索学术资料"},
            {"id": "search_b", "name": "行业搜索",  "discipline": "quick", "prompt": "搜索行业报告"},
            {"id": "outline",  "name": "大纲",     "discipline": "deep",  "prompt": "整理大纲"},
            {"id": "write",    "name": "撰写",     "discipline": "deep",  "prompt": "写正文"},
            {"id": "review",   "name": "审校",     "discipline": "quick", "prompt": "审校发布"},
        ],
        edges=[
            ("topic", "search_a"), ("topic", "search_b"),
            ("search_a", "outline"), ("search_b", "outline"),
            ("outline", "write"), ("write", "review"),
        ],
    )

    # 3. 启动（Scheduler 自动调度：topic → [search_a ∥ search_b] → outline → write → review）
    await ws.start_workflow(wf["id"])

    # 4. 查状态
    status = await ws.get_workflow_status(wf["id"])
    print(f"State: {status['state']}, Progress: {status['progress']}")

    # 5. 手动推进步骤（不用 Scheduler 时）
    ready = await ws.get_ready_steps(wf["id"])
    for step_id in ready:
        result = f"完成了 {step_id}"  # 实际中这里调用 LLM
        await ws.advance_step(wf["id"], step_id, result=result)

asyncio.run(main())
```

### 自定义 Executor

```python
# 注入自己的执行逻辑（如调用 LLM、搜索 API 等）
async def my_executor(step: dict) -> str:
    response = await call_your_llm(step["prompt"])
    return response

scheduler = Scheduler(store, ws, config={"max_parallelism": 4, "default_timeout": 60})
result = await scheduler.execute_workflow(workflow_id, executor=my_executor)
```

### 记忆系统

```python
from memory.episodic_memory import EpisodicMemory
from memory.semantic_memory import SemanticMemory

em = EpisodicMemory(store)

# 记录事件
await em.record(event_type="step_completed", data={"step": "search_a", "result": "找到 12 篇"})

# 全文搜索
results = await em.search("timeout")  # 搜所有超时事件

# 语义模式提取
sm = SemanticMemory(store)
template = await sm.extract_and_store(completed_workflow)
templates = await sm.get_templates()  # 获取所有模式模板
```

---

## API 参考

### WorkflowService

| 方法 | 说明 |
|------|------|
| `create_workflow(name, description, steps, edges)` | 创建工作流，返回 workflow dict |
| `start_workflow(workflow_id)` | 启动工作流（draft → running） |
| `advance_step(workflow_id, step_id, result?, error?)` | 推进步骤状态 |
| `get_ready_steps(workflow_id)` | 获取当前可执行的步骤列表 |
| `get_workflow_status(workflow_id)` | 查询工作流状态和进度 |
| `list_workflows(limit?, state_filter?)` | 列出/筛选工作流 |
| `cancel_workflow(workflow_id)` | 取消运行中的工作流 |

### Scheduler

| 方法 | 说明 |
|------|------|
| `execute_workflow(workflow_id, executor?)` | 执行整个工作流（自动并行调度） |
| `cancel_step(workflow_id, step_id)` | 取消单个运行中的步骤 |
| `cancel_all(workflow_id)` | 取消工作流的所有运行步骤 |

### Step 配置

```python
{
    "id": "unique_step_id",       # 必填，步骤唯一标识
    "name": "步骤名称",            # 必填
    "description": "描述",         # 可选
    "discipline": "deep",          # quick / deep / visual / ultrabrain
    "prompt": "执行指令",           # 必填，传给 executor 的内容
    "max_retries": 3,              # 可选，默认 3
    "timeout_seconds": 300,        # 可选，默认 300
}
```

---

## 测试

```bash
# 核心功能测试 (25 项)
python3 /tmp/soloflow_full_test.py

# 边界场景测试 (17 场景 56 项)
python3 /tmp/soloflow_edge_test.py
```

测试覆盖：DAG 构建、并行调度、状态机转换、超时重试、三层记忆、FTS5 搜索、并发竞争、幂等保存、空/极端输入...

---

## 集成到 Hermes Agent

SoloFlow 是独立的 Python 库，可以集成到任何 AI Agent 框架。以 [Hermes Agent](https://github.com/nousresearch/hermes-agent) 为例：

1. 将 `hermes-plugin/` 目录放到 Hermes 的 plugins 目录
2. 在 Hermes `config.yaml` 中注册插件
3. Agent 即可通过 tool 接口创建和管理工作流

也可以作为独立库使用，不依赖任何 Agent 框架。

---

## 项目结构

```
SoloFlow/
├── hermes-plugin/           # Python 工作流引擎
│   ├── core/
│   │   ├── dag.py           # Kahn 算法 DAG 引擎
│   │   └── fsm.py           # 状态机
│   ├── services/
│   │   ├── workflow_service.py  # 核心服务层
│   │   └── scheduler.py        # 并行调度器
│   ├── memory/
│   │   ├── working_memory.py    # LRU 工作记忆
│   │   ├── episodic_memory.py   # FTS5 事件记忆
│   │   └── semantic_memory.py   # 语义记忆
│   ├── store/
│   │   ├── sqlite_store.py      # SQLite WAL 持久化
│   │   └── migrations.py        # 8 版增量迁移
│   ├── models.py                # 状态枚举
│   ├── config.py                # 配置
│   └── plugin.yaml              # 插件元数据
├── openclaw-plugin/         # (旧版) OpenClaw Node.js 插件
├── core/                    # (旧版) 独立 DAG/FSM 模块
└── README.md
```

---

## License

MIT
