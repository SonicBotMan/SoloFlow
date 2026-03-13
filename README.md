<p align="center">
  <img src="https://img.shields.io/badge/version-v1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/python-3.12+-green.svg" alt="Python">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
  <img src="https://img.shields.io/badge/status-active-success.svg" alt="Status">
</p>

<h1 align="center">🎬 SoloFlow</h1>
<h3 align="center">AI-Powered One-Person Company Framework</h3>
<h4 align="center">让一个人也能拥有完整的AI创作团队</h4>

<p align="center">
  <a href="#-核心特性">核心特性</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-架构设计">架构设计</a> •
  <a href="#-ai员工团队">AI员工</a> •
  <a href="#-技术文档">文档</a>
</p>

---

## 💡 为什么选择 SoloFlow？

**传统方式：** 做一个视频，需要创意 → 写脚本 → 找素材 → 剪辑 → 发布，至少需要3-5人的团队协作。

**SoloFlow 方式：** 你只需要说一句"帮我做个AI热点视频"，AI助理会自动调度团队完成所有工作。

```bash
老板 > 帮我做个科技热点视频

【小助】好的老板！正在为您创建项目...
📡 正在召唤点子王获取热点...

【小点】老板好！为您分析当前科技热点：
🔥 热门热点：
1. GPT-5发布预告 (热度 98)
2. 苹果折叠屏专利 (热度 85)
...

【小助】✅ 项目完成！成片已上传至抖音
```

---

## 🌟 核心特性

### 1️⃣ **唯一对话入口**
- 只有老板助理（小助）直接与用户对话
- 其他AI员工不直接面向用户，确保交互简洁
- 像管理真实团队一样管理AI员工

### 2️⃣ **任务闭环机制**
每个任务都有完整流程：
```
需求理解 → 任务分配 → 执行 → 汇报 → 确认 → 反馈
```

### 3️⃣ **偏好学习系统**
- 老板的每次反馈都会被自动提取为偏好标签
- AI员工会记住老板的喜好并自动应用
- 置信度 + 时间衰减，让记忆更智能

```
老板说："节奏太慢了"
→ 小剪学会：视频节奏 = 快节奏 (置信度 90%)

下次做视频时，小剪会自动应用这个偏好
```

### 4️⃣ **零依赖部署**
```bash
# 方式1: Docker Compose（推荐）
docker compose up

# 方式2: 本地运行
pip install -r requirements.txt
export OPENAI_API_KEY=sk-xxx
python main.py
```

### 5️⃣ **YAML 驱动 Agent**
修改配置即可定制AI员工，无需改代码：

```yaml
# agents/writer.yaml
name: writer
alias: 小文
role: 文案师
model: gpt-4o
temperature: 0.7
system_prompt: |
  你是「小文」，公司的文案师...
```

---

## 🚀 快速开始

### 前置要求

- Python 3.12+ 或 Docker
- OpenAI API Key（或兼容的 API）

### 方式一：Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/SonicBotMan/ai-one-person-company.git
cd ai-one-person-company

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env 文件，填入你的 OPENAI_API_KEY

# 3. 一键启动
docker compose up

# 打开 http://localhost:8000
```

### 方式二：本地运行

```bash
# 1. 克隆项目
git clone https://github.com/SonicBotMan/ai-one-person-company.git
cd ai-one-person-company

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置环境变量
export OPENAI_API_KEY=sk-xxx

# 4. 启动 Web UI
python main.py

# 或启动 CLI 模式
python main.py --cli
```

### 验证安装

```bash
# 运行测试验证
python tests/verify.py

# 预期输出：
# ✅ 所有测试通过！
```

---

## 🏗️ 架构设计

### 系统架构图

```
用户 (老板)
  │
  ▼
