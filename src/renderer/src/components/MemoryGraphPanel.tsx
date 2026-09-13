import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useStore } from '@/store/store';
import { PixelBadge } from './PixelBadge';
import { Icon } from './Icon';
import { StatusGlyph } from './StatusGlyph';
import type { MessageAct } from '@/scene/office/MessageEnvelope';
import {
  buildGraph,
  type GraphData,
  type GraphNode,
  type GraphEdge,
  type MessageLogEntry
} from './memoryGraph/buildGraph';
import { forceLayout, type Positions } from './memoryGraph/forceLayout';

/** The memory-graph tab: hive agents as nodes, messages as edges, an optional
 *  topic layer from each agent's memory file. SVG-rendered (DESIGN.md neo-pixel:
 *  square nodes, hard offset shadows, VT323/Pixelify). See MEMORY_GRAPH_SPEC.md.
 *
 *  All data comes from the existing preload bridge: store.agents + hiveLog +
 *  hiveMemory. No new IPC. Click an agent to jump to its memory; hover to peek. */
export function MemoryGraphPanel({
  godId,
  onJumpToMemory
}: {
  godId: string;
  onJumpToMemory: (agentId: string) => void;
}) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);

  const [log, setLog] = useState<MessageLogEntry[]>([]);
  const [showTopics, setShowTopics] = useState(false);
  const [memories, setMemories] = useState<Record<string, string>>({});
  const [loadingTopics, setLoadingTopics] = useState(false);

  // ── poll the message log (same cadence as the Activity tab) ──────────────────
  const refresh = useCallback(async () => {
    try { setLog((await window.cth.hiveLog(200)) as MessageLogEntry[]); } catch { /* noop */ }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // ── lazy memory loads: one on hover, all when the topic layer turns on ───────
  const fetchMemory = useCallback(async (id: string) => {
    try {
      const text = await window.cth.hiveMemory(id);
      // Coerced, not just defaulted: a bridge that answers with anything other
      // than a string (an empty list, say) used to reach `text.trim()` and take
      // the whole graph down.
      setMemories((m) => ({ ...m, [id]: typeof text === 'string' ? text : '' }));
    } catch { setMemories((m) => ({ ...m, [id]: '' })); }
  }, []);

  useEffect(() => {
    if (!showTopics) return;
    const missing = agents.map((a) => a.id).filter((id) => !(id in memories));
    if (missing.length === 0) return;
    setLoadingTopics(true);
    Promise.all(missing.map((id) => window.cth.hiveMemory(id).then(
      (t) => [id, typeof t === 'string' ? t : ''] as const,
      () => [id, ''] as const
    ))).then((pairs) => {
      setMemories((m) => ({ ...m, ...Object.fromEntries(pairs) }));
      setLoadingTopics(false);
    });
  }, [showTopics, agents, memories]);

  // ── graph model ──────────────────────────────────────────────────────────────
  const graph: GraphData = useMemo(
    () => buildGraph(agents, log, { showTopics, memories }),
    [agents, log, showTopics, memories]
  );

  // ── canvas sizing ─────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 640, h: 440 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) setDims({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── pinned (dragged) node positions ──────────────────────────────────────────
  const [pinned, setPinned] = useState<Record<string, { x: number; y: number }>>({});

  // recompute layout only when structure / size / pins change (not on every poll)
  const structKey = useMemo(
    () => graph.nodes.map((n) => n.id).join(',') + '|' + graph.edges.map((e) => e.id).join(','),
    [graph]
  );
  const pinnedKey = useMemo(() => JSON.stringify(pinned), [pinned]);
  const layout: Positions = useMemo(() => {
    const lnodes = graph.nodes.map((n) => ({
      id: n.id,
      gravityBias: n.kind === 'topic' ? 0.6 : n.kind === 'pseudo' ? 1.4 : n.id === godId ? 2.4 : 1
    }));
    const ledges = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      strength: e.kind === 'topic' ? 0.35 : 0.7 + Math.min(e.weight, 5) * 0.06
    }));
    return forceLayout(lnodes, ledges, { width: dims.w, height: dims.h, pinned });
    // structKey/pinnedKey capture the relevant graph identity; intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey, pinnedKey, dims.w, dims.h, godId]);

  // ── drag ──────────────────────────────────────────────────────────────────────
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);

  const posOf = useCallback(
    (id: string) => (live && live.id === id ? { x: live.x, y: live.y } : layout.get(id)),
    [live, layout]
  );

  const startDrag = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const p = posOf(id);
    if (!p) return;
    const s = toSvg(e.clientX, e.clientY);
    dragOffset.current = { x: s.x - p.x, y: s.y - p.y };
    moved.current = false;
    setLive({ id, x: p.x, y: p.y });
  }, [posOf, toSvg]);

  useEffect(() => {
    if (!live) return;
    const onMove = (ev: MouseEvent) => {
      const s = toSvg(ev.clientX, ev.clientY);
      const x = Math.max(8, Math.min(dims.w - 8, s.x - dragOffset.current.x));
      const y = Math.max(8, Math.min(dims.h - 8, s.y - dragOffset.current.y));
      moved.current = true;
      setLive((l) => (l ? { ...l, x, y } : l));
    };
    const onUp = () => {
      setLive((l) => {
        if (l && moved.current) setPinned((p) => ({ ...p, [l.id]: { x: l.x, y: l.y } }));
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [live, toSvg, dims.w, dims.h]);

  // ── hover / tooltip ─────────────────────────────────────────────────────────
  const [hover, setHover] = useState<
    | { kind: 'node'; node: GraphNode }
    | { kind: 'edge'; edge: GraphEdge }
    | null
  >(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const onCanvasMove = useCallback((e: React.MouseEvent) => {
    const s = toSvg(e.clientX, e.clientY);
    setCursor(s);
  }, [toSvg]);

  const hoverNode = useCallback((node: GraphNode) => {
    setHover({ kind: 'node', node });
    if (node.kind === 'agent' && !(node.id in memories)) fetchMemory(node.id);
  }, [memories, fetchMemory]);

  const hoverNodeId = hover?.kind === 'node' ? hover.node.id : null;
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const messageEdgeCount = graph.edges.filter((e) => e.kind === 'message').length;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cth-paper-200)' }}>
      {/* toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexShrink: 0,
        borderBottom: '1px solid var(--cth-ink-100)', background: 'var(--cth-paper-100)', flexWrap: 'wrap'
      }}>
        <button
          onClick={() => setShowTopics((v) => !v)}
          aria-pressed={showTopics}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 30, padding: '0 12px', border: 'none', cursor: 'pointer',
            borderRadius: 'var(--cth-radius-btn)',
            background: showTopics ? 'var(--cth-lilac)' : 'var(--cth-cream-100)',
            color: showTopics ? 'var(--cth-on-accent)' : 'var(--cth-ink-700)',
            boxShadow: showTopics ? 'var(--cth-shadow-sm)' : 'none',
            fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600,
            transition: 'background 120ms ease, color 120ms ease'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="3.4" y="3.4" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
            <rect x="11" y="3.4" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
            <rect x="3.4" y="11" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
            <rect x="11" y="11" width="5.6" height="5.6" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          {t('memoryGraph.topics')}
        </button>
        <button
          onClick={refresh}
          className="cth-iconbar"
          data-label={t('memoryGraph.refresh')}
          aria-label={t('memoryGraph.refresh')}
          style={{
            width: 30, height: 30, border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--cth-radius-btn)', background: 'transparent',
            color: 'var(--cth-sky-text)'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M16.4 10a6.4 6.4 0 11-2.3-4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M16.6 3.4v4h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{ flex: 1 }} />
        {showTopics && (
          <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
            {loadingTopics ? t('memoryGraph.readingMemory') : t('memoryGraph.topicsShown', { shown: graph.topicShown, total: graph.topicTotal })}
          </span>
        )}
      </div>

      {/* canvas */}
      <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <svg
          width={dims.w}
          height={dims.h}
          onMouseMove={onCanvasMove}
          style={{ display: 'block', userSelect: 'none' }}
        >
          <defs>
            <pattern id="mg-grid" width={32} height={32} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill="var(--cth-ink-100)" />
            </pattern>
            {MARKER_ACTS.map((act) => (
              <marker
                key={act}
                id={`mg-arrow-${act}`}
                viewBox="0 0 8 8" refX={7} refY={4}
                markerWidth={7} markerHeight={7}
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill={actColor(act)} />
              </marker>
            ))}
          </defs>

          <rect x={0} y={0} width={dims.w} height={dims.h} fill="var(--cth-paper-100)" />
          <rect x={0} y={0} width={dims.w} height={dims.h} fill="url(#mg-grid)" />

          {/* edges */}
          <g>
            {graph.edges.map((e) => {
              const sp = posOf(e.source);
              const tp = posOf(e.target);
              const sn = nodeById.get(e.source);
              const tn = nodeById.get(e.target);
              if (!sp || !tp || !sn || !tn) return null;
              const isTopic = e.kind === 'topic';
              const touches = !hoverNodeId || e.source === hoverNodeId || e.target === hoverNodeId;
              const dx = tp.x - sp.x;
              const dy = tp.y - sp.y;
              const dist = Math.hypot(dx, dy) || 1;
              const ux = dx / dist;
              const uy = dy / dist;
              const startArrow = !isTopic && (e.dir === 'bwd' || e.dir === 'both');
              const endArrow = !isTopic && (e.dir === 'fwd' || e.dir === 'both');
              const sr = nodeRadius(sn) + (startArrow ? 7 : 2);
              const tr = nodeRadius(tn) + (endArrow ? 7 : 2);
              const x1 = sp.x + ux * sr;
              const y1 = sp.y + uy * sr;
              const x2 = tp.x - ux * tr;
              const y2 = tp.y - uy * tr;
              const stroke = isTopic ? 'var(--cth-ink-300)' : actColor(e.lastAct);
              const w = isTopic ? 1 : 1 + Math.min(e.weight, 4) * 0.6;
              return (
                <line
                  key={e.id}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={stroke}
                  strokeWidth={w}
                  strokeDasharray={isTopic ? '3 3' : undefined}
                  opacity={touches ? (isTopic ? 0.55 : 0.9) : 0.12}
                  markerStart={startArrow ? `url(#mg-arrow-${e.lastAct ?? 'inform'})` : undefined}
                  markerEnd={endArrow ? `url(#mg-arrow-${e.lastAct ?? 'inform'})` : undefined}
                  onMouseEnter={() => setHover({ kind: 'edge', edge: e })}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'default' }}
                />
              );
            })}
          </g>

          {/* nodes */}
          <g>
            {graph.nodes.map((n) => {
              const p = posOf(n.id);
              if (!p) return null;
              const s = nodeSize(n);
              const half = s / 2;
              const dim = hoverNodeId && hoverNodeId !== n.id && !isNeighbor(graph, hoverNodeId, n.id);
              const navigable = n.kind === 'agent';
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={dim ? 0.3 : 1}
                  onMouseEnter={() => hoverNode(n)}
                  onMouseLeave={() => setHover(null)}
                  onMouseDown={(e) => startDrag(e, n.id)}
                  onClick={() => { if (navigable && !moved.current) onJumpToMemory(n.id); }}
                  style={{ cursor: navigable ? 'pointer' : 'grab' }}
                >
                  {n.kind === 'topic' ? (
                    <rect
                      x={-half} y={-half} width={s} height={s} rx={6}
                      fill={nodeFill(n)}
                      stroke="var(--cth-ink-100)"
                      strokeWidth={1}
                    />
                  ) : (
                    <>
                      {/* the state ring doubles as the node's edge, so an agent
                          carries its status without a second outline */}
                      <circle
                        r={half}
                        fill={nodeFill(n)}
                        stroke={n.kind === 'agent' ? `var(--cth-status-${n.status})` : 'var(--cth-ink-300)'}
                        strokeWidth={n.kind === 'agent' ? 2.5 : 1.5}
                      />
                      {n.kind === 'agent' && n.isGod && (
                        <circle r={half - 5} fill="none" stroke="var(--cth-paper-100)" strokeWidth={1.5} opacity={0.7} />
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* labels */}
          <g pointerEvents="none">
            {graph.nodes.map((n) => {
              const p = posOf(n.id);
              if (!p) return null;
              const dim = hoverNodeId && hoverNodeId !== n.id && !isNeighbor(graph, hoverNodeId, n.id);
              const below = nodeSize(n) / 2 + 12;
              const isTopic = n.kind === 'topic';
              return (
                <text
                  key={n.id}
                  x={p.x} y={p.y + below}
                  textAnchor="middle"
                  opacity={dim ? 0.25 : 1}
                  style={{
                    fontFamily: 'var(--cth-font-ui)',
                    fontSize: isTopic ? 11 : 12,
                    fontWeight: isTopic ? 400 : 600,
                    fill: isTopic ? 'var(--cth-ink-500)' : 'var(--cth-ink-900)'
                  }}
                >{truncate(n.label, isTopic ? 20 : 16)}</text>
              );
            })}
          </g>
        </svg>

        {/* empty hint */}
        {messageEdgeCount === 0 && !showTopics && (
          <div style={{
            position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '9px 14px', maxWidth: 'calc(100% - 32px)',
            borderRadius: 'var(--cth-radius-pill)',
            background: 'var(--cth-paper-100)',
            boxShadow: '0 0 0 1px var(--cth-ink-100), var(--cth-shadow-sm)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, color: 'var(--cth-ink-500)',
            pointerEvents: 'none'
          }}>
            <span style={{ display: 'inline-flex', color: 'var(--cth-status-idle)', flexShrink: 0 }}>
              <StatusGlyph status="idle" size={15} />
            </span>
            {t('memoryGraph.noMessages')}
          </div>
        )}

        {/* tooltip */}
        {hover && (
          <Tooltip x={cursor.x} y={cursor.y} wrap={dims}>
            {hover.kind === 'node'
              ? <NodeTip node={hover.node} memories={memories} />
              : <EdgeTip edge={hover.edge} nodeById={nodeById} />}
          </Tooltip>
        )}

        {/* legend */}
        <Legend />
      </div>
    </div>
  );
}

// ─── tooltip bodies ──────────────────────────────────────────────────────────

function NodeTip({ node, memories }: { node: GraphNode; memories: Record<string, string> }) {
  const { t } = useTranslation();
  if (node.kind === 'agent') {
    const mem = memories[node.id];
    const snippet = mem === undefined ? t('memoryGraph.loadingMemory') : memorySnippet(mem, t);
    return (
      <>
        <div style={tipTitle}>{node.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 4px' }}>
          <PixelBadge status={node.status} />
          <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('memoryGraph.messageLinks', { count: node.degree })}</span>
        </div>
        <div style={tipBody}>{snippet}</div>
      </>
    );
  }
  if (node.kind === 'topic') {
    return (
      <>
        <div style={tipTitle}>{node.label}</div>
        <div style={tipBody}>shared by {node.weight} agents</div>
      </>
    );
  }
  return (
    <>
      <div style={tipTitle}>{node.label}</div>
      <div style={tipBody}>{node.id === 'human' ? 'escalations to the human' : 'broadcast to everyone'}</div>
    </>
  );
}

function EdgeTip({ edge, nodeById }: { edge: GraphEdge; nodeById: Map<string, GraphNode> }) {
  const { t } = useTranslation();
  const a = nodeById.get(edge.source)?.label ?? edge.source;
  const b = nodeById.get(edge.target)?.label ?? edge.target;
  if (edge.kind === 'topic') {
    return <div style={tipBody}>{t('memoryGraph.knowsAbout', { a, b })}</div>;
  }
  const arrow = edge.dir === 'both' ? '↔' : edge.dir === 'bwd' ? '←' : '→';
  return (
    <>
      <div style={tipTitle}>{a} {arrow} {b}</div>
      <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', margin: '2px 0' }}>
        {t('memoryGraph.messagesLast', { count: edge.weight, act: edge.lastAct ?? '—' })}
      </div>
      {edge.lastSubject && <div style={tipBody}>{truncate(edge.lastSubject, 80)}</div>}
    </>
  );
}

function Legend() {
  const { t } = useTranslation();
  const items: { c: string; label: string }[] = [
    { c: actColor('request'), label: t('memoryGraph.legendRequest') },
    { c: actColor('query'), label: t('memoryGraph.legendQuery') },
    { c: actColor('propose'), label: t('memoryGraph.legendPropose') },
    { c: actColor('agree'), label: t('memoryGraph.legendAgreeDone') },
    { c: actColor('refuse'), label: t('memoryGraph.legendRefuse') },
    { c: 'var(--cth-ink-300)', label: t('memoryGraph.legendInformTopic') }
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 10, left: 10, padding: '8px 10px',
      background: 'var(--cth-paper-100)',
      borderRadius: 'var(--cth-radius-input)',
      boxShadow: '0 0 0 1px var(--cth-ink-100), var(--cth-shadow-sm)',
      display: 'flex', flexWrap: 'wrap', gap: '4px 12px', maxWidth: 300, pointerEvents: 'none'
    }}>
      {items.map((it) => (
        <span key={it.label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-500)'
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 'var(--cth-radius-pill)',
            background: it.c, display: 'inline-block', flexShrink: 0
          }} /> {it.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, wrap, children }: { x: number; y: number; wrap: { w: number; h: number }; children: React.ReactNode }) {
  const W = 240;
  const left = Math.min(x + 14, wrap.w - W - 6);
  const flipUp = y > wrap.h - 120;
  return (
    <div style={{
      position: 'absolute', left: Math.max(6, left), top: flipUp ? undefined : y + 14,
      bottom: flipUp ? wrap.h - y + 14 : undefined,
      width: W, padding: 12, pointerEvents: 'none', zIndex: 5,
      background: 'var(--cth-paper-100)', borderRadius: 'var(--cth-radius-input)',
      boxShadow: '0 0 0 1px var(--cth-ink-100), var(--cth-shadow-hover)',
      fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-900)'
    }}>{children}</div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 12px 2px', border: 'none', cursor: 'pointer',
        background: on ? 'var(--cth-lilac)' : 'var(--cth-cream-200)',
        boxShadow: on ? 'inset 0 0 0 1px var(--cth-ink-300)' : 'inset 0 0 0 1px var(--cth-ink-100)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)'
      }}
    >
      <Icon name={on ? 'check' : 'plus'} /> {label}
    </button>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const MARKER_ACTS: MessageAct[] = ['request', 'inform', 'propose', 'query', 'agree', 'refuse', 'done'];

/** Speech-act → colour. Mirrors ACT_COLOR in MessageEnvelope.ts so the graph
 *  speaks the same visual language as the floor's flying envelopes. */
function actColor(act?: MessageAct): string {
  switch (act) {
    case 'request': return 'var(--cth-sky)';
    case 'query': return 'var(--cth-lilac)';
    case 'propose': return 'var(--cth-lemon)';
    case 'agree': return 'var(--cth-mint)';
    case 'done': return 'var(--cth-mint)';
    case 'refuse': return 'var(--cth-coral)';
    case 'inform':
    default: return 'var(--cth-ink-300)';
  }
}

function nodeSize(n: GraphNode): number {
  if (n.kind === 'agent') return (n.isGod ? 30 : 22) + Math.min(n.degree, 10) * 1.0;
  if (n.kind === 'topic') return 12 + Math.min(n.weight, 6) * 1.4;
  return 17; // pseudo
}
function nodeRadius(n: GraphNode): number { return nodeSize(n) / 2; }

function nodeFill(n: GraphNode): string {
  if (n.kind === 'agent') return `var(--cth-${n.accent})`;
  if (n.kind === 'topic') return 'var(--cth-cream-200)';
  return n.id === 'human' ? 'var(--cth-lemon-light)' : 'var(--cth-ink-300)';
}

function isNeighbor(graph: GraphData, a: string, b: string): boolean {
  for (const e of graph.edges) {
    if ((e.source === a && e.target === b) || (e.source === b && e.target === a)) return true;
  }
  return false;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** First meaningful line(s) of a memory file, for the hover preview. */
function memorySnippet(text: unknown, t: TFunction): string {
  if (typeof text !== 'string' || !text.trim()) return t('memoryGraph.noMemory');
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[#>\-*\s]+/, '').trim())
    .filter((l) => l && !/^_.*_$/.test(l) && !/^memory —/i.test(l));
  return truncate(lines.slice(0, 3).join(' '), 200) || t('memoryGraph.noMemory');
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 12px 2px', border: 'none', cursor: 'pointer',
  background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)'
};

const tipTitle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)', lineHeight: '16px'
};
const tipBody: React.CSSProperties = {
  fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-700)'
};
