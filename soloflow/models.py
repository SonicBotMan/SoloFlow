"""
国内模型支持

支持:
- MiniMax（海螺AI）
- 智谱AI（GLM）
- Moonshot（Kimi）
- 百度文心一言
- 阿里通义千问
"""

from typing import Optional, Dict, List
from dataclasses import dataclass
from openai import AsyncOpenAI
import os


@dataclass
class ModelConfig:
    """模型配置"""
    name: str
    provider: str
    base_url: str
    api_key_env: str
    max_tokens: int = 4096
    supports_json: bool = True


# 国内模型配置
DOMESTIC_MODELS = {
    # MiniMax（海螺AI）
    "minimax": ModelConfig(
        name="abab6.5-chat",
        provider="MiniMax",
        base_url="https://api.minimax.chat/v1",
        api_key_env="MINIMAX_API_KEY",
        max_tokens=4096,
        supports_json=True
    ),
    
    # 智谱AI（GLM）
    "zhipu": ModelConfig(
        name="glm-4",
        provider="ZhipuAI",
        base_url="https://open.bigmodel.cn/api/paas/v4/",
        api_key_env="ZHIPU_API_KEY",
        max_tokens=4096,
        supports_json=True
    ),
    
    # Moonshot（Kimi）
    "moonshot": ModelConfig(
        name="moonshot-v1-8k",
        provider="Moonshot",
        base_url="https://api.moonshot.cn/v1",
        api_key_env="MOONSHOT_API_KEY",
        max_tokens=8192,
        supports_json=True
    ),
    
    # 百度文心一言
    "wenxin": ModelConfig(
        name="ernie-bot-4",
        provider="Baidu",
        base_url="https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions",
        api_key_env="WENXIN_API_KEY",
        max_tokens=4096,
        supports_json=False
    ),
    
    # 阿里通义千问
    "qwen": ModelConfig(
        name="qwen-max",
        provider="Alibaba",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key_env="QWEN_API_KEY",
        max_tokens=6000,
        supports_json=True
    ),
}


class DomesticModelClient:
    """国内模型客户端"""
    
    def __init__(self, provider: str = "zhipu"):
        """初始化客户端
        
        Args:
            provider: 模型提供商（minimax/zhipu/moonshot/wenxin/qwen）
        """
        self.provider = provider
        self.config = DOMESTIC_MODELS.get(provider)
        
        if not self.config:
            raise ValueError(
                f"Unknown provider: {provider}. "
                f"Available: {list(DOMESTIC_MODELS.keys())}"
            )
        
        # 获取 API Key
        self.api_key = os.getenv(self.config.api_key_env)
        if not self.api_key:
            raise ValueError(
                f"API key not found. Please set {self.config.api_key_env}"
            )
        
        # 创建客户端
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.config.base_url
        )
    
    async def chat(
        self,
        messages: List[Dict],
        temperature: float = 0.7,
        response_format: Optional[Dict] = None
    ) -> str:
        """聊天完成
        
        Args:
            messages: 消息列表
            temperature: 温度
            response_format: 响应格式（如 {"type": "json_object"}）
            
        Returns:
            str: 响应内容
        """
        kwargs = {
            "model": self.config.name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": self.config.max_tokens,
        }
        
        # 只有支持的模型才添加 response_format
        if response_format and self.config.supports_json:
            kwargs["response_format"] = response_format
        
        response = await self.client.chat.completions.create(**kwargs)
        
        return response.choices[0].message.content
    
    @staticmethod
    def list_providers() -> List[str]:
        """列出所有支持的提供商"""
        return list(DOMESTIC_MODELS.keys())
    
    @staticmethod
    def get_provider_info(provider: str) -> Dict:
        """获取提供商信息"""
        config = DOMESTIC_MODELS.get(provider)
        if not config:
            return {}
        
        return {
            "provider": config.provider,
            "model": config.name,
            "max_tokens": config.max_tokens,
            "supports_json": config.supports_json,
            "api_key_env": config.api_key_env,
        }


def create_model_client(
    provider: str = "openai",
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
):
    """创建模型客户端
    
    Args:
        provider: 提供商（openai/minimax/zhipu/moonshot/wenxin/qwen）
        api_key: API Key（可选，从环境变量读取）
        base_url: Base URL（可选，使用默认值）
        
    Returns:
        AsyncOpenAI 或 DomesticModelClient
    """
    if provider == "openai":
        return AsyncOpenAI(
            api_key=api_key or os.getenv("OPENAI_API_KEY"),
            base_url=base_url
        )
    else:
        return DomesticModelClient(provider)


# 便捷函数
async def chat_with_model(
    provider: str,
    messages: List[Dict],
    temperature: float = 0.7,
    response_format: Optional[Dict] = None
) -> str:
    """使用指定模型聊天
    
    Args:
        provider: 提供商
        messages: 消息列表
        temperature: 温度
        response_format: 响应格式
        
    Returns:
        str: 响应内容
    """
    if provider == "openai":
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        kwargs = {
            "model": "gpt-4o",
            "messages": messages,
            "temperature": temperature,
        }
        if response_format:
            kwargs["response_format"] = response_format
        
        response = await client.chat.completions.create(**kwargs)
        return response.choices[0].message.content
    else:
        client = DomesticModelClient(provider)
        return await client.chat(messages, temperature, response_format)
