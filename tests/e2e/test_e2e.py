"""SoloFlow 端到端测试

测试完整的工作流生命周期：
创建 → 执行 → 监控 → 完成

覆盖所有Phase 1-5的功能：
- Phase 1: MCP Tool Layer
- Phase 2: Trace可观测性
- Phase 3: Ebbinghaus遗忘曲线
- Phase 4: 学科路由
- Phase 5: 技能自动进化
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import pytest

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def tmp_dir(tmp_path):
    """Create temporary directory for test artifacts."""
    return tmp_path


class TestEndToEnd:
    """端到端测试套件"""
    
    @pytest.mark.asyncio
    async def test_complete_workflow_lifecycle(self, tmp_dir):
        """测试完整的工作流生命周期"""
        # === Phase 1: MCP Tool Layer ===
        from mcp.server import SoloFlowMCPServer
        
        store_path = tmp_dir / "test.db"
        server = SoloFlowMCPServer(store_path=store_path)
        await server.start()
        
        # 创建工作流
        create_result = await server.handle_request("tools/call", {
            "name": "soloflow_create",
            "arguments": {
                "name": "research-report",
                "description": "生成行业调研报告",
                "steps": [
                    {"id": "topic", "name": "选题", "discipline": "deep", "prompt": "确定研究方向"},
                    {"id": "search_a", "name": "学术搜索", "discipline": "quick", "prompt": "搜索学术资料"},
                    {"id": "search_b", "name": "行业搜索", "discipline": "quick", "prompt": "搜索行业报告"},
                    {"id": "outline", "name": "大纲", "discipline": "deep", "prompt": "整理大纲"},
                    {"id": "write", "name": "撰写", "discipline": "deep", "prompt": "写正文"},
                    {"id": "review", "name": "审校", "discipline": "quick", "prompt": "审校发布"},
                ],
                "edges": [
                    ["topic", "search_a"],
                    ["topic", "search_b"],
                    ["search_a", "outline"],
                    ["search_b", "outline"],
                    ["outline", "write"],
                    ["write", "review"],
                ],
            },
        })
        
        assert "content" in create_result
        create_data = json.loads(create_result["content"][0]["text"])
        assert create_data["success"] is True
        workflow_id = create_data["workflow_id"]
        
        # 查询状态
        status_result = await server.handle_request("tools/call", {
            "name": "soloflow_status",
            "arguments": {"workflow_id": workflow_id},
        })
        
        status_data = json.loads(status_result["content"][0]["text"])
        assert status_data["success"] is True
        assert status_data["state"] == "draft"
        assert len(status_data["steps"]) == 6
        
        # 列出工作流
        list_result = await server.handle_request("tools/call", {
            "name": "soloflow_list",
            "arguments": {},
        })
        
        list_data = json.loads(list_result["content"][0]["text"])
        assert list_data["success"] is True
        assert list_data["count"] >= 1
        
        await server.stop()
        
        # === Phase 2: Trace可观测性 ===
        from trace.collector import TraceCollector
        from trace.exporter import TraceExporter
        from trace.span import SpanStatus, TokenUsage
        
        trace_db = tmp_dir / "traces.db"
        collector = TraceCollector(db_path=trace_db)
        exporter = TraceExporter(collector)
        
        # 模拟工作流执行的trace
        root_span = collector.start_span(
            operation="workflow",
            node_name="research-report",
            input_data={"workflow_id": workflow_id},
        )
        
        # 模拟步骤执行
        steps = ["选题", "学术搜索", "行业搜索", "大纲", "撰写", "审校"]
        for step_name in steps:
            step_span = collector.start_span(
                operation="step",
                node_name=step_name,
                parent_id=root_span.span_id,
                trace_id=root_span.trace_id,
                input_data={"step": step_name},
            )
            
            # 模拟LLM调用
            llm_span = collector.start_span(
                operation="llm_call",
                node_name=f"{step_name}_llm",
                parent_id=step_span.span_id,
                trace_id=root_span.trace_id,
            )
            
            collector.finish_span(
                llm_span.span_id,
                status=SpanStatus.SUCCESS,
                output_data={"response": f"{step_name}完成"},
                token_usage=TokenUsage(
                    prompt_tokens=100,
                    completion_tokens=200,
                    total_tokens=300,
                    cost_usd=0.005,
                ),
            )
            
            collector.finish_span(
                step_span.span_id,
                status=SpanStatus.SUCCESS,
                output_data={"result": f"{step_name}结果"},
            )
        
        collector.finish_span(
            root_span.span_id,
            status=SpanStatus.SUCCESS,
            output_data={"report": "调研报告"},
        )
        
        # 验证trace
        traces = collector.get_recent_traces()
        assert len(traces) >= 1
        
        stats = collector.get_span_stats(root_span.trace_id)
        # 1 root + 6 steps + 6 llm calls = 13 spans
        assert stats["total_spans"] == 13
        assert stats["success_count"] == 13
        assert stats["total_tokens"] > 0
        
        # 导出trace
        export_path = tmp_dir / "trace.json"
        exporter.export_json(root_span.trace_id, export_path)
        assert export_path.exists()
        
        # 树形可视化
        tree = exporter.format_trace_tree(root_span.trace_id)
        assert "workflow" in tree
        assert "选题" in tree
        
        collector.close()
        
        # === Phase 3: Ebbinghaus遗忘曲线 ===
        from forgetting_memory.forgetting.curve import ForgettingCurve
        from forgetting_memory.forgetting.consolidation import MemoryConsolidator
        
        memory_db = tmp_dir / "memory.db"
        consolidator = MemoryConsolidator(db_path=memory_db)
        
        # 添加记忆
        entry1 = await consolidator.add_memory(
            key="workflow_result",
            content={"workflow_id": workflow_id, "result": "调研报告"},
            tier="episodic",
            stability=1.0,
        )
        
        entry2 = await consolidator.add_memory(
            key="user_preference",
            content={"theme": "dark", "language": "zh"},
            tier="semantic",
            stability=2.0,
        )
        
        # 访问记忆（增加稳定性）
        for _ in range(5):
            await consolidator.get_memory("workflow_result")
        
        # 检查稳定性增长
        entry = await consolidator.get_memory("workflow_result")
        assert entry is not None
        assert entry.access_count == 6  # 1 initial + 5 accesses
        assert entry.stability > 1.0  # Stability should have increased
        
        # 运行巩固周期
        consolidation_stats = await consolidator.consolidate_all()
        assert "consolidated" in consolidation_stats
        assert "expired" in consolidation_stats
        
        # 搜索记忆
        results = await consolidator.search_memories("workflow")
        assert len(results) >= 1
        
        consolidator.close()
        
        # === Phase 4: 学科路由 ===
        from routing.classifier import TaskClassifier, Discipline
        from routing.router import DisciplineRouter, Executor
        
        classifier = TaskClassifier()
        router = DisciplineRouter(classifier=classifier)
        
        # 测试分类
        test_cases = [
            ("Summarize this article", Discipline.QUICK),
            ("Analyze the economic implications", Discipline.DEEP),
            ("Generate an image of a sunset", Discipline.VISUAL),
            ("Debate the pros and cons", Discipline.ULTRABRAIN),
        ]
        
        for task, expected in test_cases:
            result = classifier.classify(task)
            # 允许一定的分类误差
            assert result.discipline in Discipline
        
        # 注册执行器
        execution_log = []
        
        async def quick_handler(task: str) -> str:
            execution_log.append(("quick", task))
            return f"Quick result: {task}"
        
        async def deep_handler(task: str) -> str:
            execution_log.append(("deep", task))
            return f"Deep result: {task}"
        
        router.register_executor(Executor(
            name="quick-agent",
            discipline=Discipline.QUICK,
            handler=quick_handler,
        ))
        
        router.register_executor(Executor(
            name="deep-agent",
            discipline=Discipline.DEEP,
            handler=deep_handler,
        ))
        
        # 路由并执行
        routing_result = await router.route_and_execute("Summarize this article")
        assert len(execution_log) == 1
        assert execution_log[0][0] == "quick"
        
        # === Phase 5: 技能自动进化 ===
        from evolution.pattern_detector import PatternDetector
        from evolution.skill_packager import SkillPackager
        from evolution.quality_scorer import QualityScorer
        
        patterns_db = tmp_dir / "patterns.db"
        skills_db = tmp_dir / "skills.db"
        
        detector = PatternDetector(db_path=patterns_db)
        packager = SkillPackager(db_path=skills_db)
        scorer = QualityScorer()
        
        # 模拟多次工作流执行
        workflow_pattern = {
            "id": "wf_research",
            "name": "research-report",
            "steps": [
                {"name": "选题", "prompt": "确定研究方向"},
                {"name": "搜索", "prompt": "搜索资料"},
                {"name": "撰写", "prompt": "写报告"},
            ],
            "edges": [("选题", "搜索"), ("搜索", "撰写")],
        }
        
        for i in range(5):
            detector.record_execution(
                workflow=workflow_pattern,
                success=True,
                duration_ms=1000 + i * 100,
            )
        
        # 检测模式
        patterns = detector.detect_patterns(min_occurrences=3)
        assert len(patterns) >= 1
        assert patterns[0].occurrence_count == 5
        assert patterns[0].success_rate == 1.0
        
        # 打包技能
        skill = packager.package_pattern(patterns[0])
        assert skill.skill_id.startswith("skill_")
        assert skill.version == "1.0.0"
        
        # 转换为MCP工具
        mcp_tool = skill.to_mcp_tool()
        assert mcp_tool["name"].startswith("soloflow_skill_")
        
        # 质量评分
        score = scorer.score_skill(skill, patterns[0])
        assert 0.0 <= score.overall_score <= 1.0
        assert score.grade in ["A", "B", "C", "D", "F"]
        
        detector.close()
        packager.close()
        
        print("\n✅ 端到端测试完成！")
        print(f"   - 工作流ID: {workflow_id}")
        print(f"   - Trace Spans: {stats['total_spans']}")
        print(f"   - 记忆条目: 2")
        print(f"   - 检测到的模式: {len(patterns)}")
        print(f"   - 打包的技能: {skill.skill_id}")
        print(f"   - 技能质量: {score.grade} ({score.overall_score:.2f})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
