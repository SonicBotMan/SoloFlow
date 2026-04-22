"""
SoloFlow 使用示例 — 5 步调研报告工作流

演示内容：
1. 创建 DAG 工作流（含并行步骤）
2. 手动逐步推进
3. 查询状态和进度
4. 取消工作流

运行: cd hermes-plugin && python ../examples/01_basic_workflow.py
"""

import asyncio
import sys
import tempfile
from pathlib import Path

# 将 hermes-plugin 加入 import 路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler


async def main():
    # ── 初始化 ──────────────────────────────────────────────
    db_path = Path(tempfile.mkdtemp()) / "demo.db"
    store = SQLiteStore(db_path)
    store.initialize()

    ws = WorkflowService(store)
    ws.set_scheduler(Scheduler(store, ws))

    print("=" * 60)
    print("SoloFlow Demo — 行业调研报告")
    print("=" * 60)

    # ── 1. 创建工作流 ──────────────────────────────────────
    print("\n📌 创建工作流...")

    wf = await ws.create_workflow(
        name="ai-industry-report",
        description="AI 行业调研报告生成",
        steps=[
            {"id": "topic",    "name": "确定选题",  "discipline": "deep",
             "prompt": "分析当前 AI 行业热点，确定调研方向"},
            {"id": "search_a", "name": "学术搜索",  "discipline": "quick",
             "prompt": "搜索近期 AI 学术论文和前沿研究"},
            {"id": "search_b", "name": "行业搜索",  "discipline": "quick",
             "prompt": "搜索 AI 行业报告、投融资数据"},
            {"id": "outline",  "name": "整理大纲",  "discipline": "deep",
             "prompt": "根据搜索结果整理报告大纲"},
            {"id": "write",    "name": "撰写正文",  "discipline": "deep",
             "prompt": "按照大纲撰写 5000 字调研报告"},
            {"id": "review",   "name": "审校发布",  "discipline": "quick",
             "prompt": "审校报告，检查数据和引用准确性"},
        ],
        edges=[
            ("topic", "search_a"),     # 选题完成后才能搜索
            ("topic", "search_b"),     # 两个搜索可以并行
            ("search_a", "outline"),   # 搜索完成后整理大纲
            ("search_b", "outline"),
            ("outline", "write"),      # 大纲完成后撰写
            ("write", "review"),       # 撰写完成后审校
        ],
    )

    print(f"  工作流 ID: {wf['id'][:8]}...")
    print(f"  状态: {wf['state']}")
    print(f"  步骤数: {len(wf['steps'])}")
    print(f"  DAG 层级: {len(wf.get('layers', {}))} 层")
    print(f"    Layer 0: 选题 (入口)")
    print(f"    Layer 1: 学术搜索 ∥ 行业搜索 (并行)")
    print(f"    Layer 2: 整理大纲")
    print(f"    Layer 3: 撰写正文")
    print(f"    Layer 4: 审校发布")

    # ── 2. 启动工作流 ──────────────────────────────────────
    print("\n🚀 启动工作流...")
    started = await ws.start_workflow(wf["id"])
    print(f"  状态: {started['state']}")

    # ── 3. 查看就绪步骤 ────────────────────────────────────
    ready = await ws.get_ready_steps(wf["id"])
    print(f"  当前可执行: {ready}")

    # ── 4. 逐步推进 ────────────────────────────────────────
    print("\n📝 逐步推进...")

    # Step 1: 选题
    step_id = ready[0]
    print(f"\n  [{step_id}] 确定选题...")
    # 实际使用中这里调用 LLM
    fake_result = "选题方向：2026 年大模型 Agent 生态发展趋势"
    await ws.advance_step(wf["id"], step_id, result=fake_result)
    print(f"  → {fake_result}")

    # 并行步骤：两个搜索
    ready = await ws.get_ready_steps(wf["id"])
    print(f"\n  并行步骤就绪: {ready}")

    for step_id in ready:
        print(f"  [{step_id}] 执行搜索...")
        fake_result = f"{step_id} 完成：找到 15 篇相关资料"
        await ws.advance_step(wf["id"], step_id, result=fake_result)
        print(f"  → {fake_result}")

    # 查看进度
    status = await ws.get_workflow_status(wf["id"])
    print(f"\n  📊 进度: {status['progress']['completed']}/{status['progress']['total']} "
          f"({status['progress']['progress_pct']}%)")

    # 后续步骤
    for step_name in ["outline", "write", "review"]:
        ready = await ws.get_ready_steps(wf["id"])
        if not ready:
            break
        step_id = ready[0]
        print(f"\n  [{step_id}] 执行...")
        fake_result = f"{step_name} 完成"
        await ws.advance_step(wf["id"], step_id, result=fake_result)
        print(f"  → {fake_result}")

    # ── 5. 最终状态 ────────────────────────────────────────
    status = await ws.get_workflow_status(wf["id"])
    print("\n" + "=" * 60)
    print(f"🏁 工作流完成!")
    print(f"  状态: {status['state']}")
    print(f"  进度: {status['progress']['completed']}/{status['progress']['total']}")
    print("=" * 60)

    store.close()
    print(f"\n数据库保存在: {db_path}")


if __name__ == "__main__":
    asyncio.run(main())
