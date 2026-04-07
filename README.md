# SoloFlow ⚡

**OpenClaw 工作流编排插件** —— 将复杂多步骤 AI 任务转化为结构化、可观测、可重试的工作流。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/官网-soloflow.pmparker.net-6366f1)](https://soloflow.pmparker.net/)
[![TypeScript Tests](https://img.shields.io/badge/tests-175%20passing-brightgreen)](./openclaw-plugin/tests)
[![Bundle](https://img.shields.io/badge/bundle-%7E0.27MB-orange)](./openclaw-plugin/dist)

---

SoloFlow 是 [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) 的工作流编排层：纯 DAG 编排器，负责步骤依赖管理、状态持久化和执行协调。**它不直接调用 LLM** —— 主 OpenClaw Agent 通过 `soloflow_ready_steps` → `sessions_spawn` → `soloflow_advance_step` 驱动实际执行。

| 资源 | 链接 |
|------|------|
| **产品官网（特性 / 架构 / 对比 / 快速上手）** | [soloflow.pmparker.net](https://soloflow.pmparker.net/) |
| **官网静态源码** | [website/](./website/)（部署该目录到静态托管即可） |
| **本仓库** | [github.com/SonicBotMan/SoloFlow](https://github.com/SonicBotMan/SoloFlow) |
| **发行说明** | [Releases](https://github.com/SonicBotMan/SoloFlow/releases) |
| **插件详细文档（英文长文）** | [openclaw-plugin/README.md](./openclaw-plugin/README.md) |

---

## 核心架构

### 🧩 纯 DAG 编排器（v0.5）

SoloFlow **不调用 LLM**。它是一个纯编排层：

1. `soloflow_create` — 定义工作流（DAG + 步骤元数据）
2. `soloflow_start` — 启动工作流
3. `soloflow_ready_steps` — 查询就绪步骤（所有依赖已完成）
4. 主 Agent 对就绪步骤调用 `sessions_spawn` 分发子 Agent
5. 子 Agent 完成后，主 Agent 调用 `soloflow_advance_step` 标记完成
6. 循环直到所有步骤完成

**子 Agent 拥有完整的 OpenClaw 工具访问权限**：`ezviz_capture`、`image`、`web_search`、`message`、`browser` 等 —— 不局限于编排器内的工具子集。

### 🔧 7 个工具

| 工具 | 说明 |
|------|------|
| `soloflow_create` | 创建工作流（名称、步骤、依赖、discipline） |
| `soloflow_start` | 启动工作流 |
| `soloflow_ready_steps` | 🔴 新 — 查询当前可执行的步骤 |
| `soloflow_advance_step` | 🔴 新 — 标记步骤完成/失败，解锁下游 |
| `soloflow_status` | 查询工作流状态 |
| `soloflow_list` | 列出所有工作流 |
| `soloflow_cancel` | 取消运行中的工作流 |

### 🎯 Discipline-Aware 路由

每个步骤可标注 discipline，供主 Agent 选择执行策略：

- **quick** — 简单查询、格式化、翻译
- **deep** — 深度研究、多步推理、架构设计
- **visual** — UI/UX、视觉与前端相关任务
- **ultrabrain** — 复杂算法、硬逻辑、强推理类任务

> v0.5 中 discipline 为步骤元数据，实际路由决策由主 Agent 根据 discipline 标签选择合适的模型和思考深度。

### ⚙️ DAG + FSM 混合

- **DAG** — 拓扑排序表达步骤依赖，同层步骤可并行
- **FSM** — 状态机管理工作流生命周期：`idle → queued → running → paused → completed / failed / cancelled`

### 💾 SQLite 持久化

工作流存储在 `~/.openclaw/data/soloflow/workflows.db`，Gateway 重启后自动恢复运行中的工作流。

---

## 仓库结构

```
openclaw-plugin/
├── src/
│   ├── core/           # DAG + FSM 引擎
│   ├── agents/         # Discipline 分类与路由
│   ├── services/       # 工作流服务、调度
│   ├── memory/         # 记忆层
│   ├── skills/         # Skill 进化与注册
│   ├── coordination/   # 多 Agent 协调
│   ├── mcp/            # MCP 工具实现
│   ├── api/            # REST / WebSocket
│   ├── rpc/            # JSON-RPC 接口
│   ├── commands/       # /workflow 命令
│   └── hooks/          # 生命周期钩子
├── tests/              # TypeScript 测试（175 个用例）
└── dist/               # 构建产物
```

---

## 快速开始

**前置**：Node ≥ 22。将本仓库置于 OpenClaw 插件目录后执行：

```bash
git clone https://github.com/SonicBotMan/SoloFlow.git
cd SoloFlow/openclaw-plugin

npm install
npm run build
```

构建产物由 `openclaw.plugin.json` 声明，供 OpenClaw 自动加载。具体挂载方式以 [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) 文档为准。

---

## 竞品对比

| 特性 | SoloFlow | CrewAI | LangGraph | AutoGPT | n8n |
|------|:--------:|:------:|:---------:|:-------:|:---:|
| Discipline-Aware 路由 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 认知记忆系统 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Skill 自动进化 | ✅ | ❌ | ❌ | ❌ | ❌ |
| DAG + FSM 混合 | ✅ | 部分 | ✅ | ❌ | ✅ |
| 可视化构建器 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 多用户/RBAC | ✅ | ❌ | ❌ | ❌ | ✅ |
| OpenClaw 集成 | ✅ | ❌ | ❌ | ❌ | ❌ |
| MCP 工具接口 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 遗忘曲线 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 子 Agent 真实工具访问 | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## License

MIT
