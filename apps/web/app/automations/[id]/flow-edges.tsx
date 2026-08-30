'use client';

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';

// Nodes get an explicit trash-icon button (see flow-nodes.tsx), but edges had no delete
// affordance at all — `deleteKeyCode={null}` on the canvas (kept off so pressing
// Delete/Backspace while typing in a node's config modal doesn't wipe out the flow) also
// disabled the ONLY built-in way ReactFlow offers to remove a selected edge. This restores
// deletion for connections specifically, via an always-visible button at the edge's midpoint
// instead of the keyboard.
export function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12 });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="flow-edge-delete nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={(event) => {
            event.stopPropagation();
            setEdges((current) => current.filter((edge) => edge.id !== id));
          }}
          title="Clic para desconectar"
        >
          <X size={12} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { deletable: DeletableEdge };
