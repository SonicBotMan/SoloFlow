<p align="center">
  <img src="https://img.shields.io/badge/version-v1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/python-3.12+-green.svg" alt="Python">
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License">
  <img src="https://img.shields.io/badge/status-active-success.svg" alt="Status">
</p>

<h1 align="center">🎬 SoloFlow</h1>
<h3 align="center">AI-Powered One-Person Company Framework</h3>
<h4 align="center">Empowering Individuals with Complete AI Creative Teams</h4>

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-ai-employees">AI Employees</a> •
  <a href="#-documentation">Docs</a>
</p>

---

## 💡 Why SoloFlow?

**Traditional Approach:** Creating a video requires ideation → scriptwriting → sourcing → editing → publishing, needing at least 3-5 team members.

**SoloFlow Approach:** Just say "Make me an AI trending video," and the AI assistant automatically coordinates the team to complete all tasks.

```bash
Boss > Make me a tech trending video

【Xiao Zhu】Got it! Creating project...
📡 Calling the Idea Guy for trending topics...

【Xiao Dian】Hello Boss! Here's the tech trends:
🔥 Hot Topics:
1. GPT-5 Release Preview (Heat 98)
2. Apple Foldable Patent (Heat 85)
...

【Xiao Zhu】✅ Project completed! Video uploaded to TikTok
```

---

## 🌟 Key Features

### 1️⃣ **Single Entry Point**
- Only the assistant (Xiao Zhu) talks directly to users
- Other AI employees don't directly interact with users, ensuring simplicity
- Manage AI employees like managing a real team

### 2️⃣ **Task Loop Mechanism**
Each task has a complete workflow:
```
Understanding → Assignment → Execution → Report → Confirmation → Feedback
```

### 3️⃣ **Preference Learning System**
- Every feedback is automatically extracted as preference tags
- AI employees remember preferences and automatically apply them
- Confidence + time decay for smarter memory

```
Boss says: "Too slow"
→ Xiao Jian learns: Video Pace = Fast (Confidence 90%)

Next time, Xiao Jian will automatically apply this preference
```

### 4️⃣ **Zero-Dependency Deployment**
```bash
# Option 1: Docker Compose (Recommended)
docker compose up

# Option 2: Local
pip install -r requirements.txt
export OPENAI_API_KEY=sk-xxx
python main.py
```

### 5️⃣ **YAML-Driven Agents**
Customize AI employees without modifying code.

```yaml
# agents/writer.yaml
name: writer
alias: Xiao Wen
role: Copywriter
model: gpt-4o
temperature: 0.7

system_prompt: |
  You are Xiao Wen, the company's copywriter...
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.12+
- OpenAI API key (or compatible API)

### Option 1: Docker Compose (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/SonicBotMan/ai-one-person-company.git
cd ai-one-person-company

# 2. Configure API Key
cp .env.example .env
# Edit .env file and add your OPENAI_API_KEY

# 3. Start
docker compose up

# Open http://localhost:8000
```

### Option 2: Local Run

```bash
# 1. Clone the repo
git clone https://github.com/SonicBotMan/ai-one-person-company.git
cd ai-one-person-company

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
export OPENAI_API_KEY=sk-xxx

# 4. Start Web UI
python main.py

# Or start CLI mode
python main.py --cli
```

### Verify Installation

```bash
# Run test verification
python tests/verify.py

# Expected output:
# ✅ All tests passed!
```

---

## 🏗️ Architecture

### System Architecture

```
User (Boss)
  │
  ▼
┌──────────────────────────────────────────────────────┐
│                   SoloFlow Core                      │
│                                                      │
│  ┌─────────────┐    ┌──────────────────────────┐    │
│  │  CLI / Web  │───▶│    TaskFSM (State Engine) │    │
│  │  One Command│    │  pending→running→done     │    │
│  └─────────────┘    └──────────┬───────────────┘    │
│                                │                     │
│         ┌──────────────────────┼──────────────┐      │
│         ▼                      ▼              ▼      │
│  ┌─────────────┐  ┌──────────────────┐  ┌─────────┐ │
│  │ AgentLoader │  │  MemoryStore     │  │ Router  │ │
│  │ YAML-Driven │  │  SQLite + Vector │  │ Task    │ │
│  └─────────────┘  └──────────────────┘  └─────────┘ │
└──────────────────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────┐
   │           Agent Pool (Pluggable)         │
   │  Xiao Zhu (Dispatch) Xiao Dian (Trends) │
   │  Xiao Wen (Copy) Xiao Jian (Edit)       │
   │  Xiao Fa (Publish)                      │
   └─────────────────────────────────────────┘
```

### Core Modules

| Module | File | Description |
|--------|------|-------------|
| **Task State Machine** | `soloflow/fsm.py` | Lightweight task management (SQLite-based) |
| **Agent Loader** | `soloflow/agent_loader.py` | YAML-driven agent configuration |
| **Preference Memory** | `soloflow/memory.py` | Confidence + time decay memory |
| **Main Runner** | `soloflow/runner.py` | Task dispatch + execution |
| **Web UI** | `soloflow/web.py` | FastAPI web interface |

---

## 👥 AI Employees

| Alias | Role | Responsibility | Core Skills |
|-------|------|----------------|-------------|
| **Xiao Zhu** | Assistant | Main dispatch, single entry point | Intent understanding, task distribution, preference learning |
| **Xiao Dian** | Idea Guy | Trend analysis, creative ideation | Trend analysis, creative recommendations |
| **Xiao Wen** | Copywriter | Script writing, content creation | Content creation, style adaptation |
| **Xiao Jian** | Editor | Video editing, post-production | Video editing, effects |
| **Xiao Fa** | Publisher | Multi-platform publishing, analytics | Auto-publish, data tracking |

