"""
SoloFlow Web UI - FastAPI 实现

提供:
- REST API
- Web 聊天界面
- 任务管理界面
- 偏好管理界面
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
import asyncio

from .runner import SoloFlowRunner
from .fsm import TaskStatus


# ============ FastAPI App ============

app = FastAPI(
    title="SoloFlow - AI一人公司",
    description="基于任务流水线的AI一人公司框架",
    version="1.0.0"
)

# 全局运行器实例
_runner: Optional[SoloFlowRunner] = None


def get_runner() -> SoloFlowRunner:
    """获取运行器实例"""
    global _runner
    if _runner is None:
        _runner = SoloFlowRunner()
    return _runner


# ============ API Models ============

class ChatRequest(BaseModel):
    """聊天请求"""
    message: str
    user_id: str = "boss"


class ChatResponse(BaseModel):
    """聊天响应"""
    result: str
    tasks_created: int = 0


class FeedbackRequest(BaseModel):
    """反馈请求"""
    task_id: str
    feedback: str
    extract_preferences: bool = True


class PreferenceUpdate(BaseModel):
    """偏好更新请求"""
    agent: str
    category: str
    value: str
    confidence: float
    evidence: str = "手动设置"


# ============ API Endpoints ============

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """聊天主入口"""
    runner = get_runner()
    
    try:
        result = await runner.dispatch(request.message, request.user_id)
        return ChatResponse(result=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """SSE 流式聊天接口
    
    返回 Server-Sent Events 流：
    - type: "task_start" | "task_progress" | "task_done" | "flow_done"
    - data: 任务进度信息
    """
    from fastapi.responses import StreamingResponse
    import json as json_mod
    
    runner = get_runner()
    
    async def event_generator():
        try:
            # 先发一个开始事件
            yield f"data: {json_mod.dumps({'type': 'flow_start', 'message': request.message})}\n\n"
            
            result = await runner.dispatch(request.message, request.user_id)
            
            # 逐步发送任务结果
            if isinstance(result, dict) and "tasks" in result:
                for task in result["tasks"]:
                    yield f"data: {json_mod.dumps({'type': 'task_done', 'agent': task.get('agent'), 'alias': task.get('alias'), 'result': task.get('result', '')[:200]}, ensure_ascii=False)}\n\n"
            
            # 最终结果
            yield f"data: {json_mod.dumps({'type': 'flow_done', 'result': result}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json_mod.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.get("/api/tasks")
def list_tasks(status: str = None):
    """列出任务"""
    runner = get_runner()
    
    if status:
        try:
            task_status = TaskStatus(status)
            tasks = runner.fsm.list_by_status(task_status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    else:
        tasks = runner.fsm.list_pending()
    
    return [t.to_dict() for t in tasks]


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str):
    """获取任务详情"""
    runner = get_runner()
    
    try:
        task = runner.fsm.get(task_id)
        history = runner.fsm.get_history(task_id)
        
        result = task.to_dict()
        result["history"] = history
        
        return result
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")


@app.post("/api/feedback")
async def provide_feedback(request: FeedbackRequest):
    """提供反馈"""
    runner = get_runner()
    
    try:
        await runner.provide_feedback(
            request.task_id,
            request.feedback,
            request.extract_preferences
        )
        return {"status": "ok"}
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Task {request.task_id} not found")


@app.get("/api/agents")
def list_agents():
    """列出所有 Agent"""
    runner = get_runner()
    return runner.loader.list_agents()


@app.get("/api/preferences")
def get_preferences(agent: str = None):
    """获取偏好"""
    runner = get_runner()
    return runner.memory.get_all_preferences(agent)


@app.post("/api/preferences")
def update_preference(pref: PreferenceUpdate):
    """手动更新偏好"""
    runner = get_runner()
    runner.memory.manual_update(
        pref.agent,
        pref.category,
        pref.value,
        pref.confidence,
        pref.evidence
    )
    return {"status": "ok"}


@app.delete("/api/preferences")
def delete_preference(agent: str, category: str, value: str):
    """删除偏好"""
    runner = get_runner()
    runner.memory.delete_preference(agent, category, value)
    return {"status": "ok"}


@app.get("/api/status")
def get_status():
    """获取系统状态"""
    runner = get_runner()
    return runner.get_status()


# ============ Web UI ============

@app.get("/", response_class=HTMLResponse)
def index():
    """Web 主页"""
    return """
