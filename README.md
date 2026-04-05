# SoloFlow ⚡

**OpenClaw 工作流编排插件** —— 将复杂多步骤 AI 任务转化为结构化、可观测、可重试的工作流。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript Tests](https://img.shields.io/badge/tests-175%20passing-brightgreen)](./openclaw-plugin/tests)
[![Bundle](https://img.shields.io/badge/bundle-0.27MB-orange)](./openclaw-plugin/dist)

---

SoloFlow 是 [OpenClaw](https://github.com/SonicBotMan/openclaw-portable) 的工作流编排大脑。用户描述需求，系统自动完成剩余工作——从任务规划到执行、从记忆学习到技能进化，全部自动化。

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
- **FSM** — 严格的状态机 governance（pending → running → success/failure/retry）
- 两者结合：既有工作流的表达力，又有状态机的严谨性

### 🔄 弹性执行
- 任务失败自动重试（可配置次数）
- 超时控制 + 优雅降级
- 完整执行日志和状态追踪

### 📦 Skill 自动进化
系统自动检测重复模式，分析成功案例，生成可复用的 Skill。重复任务自动升级为自动化技能。

### 🔌 MCP 工具暴露
通过 MCP 协议暴露 5 个核心工具：`soloflow_run`、`soloflow_status`、`soloflow_list`、`soloflow_cancel`、`soloflow_create`，供外部 AI 系统调用。

---

## 架构

```
openclaw-plugin/
├── src/
│   ├── core/               # DAG + FSM 引擎
│   ├── agents/             # Discipline Agents (deep/quick/visual/ultrabrain)
│   ├── memory/             # 三层记忆系统 (Working/Episodic/Semantic)
│   ├── skills/             # Skill 自动进化
│   ├── coordination/       # 多 Agent 协调 (TeamBuilder/ModelSelector/LoadBalancer)
│   ├── vector/              # 向量检索 (RRF/MMR + 时间衰减)
│   ├── visual/             # YAML ↔ DAG 双向同步
│   ├── api/                # REST API + WebSocket Server
│   ├── marketplace/        # 插件市场
│   └── multiuser/          # 多用户 / RBAC
├── ui/                     # React Flow 可视化构建器
└── tests/                  # 175 TypeScript 测试
```

---

## 快速开始

```bash
cd openclaw-plugin
bun install
bun run build

# 插件自动注册到 OpenClaw
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

## 研究基础

- [**oh-my-openagent**](https://github.com/SonicBotMan/oh-my-openagent) — Discipline Agents、Sisyphean Hook 系统、Interview 规划模式
- [**lobster-press**](https://github.com/SonicBotMan/lobster-press) — MemOS 四阶段架构、遗忘曲线、三层记忆系统
- [**openclaw-portable**](https://github.com/SonicBotMan/openclaw-portable) — OpenClaw 生态核心

---

## License

MIT
