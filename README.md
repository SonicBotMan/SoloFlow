# SoloFlow ⚡

**AI 原生工作流编排引擎** —— 将复杂多步骤 AI 任务转化为结构化、可观测、可重试的工作流。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Python Tests](https://img.shields.io/badge/Python%20tests-58%20passing-brightgreen)](./tests)
[![TypeScript Tests](https://img.shields.io/badge/TypeScript%20tests-175%20passing-brightgreen)](./openclaw-plugin/tests)

---

## 定位

SoloFlow 是为 **一人公司** 设计的 AI 工作流框架。

你描述需求，系统自动完成剩余工作——从任务规划到执行、从记忆学习到技能进化，全部自动化。

两个版本协同工作：

| 组件 | 技术栈 | 定位 |
|------|--------|------|
| **`soloflow/`** (Python) | Python / asyncio / SQLite | 轻量核心，可独立运行 |
| **`openclaw-plugin/`** (TypeScript) | TypeScript / Bun / OpenClaw | 完整企业级插件 |

---

## 核心特性

### 🧠 认知记忆系统
基于龙虾饼（LobsterPress）的四级记忆架构：Core Intelligence → Skill Evolution → Multi-Agent → Engineering。三层记忆（语义/情景/工作）配合遗忘曲线 `R(t) = base × e^(-t/stability)`，让 Agent 越用越懂你。

### 🎯 Discipline-Aware 路由
根据任务类型自动路由到最适合的 Agent：
- **quick** — 简单查询、格式化、翻译
- **deep** — 深度研究、多步推理、架构设计
- **visual** — UI/UX、视觉设计、前端开发
- **ultrabrain** — 复杂算法、硬逻辑、原创方案

### ⚙️ DAG + FSM 混合架构
- **DAG** — 表达任务之间的依赖关系，并行优化
- **FSM** — 严格的状态机governance（pending → running → success/failure/retry）
- 两者结合：既有工作流的表达力，又有状态机的严谨性

### 🔄 弹性执行
- 任务失败自动重试（可配置次数）
- 超时控制 + 优雅降级
- 完整执行日志和状态追踪

### 📦 Skill 自动进化
系统自动检测重复模式，分析成功案例，生成可复用的 Skill。重复任务自动升级为自动化技能，越用越快。

---

## 架构

```
用户需求（自然语言）
    ↓
┌─────────────────────────────────────────────────────────────┐
│  OpenClaw Plugin (TypeScript)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ DAG Engine  │  │ FSM Engine  │  │ ContextBus        │  │
│  │ (调度/并行) │  │ (状态机)    │  │ (步骤间数据传递)  │  │
│  └─────────────┘  └─────────────┘  └──────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ Memory      │  │ Skills      │  │ Vector Search    │  │
│  │ (三层记忆)  │  │ (自动进化)  │  │ (RRF/MMR 检索)   │  │
│  └─────────────┘  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  SoloFlow Core (Python)                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ FlowEngine  │  │ Agent Loader│  │ PreferenceMemory │  │
│  │ (并行调度)  │  │ (YAML配置)  │  │ (贝叶斯偏好)     │  │
│  └─────────────┘  └─────────────┘  └──────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ FSM         │  │ ContextBus  │  │ Drivers          │  │
│  │ (SQLite持久)│  │ (数据总线)  │  │ LLM/MCP/OpenClaw│  │
│  └─────────────┘  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
    ↓
外部服务（OpenAI / MCP / OpenClaw / 自定义 Skill）
```

---

## 快速开始

### Python 核心（独立运行）

```bash
# 安装依赖
pip install -r requirements.txt

# 设置 API Key
export OPENAI_API_KEY="your-key"

# 运行
python main.py "帮我做一条关于AI编程的短视频"
```

### OpenClaw 插件（完整功能）

```bash
cd openclaw-plugin
bun install
bun run build

# 插件会自动注册到 OpenClaw
# 使用 /workflow 命令创建和管理工作流
```

---

## 竞品对比

| 特性 | SoloFlow | CrewAI | LangGraph | AutoGPT | n8n |
|------|:--------:|:-------:|:---------:|:--------:|:---:|
| Discipline-Aware 路由 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 认知记忆系统 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Skill 自动进化 | ✅ | ❌ | ❌ | ❌ | ❌ |
| DAG + FSM 混合 | ✅ | 部分 | ✅ | ❌ | ✅ |
| 可视化构建器 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 多用户/RBAC | ✅ | ❌ | ❌ | ❌ | ✅ |
| OpenClaw 集成 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 遗忘曲线 | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 项目结构

```
ai-one-person-company/
├── soloflow/                    # Python 核心引擎
│   ├── flow_engine.py           # 并行任务调度
│   ├── fsm.py                  # SQLite 状态机
│   ├── context_bus.py          # 数据总线
│   ├── memory.py               # 偏好记忆
│   ├── agent_loader.py         # YAML Agent 加载
│   └── drivers/                # LLM / MCP / OpenClaw / Skill
│
├── openclaw-plugin/             # OpenClaw 插件（TypeScript）
│   ├── src/
│   │   ├── core/               # DAG + FSM 引擎
│   │   ├── agents/             # Discipline Agents
│   │   ├── memory/            # 三层记忆系统
│   │   ├── skills/             # Skill 进化
│   │   ├── coordination/      # 多 Agent 协调
│   │   ├── vector/            # 向量检索
│   │   ├── visual/             # YAML ↔ DAG 双向同步
│   │   ├── api/               # REST API + WebSocket
│   │   └── multiuser/         # 多用户 / RBAC
│   ├── ui/                    # React Flow 可视化构建器
│   └── tests/                 # 175 TypeScript 测试
│
├── main.py                     # Python 入口
├── requirements.txt            # Python 依赖
└── README.md                   # 本文件
```

---

## 研究基础

SoloFlow 的设计参考了以下开源项目：

- [**oh-my-openagent**](https://github.com/SonicBotMan/oh-my-openagent) — Discipline Agents、Sisyphean Hook 系统、Interview 规划模式
- [**lobster-press**](https://github.com/SonicBotMan/lobster-press) — MemOS 四阶段架构、遗忘曲线、三层记忆系统
- [**openclaw-portable**](https://github.com/SonicBotMan/openclaw-portable) — OpenClaw 生态核心

---

## License

MIT
