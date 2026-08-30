'use client';

import { Background, ReactFlow, ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Layers, X } from 'lucide-react';
import { nodeTypes } from '../[id]/flow-nodes';
import type { FlowTemplate } from './data';

function toReactFlow(graph: FlowTemplate['graph']): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, data: (node.data as Record<string, unknown>) || {} }));
  const edges: Edge[] = graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, animated: true }));
  return { nodes, edges };
}

export function TemplatePreviewModal({ template, onClose, onUse }: { template: FlowTemplate; onClose: () => void; onUse: () => void }) {
  const { nodes, edges } = toReactFlow(template.graph);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal template-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="template-preview-header">
          <span className="default-badge">★ OFICIAL</span>
          <strong>{template.icon} {template.name}</strong>
          <span className="template-preview-readonly">Vista previa — solo lectura</span>
          <button className="icon-button ghost small" type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="template-preview-canvas">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag
              zoomOnScroll
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Cerrar</button>
          <button className="button primary" type="button" onClick={onUse}><Layers size={14} /> Usar esta plantilla</button>
        </div>
      </div>
    </div>
  );
}
