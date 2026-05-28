"""
SoloFlow Discipline Routing Example

Demonstrates the discipline-aware routing system.
"""

import asyncio
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from routing.classifier import TaskClassifier, Discipline
from routing.router import DisciplineRouter, Executor


async def main():
    print("=== SoloFlow Discipline Routing Example ===\n")
    
    # Initialize
    classifier = TaskClassifier()
    router = DisciplineRouter(classifier=classifier)
    
    # 1. Classify tasks
    print("1. Task Classification:")
    
    tasks = [
        "Summarize this article in 3 bullet points",
        "Analyze the economic implications of AI adoption",
        "Generate an image of a sunset over mountains",
        "Debate the pros and cons of remote work",
        "Write a Python function to sort a list",
        "Research the latest trends in AI agents",
    ]
    
    for task in tasks:
        result = classifier.classify(task)
        print(f"   [{result.discipline.value:10}] {task[:50]}...")
    
    # 2. Register executors
    print("\n2. Registering executors...")
    
    execution_log = []
    
    async def quick_handler(task: str) -> str:
        execution_log.append(("quick", task))
        return f"Quick result: {task[:30]}"
    
    async def deep_handler(task: str) -> str:
        execution_log.append(("deep", task))
        return f"Deep result: {task[:30]}"
    
    async def visual_handler(task: str) -> str:
        execution_log.append(("visual", task))
        return f"Visual result: {task[:30]}"
    
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
    
    router.register_executor(Executor(
        name="visual-agent",
        discipline=Discipline.VISUAL,
        handler=visual_handler,
    ))
    
    print("   Registered: quick-agent, deep-agent, visual-agent")
    
    # 3. Route and execute tasks
    print("\n3. Routing and executing tasks...")
    
    for task in tasks[:3]:
        result = await router.route_and_execute(task)
        print(f"   Executed: {task[:40]}...")
    
    # 4. Show execution log
    print("\n4. Execution Log:")
    for discipline, task in execution_log:
        print(f"   [{discipline}] {task[:50]}...")
    
    # 5. List executors
    print("\n5. Registered Executors:")
    executors = router.list_executors()
    for discipline, names in executors.items():
        print(f"   {discipline}: {', '.join(names)}")
    
    print("\n=== Example Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
