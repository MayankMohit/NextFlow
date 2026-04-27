import type { Node, Edge } from '@xyflow/react'

// Returns nodes in topological order (dependencies first)
export function topologicalSort(nodes: Node[], edges: Edge[]): Node[][] {
  // Build adjacency and in-degree maps
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    dependents.set(node.id, [])
  }

  for (const edge of edges) {
    // Only count edges where both endpoints are in the target node set
    if (!inDegree.has(edge.source) || !inDegree.has(edge.target)) continue
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    dependents.get(edge.source)?.push(edge.target)
  }

  // Kahn's algorithm — groups nodes into parallel layers
  const layers: Node[][] = []
  let currentLayer = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0)

  while (currentLayer.length > 0) {
    layers.push(currentLayer)
    const nextLayer: Node[] = []

    for (const node of currentLayer) {
      for (const depId of dependents.get(node.id) ?? []) {
        const newDegree = (inDegree.get(depId) ?? 0) - 1
        inDegree.set(depId, newDegree)
        if (newDegree === 0) {
          const depNode = nodes.find((n) => n.id === depId)
          if (depNode) nextLayer.push(depNode)
        }
      }
    }

    currentLayer = nextLayer
  }

  return layers
}

// Get the output value of a node given completed results
export function resolveInputs(
  node: Node,
  edges: Edge[],
  nodeOutputs: Map<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  // Find all edges that point TO this node
  const incomingEdges = edges.filter((e) => e.target === node.id)

  for (const edge of incomingEdges) {
    if (edge.targetHandle && nodeOutputs.has(edge.source)) {
      resolved[edge.targetHandle] = nodeOutputs.get(edge.source)
    }
  }

  return resolved
}