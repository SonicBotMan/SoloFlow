"""
内置 Web 相关 Skill 模块

暴露 SKILL_MANIFEST 供 SkillRegistry 自动加载。
"""

import json
import urllib.parse
import urllib.request
from typing import Dict


def search_duckduckgo(query: str, max_results: int = 5) -> str:
    """
    通过 DuckDuckGo Lite 搜索（无需 API Key）。
    返回搜索结果摘要。
    """
    try:
        encoded = urllib.parse.quote_plus(query)
        url = f"https://lite.duckduckgo.com/lite/?q={encoded}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (SoloFlow/2.0)",
                "Accept": "text/html",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        # 简单提取文本（无需 BeautifulSoup）
        import re
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:3000]
    except Exception as e:
        return f"[SEARCH ERROR] {e}"


def fetch_url(url: str, max_chars: int = 4000) -> str:
    """
    抓取指定 URL 的页面内容。
    """
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (SoloFlow/2.0)"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
        import re
        text = re.sub(r"<[^>]+>", " ", content)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_chars]
    except Exception as e:
        return f"[FETCH ERROR] {e}"


SKILL_MANIFEST = [
    {
        "name": "search_duckduckgo",
        "func": search_duckduckgo,
        "description": "使用 DuckDuckGo 搜索互联网信息，无需 API Key",
        "tags": ["web", "search"],
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
                "max_results": {"type": "integer", "description": "最大结果数（默认5）", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "func": fetch_url,
        "description": "抓取指定 URL 的网页文本内容",
        "tags": ["web", "fetch"],
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "目标网页 URL"},
                "max_chars": {"type": "integer", "description": "最大字符数（默认4000）", "default": 4000},
            },
            "required": ["url"],
        },
    },
]
