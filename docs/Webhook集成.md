# Webhook 集成指南

SoloFlow 支持 Webhook 通知，可将任务状态推送到企业协作平台。

---

## 📋 支持的平台

| 平台 | Webhook 类型 | 特性 |
|------|-------------|------|
| **企业微信** | 群机器人 | @所有人、Markdown |
| **钉钉** | 群机器人 | @手机号、Markdown |
| **飞书** | 群机器人 | 富文本、卡片 |
| **Slack** | Incoming Webhook | Blocks、Attachments |
| **Discord** | Webhook | Embeds、Markdown |
| **通用** | POST JSON | 自定义格式 |

---

## 🚀 快速配置

### 企业微信机器人

1. **创建机器人**
   - 在企业微信群中，点击「...」→「群机器人」→「添加机器人」
   - 复制 Webhook URL

2. **配置 SoloFlow**
   ```python
   from soloflow.webhook import WebhookSender, WebhookConfig
   
   sender = WebhookSender()
   await sender.init()
   
   # 添加企业微信 Webhook
   sender.add_webhook(WebhookConfig(
       name="wecom-alerts",
       webhook_url="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY",
       platform="wecom",
       enabled=True
   ))
   ```

3. **发送通知**
   ```python
   await sender.send("wecom-alerts", "项目完成！", mention_all=True)
   ```

### 钉钉机器人

1. **创建机器人**
   - 群设置 → 智能群助手 → 添加机器人 → 自定义
   - 安全设置选择「自定义关键词」（如：SoloFlow）

2. **配置 SoloFlow**
   ```python
   sender.add_webhook(WebhookConfig(
       name="dingtalk-alerts",
       webhook_url="https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN",
       platform="dingtalk",
       enabled=True
   ))
   ```

3. **发送通知**
   ```python
   await sender.send("dingtalk-alerts", "SoloFlow: 任务完成")
   ```

### 飞书机器人

1. **创建机器人**
   - 群设置 → 群机器人 → 添加机器人 → 自定义机器人
   - 复制 Webhook URL

2. **配置 SoloFlow**
   ```python
   sender.add_webhook(WebhookConfig(
       name="feishu-alerts",
       webhook_url="https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK",
       platform="feishu",
       enabled=True
   ))
   ```

3. **发送通知**
   ```python
   await sender.send("feishu-alerts", "任务完成通知")
   ```

### Slack Webhook

1. **创建 Webhook**
   - 访问 https://api.slack.com/apps
   - 创建 App → Incoming Webhooks → Add New Webhook to Workspace

2. **配置 SoloFlow**
   ```python
   sender.add_webhook(WebhookConfig(
       name="slack-alerts",
       webhook_url="https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
       platform="slack",
       enabled=True
   ))
   ```

3. **发送通知**
   ```python
   await sender.send("slack-alerts", "Project completed!")
   ```

### Discord Webhook

1. **创建 Webhook**
   - 服务器设置 → 整合 → Webhooks → 新建 Webhook

2. **配置 SoloFlow**
   ```python
   sender.add_webhook(WebhookConfig(
       name="discord-alerts",
       webhook_url="https://discord.com/api/webhooks/YOUR_WEBHOOK",
       platform="discord",
       enabled=True
   ))
   ```

3. **发送通知**
   ```python
   await sender.send("discord-alerts", "Project done!")
   ```

---

## 💡 使用场景

### 1. 项目完成通知

```python
from soloflow.webhook import notify_project_complete

# 项目完成后发送通知
await notify_project_complete(
    project_name="科技热点视频 #1",
    video_url="https://www.douyin.com/video/123456"
)
```

**通知内容：**
```
🎬 项目完成通知

项目: 科技热点视频 #1
状态: ✅ 已完成
视频: https://www.douyin.com/video/123456

请及时查看并反馈。
```

### 2. 任务分配通知

```python
from soloflow.webhook import notify_task_assigned

# 任务分配后发送通知
await notify_task_assigned(
    task_name="撰写 GPT-5 科普脚本",
    assignee="小文"
)
```

**通知内容：**
```
📋 任务分配通知

任务: 撰写 GPT-5 科普脚本
分配给: 小文
状态: 🔄 进行中

请及时处理。
```

### 3. 自定义通知

```python
sender = WebhookSender()
await sender.init()

# 添加多个 Webhook
sender.add_webhook(WebhookConfig(
    name="wecom-team",
    webhook_url="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=KEY1",
    platform="wecom"
))

sender.add_webhook(WebhookConfig(
    name="dingtalk-team",
    webhook_url="https://oapi.dingtalk.com/robot/send?access_token=TOKEN",
    platform="dingtalk"
))

# 发送到所有 Webhook
results = await sender.send_all("📢 重要通知：老板有新需求！")

print(results)
# {'wecom-team': True, 'dingtalk-team': True}
```

---

## 🔧 高级配置

### 环境变量配置

```bash
# .env 文件
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=KEY
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=TOKEN
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/HOOK
```

### 代码加载

```python
import os
from soloflow.webhook import WebhookSender, WebhookConfig

sender = WebhookSender()
await sender.init()

# 从环境变量加载
if os.getenv("WECOM_WEBHOOK_URL"):
    sender.add_webhook(WebhookConfig(
        name="wecom",
        webhook_url=os.getenv("WECOM_WEBHOOK_URL"),
        platform="wecom"
    ))

if os.getenv("DINGTALK_WEBHOOK_URL"):
    sender.add_webhook(WebhookConfig(
        name="dingtalk",
        webhook_url=os.getenv("DINGTALK_WEBHOOK_URL"),
        platform="dingtalk"
    ))
```

---

## ⚠️ 注意事项

1. **频率限制**
   - 企业微信：20次/分钟
   - 钉钉：20次/分钟
   - 飞书：100次/分钟
   - 注意控制发送频率

2. **安全设置**
   - 企业微信：IP 白名单或关键词验证
   - 钉钉：加签或关键词验证
   - 飞书：签名验证

3. **错误处理**
   ```python
   try:
       success = await sender.send("wecom", "通知")
       if not success:
           print("发送失败，可能是 Webhook 不可用")
   except Exception as e:
       print(f"发送异常: {e}")
   ```

4. **异步关闭**
   ```python
   # 使用完毕后关闭连接
   await sender.close()
   ```

---

## 📊 监控和日志

```python
import logging

# 启用日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("soloflow.webhook")

# 发送并记录
results = await sender.send_all("通知")
for name, success in results.items():
    if success:
        logger.info(f"✅ {name} 发送成功")
    else:
        logger.error(f"❌ {name} 发送失败")
```

---

## 🔗 相关链接

- [企业微信机器人 API](https://developer.work.weixin.qq.com/document/path/91770)
- [钉钉机器人 API](https://open.dingtalk.com/document/robots/custom-robot-access)
- [飞书机器人 API](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)
- [Slack Webhook API](https://api.slack.com/messaging/webhooks)
- [Discord Webhook API](https://discord.com/developers/docs/resources/webhook)
