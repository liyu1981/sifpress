import { useMemo } from 'react';
import type { Revision } from 'ui-sdk';

const GRID_Y = 84;
const OFFSET_X = 20;
const OFFSET_Y = 22;
const CIRCLE_R = 5;
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

function buildGraph(revisions: Revision[], currentRevisionId: string | null) {
  if (revisions.length === 0) return { nodes: [] as GraphNode[], width: 0, height: 0 };

  // Build lookup maps
  const revById = new Map<string, Revision>();
  for (const r of revisions) revById.set(r.revision_id, r);

  // Build tree: root nodes → children
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

  // Assign lanes: DFS from each root, each root→leaf path = new lane
  const nodeLane = new Map<string, number>();
  let nextLane = 0;

  function assignLanes(node: TreeNode, lane: number) {
    if (node.children.length === 0) {
      // Leaf: assign this path's lane
      nodeLane.set(node.revision.revision_id, lane);
    } else {
      for (let i = 0; i < node.children.length; i++) {
        const childLane = i === 0 ? lane : nextLane++;
        assignLanes(node.children[i], childLane);
      }
      // Parent gets the minimum lane of all its descendants (leftmost)
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

  for (const root of roots) {
    assignLanes(root, nextLane++);
  }

  // Sort by committed_at descending (newest = top)
  const sorted = [...revisions].sort((a, b) => b.committed_at.localeCompare(a.committed_at));

  let maxLane = 0;
  for (const l of nodeLane.values()) if (l > maxLane) maxLane = l;

  const nodes: GraphNode[] = sorted.map((rev, i) => {
    const lane = nodeLane.get(rev.revision_id) ?? 0;
    return {
      revision: rev,
      x: lane * LANE_W + OFFSET_X,
      y: i * GRID_Y + OFFSET_Y,
      lane,
      isCurrent: rev.revision_id === currentRevisionId,
      isLast: i === sorted.length - 1,
    };
  });

  const width = (maxLane + 1) * LANE_W + OFFSET_X * 2;
  const height = sorted.length * GRID_Y + OFFSET_Y;

  return { nodes, width, height };
}

function buildEdges(revisions: Revision[], nodes: GraphNode[]) {
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.revision.revision_id, n);

  const edges: { path: string; lane: number }[] = [];

  for (const node of nodes) {
    for (const pid of node.revision.parent_ids) {
      const parentNode = nodeById.get(pid);
      if (!parentNode) continue;

      const x1 = node.x;
      const y1 = node.y;
      const x2 = parentNode.x;
      const y2 = parentNode.y;

      let d: string;
      if (x1 === x2) {
        d = `M ${x1} ${y1} L ${x2} ${y2}`;
      } else {
        const midY = (y1 + y2) / 2;
        d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
      }
      edges.push({ path: d, lane: node.lane });
    }
  }

  return edges;
}

export function RevisionGraph({ revisions, currentRevisionId, children }: RevisionGraphProps) {
  const { nodes, width, height } = useMemo(
    () => buildGraph(revisions, currentRevisionId),
    [revisions, currentRevisionId],
  );

  const edges = useMemo(() => buildEdges(revisions, nodes), [revisions, nodes]);

  if (nodes.length === 0) return null;

  return (
    <div className="relative">
      {/* SVG graph layer */}
      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={width}
        height={height}
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

      {/* Content layer — offset to the right of the graph */}
      <div className="relative" style={{ marginLeft: width + 10 }}>
        {nodes.map((node, i) => (
          <div
            key={node.revision.revision_id}
            style={{ height: GRID_Y }}
            className="flex items-start"
          >
            {children(node.revision, {
              isCurrent: node.isCurrent,
              isLast: node.isLast,
              lane: node.lane,
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