┌──────────────────────────────────────────────────────┐
│                   SoloFlow Core                      │
│                                                      │
│  ┌─────────────┐    ┌──────────────────────────┐    │
│  │  CLI / Web  │───▶│    TaskFSM (状态机引擎)   │    │
│  │  一行命令   │    │  pending→running→done     │    │
│  └─────────────┘    └──────────┬───────────────┘    │
│                                │                     │
│         ┌──────────────────────┼──────────────┐      │
│         ▼                      ▼              ▼      │
│  ┌─────────────┐  ┌──────────────────┐  ┌─────────┐ │
│  │ AgentLoader │  │  MemoryStore     │  │ Router  │ │
│  │ YAML驱动    │  │  SQLite + 向量   │  │ 任务路由│ │
│  └─────────────┘  └──────────────────┘  └─────────┘ │
└──────────────────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────┐
   │           Agent Pool (可插拔)            │
   │  小助(调度) 小点(热点) 小文(文案)        │
   │  小材(素材) 小剪(剪辑) 小营(营销)       │
   └─────────────────────────────────────────┘
```

### 核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| **TaskFSM** | `soloflow/fsm.py` | 任务状态机（SQLite 存储） |
| **AgentLoader** | `soloflow/agent_loader.py` | YAML 驱动的 Agent 加载器 |
| **PreferenceMemory** | `soloflow/memory.py` | 偏好记忆系统（置信度+衰减） |
| **SoloFlowRunner** | `soloflow/runner.py` | 主运行器（任务分发+执行） |
| **Web UI** | `soloflow/web.py` | FastAPI Web 界面 |

---

## 👥 AI员工团队

| 花名 | 角色 | 职责 | 核心能力 |
|------|------|------|----------|
| **小助** | 老板助理 | 主调度、唯一对话入口 | 意图理解、任务分发、偏好学习 |
| **小点** | 点子王 | 热点分析、创意构思 | 趋势分析、创意推荐 |
| **小文** | 文案师 | 脚本撰写、文案创作 | 内容创作、风格适配 |
| **小剪** | 剪辑师 | 视频剪辑、后期制作 | 视频剪辑、特效调色 |
| **小发** | 发布专家 | 多平台发布、数据追踪 | 自动发布、数据追踪 |

**可扩展：** 通过添加 YAML 配置文件即可创建新的AI员工。

---

## 📖 使用示例

### Web UI 交互

1. 打开 http://localhost:8000
2. 在输入框输入："帮我做个科技热点视频"
3. 小助会自动调度团队完成任务

### CLI 模式

```bash
python main.py --cli

老板 > 帮我做个科技热点视频

⏳ 处理中...

【小助】好的老板！正在为您创建项目...

✅ 项目已创建: #proj_20260313_001

📡 正在召唤点子王获取热点...

【小点】老板好！为您分析当前科技热点：

🔥 热门热点：
1. GPT-5发布预告 (热度 98)
2. 苹果折叠屏专利 (热度 85)
3. 国产芯片突破 (热度 82)

💡 创意建议：
• 方向1: GPT-5科普解读
• 方向2: 折叠屏手机盘点
```

### Python API

```python
from soloflow.runner import SoloFlowRunner

# 初始化
runner = SoloFlowRunner(
    db_path="data/soloflow.db",
    agents_dir="soloflow/agents",
    api_key="sk-xxx"
)

# 分发任务
result = await runner.dispatch("帮我做个AI热点视频")
print(result)

# 查看状态
status = runner.get_status()
print(status)
```

---

## 🔧 高级配置

### 任务状态机

```python
from soloflow.fsm import TaskFSM, TaskStatus

fsm = TaskFSM()

# 创建任务
task = fsm.create(
    title="写科技视频脚本",
    description="写一个关于GPT-5的科普视频脚本",
    agent="writer"
)

# 状态转移
fsm.transition(task.id, TaskStatus.ASSIGNED)
fsm.transition(task.id, TaskStatus.RUNNING)
fsm.transition(task.id, TaskStatus.DONE, "脚本完成")

# 查看历史
history = fsm.get_history(task.id)
```

### 偏好记忆

```python
from soloflow.memory import PreferenceMemory

memory = PreferenceMemory()

# 添加偏好
memory.update(
    agent="editor",
    category="视频节奏",
    value="快节奏",
    evidence="老板说节奏太慢",
    delta=0.1
)

# 回忆偏好
prefs = memory.recall("editor")
# 自动注入到 Agent 的 system prompt
```

### 自定义 Agent

```yaml
# agents/custom_agent.yaml
name: custom_agent
alias: 自定义Agent
role: 你的专属助手
model: gpt-4o
temperature: 0.5
can_delegate: false

