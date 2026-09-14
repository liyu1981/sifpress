import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Revision } from 'ui-sdk';

const ROW_H = 84;
const OFFSET_X = 20;
const ROW_PAD = 12;
const CIRCLE_R = 5;
const NODE_Y = ROW_PAD + 10;
const LANE_W = 32;

const COLORS = [
  'var(--primary)',
  '#7c3aed',
  '#ea580c',
  '#059669',
  '#4f46e5',
  '#e11d48',
  '#2563eb',
  '#9333ea',
  '#d97706',
  '#16a34a',
];

export interface RevisionGraphProps {
  revisions: Revision[];
  currentRevisionId: string | null;
  children: (
    rev: Revision,
    ctx: { isCurrent: boolean; isLast: boolean; lane: number },
  ) => React.ReactNode;
}

interface TreeNode {
  revision: Revision;
  children: TreeNode[];
}

interface GraphNode {
  revision: Revision;
  x: number;
  y: number;
  lane: number;
  isCurrent: boolean;
  isLast: boolean;
}

function buildTree(revisions: Revision[]) {
  const treeNodes = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const rev of revisions) {
    treeNodes.set(rev.revision_id, { revision: rev, children: [] });
  }

  for (const rev of revisions) {
    const node = treeNodes.get(rev.revision_id)!;
    if (rev.parent_ids.length === 0) {
      roots.push(node);
    } else {
      for (const pid of rev.parent_ids) {
        const parent = treeNodes.get(pid);
        if (parent) parent.children.push(node);
      }
    }
  }

  return { roots, treeNodes };
}

function assignLanes(roots: TreeNode[]) {
  const nodeLane = new Map<string, number>();
  let nextLane = 0;

  function walk(node: TreeNode, lane: number) {
    if (node.children.length === 0) {
      nodeLane.set(node.revision.revision_id, lane);
    } else {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], i === 0 ? lane : nextLane++);
      }
      let minLane = lane;
      function findMin(n: TreeNode) {
        const l = nodeLane.get(n.revision.revision_id);
        if (l !== undefined && l < minLane) minLane = l;
        for (const c of n.children) findMin(c);
      }
      findMin(node);
      nodeLane.set(node.revision.revision_id, minLane);
    }
  }

  for (const root of roots) walk(root, nextLane++);
  return nodeLane;
}

/**
 * RevisionGraph renders a git-graph-style SVG alongside revision rows.
 *
 * Layout strategy (following reference gitgraph):
 * - SVG nodes use a coordinate system derived from actual measured row heights
 * - Content rows and SVG share the same Y origin and cumulative spacing
 * - When a diff expands a row, measurements update and both SVG and content
 *   stay aligned because they're computed from the same data
 */
export function RevisionGraph({ revisions, currentRevisionId, children }: RevisionGraphProps) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);

  useLayoutEffect(() => {
    const next = rowRefs.current.map(el => el?.offsetHeight ?? ROW_H);
    setRowHeights(prev =>
      prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next,
    );
  });

  const sorted = useMemo(
    () => [...revisions].sort((a, b) => b.committed_at.localeCompare(a.committed_at)),
    [revisions],
  );

  const { laneOf, maxLane } = useMemo(() => {
    const { roots } = buildTree(revisions);
    const lanes = assignLanes(roots);
    let mx = 0;
    for (const l of lanes.values()) if (l > mx) mx = l;
    return { laneOf: lanes, maxLane: mx };
  }, [revisions]);

  const { nodes, edges, width, totalHeight } = useMemo(() => {
    const gw = (maxLane + 1) * LANE_W + OFFSET_X * 2;

    // Build y-positions from measured row heights.
    // Circle aligns with the top of each row (circle center = row top + CIRCLE_R).
    let cy = 0;
    const ySlots: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      ySlots.push(cy + NODE_Y);
      cy += rowHeights[i] ?? ROW_H;
    }

    const ns: GraphNode[] = sorted.map((rev, i) => ({
      revision: rev,
      x: (laneOf.get(rev.revision_id) ?? 0) * LANE_W + OFFSET_X,
      y: ySlots[i],
      lane: laneOf.get(rev.revision_id) ?? 0,
      isCurrent: rev.revision_id === currentRevisionId,
      isLast: i === sorted.length - 1,
    }));

    const byId = new Map<string, GraphNode>();
    for (const n of ns) byId.set(n.revision.revision_id, n);

    const es: { path: string; lane: number }[] = [];
    for (const node of ns) {
      for (const pid of node.revision.parent_ids) {
        const par = byId.get(pid);
        if (!par) continue;
        const { x: x1, y: y1 } = node;
        const { x: x2, y: y2 } = par;
        const d =
          x1 === x2
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
        es.push({ path: d, lane: node.lane });
      }
    }

    return { nodes: ns, edges: es, width: gw, totalHeight: cy };
  }, [sorted, currentRevisionId, rowHeights, laneOf, maxLane]);

  if (nodes.length === 0) return null;

  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={width}
        height={totalHeight}
        style={{ zIndex: 0 }}
      >
        {edges.map((edge, i) => (
          <path
            key={`e-${i}`}
            d={edge.path}
            stroke={COLORS[edge.lane % COLORS.length]}
            strokeWidth={2}
            fill="none"
            opacity={0.45}
          />
        ))}
        {nodes.map((node, i) => (
          <g key={`n-${i}`}>
            {node.isCurrent && (
              <circle
                cx={node.x}
                cy={node.y}
                r={CIRCLE_R + 3}
                fill="none"
                stroke={COLORS[node.lane % COLORS.length]}
                strokeWidth={1.5}
                opacity={0.35}
              />
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r={CIRCLE_R}
              fill={
                node.isCurrent
                  ? COLORS[node.lane % COLORS.length]
                  : 'color-mix(in oklch, var(--muted-foreground), transparent 65%)'
              }
              stroke={
                node.isCurrent
                  ? COLORS[node.lane % COLORS.length]
                  : 'color-mix(in oklch, var(--muted-foreground), transparent 85%)'
              }
              strokeWidth={node.isCurrent ? 2 : 1}
            />
          </g>
        ))}
      </svg>

      <div className="relative" style={{ marginLeft: width + 10 }}>
        {sorted.map((rev, i) => {
          const isLast = i === sorted.length - 1;
          return (
            <div
              key={rev.revision_id}
              ref={el => {
                rowRefs.current[i] = el;
              }}
              className={`py-3 ${isLast ? '' : 'border-b border-border/40'}`}
            >
              {children(rev, {
                isCurrent: rev.revision_id === currentRevisionId,
                isLast,
                lane: nodes[i].lane,
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
