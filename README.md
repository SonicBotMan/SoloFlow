# SoloFlow ⚡

### Cognitive Workflow Orchestration for AI Agents

**将混乱的多步骤 AI 任务，转化为结构化的、可观测的、可自进化的智能工作流。**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/官网-soloflow.pmparker.net-6366f1)](https://soloflow.pmparker.net/)
[![Tools](https://img.shields.io/badge/tools-15%20MCP%20tools-3178c6)](./src)
[![Runtime](https://img.shields.io/badge/runtime-Node.js%20%E2%89%A522-339933?logo=node.js)](https://nodejs.org)
[![Bundle](https://img.shields.io/badge/bundle-~469KB-orange)](./dist)

---

## 它解决什么问题

AI Agent 框架普遍存在一个矛盾：**结构化** 与 **灵活性** 无法兼得。硬编码的 Pipeline 遇到真实场景就断裂；纯自由式的 Agent 又陷入不可预测的混乱。

真正的痛点更深：

| 痛点 | 现状 |
|------|------|
| **无记忆** | 每次任务从零开始，重复问同样的问题，浪费 Token 和时间 |
| **无分类** | 查个天气和做架构评审用同一种模型，成本高、速度慢 |
| **无可见性** | 多步骤任务像黑箱运行，某步出错只能靠猜 |
| **无进化** | 同样的工作流重复手动执行，规律永远不变成能力 |
| **无恢复** | 第 7 步超时，前功尽弃，从头再来 |

SoloFlow 全部解决。

---

## 核心能力

### 🧠 四层认知记忆系统

不只是"记住"，是真正模拟人类记忆的科学模型：

```
Working Memory          ← 当前任务上下文，运行中实时活跃
       ↓
Episodic Memory         ← 执行历史，SQLite 持久化，支持按 workflowId 去重
       ↓
Unified Retrieval (RRF)← 统一检索融合，多源记忆协同召回
       ↓
Semantic Memory         ← 抽象化持久知识，受 Ebbinghaus 遗忘曲线自然衰减
```

每次步骤完成自动存入 Episodic Memory，下次相似任务自动召回相关经验。

### ⚡ Discipline-Aware 智能路由

每个步骤自动路由到最合适的 Agent 类型，**不错配、不浪费**：

| Discipline | 适用场景 | 模型策略 |
|------------|----------|----------|
| `quick` | 查天气、格式化、翻译 | 轻量快速 |
| `deep` | 架构评审、深度研究 | 强推理 |
| `visual` | UI/UX、前端相关 | 设计与代码 |
| `ultrabrain` | 复杂算法、硬逻辑 | 超深度思考 |

### 🔄 自动技能进化

无需人工干预，系统自动从执行历史中提取可复用模式：

- **EvolutionAnalyzer** — 扫描工作流历史，LLM 驱动模式提取
- **EvolutionStore** — SQLite 持久化，进化结果永不丢失
- `soloflow_evolve` 手动触发，`soloflow_templates` 搜索已进化模板
- Cron 定时驱动，持续自我完善

### 🎨 可视化构建器

拖拽式 DAG 编辑器，所见即所得：

- 基于 SVG，无需依赖外部服务
- 实时显示执行状态（等待中 / 运行中 / 完成 / 失败）
- 模板画廊，一键导入已有工作流
- 暗色主题，支持 `/soloflow/builder` 直接访问

### 🎰 DAG + FSM 混合引擎

- **DAG** — 拓扑排序表达步骤依赖，同层步骤可完全并行
- **FSM** — 严格状态机：`idle → queued → running → paused → completed / failed / cancelled`
- 子 Agent 拥有完整 OpenClaw 工具访问权限，不局限于编排器内工具子集

---

## 15 个 MCP 工具

| 工具 | 说明 |
|------|------|
| `soloflow_create` | 创建工作流（名称、步骤、依赖、discipline） |
| `soloflow_start` | 启动工作流 |
| `soloflow_ready_steps` | 查询当前可执行的步骤（所有依赖已完成） |
| `soloflow_advance_step` | 标记步骤完成/失败，解锁下游 |
| `soloflow_status` | 查询工作流状态 |
| `soloflow_list` | 列出所有工作流 |
| `soloflow_cancel` | 取消运行中的工作流 |
| `soloflow_memory` | 查询认知记忆（Working / Episodic / Semantic 三层） |
| `soloflow_evolve` | 触发 Skill 自动进化分析 |
| `soloflow_templates` | 搜索已进化的 workflow / skill 模板 |
| `soloflow_skills_list` | 列出所有已注册的 Skill |
| `soloflow_skills_usage` | 查看 Skill 使用分析 |
| `soloflow_skills_scan` | 扫描并更新 Skill 清单 |
| `mcp_servers` | 列出所有 MCP 服务器及其工具 |
| `mcp_stats` | MCP 服务器使用统计与工具排行 |

---

## 工作原理

```
soloflow_create   →  定义 DAG 工作流（步骤 + 依赖关系）
       ↓
soloflow_start    →  启动工作流，FSM 进入 running
       ↓
soloflow_ready_steps → 查询当前可执行的步骤
       ↓
主 Agent 通过 sessions_spawn 分发子 Agent
       ↓
子 Agent 调用 OpenClaw 完整工具集完成任务
       ↓
soloflow_advance_step → 标记完成，触发认知记忆存储
       ↓
解锁下游步骤，循环直到全部完成
```

子 Agent 可调用：`ezviz_capture`、`image`、`web_search`、`message`、`browser`、`mcp_servers` 等全部 OpenClaw 工具——**不局限于工具子集**。

---

## 快速开始

```bash
# 通过 ClawHub 安装（推荐）
clawhub install soloflow

# 重启 Gateway 加载插件
openclaw gateway restart

# 验证
openclaw status
# → SoloFlow loaded ✓
```

或手动构建：

```bash
git clone https://github.com/SonicBotMan/SoloFlow.git
cd SoloFlow/openclaw-plugin
npm install
npm run build
```

**前置要求：** Node.js ≥ 22

---

## 项目架构

```
openclaw-plugin/
├── src/
│   ├── core/              # DAG 编排 + FSM 状态机引擎
│   ├── agents/            # Discipline 分类与智能路由
│   ├── services/          # 工作流服务、调度器
│   ├── memory/             # 四层认知记忆系统
│   ├── evolution/         # 自动技能进化引擎
│   ├── skills/            # Skill 注册与生命周期
│   ├── coordination/       # 多 Agent 协调
│   ├── mcp/               # MCP 工具实现（15 个工具）
│   ├── api/               # REST / WebSocket 接口
│   ├── rpc/               # JSON-RPC 协议
│   ├── commands/          # /workflow 命令
│   ├── hooks/             # 生命周期钩子
│   ├── visual-builder/    # SVG 拖拽式 DAG 编辑器
│   └── store/             # SQLite 持久化存储
└── tests/                 # 完整测试套件
```

---

## 与竞品对比

| 特性 | SoloFlow | CrewAI | LangGraph | AutoGPT | n8n |
|------|:--------:|:------:|:---------:|:-------:|:---:|
| 四层认知记忆 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Discipline-Aware 路由 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 自动技能进化 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 遗忘曲线衰减 | ✅ | ❌ | ❌ | ❌ | ❌ |
| DAG + FSM 混合 | ✅ | 部分 | ✅ | ❌ | ✅ |
| 可视化 DAG 构建器 | ✅ | ❌ | ❌ | ❌ | ✅ |
| MCP 工具接口 | ✅ | ❌ | ❌ | ❌ | ❌ |
| OpenClaw 深度集成 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 子 Agent 完整工具访问 | ✅ | ✅ | ✅ | ✅ | ❌ |
| Open Source | ✅ | ✅ | ✅ | ✅ | 部分 |

---

## 资源链接

| 资源 | 链接 |
|------|------|
| **产品官网** | [soloflow.pmparker.net](https://soloflow.pmparker.net/) |
| **官网源码** | [website/](./website/) |
| **GitHub 仓库** | [github.com/SonicBotMan/SoloFlow](https://github.com/SonicBotMan/SoloFlow) |
| **插件详细文档** | [openclaw-plugin/README.md](./openclaw-plugin/README.md) |
| **发行说明** | [Releases](https://github.com/SonicBotMan/SoloFlow/releases) |

---

## License

MIT
