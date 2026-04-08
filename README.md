# SoloFlow ⚡

### Cognitive Workflow Orchestration for AI Agents

**让 OpenClaw 越用越聪明，越用越可靠。**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/官网-soloflow.pmparker.net-6366f1)](https://soloflow.pmparker.net/)
[![Tools](https://img.shields.io/badge/tools-15%20MCP%20tools-3178c6)](./src)
[![Runtime](https://img.shields.io/badge/runtime-Node.js%20%E2%89%A522-339933?logo=node.js)](https://nodejs.org)
[![Bundle](https://img.shields.io/badge/bundle-~469KB-orange)](./dist)

---

## 它解决什么问题

**每次对话都在重复。** 同一个需求，AI 要从头理解一遍。上下文越长，Token 消耗越多，速度越慢，可靠性越低。

| 现状 | 理想 |
|------|------|
| 每次任务从零开始，重复描述背景 | 记住历史决策，下次直接执行 |
| 长对话上下文爆 Token，费用飙升 | 工作流复用，Token 消耗降低 90% |
| 复杂任务靠人工拆解，容易遗漏 | 自动拆分、智能路由、步步可控 |
| 经验散落在聊天记录里，无法复用 | 智能提炼成 Skill，下次一键调用 |
| 用久了没有进步，同类问题反复错 | 越用越聪明，可靠性持续提升 |

---

## 核心价值

### 🧠 让 OpenClaw 越用越聪明

SoloFlow 为 OpenClaw 注入真正的**认知记忆系统**，不只是存储，是科学建模的人类记忆结构：

```
Working Memory          ← 当前任务上下文，运行中实时活跃
       ↓
Episodic Memory         ← 每次执行的完整历史，SQLite 持久化
       ↓
Unified Retrieval (RRF)← 多源协同召回，相似任务自动匹配
       ↓
Semantic Memory         ← 抽象化知识沉淀，受 Ebbinghaus 遗忘曲线自然淘汰无用信息
```

**效果：** 第 3 次遇到同类任务，OpenClaw 自动召回历史经验，**无需重复描述背景，Token 消耗大幅下降**。

### ⚡ 自动提炼 Skill，工作流即插即用

每次完成复杂任务，SoloFlow 自动分析执行路径，提取可复用的模式：

- `soloflow_evolve` — LLM 驱动，从执行历史中提取工作流模板和 Skill 模式
- `soloflow_templates` — 搜索已进化的模板，一句话创建新任务
- 首次安装自动扫描现有执行记录冷启动

**效果：** 用得越多，系统越懂你的习惯。重复性任务从"从头描述"变成"一键执行"。

### 🎯 智能路由，降低 Token 消耗

Discipline-Aware 路由，每个步骤自动匹配最合适的 Agent 类型：

| Discipline | 场景 | 策略 |
|------------|------|------|
| `quick` | 查天气、格式化、翻译 | 轻量快速，省 Token |
| `deep` | 架构评审、深度研究 | 强推理，保证质量 |
| `visual` | UI/UX、前端任务 | 设计+代码双视角 |
| `ultrabrain` | 复杂算法、硬逻辑 | 超深度思考，正确率优先 |

**效果：** 简单任务用轻量模型，复杂任务用强推理模型，**不错配、不浪费**。

### 🔄 DAG + FSM，执行步步可观测

- **DAG** — 拓扑排序，同层步骤完全并行，每步独立可观测
- **FSM** — 严格状态机，任何步骤失败立即定位，不丢上下文
- **断点续跑** — 第 7 步失败？从第 7 步恢复，不从头开始

**效果：** 全程可控可观测，出错不怕，凌晨不慌。

### 🎨 可视化构建器

拖拽式 DAG 编辑器，所见即所得。基于 SVG 无需外部依赖，支持 `/soloflow/builder` 直接访问。

---

## 15 个 MCP 工具

| 工具 | 说明 |
|------|------|
| `soloflow_create` | 创建工作流（步骤 + 依赖 + discipline） |
| `soloflow_start` | 启动工作流 |
| `soloflow_ready_steps` | 查询当前可执行步骤 |
| `soloflow_advance_step` | 标记步骤完成/失败，推进工作流 |
| `soloflow_status` | 查询工作流状态 |
| `soloflow_list` | 列出所有工作流 |
| `soloflow_cancel` | 取消运行中的工作流 |
| `soloflow_memory` | 查询认知记忆（Working / Episodic / Semantic） |
| `soloflow_evolve` | 触发 Skill 自动进化分析 |
| `soloflow_templates` | 搜索已进化的 workflow / skill 模板 |
| `soloflow_skills_list` | 列出所有已注册的 Skill |
| `soloflow_skills_usage` | 查看 Skill 使用分析 |
| `soloflow_skills_scan` | 扫描并更新 Skill 清单 |
| `mcp_servers` | 列出所有 MCP 服务器及工具 |
| `mcp_stats` | MCP 服务器使用统计 |

---

## 工作原理

```
用户: "帮我分析这个 GitHub 项目的代码质量"
         ↓
soloflow_create   →  自动拆解为 DAG 工作流
                         ↙        ↘
                   抓取代码      静态分析
                         ↘        ↙
                       综合报告 + Skill 提炼
                                 ↓
                    存入 Episodic Memory
                                 ↓
              下次说"分析 XX 项目"→ 自动召回 + 执行
```

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

**前置要求：** Node.js ≥ 22

---

## 与竞品对比

| 特性 | SoloFlow | CrewAI | LangGraph | AutoGPT | n8n |
|------|:--------:|:------:|:---------:|:-------:|:---:|
| 认知记忆系统 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 自动提炼 Skill | ✅ | ❌ | ❌ | ❌ | ❌ |
| 降低 Token 消耗 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 越用越聪明 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Discipline-Aware 路由 | ✅ | ❌ | ❌ | ❌ | ❌ |
| DAG + FSM 混合 | ✅ | 部分 | ✅ | ❌ | ✅ |
| 可视化 DAG 构建器 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 遗忘曲线衰减 | ✅ | ❌ | ❌ | ❌ | ❌ |
| MCP 工具接口 | ✅ | ❌ | ❌ | ❌ | ❌ |
| OpenClaw 深度集成 | ✅ | ❌ | ❌ | ❌ | ❌ |

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
