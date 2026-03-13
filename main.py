#!/usr/bin/env python3
"""
SoloFlow - AI一人公司

一个基于任务流水线的AI一人公司框架

用法:
    python main.py              # 启动 Web UI (默认端口 8000)
    python main.py --cli        # 启动 CLI 模式
    python main.py --port 9000  # 指定端口
"""

import asyncio
import argparse
import os
from pathlib import Path

try:
    import uvicorn
    UVICORN_AVAILABLE = True
except ImportError:
    UVICORN_AVAILABLE = False

from soloflow.runner import SoloFlowRunner


def main():
    """主入口"""
    parser = argparse.ArgumentParser(
        description="SoloFlow - AI一人公司",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python main.py                # 启动 Web UI (http://localhost:8000)
    python main.py --cli          # 启动 CLI 模式
    python main.py --port 9000    # 指定端口 9000
    python main.py --host 0.0.0.0 # 允许外网访问
        """
    )
    
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="监听地址 (默认: 0.0.0.0)"
    )
    
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="监听端口 (默认: 8000)"
    )
    
    parser.add_argument(
        "--cli",
        action="store_true",
        help="启动 CLI 模式"
    )
    
    parser.add_argument(
        "--db",
        default="data/soloflow.db",
        help="数据库路径 (默认: data/soloflow.db)"
    )
    
    parser.add_argument(
        "--agents-dir",
        default="soloflow/agents",
        help="Agent 配置目录 (默认: soloflow/agents)"
    )
    
    args = parser.parse_args()
    
    # 检查环境变量
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key and not args.cli:
        print("⚠️  未设置 OPENAI_API_KEY 环境变量")
        print("   请设置: export OPENAI_API_KEY=sk-xxx")
        print("   或创建 .env 文件: echo 'OPENAI_API_KEY=sk-xxx' > .env")
        return
    
    # 创建数据目录
    Path(args.db).parent.mkdir(parents=True, exist_ok=True)
    
    if args.cli:
        # CLI 模式
        asyncio.run(run_cli(args))
    else:
        # Web 模式
        print(f"""
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🎬 SoloFlow - AI一人公司                               ║
║                                                          ║
║   让一个人也能拥有完整的AI创作团队                        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

🌐 Web UI: http://{args.host}:{args.port}
📚 API Docs: http://{args.host}:{args.port}/docs

按 Ctrl+C 停止
        """)
        
        if not UVICORN_AVAILABLE:
            print("❌ Web 模式需要 uvicorn，请先安装:")
            print("   pip install uvicorn")
            return
        
        uvicorn.run(
            "soloflow.web:app",
            host=args.host,
            port=args.port,
            reload=False,
            log_level="info"
        )


async def run_cli(args):
    """CLI 模式"""
    print("""
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🎬 SoloFlow - CLI Mode                                 ║
║                                                          ║
║   输入 'quit' 退出                                       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    """)
    
    runner = SoloFlowRunner(
        db_path=args.db,
        agents_dir=args.agents_dir,
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL")
    )
    
    try:
        while True:
            try:
                user_input = input("\n老板 > ").strip()
                
                if not user_input:
                    continue
                
                if user_input.lower() in ["quit", "exit", "q"]:
                    print("👋 再见！")
                    break
                
                # 处理指令
                print("\n⏳ 处理中...\n")
                result = await runner.dispatch(user_input)
                print(f"\n{result}\n")
                print("=" * 60)
                
            except KeyboardInterrupt:
                print("\n👋 再见！")
                break
            except Exception as e:
                print(f"\n❌ 错误: {e}\n")
    
    finally:
        runner.close()


if __name__ == "__main__":
    main()
