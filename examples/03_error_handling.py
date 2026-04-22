"""
SoloFlow 使用示例 — 错误处理、重试、取消

演示内容：
1. 步骤失败和自动重试
2. 超时处理
3. 手动取消工作流
4. 查看失败历史

运行: cd hermes-plugin && python ../examples/03_error_handling.py
"""

import asyncio
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler


async def main():
    db_path = Path(tempfile.mkdtemp()) / "demo.db"
    store = SQLiteStore(db_path)
    store.initialize()

    print("=" * 60)
    print("SoloFlow Demo — 错误处理")
    print("=" * 60)

    # ── 1. 超时处理 ────────────────────────────────────────
    print("\n📌 场景 1: 步骤超时")

    ws1 = WorkflowService(store)
    scheduler1 = Scheduler(store, ws1, config={"default_timeout": 1, "base_backoff": 0.1})

    wf1 = await ws1.create_workflow(
        "timeout-demo", "超时演示",
        steps=[{"id": "slow_step", "name": "慢步骤", "discipline": "deep",
                "prompt": "这个步骤会超时", "timeout_seconds": 1, "max_retries": 1}],
        edges=[],
    )

    call_count = 0

    async def slow_executor(step):
        nonlocal call_count
        call_count += 1
        print(f"    ⏳ 执行中... (模拟 10 秒任务, 但超时设为 1 秒)")
        await asyncio.sleep(10)
        return "不应该到达这里"

    await ws1.start_workflow(wf1["id"])
    result = await scheduler1.execute_workflow(wf1["id"], executor=slow_executor)
    print(f"  结果: {result['state']} (执行了 {call_count} 次后超时)")

    # ── 2. 手动取消 ────────────────────────────────────────
    print("\n📌 场景 2: 手动取消工作流")

    ws2 = WorkflowService(store)

    wf2 = await ws2.create_workflow(
        "cancel-demo", "取消演示",
        steps=[
            {"id": "s1", "name": "步骤1", "discipline": "quick", "prompt": "A"},
            {"id": "s2", "name": "步骤2", "discipline": "quick", "prompt": "B"},
            {"id": "s3", "name": "步骤3", "discipline": "quick", "prompt": "C"},
        ],
        edges=[("s1", "s2"), ("s2", "s3")],
    )

    await ws2.start_workflow(wf2["id"])
    await ws2.advance_step(wf2["id"], "s1", result="步骤1完成")

    status = await ws2.get_workflow_status(wf2["id"])
    print(f"  取消前: {status['progress']['completed']}/{status['progress']['total']} 完成")

    cancelled = await ws2.cancel_workflow(wf2["id"])
    print(f"  取消后状态: {cancelled['state']}")

    status = await ws2.get_workflow_status(wf2["id"])
    print(f"  步骤1: {status['steps'][0]['state']} (已完成)")
    print(f"  步骤2: {status['steps'][1]['state']} (已取消)")
    print(f"  步骤3: {status['steps'][2]['state']} (已取消)")

    # ── 3. 错误重试 ────────────────────────────────────────
    print("\n📌 场景 3: 错误重试")

    ws3 = WorkflowService(store)

    wf3 = await ws3.create_workflow(
        "retry-demo", "重试演示",
        steps=[{"id": "flaky", "name": "不稳定步骤", "discipline": "quick",
                "prompt": "这个步骤前两次会失败", "max_retries": 3}],
        edges=[],
    )

    await ws3.start_workflow(wf3["id"])

    # 第一次：故意失败
    await ws3.advance_step(wf3["id"], "flaky", error="连接超时")
    status = await ws3.get_workflow_status(wf3["id"])
    step = status["steps"][0]
    print(f"  第 1 次失败: state={step['state']}, retry={step['retry_count']}/{step['max_retries']}")

    # 第二次：再失败
    await ws3.advance_step(wf3["id"], "flaky", error="服务端 500")
    status = await ws3.get_workflow_status(wf3["id"])
    step = status["steps"][0]
    print(f"  第 2 次失败: state={step['state']}, retry={step['retry_count']}/{step['max_retries']}")

    # 第三次：成功
    await ws3.advance_step(wf3["id"], "flaky", result="终于成功了!")
    status = await ws3.get_workflow_status(wf3["id"])
    print(f"  第 3 次成功: state={status['state']} ✅")

    # ── 4. DAG 结构验证 ────────────────────────────────────
    print("\n📌 场景 4: 环检测")

    try:
        await ws3.create_workflow(
            "cycle-demo", "环检测",
            steps=[
                {"id": "a", "name": "A", "discipline": "quick", "prompt": "A"},
                {"id": "b", "name": "B", "discipline": "quick", "prompt": "B"},
                {"id": "c", "name": "C", "discipline": "quick", "prompt": "C"},
            ],
            edges=[("a", "b"), ("b", "c"), ("c", "a")],  # 环!
        )
        print("  ❌ 应该报错但没有")
    except ValueError as e:
        print(f"  ✅ 正确检测到环: {e}")

    # ── 总结 ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("✅ Demo 完成!")
    print("  - 超时: 步骤超过 timeout_seconds 自动失败")
    print("  - 取消: cancel_workflow 取消所有未完成步骤")
    print("  - 重试: max_retries 控制，retry_count 递增")
    print("  - 环检测: 创建时自动验证 DAG 无环")
    print("=" * 60)

    store.close()


if __name__ == "__main__":
    asyncio.run(main())
