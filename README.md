# SoloFlow 🎬

**AI 驱动的一人公司框架** —— 用 AI Agent 自动完成短视频内容创作全流程。

## 架构

```
用户需求
    ↓
FlowEngine（调度引擎）
    ├── Assistant Agent（理解需求，拆解任务）
    ├── Scriptwriter Agent（写脚本）
    ├── Visual Agent（生图/分镜）
    ├── Editor Agent（剪辑合成）
    └── Publisher Agent（发布）
    
数据流：
    FSM（SQLite）→ 任务状态追踪
    ContextBus → 任务间数据传递
    PreferenceMemory → 用户偏好学习
    Driver层 → LLM / MCP / OpenClaw / Skill
```

## 核心特性

- **通用 Flow 引擎**：不硬编码领域知识，通过 Agent YAML 配置任意工作流
- **并行任务执行**：无依赖关系的任务自动并行（asyncio.gather）
- **自动重试**：任务失败自动重试（默认2次）
- **4 种 Driver**：LLM（OpenAI 兼容）/ MCP / OpenClaw / Skill
- **状态机 FSM**：SQLite 持久化，完整状态转移日志
- **偏好记忆**：贝叶斯置信度 + 时间衰减，越用越懂你
- **ContextBus**：任务间数据自动传递

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 设置 API Key（支持 OpenAI 兼容接口）
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://open.bigmodel.cn/api/paas/v4"  # 可选：用国内模型

# 运行
python main.py "帮我做一条关于AI编程的短视频"
```

## Agent 配置

在 `soloflow/agents/` 目录下添加 YAML 文件即可扩展：

```yaml
name: scriptwriter
alias: 编剧小美
role: 专职编剧
model: glm-4-flash  # 或从环境变量读取
driver: llm
system_prompt: |
  你是一名专业短视频编剧...
skills:
  - name: search_hot_topics
    description: 搜索当前热点
```

## Driver 类型

| Driver | 说明 | 适用场景 |
|--------|------|---------|
| `llm` | OpenAI 兼容接口 | 文本生成、规划 |
| `mcp` | MCP 协议 | 调用外部工具 |
| `openclaw` | OpenClaw 实例 | 完整 Agent 能力 |
| `skill` | 内置 Skill | 特定领域处理 |

## 项目结构

```
soloflow/
├── __init__.py
├── flow_engine.py    # 核心引擎（并行+重试）
├── fsm.py            # SQLite 状态机
├── context_bus.py    # 任务间数据传递
├── memory.py         # 偏好记忆（贝叶斯）
├── logger.py         # 统一日志
├── agent_loader.py   # YAML 配置加载
├── skill_registry.py # Skill 注册
├── agents/           # Agent YAML 配置
│   ├── base.yaml
│   ├── assistant.yaml
│   └── ...
└── drivers/          # Driver 实现
    ├── base.py
    ├── llm_driver.py
    ├── mcp_driver.py
    ├── openclaw_driver.py
    └── skill_driver.py
```

## License

MIT
