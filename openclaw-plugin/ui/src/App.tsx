import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from './components/Toolbar';
import { WorkflowCanvas } from './components/WorkflowCanvas';

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col bg-surface-0">
        <Toolbar />
        <WorkflowCanvas />
      </div>
    </ReactFlowProvider>
  );
}
