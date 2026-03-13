"""
Webhook 集成

支持:
- 企业微信机器人
- 钉钉机器人
- 飞书机器人
- Slack Webhook
- Discord Webhook
"""

import aiohttp
import json
from typing import Optional, Dict, List
from dataclasses import dataclass
import asyncio


@dataclass
class WebhookConfig:
    """Webhook 配置"""
    name: str
    webhook_url: str
    enabled: bool = True
    
    # 平台特性
    platform: str = "generic"  # wecom/dingtalk/feishu/slack/discord/generic
    mention_all: bool = False
    secret: Optional[str] = None


class WebhookSender:
    """Webhook 发送器"""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.webhooks: Dict[str, WebhookConfig] = {}
    
    async def init(self):
        """初始化 HTTP 会话"""
        if self.session is None:
            self.session = aiohttp.ClientSession()
    
    async def close(self):
        """关闭 HTTP 会话"""
        if self.session:
            await self.session.close()
            self.session = None
    
    def add_webhook(self, config: WebhookConfig):
        """添加 Webhook"""
        self.webhooks[config.name] = config
    
    def remove_webhook(self, name: str):
        """移除 Webhook"""
        self.webhooks.pop(name, None)
    
    async def send(
        self,
        webhook_name: str,
        message: str,
        **kwargs
    ) -> bool:
        """发送消息到指定 Webhook
        
        Args:
            webhook_name: Webhook 名称
            message: 消息内容
            **kwargs: 额外参数
            
        Returns:
            bool: 是否发送成功
        """
        webhook = self.webhooks.get(webhook_name)
        if not webhook or not webhook.enabled:
            return False
        
        # 根据平台格式化消息
        payload = self._format_message(webhook.platform, message, **kwargs)
        
        # 发送
        try:
            async with self.session.post(
                webhook.webhook_url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                return response.status == 200
        except Exception as e:
            print(f"❌ Webhook 发送失败 ({webhook_name}): {e}")
            return False
    
    async def send_all(self, message: str, **kwargs) -> Dict[str, bool]:
        """发送消息到所有启用的 Webhook
        
        Args:
            message: 消息内容
            **kwargs: 额外参数
            
        Returns:
            Dict[str, bool]: 各 Webhook 的发送结果
        """
        results = {}
        
        for name in self.webhooks:
            results[name] = await self.send(name, message, **kwargs)
        
        return results
    
    def _format_message(
        self,
        platform: str,
        message: str,
        **kwargs
    ) -> Dict:
        """格式化消息
        
        Args:
            platform: 平台
            message: 消息内容
            **kwargs: 额外参数
            
        Returns:
            Dict: 格式化后的 payload
        """
        if platform == "wecom":
            # 企业微信
            return {
                "msgtype": "text",
                "text": {
                    "content": message,
                    "mentioned_list": ["@all"] if kwargs.get("mention_all") else []
                }
            }
        
        elif platform == "dingtalk":
            # 钉钉
            return {
                "msgtype": "text",
                "text": {
                    "content": message,
                    "atMobiles": kwargs.get("at_mobiles", []),
                    "atUserIds": kwargs.get("at_user_ids", [])
                }
            }
        
        elif platform == "feishu":
            # 飞书
            return {
                "msg_type": "text",
                "content": {
                    "text": message
                }
            }
        
        elif platform == "slack":
            # Slack
            return {
                "text": message,
                "blocks": kwargs.get("blocks")
            }
        
        elif platform == "discord":
            # Discord
            return {
                "content": message,
                "embeds": kwargs.get("embeds")
            }
        
        else:
            # 通用格式
            return {
                "text": message,
                **kwargs
            }


# ===== 便捷函数 =====

async def notify_project_complete(
    project_name: str,
    video_url: str,
    webhooks: List[str] = None
):
    """通知项目完成
    
    Args:
        project_name: 项目名称
        video_url: 视频链接
        webhooks: Webhook 列表（默认发送到所有）
    """
    sender = WebhookSender()
    await sender.init()
    
    try:
        message = f"""
🎬 项目完成通知

项目: {project_name}
状态: ✅ 已完成
视频: {video_url}

请及时查看并反馈。
        """.strip()
        
        if webhooks:
            for name in webhooks:
                await sender.send(name, message)
        else:
            await sender.send_all(message)
    finally:
        await sender.close()


async def notify_task_assigned(
    task_name: str,
    assignee: str,
    webhooks: List[str] = None
):
    """通知任务分配
    
    Args:
        task_name: 任务名称
        assignee: 分配给谁
        webhooks: Webhook 列表
    """
    sender = WebhookSender()
    await sender.init()
    
    try:
        message = f"""
📋 任务分配通知

任务: {task_name}
分配给: {assignee}
状态: 🔄 进行中

请及时处理。
        """.strip()
        
        if webhooks:
            for name in webhooks:
                await sender.send(name, message)
        else:
            await sender.send_all(message)
    finally:
        await sender.close()