system_prompt: |
  你是「自定义Agent」...
  
skills:
  - name: custom_skill
    description: 自定义技能
```

---

## 📊 项目结构

```
ai-one-person-company/
├── soloflow/                 # 核心模块
│   ├── __init__.py
│   ├── fsm.py                # 任务状态机
│   ├── agent_loader.py       # Agent 加载器
│   ├── memory.py             # 偏好记忆系统
│   ├── runner.py             # 主运行器
│   └── web.py                # Web UI
│
├── agents/                   # Agent 配置
│   ├── base.yaml             # 公共配置
│   ├── assistant.yaml        # 小助 - 老板助理
│   ├── idea.yaml             # 小点 - 点子王
│   ├── writer.yaml           # 小文 - 文案师
│   ├── editor.yaml           # 小剪 - 剪辑师
│   └── publisher.yaml        # 小发 - 发布专家
│
├── tests/                    # 单元测试
│   ├── conftest.py           # pytest 配置
│   ├── test_fsm.py           # FSM 测试
│   ├── test_agent_loader.py  # Agent 加载测试
│   ├── test_memory.py        # 记忆系统测试
│   └── verify.py             # 快速验证脚本
│
├── docs/                     # 设计文档
│   ├── design思路.md
│   ├── 数据模型.md
│   ├── 工作流.md
│   └── ...
│
├── main.py                   # 入口
├── requirements.txt          # 依赖
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 📚 技术文档

- [产品设计思路](./docs/design思路.md) - 核心设计理念
- [数据模型](./docs/数据模型.md) - 完整的数据结构定义
- [工作流设计](./docs/工作流.md) - 任务执行流程
- [员工Prompt](./docs/员工Prompt.md) - 完整的Agent System Prompt
- [MCP Server设计](./docs/MCP服务器设计.md) - 业务逻辑封装
- [偏好学习算法](./docs/偏好学习算法.md) - 偏好提取与更新逻辑

---

## 🧪 测试

```bash
# 快速验证
python tests/verify.py

# pytest 单元测试
pip install pytest pytest-asyncio
pytest tests/ -v

# 测试覆盖
pytest tests/ --cov=soloflow --cov-report=html
```

---

## 🤝 贡献指南

欢迎贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详情。

### 开发流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范

- 遵循 PEP 8
- 添加类型注解
- 编写单元测试
- 更新文档

---

## 🗺️ 路线图

### v1.0.0 (当前)
- ✅ 核心框架（TaskFSM/AgentLoader/PreferenceMemory）
- ✅ 5 个 AI 员工配置
- ✅ Web UI + CLI 模式
- ✅ 单元测试
- ✅ Docker 部署

### v1.1.0 (计划中)
- [ ] 添加更多 Agent（素材师小材、营销专家小营）
- [ ] 集成真实 MCP Skills（搜索、文件处理）
- [ ] 接入国内模型（MiniMax、智谱AI）
- [ ] 微信/飞书 webhook 接口

### v2.0.0 (未来)
- [ ] 多用户支持
- [ ] 项目管理界面
- [ ] 数据分析面板
- [ ] 视频预览功能

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

## 🙏 致谢

- [paperclipai/paperclip](https://github.com/paperclipai/paperclip) - 灵感来源
- OpenAI - GPT API
- FastAPI - Web 框架
- SQLite - 轻量数据库

---

## 📞 联系方式

- **项目地址**: https://github.com/SonicBotMan/ai-one-person-company
- **问题反馈**: https://github.com/SonicBotMan/ai-one-person-company/issues
- **作者**: SonicBotMan

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/SonicBotMan">SonicBotMan</a>
</p>

<p align="center">
  <a href="https://github.com/SonicBotMan/ai-one-person-company/stargazers">
    <img src="https://img.shields.io/github/stars/SonicBotMan/ai-one-person-company?style=social" alt="Stars">
  </a>
  <a href="https://github.com/SonicBotMan/ai-one-person-company/network/members">
    <img src="https://img.shields.io/github/forks/SonicBotMan/ai-one-person-company?style=social" alt="Forks">
  </a>
</p>
