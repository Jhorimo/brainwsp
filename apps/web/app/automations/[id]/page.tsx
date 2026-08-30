'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Plus, Save, Settings, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { edgeTypes } from './flow-edges';
import { MenuConfigModal } from './menu-config-modal';
import { nodeTypes } from './flow-nodes';
import { NodeConfigModal } from './node-config-modal';
import { NodeLibrary } from './node-library';
import { SimulatorPanel } from './simulator-panel';
import { WaitConfigModal } from './wait-config-modal';
import { newNodeId, newOptionId, NO_RESPONSE_HANDLE, type ContentBlock, type ContentNodeData, type FlowDetail, type MenuNodeData, type MenuOption, type WaitNodeData } from '../types';

function toReactFlow(graph: FlowDetail['graph']): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: (node.data as Record<string, unknown>) || {},
    deletable: node.type !== 'start',
  }));
  const edges: Edge[] = graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || undefined, animated: true, type: 'deletable' }));
  return { nodes, edges };
}

function EditorInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const flowId = params.id;

  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState({ name: '', keywords: '', active: true });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, [setNodes, setEdges]);

  const editNode = useCallback((nodeId: string) => setEditingNodeId(nodeId), []);

  useEffect(() => {
    apiFetch<FlowDetail>(`/automations/flows/${flowId}`)
      .then((loaded) => {
        setFlow(loaded);
        const { nodes: rfNodes, edges: rfEdges } = toReactFlow(loaded.graph);
        setNodes(rfNodes);
        setEdges(rfEdges);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el flujo'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  // Los nodos INICIO/CONTENIDO necesitan datos que no viven en el grafo persistido (las
  // palabras clave del Flow, los callbacks de editar/eliminar) — se inyectan aquí en cada
  // render en vez de guardarse en `data`, así el JSON que se persiste se queda limpio.
  const displayNodes = useMemo(() => nodes.map((node) => {
    if (node.type === 'start') return { ...node, data: { keywords: flow?.triggerKeywords || [] } };
    if (node.type === 'content' || node.type === 'wait' || node.type === 'menu') return { ...node, data: { ...node.data, onEdit: editNode, onDelete: deleteNode } };
    return node;
  }), [nodes, flow?.triggerKeywords, editNode, deleteNode]);

  // Un nodo de menú tiene una salida por opción (más "sin respuesta"), cada una identificada
  // por su propio `sourceHandle` — así que solo se reemplaza la conexión existente que salga
  // de ESE mismo handle, no cualquier otra que salga del mismo nodo. El lado destino no se
  // deduplica: que varias opciones converjan en un mismo nodo es válido y esperado.
  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true, type: 'deletable' }, current.filter((edge) => !(edge.source === connection.source && edge.sourceHandle === connection.sourceHandle))));
  }, [setEdges]);

  const nextPosition = () => {
    const rightmost = nodes.reduce((max, node) => Math.max(max, node.position.x), 0);
    return { x: rightmost + 320, y: 200 };
  };

  const addContentNode = () => {
    const id = newNodeId();
    setNodes((current) => [...current, { id, type: 'content', position: nextPosition(), data: { label: 'Contenido', blocks: [] } as ContentNodeData }]);
    setEditingNodeId(id);
  };

  const addWaitNode = () => {
    const id = newNodeId();
    setNodes((current) => [...current, { id, type: 'wait', position: nextPosition(), data: { seconds: 60 } as WaitNodeData }]);
    setEditingNodeId(id);
  };

  const addMenuNode = () => {
    const id = newNodeId();
    const menuData: MenuNodeData = { label: 'Menú', prompt: '', options: [{ id: newOptionId(), text: '' }, { id: newOptionId(), text: '' }] };
    setNodes((current) => [...current, { id, type: 'menu', position: nextPosition(), data: menuData }]);
    setEditingNodeId(id);
  };

  const editingNode = editingNodeId ? nodes.find((node) => node.id === editingNodeId) : undefined;

  const saveNodeConfig = (label: string, blocks: ContentBlock[]) => {
    if (!editingNodeId) return;
    setNodes((current) => current.map((node) => (node.id === editingNodeId ? { ...node, data: { label, blocks } } : node)));
    setEditingNodeId(null);
  };

  const saveWaitConfig = (seconds: number) => {
    if (!editingNodeId) return;
    setNodes((current) => current.map((node) => (node.id === editingNodeId ? { ...node, data: { seconds } } : node)));
    setEditingNodeId(null);
  };

  const saveMenuConfig = (label: string, prompt: string, options: MenuOption[], displayMode: 'list' | 'buttons') => {
    if (!editingNodeId) return;
    const nodeId = editingNodeId;
    const validHandles = new Set(options.map((option) => option.id));
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, data: { label, prompt, options, displayMode } } : node)));
    // Si se borró una opción, su conexión en el canvas queda apuntando a un handle que ya no
    // existe — se quita para no dejar un edge "fantasma" (sourceHandle nunca vuelve a hacer
    // match en nextNodeId, así que sin esto el flujo simplemente se detendría ahí en silencio).
    setEdges((current) => current.filter((edge) => edge.source !== nodeId || !edge.sourceHandle || edge.sourceHandle === NO_RESPONSE_HANDLE || validHandles.has(edge.sourceHandle)));
    setEditingNodeId(null);
  };

  const persistGraph = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const cleanNodes = nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.type === 'content'
          ? { label: (node.data as ContentNodeData).label, blocks: (node.data as ContentNodeData).blocks }
          : node.type === 'wait'
            ? { seconds: (node.data as WaitNodeData).seconds }
            : node.type === 'menu'
              ? { label: (node.data as MenuNodeData).label, prompt: (node.data as MenuNodeData).prompt, options: (node.data as MenuNodeData).options, displayMode: (node.data as MenuNodeData).displayMode }
              : {},
      }));
      const cleanEdges = edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || undefined }));
      const updated = await apiFetch<FlowDetail>(`/automations/flows/${flowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ graph: { schemaVersion: 1, nodes: cleanNodes, edges: cleanEdges } }),
      });
      setFlow(updated);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo guardar el flujo');
    } finally {
      setSaving(false);
    }
  };

  const openConfig = () => {
    if (!flow) return;
    setConfigDraft({ name: flow.name, keywords: flow.triggerKeywords.join(', '), active: flow.active });
    setConfigOpen(true);
  };

  const saveConfig = async () => {
    const keywords = configDraft.keywords.split(',').map((k) => k.trim()).filter(Boolean);
    const updated = await apiFetch<FlowDetail>(`/automations/flows/${flowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: configDraft.name.trim(), triggerKeywords: keywords, active: configDraft.active }),
    });
    setFlow((current) => (current ? { ...current, ...updated } : updated));
    setConfigOpen(false);
  };

  if (loadError) return <div className="page-content"><div className="error-box">{loadError}</div></div>;
  if (!flow) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <div className="flow-editor-shell">
      <div className="flow-editor-toolbar">
        <div className="flow-editor-toolbar-left">
          <button className="button small" type="button" onClick={() => router.push('/automations')}><ArrowLeft size={14} /> Volver</button>
          <div className="flow-editor-title">
            <strong>{flow.name}</strong>
            <div className="flow-editor-pills">
              {flow.triggerKeywords.map((keyword) => <span key={keyword} className="status-pill info">Keyword &quot;{keyword}&quot;</span>)}
              <span className={`status-pill ${flow.active ? 'success' : 'neutral'}`}><span className="status-dot" /> {flow.active ? 'Activo' : 'Inactivo'}</span>
            </div>
          </div>
        </div>
        <div className="flow-editor-toolbar-right">
          <div className="node-library-anchor">
            <button className={`button primary small`} type="button" onClick={() => setLibraryOpen((v) => !v)}><Plus size={14} /> Añadir módulo</button>
            {libraryOpen && <NodeLibrary onSelectContent={addContentNode} onSelectWait={addWaitNode} onSelectMenu={addMenuNode} onClose={() => setLibraryOpen(false)} />}
          </div>
          <button className="button small" type="button" onClick={openConfig}><Settings size={14} /> Configurar</button>
          <button className={`button small ${simulatorOpen ? 'info' : ''}`} type="button" onClick={() => setSimulatorOpen((v) => !v)}><Sparkles size={14} /> Simular</button>
          <button className="button primary small" type="button" disabled={saving} onClick={() => void persistGraph()}>
            <Save size={14} /> {saving ? 'Guardando...' : 'Guardar flujo'}
          </button>
        </div>
      </div>
      {saveError && <div className="error-box" style={{ margin: '0 20px' }}>{saveError}</div>}
      {savedAt && !saveError && <div className="success-box" style={{ margin: '0 20px' }}>Flujo guardado.</div>}

      <div className="flow-editor-canvas-row">
        <div className="flow-editor-canvas">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ animated: true, type: 'deletable' }}
            fitView
            deleteKeyCode={null}
          >
            <Background gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {simulatorOpen && <SimulatorPanel flowId={flowId} onClose={() => setSimulatorOpen(false)} />}
      </div>

      {editingNode && editingNode.type === 'content' && (
        <NodeConfigModal
          label={(editingNode.data as ContentNodeData).label}
          blocks={(editingNode.data as ContentNodeData).blocks}
          onClose={() => setEditingNodeId(null)}
          onSave={saveNodeConfig}
        />
      )}

      {editingNode && editingNode.type === 'wait' && (
        <WaitConfigModal
          seconds={(editingNode.data as WaitNodeData).seconds}
          onClose={() => setEditingNodeId(null)}
          onSave={saveWaitConfig}
        />
      )}

      {editingNode && editingNode.type === 'menu' && (
        <MenuConfigModal
          label={(editingNode.data as MenuNodeData).label}
          prompt={(editingNode.data as MenuNodeData).prompt}
          options={(editingNode.data as MenuNodeData).options}
          displayMode={(editingNode.data as MenuNodeData).displayMode}
          onClose={() => setEditingNodeId(null)}
          onSave={saveMenuConfig}
        />
      )}

      {configOpen && (
        <div className="modal-backdrop" onClick={() => setConfigOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Configurar flujo</h2><p>Nombre, palabras clave y estado de la automatización.</p></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field"><label>Nombre</label><input value={configDraft.name} onChange={(e) => setConfigDraft({ ...configDraft, name: e.target.value })} /></div>
                <div className="field"><label>Palabras clave</label><input value={configDraft.keywords} onChange={(e) => setConfigDraft({ ...configDraft, keywords: e.target.value })} placeholder="precio, info, comprar" /></div>
                <label className="member-option" style={{ gridTemplateColumns: '18px 1fr' }}>
                  <input type="checkbox" checked={configDraft.active} onChange={(e) => setConfigDraft({ ...configDraft, active: e.target.checked })} />
                  <div><strong>Flujo activo</strong><span>Si lo desactivas, dejará de responder aunque coincida la palabra clave.</span></div>
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setConfigOpen(false)}>Cancelar</button>
              <button className="button primary" type="button" onClick={() => void saveConfig()}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AutomationEditorPage() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}
