import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { Code2, Compass, FilePlus2, Hand, ImagePlus, Info } from 'lucide-react';
import { MistyContext } from './context.js';
import BlendDialog from './components/BlendDialog.jsx';
import CodeDock from './components/CodeDock.jsx';
import DemoTour from './components/DemoTour.jsx';
import ExampleNode from './components/ExampleNode.jsx';
import SourceNode from './components/SourceNode.jsx';
import { pickTarget } from './lib/dom.js';
import { readFileAsDataUrl, toPng } from './lib/image.js';
import { loadCanvas, saveCanvas } from './lib/persist.js';
import { BRIDGE_URL, bridgeHealth, callModel, normalizeCategories } from './lib/llm.js';
import { dropBlendPrompt, fixRenderPrompt, globalBlendPrompt, togglePrompt } from './lib/prompts.js';
import { repairCode } from './lib/repair.js';
import { swapChangeValue } from './lib/changes.js';
import { PARKS_CODE, SAMPLE_EXAMPLES, SAMPLE_SOURCES } from './lib/samples.js';

const nodeTypes = { example: ExampleNode, source: SourceNode };

let counter = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${++counter}`;

const sourceData = (code) => ({
  code,
  status: 'idle',
  categories: [],
  panelOpen: true,
});

const toggleKey = (categories) =>
  categories.filter((c) => c.enabled).map((c) => c.id).join(',');

function Workspace() {
  const flow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [drag, setDrag] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [dockId, setDockId] = useState(null);
  const [toast, setToast] = useState(null);
  const [menu, setMenu] = useState(null);
  const [pasted, setPasted] = useState('');
  const [bridge, setBridge] = useState({ state: 'checking' });
  const [demoOpen, setDemoOpen] = useState(false);
  const imageInput = useRef(null);
  const codeInput = useRef(null);
  const started = useRef(false);
  const [loaded, setLoaded] = useState(false);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const getNode = (id) => nodesRef.current.find((n) => n.id === id);

  const say = useCallback((message) => {
    setToast(message);
    window.clearTimeout(say.timer);
    say.timer = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const patchNode = useCallback(
    (id, patch) => {
      setNodes((list) =>
        list.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      // Keep the ref current for logic that runs before the next render.
      nodesRef.current = nodesRef.current.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
      );
    },
    [setNodes]
  );

  // ---- adding nodes -------------------------------------------------------

  // Step away from existing nodes until the new one does not overlap any of them.
  const freePosition = (x, y, width, height, stepX, stepY) => {
    const overlaps = (n) =>
      x < n.position.x + (n.measured?.width ?? 460) &&
      x + width > n.position.x &&
      y < n.position.y + (n.measured?.height ?? 800) &&
      y + height > n.position.y;
    while (nodesRef.current.some(overlaps)) {
      x += stepX;
      y += stepY;
    }
    return { x, y };
  };

  const addExample = useCallback(
    async (src, name, position) => {
      const image = await toPng(src);
      const node = {
        id: nextId('example'),
        type: 'example',
        position: position ?? freePosition(-420, 40, 340, 760, -380, 0),
        data: { image, name, sketch: /sketch/i.test(name) },
      };
      nodesRef.current = [...nodesRef.current, node];
      setNodes((list) => [...list, node]);
      return node;
    },
    [setNodes]
  );

  const addSource = useCallback(
    (code, position) => {
      const node = {
        id: nextId('source'),
        type: 'source',
        position: position ?? freePosition(40, 0, 450, 880, 0, 960),
        data: sourceData(repairCode(code)),
      };
      nodesRef.current = [...nodesRef.current, node];
      setNodes((list) => [...list, node]);
      return node;
    },
    [setNodes]
  );

  const seedCanvas = useCallback(async () => {
    nodesRef.current = [];
    setNodes([]);
    setEdges([]);
    await addExample(SAMPLE_EXAMPLES[0].src, SAMPLE_EXAMPLES[0].name, { x: -420, y: 40 });
    addSource(PARKS_CODE, { x: 40, y: 0 });
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 80);
  }, [addExample, addSource, flow, setEdges, setNodes]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      // Restore the saved canvas (see lib/persist.js); start from the samples otherwise.
      const saved = await loadCanvas();
      if (saved?.nodes?.length) {
        const restored = saved.nodes.map((n) =>
          n.type === 'source' && (n.data.status === 'loading' || n.data.toggling)
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: 'idle',
                  toggling: false,
                  error: 'Interrupted by a page reload. Press Regenerate to try again.',
                },
              }
            : n
        );
        nodesRef.current = restored;
        setNodes(restored);
        setEdges(saved.edges ?? []);
        setTimeout(() => (saved.viewport ? flow.setViewport(saved.viewport) : flow.fitView({ padding: 0.15 })), 80);
      } else {
        await seedCanvas();
      }
      setLoaded(true);
    })().catch((error) => say(error.message));
    bridgeHealth()
      .then((info) => setBridge({ state: 'ok', info }))
      .catch(() => setBridge({ state: 'down' }));
  }, [seedCanvas, flow, say, setEdges, setNodes]);

  // Save the canvas shortly after every change.
  useEffect(() => {
    if (!loaded) return undefined;
    const timer = setTimeout(() => {
      const clean = nodes.map(({ id, type, position, data }) => ({
        id,
        type,
        position,
        data: { ...data, renderError: undefined },
      }));
      saveCanvas({ nodes: clean, edges, viewport: flow.getViewport() });
    }, 600);
    return () => clearTimeout(timer);
  }, [nodes, edges, loaded, flow]);

  const newCanvas = async () => {
    if (!window.confirm('Clear the canvas and start again from the sample nodes?')) return;
    setDockId(null);
    setPendingDrop(null);
    setHighlight(null);
    setMenu(null);
    await seedCanvas().catch((error) => say(error.message));
  };

  const importFiles = useCallback(
    async (files) => {
      for (const file of files) {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          if (file.type.startsWith('image/')) await addExample(dataUrl, file.name);
          else addSource(await file.text());
        } catch (error) {
          say(error.message);
        }
      }
    },
    [addExample, addSource, say]
  );

  useEffect(() => {
    const onPaste = (event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) importFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [importFiles]);

  // ---- blending -----------------------------------------------------------

  const requestBlend = async (nodeId, spec, attempt) => {
    patchNode(nodeId, { status: 'loading', error: null, categories: [] });
    try {
      const prompt =
        spec.kind === 'global'
          ? globalBlendPrompt(spec.parentCode, attempt)
          : dropBlendPrompt({
              code: spec.parentCode,
              aspects: spec.aspects,
              custom: spec.custom,
              targetHtml: spec.targetHtml,
              attempt,
            });
      const result = await callModel(prompt, spec.image);
      if (!result.updatedCode) throw new Error('The model returned no code. Try Regenerate.');
      const code = repairCode(result.updatedCode);
      const categories = normalizeCategories(result.categorizedChanges);
      const allOn = toggleKey(categories);
      patchNode(nodeId, {
        status: 'idle',
        code,
        blendedCode: code,
        categories,
        designExplanation: result.designExplanation,
        differences: result.differences,
        toggleCache: { [allOn]: code, '': spec.parentCode },
      });
    } catch (error) {
      patchNode(nodeId, { status: 'idle', error: error.message });
    }
  };

  // A blend creates a new source node with the updated code; the parent stays.
  const startBlend = (parentId, exampleId, spec) => {
    const parent = getNode(parentId);
    if (!parent) return;
    const siblings = edges.filter((e) => e.source === parentId).length;
    const width = parent.measured?.width ?? 460;
    const id = nextId('source');
    const node = {
      id,
      type: 'source',
      position: { x: parent.position.x + width + 120, y: parent.position.y + siblings * 960 },
      data: {
        ...sourceData(parent.data.code),
        blend: { ...spec, parentCode: parent.data.code },
        attempt: 0,
        blendLabel:
          spec.kind === 'global'
            ? 'Global blend'
            : [...spec.aspects.filter((a) => a !== 'Customize'), spec.custom].filter(Boolean).join(' + '),
      },
    };
    nodesRef.current = [...nodesRef.current, node];
    setNodes((list) => [...list, node]);
    setEdges((list) => [
      ...list,
      {
        id: `${parentId}-${id}`,
        source: parentId,
        sourceHandle: 'out',
        target: id,
        targetHandle: 'in',
        style: { stroke: '#B79FD8', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#B79FD8' },
      },
      {
        id: `${exampleId}-${id}`,
        source: exampleId,
        sourceHandle: 'out',
        target: id,
        targetHandle: 'in',
        style: { stroke: '#8D9FCB', strokeWidth: 2, strokeDasharray: '6 6' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8D9FCB' },
      },
    ]);
    setTimeout(() => flow.fitView({ nodes: [{ id: parentId }, { id }], padding: 0.15, duration: 500 }), 80);
    requestBlend(id, { ...spec, parentCode: parent.data.code }, 0);
  };

  const globalBlend = (exampleId, sourceId) => {
    const example = getNode(exampleId);
    const target = getNode(sourceId);
    if (example?.type !== 'example' || target?.type !== 'source') {
      say('Connect a reference example to a source UI.');
      return;
    }
    if (target.data.status === 'loading') return;
    startBlend(sourceId, exampleId, { kind: 'global', image: example.data.image });
  };

  const regenerate = (id) => {
    const node = getNode(id);
    if (!node?.data.blend) return;
    const attempt = (node.data.attempt ?? 0) + 1;
    patchNode(id, { attempt });
    requestBlend(id, node.data.blend, attempt);
  };

  // Semantic diff: toggling asks the model for updated code (Section 4.3). A state
  // already seen, including all-on and all-off, is restored without a new call.
  const toggleCategory = async (id, categoryId) => {
    const node = getNode(id);
    if (!node || node.data.toggling) return;
    const categories = node.data.categories.map((c) =>
      c.id === categoryId ? { ...c, enabled: !c.enabled } : c
    );
    const switched = categories.find((c) => c.id === categoryId);
    const key = toggleKey(categories);
    const cached = node.data.toggleCache?.[key];
    if (cached) {
      patchNode(id, { categories, code: cached, error: null });
      return;
    }
    patchNode(id, { categories, toggling: true, error: null });
    try {
      const result = await callModel(
        togglePrompt({
          currentCode: node.data.code,
          originalCode: node.data.blend.parentCode,
          categories,
          switched,
        })
      );
      if (!result.updatedCode) throw new Error('The model returned no code.');
      const code = repairCode(result.updatedCode);
      patchNode(id, {
        code,
        toggling: false,
        toggleCache: { ...getNode(id).data.toggleCache, [key]: code },
      });
    } catch (error) {
      patchNode(id, { categories: node.data.categories, toggling: false, error: error.message });
    }
  };

  const resetAll = (id) => {
    const node = getNode(id);
    if (!node?.data.blendedCode) return;
    // Also undo class values edited in the panel, so the list matches the code again.
    const categories = node.data.categories.map((c) => ({
      ...c,
      enabled: true,
      changes: c.changes.map((x) => (x.original !== undefined ? { ...x, after: x.original, original: undefined } : x)),
    }));
    patchNode(id, {
      categories,
      code: node.data.blendedCode,
      error: null,
      toggleCache: { [toggleKey(categories)]: node.data.blendedCode, '': node.data.blend.parentCode },
    });
  };

  // Fine-grained end of the semantic diff: edit one class value directly.
  const editChange = (id, categoryId, index, value) => {
    const node = getNode(id);
    const category = node?.data.categories.find((c) => c.id === categoryId);
    const change = category?.changes[index];
    if (!change || !value || value === change.after) return;
    const swapped = swapChangeValue(node.data.code, change.after, value);
    if (swapped === null) {
      say(`"${change.after || '(empty)'}" is not in the current code, so it can't be swapped. Use Show Code.`);
      return;
    }
    patchNode(id, {
      code: swapped,
      toggleCache: {},
      categories: node.data.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              changes: c.changes.map((x, i) =>
                i === index ? { ...x, after: value, original: x.original ?? x.after } : x
              ),
            }
          : c
      ),
    });
  };

  const fixRender = async (id) => {
    const node = getNode(id);
    if (!node) return;
    const repaired = repairCode(node.data.code);
    if (repaired !== node.data.code) {
      patchNode(id, { code: repaired, error: null });
      say('Fix Render repaired the code with its syntax rules.');
      return;
    }
    if (!node.data.renderError) {
      say('This UI renders without errors, and the syntax rules found nothing to repair.');
      return;
    }
    patchNode(id, { toggling: true, error: null });
    try {
      const result = await callModel(fixRenderPrompt(node.data.code, node.data.renderError));
      if (!result.updatedCode) throw new Error('The model returned no code.');
      patchNode(id, { code: repairCode(result.updatedCode), toggling: false });
    } catch (error) {
      patchNode(id, { toggling: false, error: error.message });
    }
  };

  // ---- dragging a cropped section onto a source UI -----------------------

  const startCropDrag = useCallback(({ exampleId, crop, x, y }) => {
    setDrag({ exampleId, crop, x, y });
    setHighlight(null);
    setPendingDrop(null);
  }, []);

  useEffect(() => {
    if (!drag) return undefined;
    let over = null;

    const trackTarget = (event) => {
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      const root = hovered?.closest?.('[data-misty-preview]');
      const nodeId = root?.getAttribute('data-misty-preview');
      if (!root || getNode(nodeId)?.data.status === 'loading') {
        over = null;
        setHighlight(null);
        return;
      }
      // Shift or Alt widens the target to the enclosing section (ported from xhigh).
      let target = pickTarget(hovered, root);
      if ((event.shiftKey || event.altKey) && target?.parentElement && target.parentElement !== root) {
        target = target.parentElement;
      }
      const rect = target?.getBoundingClientRect();
      if (!rect) return;
      over = { nodeId, target };
      setHighlight({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };

    const onMove = (event) => {
      setDrag((d) => d && { ...d, x: event.clientX, y: event.clientY });
      trackTarget(event);
    };

    const onUp = (event) => {
      trackTarget(event);
      if (over) {
        setPendingDrop({
          exampleId: drag.exampleId,
          crop: drag.crop,
          nodeId: over.nodeId,
          targetHtml: over.target.outerHTML.slice(0, 4000),
          x: event.clientX,
          y: event.clientY,
        });
      } else {
        setHighlight(null);
      }
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.classList.add('m-dragging');
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('m-dragging');
    };
    // The listeners only depend on the drag having started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.exampleId, drag?.crop]);

  const cancelDrop = useCallback(() => {
    setPendingDrop(null);
    setHighlight(null);
  }, []);

  const confirmDrop = (aspects, custom) => {
    const drop = pendingDrop;
    cancelDrop();
    startBlend(drop.nodeId, drop.exampleId, {
      kind: 'drop',
      image: drop.crop,
      aspects,
      custom,
      targetHtml: drop.targetHtml,
    });
  };

  // ---- canvas -------------------------------------------------------------

  const isValidConnection = useCallback(
    (connection) =>
      getNode(connection.source)?.type === 'example' && getNode(connection.target)?.type === 'source',
    []
  );

  // Dropping the connection anywhere on a source node counts, not just on its handle.
  const onConnectEnd = (event, state) => {
    if (!state.fromNode || state.fromNode.type !== 'example') return;
    if (state.isValid && state.toNode) {
      globalBlend(state.fromNode.id, state.toNode.id);
      return;
    }
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const element = document.elementFromPoint(point.clientX, point.clientY);
    const id = element?.closest?.('.react-flow__node')?.getAttribute('data-id');
    if (id && getNode(id)?.type === 'source') globalBlend(state.fromNode.id, id);
  };

  const context = useMemo(
    () => ({
      patchNode,
      startCropDrag,
      openCode: setDockId,
      toggleCategory: (...args) => toggleCategoryRef.current(...args),
      resetAll: (...args) => resetAllRef.current(...args),
      editChange: (...args) => editChangeRef.current(...args),
      regenerate: (...args) => regenerateRef.current(...args),
      fixRender: (...args) => fixRenderRef.current(...args),
    }),
    [patchNode, startCropDrag]
  );
  const toggleCategoryRef = useRef(toggleCategory);
  toggleCategoryRef.current = toggleCategory;
  const resetAllRef = useRef(resetAll);
  resetAllRef.current = resetAll;
  const editChangeRef = useRef(editChange);
  editChangeRef.current = editChange;
  const regenerateRef = useRef(regenerate);
  regenerateRef.current = regenerate;
  const fixRenderRef = useRef(fixRender);
  fixRenderRef.current = fixRender;

  // What the guided demo needs from the canvas.
  const demoContext = useMemo(
    () => ({
      loadScene: async ({ examples, source }) => {
        nodesRef.current = [];
        setNodes([]);
        setEdges([]);
        setDockId(null);
        setPendingDrop(null);
        setHighlight(null);
        setMenu(null);
        for (const [index, name] of examples.entries()) {
          const sample = SAMPLE_EXAMPLES.find((s) => s.name === name);
          await addExample(sample.src, sample.name, { x: -420 - index * 380, y: 40 });
        }
        const starter = source === 'fuji' ? SAMPLE_SOURCES[1] : SAMPLE_SOURCES[0];
        addSource(starter.code, { x: 40, y: 0 });
        setTimeout(() => flow.fitView({ padding: 0.14, duration: 300 }), 80);
      },
      fit: () => setTimeout(() => flow.fitView({ padding: 0.14, duration: 300 }), 40),
      fitLatest: () =>
        setTimeout(() => {
          const sources = nodesRef.current.filter((n) => n.type === 'source').slice(-2);
          flow.fitView({ nodes: sources.map((n) => ({ id: n.id })), padding: 0.12, duration: 300 });
        }, 120),
    }),
    [addExample, addSource, flow, setEdges, setNodes]
  );

  const dockNode = nodes.find((n) => n.id === dockId && n.type === 'source');

  const onDockChange = useCallback(
    (code) => patchNode(dockId, { code, toggleCache: {}, error: null }),
    [dockId, patchNode]
  );

  const addPastedSource = () => {
    if (!pasted.trim()) return;
    addSource(pasted);
    setPasted('');
    setMenu(null);
  };

  return (
    <MistyContext.Provider value={context}>
      <div
        className={`m-app ${dockNode ? 'has-dock' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          importFiles([...e.dataTransfer.files]);
        }}
      >
        <div className="m-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            connectionRadius={60}
            connectionLineStyle={{ stroke: '#5B6FA8', strokeWidth: 2, strokeDasharray: '6 6' }}
            minZoom={0.15}
            maxZoom={1.6}
            zoomOnDoubleClick={false}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="#D5D7E2" />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
        </div>

        <header className="m-toolbar">
          <strong className="m-brand">Misty</strong>
          <div className="m-menu-wrap">
            <button className="m-tool" onClick={() => setMenu(menu === 'example' ? null : 'example')}>
              <ImagePlus size={16} /> Add Example
            </button>
            {menu === 'example' && (
              <div className="m-menu">
                <button
                  onClick={() => {
                    imageInput.current.click();
                    setMenu(null);
                  }}
                >
                  Upload a screenshot or sketch…
                </button>
                <hr />
                <small>Sample examples</small>
                {SAMPLE_EXAMPLES.map((sample) => (
                  <button
                    key={sample.src}
                    onClick={() => {
                      addExample(sample.src, sample.name).catch((error) => say(error.message));
                      setMenu(null);
                    }}
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="m-menu-wrap">
            <button className="m-tool" onClick={() => setMenu(menu === 'source' ? null : 'source')}>
              <Code2 size={16} /> Add Source
            </button>
            {menu === 'source' && (
              <div className="m-menu m-menu-wide">
                <button
                  onClick={() => {
                    codeInput.current.click();
                    setMenu(null);
                  }}
                >
                  Upload a code file…
                </button>
                <hr />
                <small>Starter UIs</small>
                {SAMPLE_SOURCES.map((sample) => (
                  <button
                    key={sample.name}
                    onClick={() => {
                      addSource(sample.code);
                      setMenu(null);
                    }}
                  >
                    {sample.name}
                  </button>
                ))}
                <hr />
                <small>Or paste a component: () =&gt; {'{ … }'}</small>
                <textarea rows={5} value={pasted} spellCheck={false} onChange={(e) => setPasted(e.target.value)} />
                <button className="m-menu-primary" disabled={!pasted.trim()} onClick={addPastedSource}>
                  Add pasted code
                </button>
              </div>
            )}
          </div>
          <button
            className="m-tool m-tool-demo"
            onClick={() => {
              setMenu(null);
              setDemoOpen(true);
            }}
          >
            <Compass size={16} /> Guided Demo
          </button>
          <button className="m-tool" title="Clear the canvas (it is saved in this browser)" onClick={newCanvas}>
            <FilePlus2 size={16} /> New Canvas
          </button>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              importFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
          <input
            ref={codeInput}
            type="file"
            accept=".js,.jsx,.ts,.tsx,.txt"
            multiple
            hidden
            onChange={(e) => {
              importFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
        </header>

        <footer className="m-status">
          <Info size={13} />
          {bridge.state === 'ok' && (
            <span>Substitution: blends use {bridge.info?.model || bridge.info?.backend || 'the bridge model'} through the LLM bridge, not GPT-4o.</span>
          )}
          {bridge.state === 'down' && <span className="is-alert">LLM bridge not reachable at {BRIDGE_URL}. Blends will fail until it runs.</span>}
          {bridge.state === 'checking' && <span>Checking the LLM bridge…</span>}
          <span>Stock photos are generated placeholders.</span>
        </footer>

        {highlight && <div className="m-highlight" style={highlight} />}

        {drag && (
          <div className="m-ghost" style={{ left: drag.x, top: drag.y }}>
            <img src={drag.crop} alt="" />
            <Hand size={20} />
            <small className="m-ghost-hint">Hold Shift for a wider target</small>
          </div>
        )}

        {pendingDrop && (
          <>
            {/* Holds the canvas still, so the highlight stays on the drop target. */}
            <div className="m-dialog-backdrop" onClick={cancelDrop} />
            <BlendDialog x={pendingDrop.x} y={pendingDrop.y} onCancel={cancelDrop} onNext={confirmDrop} />
          </>
        )}

        {toast && <div className="m-toast" role="status">{toast}</div>}

        <DemoTour
          open={demoOpen}
          bridgeDown={bridge.state === 'down'}
          ctx={demoContext}
          onClose={() => setDemoOpen(false)}
        />


        {dockNode && <CodeDock node={dockNode} onChange={onDockChange} onClose={() => setDockId(null)} />}
      </div>
    </MistyContext.Provider>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}
