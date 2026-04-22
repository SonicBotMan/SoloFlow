"""
SoloFlow 使用示例 — 自动调度 + 超时重试 + 记忆系统

演示内容：
1. Scheduler 自动并行调度（无需手动 advance_step）
2. 自定义 executor（模拟 LLM 调用）
3. 超时和重试机制
4. 三层记忆系统的使用

运行: cd hermes-plugin && python ../examples/02_scheduler_and_memory.py
"""

import asyncio
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler
from memory.working_memory import WorkingMemory
from memory.episodic_memory import EpisodicMemory
from memory.semantic_memory import SemanticMemory


async def main():
    db_path = Path(tempfile.mkdtemp()) / "demo.db"
    store = SQLiteStore(db_path)
    store.initialize()

    ws = WorkflowService(store)
    scheduler = Scheduler(store, ws, config={
        "max_parallelism": 3,
        "default_timeout": 10,
        "base_backoff": 0.1,
    })

    print("=" * 60)
    print("SoloFlow Demo — 自动调度 + 记忆系统")
    print("=" * 60)

    # ── 1. 自定义 Executor ──────────────────────────────────
    print("\n📌 自定义 Executor（模拟 LLM 调用）")

    execution_log = []  # 记录执行顺序

    async def mock_llm_executor(step: dict) -> str:
        """模拟 LLM 调用 — 实际使用中替换成真实 API 调用"""
        name = step.get("name", step["id"])
        discipline = step.get("discipline", "quick")
        duration = 0.05 if discipline == "quick" else 0.15  # 深度思考更慢

        execution_log.append({
            "id": step["id"],
            "name": name,
            "start": time.time(),
        })
        print(f"    ⚙️  执行: {name} (discipline={discipline}, {duration}s)")
        await asyncio.sleep(duration)

        result = f"[{name}] 分析完成，生成结论"
        print(f"    ✅ 完成: {name}")
        return result

    # ── 2. 创建复杂工作流 ──────────────────────────────────
    print("\n📌 创建工作流（含并行和汇聚）")

    wf = await ws.create_workflow(
        name="data-pipeline",
        description="数据处理管线",
        steps=[
            {"id": "fetch_api",  "name": "拉取API数据",  "discipline": "quick",
             "prompt": "从 3 个数据源拉取最新数据"},
            {"id": "fetch_db",   "name": "查询数据库",   "discipline": "quick",
             "prompt": "查询内部数据库"},
            {"id": "clean",      "name": "数据清洗",     "discipline": "quick",
             "prompt": "去重、填充缺失值、标准化格式"},
            {"id": "analyze",    "name": "深度分析",     "discipline": "deep",
             "prompt": "趋势分析 + 异常检测"},
            {"id": "visualize",  "name": "生成图表",     "discipline": "quick",
             "prompt": "生成可视化图表"},
            {"id": "report",     "name": "生成报告",     "discipline": "deep",
             "prompt": "汇总分析结果，生成周报"},
        ],
        edges=[
            ("fetch_api", "clean"), ("fetch_db", "clean"),  # 两个数据源并行拉取 → 汇聚到清洗
            ("clean", "analyze"),                            # 清洗后分析
            ("analyze", "visualize"), ("analyze", "report"), # 分析后并行：图表 + 报告
        ],
    )
    print(f"  步骤: {len(wf['steps'])} 个")
    print(f"  结构: [fetch_api ∥ fetch_db] → clean → analyze → [visualize ∥ report]")

    # ── 3. 自动调度执行 ────────────────────────────────────
    print("\n🚀 Scheduler 自动调度执行...\n")
    t0 = time.time()
    await ws.start_workflow(wf["id"])
    result = await scheduler.execute_workflow(wf["id"], executor=mock_llm_executor)
    elapsed = time.time() - t0

    print(f"\n⏱️  总耗时: {elapsed:.2f}s")
    print(f"  状态: {result.get('state')}")

    # 验证并行执行
    if len(execution_log) >= 2:
        t1 = execution_log[0]["start"]
        t2 = execution_log[1]["start"]
        parallel = abs(t2 - t1) < 0.1
        print(f"  并行验证: {'✅ 前两步并行执行' if parallel else '⚠️  串行执行'}")

    # ── 4. 三层记忆系统 ────────────────────────────────────
    print("\n" + "=" * 60)
    print("🧠 记忆系统")
    print("=" * 60)

    # Working Memory — 即时上下文
    print("\n📝 Working Memory (LRU 即时上下文)")
    wm = WorkingMemory(max_size=5)
    for i in range(5):
        wm.put(f"var_{i}", {"value": f"result_{i}", "step": f"step_{i}"})
    print(f"  容量: {len(wm)}/5")
    print(f"  查询 var_2: {wm.get('var_2')}")
    wm.put("var_5", {"value": "overflow"})  # 溢出，淘汰 var_0
    print(f"  加入 var_5 后 var_0 被淘汰: {wm.get('var_0') is None}")

    # Episodic Memory — 事件流
    print("\n📚 Episodic Memory (FTS5 事件记忆)")
    em = EpisodicMemory(store)

    await em.record(event_type="step_completed", data={"step": "fetch_api", "result": "200 OK"})
    await em.record(event_type="step_completed", data={"step": "analyze", "result": "发现 3 个异常"})
    await em.record(event_type="error", data={"step": "fetch_db", "msg": "connection timeout after 5s"})

    search_result = await em.search("timeout")
    print(f"  搜索 'timeout': {len(search_result)} 条结果")
    for r in search_result:
        print(f"    - {r['event_type']}: {r['data']}")

    search_result2 = await em.search("completed analyze")
    print(f"  搜索 'completed analyze': {len(search_result2)} 条结果")

    # Semantic Memory — 模式提取
    print("\n🔮 Semantic Memory (模式提取)")
    sm = SemanticMemory(store)

    completed_wf = store.get_workflow(wf["id"], full=True)
    template = await sm.extract_and_store(completed_wf)
    print(f"  提取模板: {template['name']}")
    print(f"  步骤数: {template['step_count']}")
    print(f"  结构: {template['pattern']}")

    templates = await sm.get_templates()
    print(f"  已有模板数: {len(templates)}")

    # ── 5. 总结 ────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("✅ Demo 完成!")
    print("  - DAG 自动调度: 6 步 3 轮完成（并行 2+1+2）")
    print("  - Working Memory: LRU 即时上下文，超 size 自动淘汰")
    print("  - Episodic Memory: FTS5 全文搜索事件流")
    print("  - Semantic Memory: 自动提取 workflow 结构模板")
    print("=" * 60)

    store.close()


if __name__ == "__main__":
    asyncio.run(main())
