# 🛠️ MCP服务器设计

## 一、概述

MCP (Model Context Protocol) Server 是AI一人公司的核心业务逻辑封装，提供统一的数据操作接口。

## 二、工具定义

### 2.1 项目管理

```javascript
{
  tool: "create_project",
  description: "创建新项目",
  inputSchema: {
    type: "object",
    properties: {
      name: { 
        type: "string", 
        description: "项目名称" 
      },
      type: { 
        type: "string", 
        enum: ["hot_video", "creative_video", "product_video", "image_series", "other"],
        description: "项目类型"
      },
      requirement: { 
        type: "string", 
        description: "老板需求" 
      }
    },
    required: ["name", "requirement"]
  }
}
```

```javascript
{
  tool: "get_project",
  description: "获取项目详情",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" }
    }
  }
}
```

```javascript
{
  tool: "list_projects",
  description: "列出所有项目",
  inputSchema: {
    type: "object",
    properties: {
      status: { 
        type: "string",
        enum: ["draft", "planning", "executing", "reviewing", "completed", "rejected"]
      },
      limit: { 
        type: "number", 
        default: 10 
      }
    }
  }
}
```

```javascript
{
  tool: "update_project_status",
  description: "更新项目状态",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      status: { type: "string" },
      boss_approved: { type: "boolean" },
      boss_comment: { type: "string" }
    }
  }
}
```

### 2.2 任务管理

```javascript
{
  tool: "create_task",
  description: "创建任务",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      employee_role: { 
        type: "string",
        enum: ["ideator", "copywriter", "material", "editor", "marketer", "publisher"]
      },
      name: { type: "string" },
      description: { type: "string" },
      requirement: { type: "string" },
      depends_on: { type: "array", items: { type: "string" } }
    },
    required: ["project_id", "employee_role", "name", "requirement"]
  }
}
```

```javascript
{
  tool: "get_task",
  description: "获取任务详情",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" }
    }
  }
}
```

```javascript
{
  tool: "update_task_status",
  description: "更新任务状态",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      status: { 
        type: "string",
        enum: ["pending", "assigned", "in_progress", "completed", "waiting_review", "rejected", "blocked"]
      },
      result: { type: "string" },
      output_files: { type: "array", items: { type: "string" } }
    }
  }
}
```

```javascript
{
  tool: "get_project_tasks",
  description: "获取项目所有任务",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" }
    }
  }
}
```

### 2.3 员工管理

```javascript
{
  tool: "get_employee",
  description: "获取员工信息",
  inputSchema: {
    type: "object",
    properties: {
      role: { 
        type: "string",
        enum: ["ideator", "copywriter", "material", "editor", "marketer", "publisher"]
      }
    }
  }
}
```

```javascript
{
  tool: "list_employees",
  description: "列出所有员工"
}
```

```javascript
{
  tool: "get_employee_status",
  description: "获取员工当前状态",
  inputSchema: {
    type: "object",
    properties: {
      role: { type: "string" }
    }
  }
}
```

### 2.4 偏好管理

```javascript
{
  tool: "record_feedback",
  description: "记录老板反馈",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      task_id: { type: "string" },
      employee_role: { type: "string" },
      content: { type: "string" },
      sentiment: { 
        type: "string",
        enum: ["positive", "negative", "neutral"]
      }
    },
    required: ["project_id", "task_id", "employee_role", "content"]
  }
}
```

```javascript
{
  tool: "get_employee_preferences",
  description: "获取员工对老板偏好的理解",
  inputSchema: {
    type: "object",
    properties: {
      role: { type: "string" }
    }
  }
}
```

```javascript
{
  tool: "get_all_preferences",
  description: "获取老板全部偏好"
}
```

```javascript
{
  tool: "update_explicit_preference",
  description: "更新老板显式偏好",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string" },
      value: { type: "string" }
    }
  }
}
```

### 2.5 交付管理

```javascript
{
  tool: "add_deliverable",
  description: "添加交付物",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      task_id: { type: "string" },
      type: { 
        type: "string",
        enum: ["video", "image", "text", "audio"]
      },
      url: { type: "string" },
      description: { type: "string" }
    }
  }
}
```

```javascript
{
  tool: "approve_deliverable",
  description: "验收交付物",
  inputSchema: {
    type: "object",
    properties: {
      deliverable_id: { type: "string" },
      approved: { type: "boolean" },
      comment: { type: "string" }
    }
  }
}
```

---

## 三、服务端实现

```javascript
// one-person-company/server.js
const { MCPServer } = require('mcporter');

class OnePersonCompanyServer extends MCPServer {
  constructor() {
    super({
      name: 'one-person-company',
      version: '1.0.0'
    });
    
    this.tools = this.defineTools();
    this.memory = new MemoryStore();
  }
  
  defineTools() {
    return {
      // 项目管理
      create_project: this.createProject.bind(this),
      get_project: this.getProject.bind(this),
      list_projects: this.listProjects.bind(this),
      update_project_status: this.updateProjectStatus.bind(this),
      
      // 任务管理
      create_task: this.createTask.bind(this),
      get_task: this.getTask.bind(this),
      update_task_status: this.updateTaskStatus.bind(this),
      get_project_tasks: this.getProjectTasks.bind(this),
      
      // 员工管理
      get_employee: this.getEmployee.bind(this),
      list_employees: this.listEmployees.bind(this),
      get_employee_status: this.getEmployeeStatus.bind(this),
      
      // 偏好管理
      record_feedback: this.recordFeedback.bind(this),
      get_employee_preferences: this.getEmployeePreferences.bind(this),
      get_all_preferences: this.getAllPreferences.bind(this),
      update_explicit_preference: this.updateExplicitPreference.bind(this),
      
      // 交付管理
      add_deliverable: this.addDeliverable.bind(this),
      approve_deliverable: this.approveDeliverable.bind(this)
    };
  }
  
  // 实现各个方法...
}

module.exports = OnePersonCompanyServer;
```

---

## 四、使用示例

### 4.1 创建项目

```javascript
// 主Agent调用
const project = await mcporter.call('one-person-company.create_project', {
  name: 'GPT-5科普视频',
  type: 'hot_video',
  requirement: '帮我做个GPT-5的热点视频'
});

console.log(project.id); // proj_20260305_001
```

### 4.2 记录反馈

```javascript
// 偏好学习
await mcporter.call('one-person-company.record_feedback', {
  project_id: 'proj_20260305_001',
  task_id: 'task_003',
  employee_role: 'editor',
  content: '这个转场太生硬了，用点平滑过渡',
  sentiment: 'negative'
});
```

### 4.3 查询员工偏好

```javascript
// 获取剪辑师对老板偏好的理解
const prefs = await mcporter.call('one-person-company.get_employee_preferences', {
  role: 'editor'
});

console.log(prefs);
// {
//   learned: [
//     { tag: '转场', value: '平滑过渡', confidence: 0.6 },
//     { tag: '节奏', value: '快节奏', confidence: 0.8 }
//   ]
// }
```