**Extensible:** Create new AI employees by adding YAML config files.

---

## 📖 Usage Examples

### Web UI Interaction

1. Open http://localhost:8000
2. Enter in the input box: "Make me a tech trending video"
3. Xiao Zhu will automatically coordinate the team to complete the task

### CLI Mode

```bash
python main.py --cli

Boss > Make me a tech trending video

⏳ Processing...

【Xiao Zhu】Got it! Creating project...

✅ Project created: #proj_20260313_001

📡 Calling the Idea Guy for trending topics...

【Xiao Dian】Hello Boss! Here's the tech trends:

🔥 Hot Topics:
1. GPT-5 Release Preview (Heat 98)
2. Apple Foldable Patent (Heat 85)
3. Domestic Chip Breakthrough (Heat 82)

💡 Creative Suggestions:
• Direction 1: GPT-5 Popular Science
• Direction 2: Foldable Phone Review
```

### Python API

```python
from soloflow.runner import SoloFlowRunner

# Initialize
runner = SoloFlowRunner(
    db_path="data/soloflow.db",
    agents_dir="soloflow/agents",
    api_key="sk-xxx"
)

# Dispatch task
result = await runner.dispatch("Make me an AI trending video")
print(result)

# Check status
status = runner.get_status()
print(status)
```

---

## 🔧 Advanced Configuration

### Task State Machine

```python
from soloflow.fsm import TaskFSM, TaskStatus

fsm = TaskFSM()

# Create task
task = fsm.create(
    title="Write tech video script",
    description="Write a popular science video about GPT-5",
    agent="writer"
)

# State transitions
fsm.transition(task.id, TaskStatus.ASSIGNED)
fsm.transition(task.id, TaskStatus.RUNNING)
fsm.transition(task.id, TaskStatus.DONE, "Script completed")

# View history
history = fsm.get_history(task.id)
```

### Preference Memory

```python
from soloflow.memory import PreferenceMemory

memory = PreferenceMemory()

# Add preference
memory.update(
    agent="editor",
    category="Video Pace",
    value="Fast",
    evidence="Boss said it's too slow",
    delta=0.1
)

# Recall preferences (auto-injected into agent prompt)
prefs = memory.recall("editor")
# [{'category': 'Video Pace', 'value': 'Fast', 'confidence': 0.6}]
```

---

## 📁 Project Structure

```
ai-one-person-company/
├── soloflow/                 # Core modules
│   ├── fsm.py               # Task state machine
│   ├── agent_loader.py      # Agent loader
│   ├── memory.py            # Preference memory
│   ├── runner.py            # Main runner
│   └── web.py               # Web UI
│
├── agents/                   # Agent configs
│   ├── base.yaml             # Common config
│   ├── assistant.yaml        # Xiao Zhu - Assistant
│   ├── idea.yaml             # Xiao Dian - Idea Guy
│   ├── writer.yaml           # Xiao Wen - Copywriter
│   ├── editor.yaml           # Xiao Jian - Editor
│   └── publisher.yaml        # Xiao Fa - Publisher
│
├── tests/                    # Unit tests
│   ├── conftest.py           # pytest config
│   ├── test_fsm.py           # FSM tests
│   ├── test_agent_loader.py  # Agent loader tests
│   ├── test_memory.py        # Memory system tests
│   └── verify.py             # Quick verification script
│
├── docs/                     # Design docs
│   ├── design思路.md
│   ├── 数据模型.md
│   ├── 工作流.md
│   └── ...
│
├── main.py                   # Entry point
├── requirements.txt          # Dependencies
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 📚 Documentation

- [Design Philosophy](./docs/design思路.md) - Core design concepts
- [Data Model](./docs/数据模型.md) - Complete data structure definitions
- [Workflow Design](./docs/工作流.md) - Task execution flow
- [Employee Prompts](./docs/员工Prompt.md) - Complete Agent System Prompts
- [MCP Server Design](./docs/MCP服务器设计.md) - Business logic encapsulation
- [Preference Learning Algorithm](./docs/偏好学习算法.md) - Preference extraction and update logic

---

## 🧪 Testing

```bash
# Quick verification
python tests/verify.py

# pytest unit tests
pip install pytest pytest-asyncio
pytest tests/ -v

# Test coverage
pytest tests/ --cov=soloflow --cov-report=html
```

---

## 🤝 Contributing

Contributions are welcome! Please check [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repo
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Create Pull Request

### Code Standards

- Follow PEP 8
- Add type annotations
- Write unit tests
- Update documentation

---

## 🗺️ Roadmap

### v1.0.0 (Current)
- ✅ Core framework (TaskFSM/AgentLoader/PreferenceMemory)
- ✅ 5 AI employee configs
- ✅ Web UI + CLI mode
- ✅ Unit tests
- ✅ Docker deployment

### v1.1.0 (Planned)
- [ ] Add more agents (Material Specialist, Marketing Expert)
- [ ] Integrate real MCP Skills (search, file processing)
- [ ] Support domestic models (MiniMax, Zhipu AI)
- [ ] WeChat/Feishu webhook integration

### v2.0.0 (Future)
- [ ] Multi-user support
- [ ] Project management interface
- [ ] Data analytics dashboard
- [ ] Video preview functionality

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [paperclipai/paperclip](https://github.com/paperclipai/paperclip) - Inspiration
- OpenAI - GPT API
- FastAPI - Web framework
- SQLite - Lightweight database

---

## 📞 Contact

- **Project URL**: https://github.com/SonicBotMan/ai-one-person-company
- **Issue Tracker**: https://github.com/SonicBotMan/ai-one-person-company/issues
- **Author**: SonicBotMan

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