<!DOCTYPE html>
<html>
<head>
    <title>SoloFlow - AI一人公司</title>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        .container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .panel {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .chat-panel {
            grid-column: 1 / -1;
        }
        h2 {
            margin-top: 0;
            color: #333;
        }
        textarea {
            width: 100%;
            height: 100px;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            resize: vertical;
        }
        button {
            background: #667eea;
            color: white;
            padding: 10px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
        }
        button:hover {
            background: #5568d3;
        }
        button.secondary {
            background: #6c757d;
        }
        #output {
            white-space: pre-wrap;
            background: #f8f9fa;
            padding: 16px;
            border-radius: 8px;
            min-height: 200px;
            margin-top: 16px;
            font-size: 14px;
            line-height: 1.6;
        }
        .task-list {
            list-style: none;
            padding: 0;
        }
        .task-item {
            padding: 12px;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            margin-bottom: 8px;
        }
        .status {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .status.pending { background: #ffeaa7; color: #856404; }
        .status.running { background: #74b9ff; color: #004085; }
        .status.done { background: #00b894; color: white; }
        .status.failed { background: #d63031; color: white; }
        .agents {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px;
        }
        .agent-card {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }
        .agent-name {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 4px;
        }
        .agent-role {
            font-size: 12px;
            color: #666;
        }
        @media (max-width: 768px) {
            .container {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎬 SoloFlow - AI一人公司</h1>
        <p>让一个人也能拥有完整的AI创作团队</p>
    </div>
    
    <div class="container">
        <div class="panel chat-panel">
            <h2>💬 对话</h2>
            <textarea id="input" placeholder="老板，请输入您的创作需求..."></textarea>
            <button onclick="send()">发送给小助</button>
            <button class="secondary" onclick="clearOutput()">清空</button>
            <div id="output">等待您的指令...</div>
        </div>
        
        <div class="panel">
            <h2>📋 任务列表</h2>
            <ul class="task-list" id="taskList">
                <li>加载中...</li>
            </ul>
        </div>
        
        <div class="panel">
            <h2>👥 AI员工团队</h2>
            <div class="agents" id="agentList">
                <div class="agent-card">加载中...</div>
            </div>
        </div>
    </div>
    
    <script>
        async function send() {
            const msg = document.getElementById('input').value;
            if (!msg.trim()) return;
            
            document.getElementById('output').textContent = '⏳ 处理中...';
            
            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({message: msg})
                });
                
                const data = await res.json();
                document.getElementById('output').textContent = data.result;
                
                // 刷新任务列表
                loadTasks();
            } catch (e) {
                document.getElementById('output').textContent = '❌ 错误: ' + e.message;
            }
        }
        
        function clearOutput() {
            document.getElementById('output').textContent = '等待您的指令...';
            document.getElementById('input').value = '';
        }
        
        async function loadTasks() {
            try {
                const res = await fetch('/api/tasks?status=pending');
                const tasks = await res.json();
                
                const list = document.getElementById('taskList');
                if (tasks.length === 0) {
                    list.innerHTML = '<li>暂无任务</li>';
                    return;
                }
                
                list.innerHTML = tasks.map(t => `
                    <li class="task-item">
                        <div><strong>${t.title}</strong></div>
                        <div>
                            <span class="status ${t.status}">${t.status}</span>
                            <small style="margin-left: 8px">${t.agent}</small>
                        </div>
                    </li>
                `).join('');
            } catch (e) {
                console.error('加载任务失败', e);
            }
        }
        
        async function loadAgents() {
            try {
                const res = await fetch('/api/agents');
                const agents = await res.json();
                
                const list = document.getElementById('agentList');
                list.innerHTML = agents.map(a => `
                    <div class="agent-card">
                        <div class="agent-name">${a.alias}</div>
                        <div class="agent-role">${a.role}</div>
                    </div>
                `).join('');
            } catch (e) {
                console.error('加载Agent失败', e);
            }
        }
        
        // 初始化
        loadTasks();
        loadAgents();
        
        // Enter 发送
        document.getElementById('input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
    </script>
</body>
</html>
    """


# ============ Lifecycle ============

@app.on_event("startup")
async def startup():
    """启动时初始化"""
    print("🚀 SoloFlow 启动中...")
    get_runner()
    print("✅ SoloFlow 已启动")


@app.on_event("shutdown")
async def shutdown():
    """关闭时清理"""
    print("👋 SoloFlow 关闭中...")
    runner = get_runner()
    runner.close()
    print("✅ SoloFlow 已关闭")
