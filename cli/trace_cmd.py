"""CLI commands for SoloFlow trace viewing."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from trace.collector import TraceCollector
from trace.exporter import TraceExporter


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="SoloFlow Trace Viewer")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List recent traces")
    list_parser.add_argument("--limit", type=int, default=10, help="Max traces")
    list_parser.add_argument("--db", type=str, default="traces.db", help="Database path")
    
    # Show command
    show_parser = subparsers.add_parser("show", help="Show a trace")
    show_parser.add_argument("trace_id", help="Trace ID")
    show_parser.add_argument("--db", type=str, default="traces.db", help="Database path")
    show_parser.add_argument("--format", choices=["tree", "json"], default="tree", help="Output format")
    
    # Export command
    export_parser = subparsers.add_parser("export", help="Export a trace")
    export_parser.add_argument("trace_id", help="Trace ID")
    export_parser.add_argument("--output", "-o", type=str, help="Output file")
    export_parser.add_argument("--db", type=str, default="traces.db", help="Database path")
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        return
    
    db_path = Path(args.db)
    if not db_path.exists():
        print(f"Error: Database not found: {db_path}")
        sys.exit(1)
    
    collector = TraceCollector(db_path=db_path)
    exporter = TraceExporter(collector)
    
    try:
        if args.command == "list":
            traces = collector.get_recent_traces(limit=args.limit)
            
            if not traces:
                print("No traces found.")
                return
            
            print(f"Recent traces ({len(traces)}):")
            print("-" * 80)
            print(f"{'Trace ID':<36} {'Start Time':<20} {'Spans':<8} {'Tokens':<10} {'Cost':<10}")
            print("-" * 80)
            
            for trace in traces:
                import datetime
                start_time = datetime.datetime.fromtimestamp(trace["start_time"]).strftime("%Y-%m-%d %H:%M:%S")
                print(f"{trace['trace_id']:<36} {start_time:<20} {trace['span_count']:<8} {trace['total_tokens'] or 0:<10} ${trace['total_cost'] or 0:.4f}")
        
        elif args.command == "show":
            if args.format == "json":
                import json
                spans = collector.get_trace(args.trace_id)
                stats = collector.get_span_stats(args.trace_id)
                print(json.dumps({"trace_id": args.trace_id, "stats": stats, "spans": spans}, indent=2, default=str))
            else:
                print(exporter.format_trace_tree(args.trace_id))
        
        elif args.command == "export":
            output_path = Path(args.output) if args.output else Path(f"{args.trace_id}.json")
            exporter.export_json(args.trace_id, output_path)
            print(f"Exported to {output_path}")
    
    finally:
        collector.close()


if __name__ == "__main__":
    main()
