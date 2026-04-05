import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
} from '@xyflow/react';
import type { AgentNodeData, Discipline, DAGWorkflow } from '../lib/types';
import { DEFAULT_MODELS } from '../lib/types';
import { dagToFlow } from '../lib/dagToFlow';
import { generateId } from '../lib/utils';

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  workflowName: string;
  isDirty: boolean;
  validationErrors: string[];

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (discipline: Discipline, position?: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<AgentNodeData>) => void;
  removeNode: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setWorkflow: (dag: DAGWorkflow) => void;
  setWorkflowName: (name: string) => void;
  setValidationErrors: (errors: string[]) => void;
  markClean: () => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  workflowName: 'Untitled Workflow',
  isDirty: false,
  validationErrors: [],

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      isDirty: true,
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    }));
  },

  onConnect: (connection) => {
    const edge = {
      ...connection,
      type: 'dependency',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: 'var(--text-tertiary)' },
    };
    set((state) => ({
      edges: addEdge(edge, state.edges),
      isDirty: true,
    }));
  },

  addNode: (discipline, position) => {
    const id = generateId();
    const nodeCount = get().nodes.length + 1;
    const newNode = {
      id,
      type: 'agent',
      position: position ?? {
        x: 100 + Math.random() * 400,
        y: 100 + Math.random() * 400,
      },
      data: {
        label: `${discipline.charAt(0).toUpperCase() + discipline.slice(1)} Step ${nodeCount}`,
        discipline,
        model: DEFAULT_MODELS[discipline],
        prompt: '',
        status: 'idle',
        temperature: 0.7,
        maxTokens: 4096,
      },
    } as Node;
    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
    }));
  },

  updateNodeData: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
      isDirty: true,
    }));
  },

  removeNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      isDirty: true,
    }));
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  setWorkflow: (dag) => {
    const { nodes, edges } = dagToFlow(dag);
    set({
      nodes,
      edges,
      workflowName: dag.name,
      isDirty: false,
      validationErrors: [],
      selectedNodeId: null,
    });
  },

  setWorkflowName: (name) => set({ workflowName: name, isDirty: true }),
  setValidationErrors: (errors) => set({ validationErrors: errors }),
  markClean: () => set({ isDirty: false }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
}));
