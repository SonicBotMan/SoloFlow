# SoloFlow v1.0.0 发布说明

## 📦 发布信息

- **版本**: v1.0.0
- **日期**: 2026-03-13
- **Issue**: #2 - SoloFlow 框架实现
- **提交**: 75e9a9e

## ✨ 新增功能

### 核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 任务状态机 | `soloflow/fsm.py` | SQLite 存储，支持 PENDING→ASSIGNED→RUNNING→DONE 状态转移 |
| Agent 加载器 | `soloflow/agent_loader.py` | YAML 配置驱动，支持热重载 |
| 偏好记忆 | `soloflow/memory.py` | 置信度+时间衰减，贝叶斯更新 |
| 主运行器 | `soloflow/runner.py` | 任务分发、偏好注入、执行 |
| Web UI | `soloflow/web.py` | FastAPI + 聊天界面 |
| 入口 | `main.py` | CLI/Web 双模式 |

### AI 员工配置

| 花名 | 角色 | 职责 |
|------|------|------|
| 小助 | 老板助理 | 唯一对话入口、任务分发、偏好学习 |
| 小点 | 点子王 | 热点分析、创意构思 |
| 小文 | 文案师 | 脚本撰写、文案创作 |
| 小剪 | 剪辑师 | 视频剪辑、后期制作 |
| 小发 | 发布专家 | 多平台发布、数据追踪 |

### 部署支持

- `Dockerfile` - Docker 镜像构建
- `docker-compose.yml` - 一键部署
- `requirements.txt` - Python 依赖
- `.env.example` - 环境变量模板

## 🔧 技术特性

### 1. 零依赖部署

```bash
# 方式1: Docker Compose（推荐）
docker compose up

# 方式2: 本地运行
pip install -r requirements.txt
export OPENAI_API_KEY=sk-xxx
python main.py
```

### 2. 任务状态机

```python
from soloflow.fsm import TaskFSM, TaskStatus

fsm = TaskFSM()
task = fsm.create("写科技视频脚本", description="...", agent="writer")
fsm.transition(task.id, TaskStatus.RUNNING)
fsm.transition(task.id, TaskStatus.DONE, "脚本完成")
```

### 3. 偏好学习系统

```python
from soloflow.memory import PreferenceMemory

memory = PreferenceMemory()
memory.update("editor", "视频节奏", "快节奏", "老板说节奏太慢", delta=0.1)
prefs = memory.recall("editor")  # 自动注入到 Agent prompt
```

### 4. YAML 驱动 Agent

```yaml
# agents/writer.yaml
name: writer
alias: 小文
role: 文案师
model: gpt-4o
temperature: 0.7
system_prompt: |
  你是「小文」...
```

## ✅ 验证结果

### 语法验证
```bash
python3 -m py_compile soloflow/*.py main.py
✅ 通过
```

### 导入验证
```python
from soloflow import TaskFSM, AgentLoader, PreferenceMemory, SoloFlowRunner
✅ 通过
```

### 行为验证
```python
# TaskFSM 测试
fsm = TaskFSM(':memory:')
task = fsm.create('test', 'desc')
fsm.transition(task.id, TaskStatus.DONE)
✅ 通过

# AgentLoader 测试
loader = AgentLoader()
agents = loader.all()  # 加载 5 个 Agent
✅ 通过

# PreferenceMemory 测试
memory = PreferenceMemory(':memory:')
memory.update('assistant', 'test', 'value', 'evidence', 0.1)
prefs = memory.recall('assistant')
✅ 通过
```

### 回归验证
- ✅ 没有修改原有 `docs/` 文档
- ✅ 没有破坏性改动
- ✅ 改动量：2262 行新增，1 行删除

## 📊 代码统计

| 指标 | 数值 |
|------|------|
| 新增文件 | 18 |
| 修改文件 | 1 |
| 新增代码 | 2262 行 |
| 删除代码 | 1 行 |
| Python 文件 | 6 |
| YAML 文件 | 6 |
| 配置文件 | 6 |

## 🚀 快速开始

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

## 📝 待办事项

- [ ] 添加更多 Agent（素材师小材、营销专家小营）
- [ ] 集成实际 MCP Skills（搜索、文件处理等）
- [ ] 添加单元测试覆盖
- [ ] 接入国内模型（MiniMax、智谱AI）
- [ ] 添加微信/飞书 webhook 接口

## 🔗 相关链接

- **Issue**: https://github.com/SonicBotMan/ai-one-person-company/issues/2
- **Commit**: https://github.com/SonicBotMan/ai-one-person-company/commit/75e9a9e
- **设计文档**: [docs/](./docs/)

---

**遵守 GitHub Development Standard**
- ✅ Step 1: 读 issue
- ✅ Step 2: 写5行任务卡
- ✅ Step 3: 确定基线版本
- ✅ Step 4: 列改动点
- ✅ Step 5: 编码
- ✅ Step 6: 本地验证（4层测试）
- ✅ Step 7: 看 diff
- ✅ Step 8: 写发布说明
- ⏭️ Step 9: 复盘
