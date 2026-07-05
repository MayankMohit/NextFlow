"use client";

// Miniature SVG rendering of a workflow graph — used by the RightSidebar
// header and the dashboard project cards. Prop-driven so it can draw any
// workflow's nodes/edges, not just the store's.

export type MiniNode = { id: string; position: { x: number; y: number } };
export type MiniEdge = { id?: string; source: string; target: string };

export default function MiniCanvas({
  nodes,
  edges,
  isDark,
  height = 52,
}: {
  nodes: MiniNode[];
  edges: MiniEdge[];
  isDark: boolean;
  height?: number;
}) {
  const W = 240, H = height;
  const PAD = 6;
  const NW = 22, NH = 11;

  if (nodes.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center gap-2 opacity-20"
        style={{ height: H, background: isDark ? '#111' : '#f5f0ff' }}
      >
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-sm" style={{ width: NW, height: NH, background: isDark ? '#2a2a4a' : '#c4b5fd' }} />
        ))}
      </div>
    );
  }

  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 100);
  const rangeY = Math.max(maxY - minY, 50);

  const toSVG = (x: number, y: number) => ({
    x: PAD + ((x - minX) / rangeX) * (W - PAD * 2 - NW),
    y: PAD + ((y - minY) / rangeY) * (H - PAD * 2 - NH),
  });

  const posMap = new Map(nodes.map(n => [n.id, toSVG(n.position.x, n.position.y)]));

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ background: isDark ? '#0e0e0e' : '#f5f0ff', display: 'block' }}>
      {edges.map((e, i) => {
        const s = posMap.get(e.source);
        const t = posMap.get(e.target);
        if (!s || !t) return null;
        const sx = s.x + NW, sy = s.y + NH / 2;
        const tx = t.x, ty = t.y + NH / 2;
        const cpX = (sx + tx) / 2;
        return (
          <path key={e.id ?? i}
            d={`M ${sx} ${sy} C ${cpX} ${sy} ${cpX} ${ty} ${tx} ${ty}`}
            fill="none"
            stroke={isDark ? '#4a3a7a' : '#8b5cf6'}
            strokeWidth={0.8}
            opacity={0.7}
          />
        );
      })}
      {nodes.map(n => {
        const p = posMap.get(n.id);
        if (!p) return null;
        return (
          <rect key={n.id}
            x={p.x} y={p.y} width={NW} height={NH} rx={2}
            fill={isDark ? '#1a1530' : '#ede9fe'}
            stroke={isDark ? '#5b4ea0' : '#7c3aed'}
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}
