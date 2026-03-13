# MCP 集成指南

SoloFlow v2.1 完整支持 **Model Context Protocol (MCP)**，让你的 AI Agent 能够接入任意外部工具服务器。

## 什么是 MCP？

MCP 是 Anthropic 推出的开放协议，标准化了 LLM 与外部工具的交互方式。
主要优势：
- **标准化**：一套协议接入所有工具
- **丰富生态**：数百个现成的 MCP Server 可直接使用
- **安全**：工具运行在独立进程，与 LLM 隔离

## 支持的传输层

| 传输层 | 适用场景 | 示例 |
|--------|---------|------|
| `stdio` | 本地命令行工具 | `npx @modelcontextprotocol/server-filesystem` |
| `sse` | 远程 HTTP 服务器 | 自托管的 MCP 服务 |
| `http` | HTTP streamable（新协议） | 新版 MCP 服务 |

## 快速接入

### 1. 在 Agent YAML 中配置 MCP Driver

```yaml
name: my_agent
alias: 小智
role: 配备工具的智能助手

driver: mcp
driver_config:
  max_tool_rounds: 15  # 最多工具调用轮数
  servers:
    # 文件系统工具
    - name: filesystem
      transport: stdio
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    
    # GitHub 工具
    - name: github
      transport: stdio  
      command: npx
      args: ["-y", "@modelcontextprotocol/server-github"]
      env:
        GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}"
    
    # 远程 MCP 服务
    - name: search_api
      transport: sse
      url: http://your-mcp-server:3100/sse
      headers:
        Authorization: "Bearer ${API_KEY}"
      timeout: 60
```

### 2. 环境变量解析

driver_config 中的 `${VAR_NAME}` 会自动从系统环境变量解析：

```bash
export GITHUB_TOKEN=ghp_xxx
export API_KEY=sk_xxx
```

### 3. 工具命名规则

MCP 工具名称格式为 `server_name__tool_name`，例如：
- `filesystem__read_file`
- `github__create_issue`
- `search_api__web_search`

这样可以避免不同 server 的工具名冲突。

## Skill Registry 集成

除了 MCP，还可以通过 **SkillRegistry** 注册自定义 Python 函数为工具：

```python
from soloflow.skill_registry import skill, SkillRegistry

# 方式 1: 装饰器注册
@skill(name="send_email", description="发送邮件")
async def send_email(to: str, subject: str, body: str) -> str:
    # 实现邮件发送逻辑
    return f"邮件已发送至 {to}"

# 方式 2: 注册 HTTP Skill
registry = SkillRegistry.get_instance()
registry.register_http(
    name="weather_api",
    url="https://api.weather.com/v1/current",
    method="GET",
    description="获取天气信息",
    parameters={
        "type": "object",
        "properties": {
            "city": {"type": "string", "description": "城市名称"}
        },
        "required": ["city"]
    }
)
```

然后在 Agent YAML 的 `skills` 列表中声明即可使用：

```yaml
skills:
  - name: send_email
    description: 发送邮件
  - name: weather_api  
    description: 查询天气
```

## 常用 MCP Servers

| Server | 安装 | 功能 |
|--------|------|------|
| `@modelcontextprotocol/server-filesystem` | `npx -y @modelcontextprotocol/server-filesystem /path` | 读写文件 |
| `@modelcontextprotocol/server-github` | `npx -y @modelcontextprotocol/server-github` | GitHub API |
| `@modelcontextprotocol/server-brave-search` | `npx -y @modelcontextprotocol/server-brave-search` | Brave 搜索 |
| `@modelcontextprotocol/server-postgres` | `npx -y @modelcontextprotocol/server-postgres` | PostgreSQL |
| `@modelcontextprotocol/server-slack` | `npx -y @modelcontextprotocol/server-slack` | Slack 消息 |

> 完整列表见 [MCP Server 仓库](https://github.com/modelcontextprotocol/servers)

## 架构图

```
用户请求
    │
    ▼
 FlowEngine.dispatch()
    │
    ├── 规划 (assistant → LLM)
    │
    └── 执行任务
         │
         ├── LLMDriver ←→ SkillRegistry (内置函数/HTTP)
         │
         ├── MCPDriver ←→ MCP Server 1 (stdio/sse)
         │             ←→ MCP Server 2 (stdio/sse)
         │
         └── OpenClawDriver ←→ OpenClaw 平台
```

## 注意事项

1. **stdio MCP** 需要 Node.js 环境（npx 命令）
2. **SSE MCP** 需要 `httpx` 库：`pip install httpx`
3. 工具调用轮数默认最多 10 轮，可通过 `max_tool_rounds` 调整
4. 生产环境建议为 MCP Server 配置超时时间
