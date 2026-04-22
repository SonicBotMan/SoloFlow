"""SoloFlow core module — DAG engine + FSM."""

from core.dag import build_dag, topological_sort, get_ready_steps, compute_layers, detect_cycle
from core.fsm import can_transition, transition

__all__ = [
    "build_dag",
    "topological_sort",
    "get_ready_steps",
    "compute_layers",
    "detect_cycle",
    "can_transition",
    "transition",
]
